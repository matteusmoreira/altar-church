import { createHash, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db/client";
import {
  normalizeUazapiEvent,
  deliveryStatus,
  isOptOut,
} from "./webhook-contract";
import { flowSchema } from "./contract";
import { selectAudience, personContext } from "./data";
import type { FlowDefinition } from "./contract";
import { matchesKeyword } from "./questions";

export async function authenticateAutomationWebhook(instanceId: string, secret: string) {
  const sql = getSql(),
    [credential] =
      await sql`select company_id,secret_hash from public.automation_webhook_secrets where instance_id=${instanceId}`;
  const hash = createHash("sha256").update(secret).digest("hex");
  if (
    !credential ||
    !timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(String(credential.secret_hash)),
    )
  )
    throw new Error("UNAUTHORIZED");
  return String(credential.company_id);
}

export async function receiveAutomationWebhook(instanceId: string, secret: string, body: unknown) {
  const companyId = await authenticateAutomationWebhook(instanceId, secret);
  return processAutomationWebhook(companyId, instanceId, normalizeUazapiEvent(body));
}

export async function processAutomationWebhook(companyId: string, instanceId: string, e: ReturnType<typeof normalizeUazapiEvent>) {
  const sql = getSql();
  const status = /update|receipt|ack/.test(e.type)
    ? deliveryStatus(e.status)
    : null;
  if (e.history || (e.api && !status)) return { ignored: true };
  if (e.type === "connection") {
    const status = ["connected", "connecting", "disconnected"].includes(
      e.connection,
    )
      ? e.connection
      : "error";
    await sql`update public.uazapi_instances set status=${status},last_checked_at=now() where id=${instanceId} and company_id=${companyId}`;
    return { ok: true };
  }
  if (!e.id) return { ignored: true };
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`${instanceId}:${e.chat}`}))`;
    const receiptKey = `${e.type}:${e.id}:${e.status}:${e.receipts.length ? createHash("sha256").update(JSON.stringify(e.receipts)).digest("hex") : ""}`;
    const receipts =
      await tx`insert into public.automation_webhook_receipts(instance_id,event_key) values(${instanceId},${receiptKey}) on conflict do nothing returning event_key`;
    if (!receipts[0]) return;
    if (status) {
      const rank = { sent: 1, delivered: 2, read: 3 };
      await tx`update public.automation_deliveries set status=${status},updated_at=now() where instance_id=${instanceId} and (provider_id=any(${tx.array(e.ids)}::text[]) or split_part(provider_id,':',2)=any(${tx.array(e.ids)}::text[])) and (${e.chat || null}::text is null or chat_id=${e.chat}) and company_id=${companyId} and (case status when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 else 0 end)<${rank[status]}`;
      return;
    }
    if (e.receipts.length && e.chat.endsWith("@g.us")) {
      const deliveries =
        await tx`select id,receipts from public.automation_deliveries where instance_id=${instanceId} and company_id=${companyId} and chat_id=${e.chat} and (provider_id=any(${tx.array(e.ids)}::text[]) or split_part(provider_id,':',2)=any(${tx.array(e.ids)}::text[])) for update`;
      const rank = { sent: 1, delivered: 2, read: 3 };
      for (const delivery of deliveries) {
        const merged = { ...delivery.receipts };
        for (const receipt of e.receipts) {
          const state = deliveryStatus(receipt.state);
          if (
            state &&
            receipt.participant &&
            (!merged[receipt.participant] ||
              rank[state] >=
                rank[
                  deliveryStatus(merged[receipt.participant].state) ?? "sent"
                ])
          )
            merged[receipt.participant] = {
              state,
              timestamp: receipt.timestamp,
            };
        }
        await tx`update public.automation_deliveries set receipts=${JSON.stringify(merged)}::jsonb,updated_at=now() where id=${delivery.id}`;
      }
      return;
    }
    if (!e.chat || !e.type.includes("message")) return;
    const [conversation] =
      await tx`select c.*,r.status as run_status,r.wait_kind,r.node_id,r.version_id,r.context,r.lease_token from public.automation_conversations c join public.automation_runs r on r.id=c.run_id where c.instance_id=${instanceId} and c.chat_id=${e.chat} and c.company_id=${companyId} for update of c,r`;
    if (isOptOut(e.text) && !e.fromMe) {
      const optChat = e.chat.endsWith("@g.us") ? e.sender : e.chat;
      if (!optChat || optChat.endsWith("@lid")) return;
      await tx`insert into public.automation_contacts(company_id,chat_id,opted_out) values(${companyId},${optChat},true) on conflict(company_id,chat_id) do update set opted_out=true,updated_at=now()`;
      if (e.chat.endsWith("@g.us")) return;
      await tx`update public.automation_runs set status='canceled',lease_token=null where company_id=${companyId} and (context->>'last_chat'=${e.chat} or context->>'chat_id'=${e.chat}) and status not in ('completed','failed','canceled')`;
      await tx`delete from public.automation_conversations where company_id=${companyId} and chat_id=${e.chat}`;
      return;
    }
    if (!conversation) {
      if (!e.fromMe) await startConversation(tx as unknown as ReturnType<typeof getSql>);
      return;
    }
    if (e.fromMe) {
      if (
        (
          await tx`select id from public.automation_deliveries where instance_id=${instanceId} and company_id=${companyId} and provider_id=${e.id}`
        )[0]
      )
        return;
      // Only a real human send reaches here; API sends were excluded above.
      await tx`update public.automation_conversations set human=true where id=${conversation.id}`;
      await tx`update public.automation_runs set status='human',lease_token=null where id=${conversation.run_id} and status not in ('completed','failed','canceled')`;
      await tx`insert into public.automation_tasks(company_id,run_id,node_id,title,kind) values(${companyId},${conversation.run_id},'human-intervention','Atendimento iniciado no WhatsApp','handoff') on conflict(run_id,node_id) do nothing`;
      return;
    }
    if (conversation.human || new Date(conversation.expires_at) < new Date())
      return;
    if (
      e.quoted &&
      conversation.last_outbound_id &&
      e.quoted !== conversation.last_outbound_id
    )
      return;
    if (e.chat.endsWith("@g.us")) {
      // Group replies belong to the verified author, never the first person in the audience.
      const digits = e.sender.split("@")[0].replace(/\D/g, "");
      if (!digits || e.sender.endsWith("@lid")) return;
      const [version] = await tx<
        { definition: FlowDefinition }[]
      >`select definition from public.automation_versions where id=${conversation.version_id}`;
      const cellId = version.definition.nodes.find(
        (n) =>
          n.id === conversation.context.last_message_node_id &&
          n.kind === "whatsapp" &&
          n.config.destination === "group",
      )?.config.cellId;
      if (!cellId) return;
      const authors =
        await tx`select p.id,p.full_name from public.people p where p.company_id=${companyId} and p.deleted_at is null and p.is_active and (regexp_replace(p.phone,'\D','','g')=${digits} or '55'||regexp_replace(p.phone,'\D','','g')=${digits}) and exists(select 1 from public.group_members m where m.company_id=p.company_id and m.person_id=p.id and m.group_id=${cellId} and m.status='active')`;
      if (authors.length !== 1) return;
      await tx`update public.automation_runs set person_id=${authors[0].id},context=context||${JSON.stringify({ nome: authors[0].full_name, primeiro_nome: String(authors[0].full_name).split(" ")[0] })}::jsonb where id=${conversation.run_id}`;
    }
    if (
      conversation.run_status === "waiting" &&
      ["response", "ai", "question"].includes(conversation.wait_kind)
    ) {
      const [v] = await tx<
        { definition: FlowDefinition }[]
      >`select definition from public.automation_versions where id=${conversation.version_id}`;
      const definition = flowSchema.parse(v.definition),
        node = definition.nodes.find((n) => n.id === conversation.node_id)!;
      const next =
        ["ai", "question"].includes(conversation.wait_kind)
          ? node.id
          : definition.edges.find(
              (edge) => edge.source === node.id && edge.port === "response",
            )?.target;
      await tx`update public.automation_runs set node_id=${next ?? node.id},status=${next ? "ready" : "failed"},due_at=now(),wait_kind=null,waiting_node_id=null,context=context||${JSON.stringify({ resposta: e.text, inbound: true, pending_response: null, ...(conversation.wait_kind === "question" ? { question_input: e.text } : {}) })}::jsonb,updated_at=now() where id=${conversation.run_id} and status='waiting'`;
      if (conversation.wait_kind === "response")
        await tx`insert into public.automation_steps(company_id,run_id,node_id,status,detail) values(${companyId},${conversation.run_id},${node.id},'completed','{"port":"response"}'::jsonb) on conflict(run_id,node_id) do nothing`;
    } else if (["ready", "working"].includes(conversation.run_status)) {
      await tx`update public.automation_runs set context=context||${JSON.stringify({ pending_response: e.text })}::jsonb where id=${conversation.run_id}`;
    }
  });
  async function startConversation(tx: ReturnType<typeof getSql>) {
    const opted =
      await tx`select opted_out from public.automation_contacts where company_id=${companyId} and chat_id=${e.chat}`;
    if (opted[0]?.opted_out) return { ignored: true };
    const digits = e.chat.split("@")[0].replace(/\D/g, "");
    const people =
      await tx`select id from public.people where company_id=${companyId} and deleted_at is null and is_active and (regexp_replace(phone,'\D','','g')=${digits} or '55'||regexp_replace(phone,'\D','','g')=${digits})`;
    if (
      e.chat.endsWith("@g.us") ||
      e.chat.endsWith("@lid")
    )
      return { ignored: true };
    const flows = await tx<
      {
        id: string;
        company_id: string;
        published_version_id: string;
        published_at: Date;
        actor_id: string;
        definition: FlowDefinition;
      }[]
    >`select f.*,v.definition,v.actor_id from public.automation_flows f join public.automation_versions v on v.id=f.published_version_id where f.company_id=${companyId} and f.status='active' order by f.published_at`;
    for (const flow of flows) {
      const root = flow.definition.nodes.find((n) => n.kind === "trigger");
      if (
        root?.config.mode !== "message" ||
        root.config.instanceId !== instanceId
      )
        continue;
      if (!matchesKeyword(e.text, root.config.keyword)) continue;
      if (people.length !== 1 && !root.config.allowUnknownContacts) continue;
      const [p] = people.length === 1 ? await selectAudience(
        companyId,
        root.config.filter,
        people[0].id,
        tx,
      ) : [];
      if (people.length === 1 && !p) continue;
      if (
        (
          await tx`select id from public.automation_conversations where instance_id=${instanceId} and chat_id=${e.chat}`
        )[0]
      )
        return;
      const [run] =
        await tx`insert into public.automation_runs(company_id,flow_id,version_id,person_id,event_key,node_id,context,ancestry) values(${companyId},${flow.id},${flow.published_version_id},${p?.id ?? null},${`inbound:${instanceId}:${e.id}`},${root.id},${JSON.stringify({ ...(p ? personContext(p) : {}), chat_id: e.chat, resposta: e.text, inbound: true, last_instance: instanceId, last_chat: e.chat })}::jsonb,${tx.array([flow.id])}::uuid[]) on conflict(company_id,flow_id,event_key) do nothing returning id`;
      if (run)
        await tx`insert into public.automation_conversations(company_id,instance_id,chat_id,run_id,expires_at) values(${companyId},${instanceId},${e.chat},${run.id},now()+interval '1 day')`;
      break;
    }
  }
  return { ok: true };
}
