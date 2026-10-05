import { getSql } from "@/lib/db/client";
import {
  flowSchema,
  conditionMatches,
  renderText,
  isBirthday,
  localClock,
  zonedDate,
  scheduleKey,
  type FlowDefinition,
  type FlowNode,
} from "./contract";
import {
  selectAudience,
  personContext,
  assertDefinitionPermissions,
} from "./data";
import { callAutomationAI } from "./ai";
import {
  sendAutomationMessage,
  whatsappChatId,
  UncertainDelivery,
} from "./delivery";
import type { UserRole } from "@/lib/types";

type Run = {
  id: string;
  company_id: string;
  flow_id: string;
  version_id: string;
  person_id: string | null;
  event_key: string;
  node_id: string;
  context: Record<string, unknown>;
  status: string;
  wait_kind: string | null;
  waiting_node_id: string | null;
  wait_started_at: Date | null;
  lease_token: string;
  ancestry: string[];
};
type ActiveFlow = {
  id: string;
  company_id: string;
  published_version_id: string;
  published_at: Date;
  definition: FlowDefinition;
  actor_id: string;
};
function dateOnly(value: string | Date) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}
export async function enqueueAutomationRun(
  flow: ActiveFlow,
  personId: string | null,
  eventKey: string,
  context: Record<string, unknown>,
  ancestry: string[] = [],
) {
  const root = flow.definition.nodes.find((n) => n.kind === "trigger");
  if (!root) throw new Error("Fluxo sem início");
  if (ancestry.includes(flow.id) || ancestry.length >= 8)
    throw new Error("Encadeamento recursivo bloqueado");
  await getSql()`insert into public.automation_runs(company_id,flow_id,version_id,person_id,event_key,node_id,context,ancestry) values(${flow.company_id},${flow.id},${flow.published_version_id},${personId},${eventKey},${root.id},${JSON.stringify(context)}::jsonb,${getSql().array([...ancestry, flow.id])}::uuid[]) on conflict(company_id,flow_id,event_key) do nothing`;
}

export async function collectAutomationStarts(now = new Date()) {
  const sql = getSql();
  const flows = await sql<
    ActiveFlow[]
  >`select f.id,f.company_id,f.published_version_id,f.published_at,v.definition,v.actor_id from public.automation_flows f join public.automation_versions v on v.id=f.published_version_id where f.status='active'`;
  for (const flow of flows) {
    flow.definition = flowSchema.parse(flow.definition);
    const root = flow.definition.nodes.find((n) => n.kind === "trigger")!,
      c = root.config;
    const [settings] =
      await sql`select timezone from public.automation_settings where company_id=${flow.company_id}`;
    const timezone = String(settings?.timezone ?? "America/Sao_Paulo"),
      today = localClock(now, timezone);
    if (
      c.mode === "schedule" ||
      c.mode === "birthday" ||
      c.mode === "relative_date"
    ) {
      const key =
        c.mode === "schedule"
          ? scheduleKey(root, now, timezone)
          : today.time >= (c.time ?? "09:00")
            ? `${c.mode}:${today.date}`
            : null;
      if (!key) continue;
      // No catch-up for times predating publication.
      if (
        c.mode === "schedule" &&
        c.schedule === "once" &&
        zonedDate(c.at ?? "", timezone).getTime() <=
          new Date(flow.published_at).getTime()
      )
        continue;
      const published = localClock(new Date(flow.published_at), timezone);
      if (
        published.date === today.date &&
        published.time >= (c.time ?? "08:00") &&
        !(c.mode === "schedule" && c.schedule === "once")
      )
        continue;
      const people = await selectAudience(flow.company_id, c.filter);
      for (const person of people) {
        if (
          c.mode === "birthday" &&
          (!person.birth_date ||
            !isBirthday(dateOnly(person.birth_date), today))
        )
          continue;
        if (c.mode === "relative_date") {
          const date =
            c.dateField === "birth_date"
              ? person.birth_date
              : person.baptism_date;
          if (!date) continue;
          const target = new Date(`${dateOnly(date)}T12:00:00Z`);
          target.setUTCDate(target.getUTCDate() + (c.offsetDays ?? 0));
          if (target.toISOString().slice(0, 10) !== today.date) continue;
        }
        await enqueueAutomationRun(
          flow,
          person.id,
          `${key}:${person.id}`,
          personContext(person),
        );
      }
    }
    if (c.mode === "event" && c.event === "event.upcoming") {
      const registrations =
        await sql`select distinct r.person_id,e.id,e.title from (select company_id,event_id,person_id,status from public.event_guest_registrations union all select company_id,event_id,person_id,status from public.member_event_rsvps) r join public.events e on e.id=r.event_id and e.company_id=r.company_id where r.company_id=${flow.company_id} and r.person_id is not null and r.status='going' and e.deleted_at is null and (e.starts_at at time zone ${timezone})::date=(${today.date}::date+${c.offsetDays ?? 1}::integer)`;
      for (const r of registrations) {
        const [p] = await selectAudience(
          flow.company_id,
          c.filter,
          r.person_id,
        );
        if (p)
          await enqueueAutomationRun(
            flow,
            p.id,
            `event:${r.id}:${today.date}:${p.id}`,
            { ...personContext(p), evento: r.title },
          );
      }
    }
    if (c.mode === "event" && c.event === "volunteer.upcoming") {
      const assignments =
        await sql`select a.id,v.person_id,s.role_name from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=a.company_id join public.volunteer_shifts s on s.id=a.shift_id and s.company_id=a.company_id where a.company_id=${flow.company_id} and a.status in ('assigned','confirmed') and (s.starts_at at time zone ${timezone})::date=(${today.date}::date+${c.offsetDays ?? 1}::integer)`;
      for (const a of assignments) {
        const [p] = await selectAudience(
          flow.company_id,
          c.filter,
          a.person_id,
        );
        if (p)
          await enqueueAutomationRun(
            flow,
            p.id,
            `shift:${a.id}:${today.date}:${p.id}`,
            { ...personContext(p), evento: a.role_name },
          );
      }
    }
  }
  // Transactional fan-out. A crash rolls back processed_at and inserts together.
  await sql.begin(async (tx) => {
    const events =
      await tx`select * from public.automation_events where processed_at is null order by created_at for update skip locked limit 100`;
    for (const event of events) {
      for (const flow of flows.filter(
        (f) =>
          f.company_id === event.company_id &&
          new Date(f.published_at) < new Date(event.created_at),
      )) {
        const root = flow.definition.nodes.find((n) => n.kind === "trigger")!,
          c = root.config;
        if (c.mode !== "event" || c.event !== event.type) continue;
        let personIds: string[] = [];
        if (String(event.type).startsWith("kids.")) {
          const guardians =
            await tx`select g.person_id from public.kid_guardians g where g.company_id=${event.company_id} and g.kid_id=${event.context.kid_id ?? null}::uuid and g.deleted_at is null and g.whatsapp_enabled=true and exists(select 1 from public.kid_consents c where c.company_id=g.company_id and c.kid_id=g.kid_id and c.consent_type='communication' and c.status='granted')`;
          personIds = guardians.map((g) => String(g.person_id));
        } else if (event.person_id) personIds = [String(event.person_id)];
        else if (
          ["content.published", "congregation.updated"].includes(event.type)
        )
          personIds = (await selectAudience(flow.company_id, c.filter)).map(
            (p) => p.id,
          );
        if (event.type === "finance.updated") {
          await tx`insert into public.automation_runs(company_id,flow_id,version_id,event_key,node_id,context,ancestry) values(${flow.company_id},${flow.id},${flow.published_version_id},${`event:${event.id}`},${root.id},${JSON.stringify(event.context)}::jsonb,${tx.array([flow.id])}::uuid[]) on conflict(company_id,flow_id,event_key) do nothing`;
        }
        // Unknown guests and finance records without a verified person never expand to all members.
        for (const personId of personIds) {
          const [p] = await selectAudience(flow.company_id, c.filter, personId);
          if (!p) continue;
          await tx`insert into public.automation_runs(company_id,flow_id,version_id,person_id,event_key,node_id,context,ancestry) values(${flow.company_id},${flow.id},${flow.published_version_id},${personId},${`event:${event.id}:${personId}`},${root.id},${JSON.stringify({ ...personContext(p), ...event.context })}::jsonb,${tx.array([flow.id])}::uuid[]) on conflict(company_id,flow_id,event_key) do nothing`;
        }
      }
      await tx`update public.automation_events set processed_at=now() where id=${event.id}`;
    }
  });
}

async function finish(
  run: Run,
  node: FlowNode,
  port: string,
  status = "ready",
  extra: Record<string, unknown> = {},
  dueAt = new Date(),
) {
  const sql = getSql(),
    [version] = await sql<
      { definition: FlowDefinition }[]
    >`select definition from public.automation_versions where id=${run.version_id}`;
  const next = version.definition.edges.find(
    (e) => e.source === node.id && e.port === port,
  )?.target;
  const merge = { ...run.context, ...extra };
  if (!Object.hasOwn(extra, "pending_response")) delete merge.pending_response;
  await sql.begin(async (tx) => {
    const updated =
      await tx`update public.automation_runs set node_id=${next ?? node.id},status=${next ? status : port === "error" ? "failed" : "completed"},context=context||${JSON.stringify(merge)}::jsonb,last_error=${typeof extra.last_error === "string" ? extra.last_error : null},due_at=${dueAt},lease_token=null,lease_until=null,wait_kind=null,waiting_node_id=null,updated_at=now() where id=${run.id} and lease_token=${run.lease_token} and status='working' returning id`;
    if (!updated[0])
      throw new Error("Execução pausada ou cancelada durante o processamento");
    await tx`insert into public.automation_steps(company_id,run_id,node_id,status,detail) values(${run.company_id},${run.id},${node.id},${port === "error" ? "failed" : "completed"},${JSON.stringify({ port, error: extra.last_error ?? null })}::jsonb) on conflict(run_id,node_id) do update set status=excluded.status,detail=excluded.detail`;
    if (!next)
      await tx`delete from public.automation_conversations where run_id=${run.id}`;
  });
}
async function waitFor(run: Run, node: FlowNode, kind: string) {
  await getSql().begin(async (tx) => {
    const [current] =
      await tx`select context from public.automation_runs where id=${run.id} and lease_token=${run.lease_token} and status='working' for update`;
    if (!current) return;
    if (kind !== "task" && current.context.pending_response) {
      const [version] = await tx<
        { definition: FlowDefinition }[]
      >`select definition from public.automation_versions where id=${run.version_id}`;
      const next =
        kind === "ai"
          ? node.id
          : version.definition.edges.find(
              (e) => e.source === node.id && e.port === "response",
            )?.target;
      await tx`update public.automation_runs set node_id=${next ?? node.id},status=${next ? "ready" : "failed"},context=context||${JSON.stringify({ resposta: current.context.pending_response, pending_response: null, inbound: true })}::jsonb,due_at=now(),wait_kind=null,waiting_node_id=null,lease_token=null,lease_until=null where id=${run.id}`;
      if (kind === "response")
        await tx`insert into public.automation_steps(company_id,run_id,node_id,status,detail) values(${run.company_id},${run.id},${node.id},'completed','{"port":"response"}'::jsonb) on conflict(run_id,node_id) do nothing`;
      return;
    }
    await tx`update public.automation_runs set status='waiting',wait_kind=${kind},waiting_node_id=${node.id},wait_started_at=now(),due_at=${new Date(Date.now() + (node.config.minutes ?? 1440) * 60000)},lease_token=null,lease_until=null where id=${run.id}`;
  });
}
async function createTask(run: Run, node: FlowNode, kind = "task") {
  const sql = getSql(),
    c = node.config;
  const [task] =
    await sql`insert into public.automation_tasks(company_id,run_id,node_id,person_id,title,responsible_id,due_at,kind) values(${run.company_id},${run.id},${node.id},${run.person_id},${renderText(c.title ?? "Acompanhamento", run.context)},${c.responsibleId ?? (typeof run.context.responsible_id === "string" ? run.context.responsible_id : null)}::uuid,${new Date(Date.now() + (c.dueDays ?? 1) * 86400000)},${kind}) on conflict(run_id,node_id) do update set title=excluded.title returning id`;
  return String(task.id);
}
async function ensureConversation(
  run: Run,
  instanceId: string,
  chatId: string,
  maxMinutes = 1440,
  outboundId?: string,
) {
  const sql = getSql();
  await sql`delete from public.automation_conversations c using public.automation_runs r where c.run_id=r.id and c.instance_id=${instanceId} and c.chat_id=${chatId} and r.status in ('completed','failed','canceled','skipped')`;
  const rows =
    await sql`insert into public.automation_conversations(company_id,instance_id,chat_id,run_id,expires_at,last_outbound_id) values(${run.company_id},${instanceId},${chatId},${run.id},${new Date(Date.now() + maxMinutes * 60000)},${outboundId ?? null}) on conflict(instance_id,chat_id) do update set expires_at=excluded.expires_at,last_outbound_id=coalesce(excluded.last_outbound_id,automation_conversations.last_outbound_id) where automation_conversations.run_id=excluded.run_id and not automation_conversations.human returning id`;
  if (!rows[0])
    throw new Error("Conversa já está em outro fluxo ou atendimento humano");
}
async function step(run: Run) {
  const sql = getSql(),
    [version] = await sql<
      { definition: FlowDefinition; actor_id: string }[]
    >`select definition,actor_id from public.automation_versions where id=${run.version_id} and company_id=${run.company_id}`;
  if (!version) throw new Error("Versão não encontrada");
  const definition = flowSchema.parse(version.definition),
    node = definition.nodes.find((n) => n.id === run.node_id);
  if (!node) throw new Error("Bloco não encontrado");
  try {
    const [actor] = await sql<
      { role: UserRole }[]
    >`select role from public.profiles where id=${version.actor_id} and active and (company_id=${run.company_id} or role='superadmin')`;
    if (!actor)
      throw new Error("Responsável pela publicação não possui mais acesso");
    assertDefinitionPermissions(actor.role, definition);
    const c = node.config;
    if (run.wait_kind) {
      const port =
        run.wait_kind === "task"
          ? (
              await sql`select id from public.automation_tasks where id=${String(run.context.task_id)}::uuid and run_id=${run.id} and status='completed'`
            )[0]
            ? "response"
            : "timeout"
          : "timeout";
      if (run.wait_kind === "ai")
        return finish(run, node, "next", "ready", { ai_timeout: true });
      return finish(run, node, port);
    }
    if (node.kind === "end") return finish(run, node, "next");
    if (node.kind === "trigger") return finish(run, node, "next");
    if (node.kind === "audience")
      return finish(
        run,
        node,
        (await selectAudience(run.company_id, c.filter, run.person_id)).length
          ? "yes"
          : "no",
      );
    if (node.kind === "condition")
      return finish(
        run,
        node,
        conditionMatches(
          run.context[c.field ?? "resposta"],
          c.operator,
          renderText(c.value ?? "", run.context),
        )
          ? "yes"
          : "no",
      );
    if (node.kind === "switch")
      return finish(
        run,
        node,
        c.cases?.find((item) =>
          conditionMatches(
            run.context[c.field ?? "resposta"],
            "equals",
            item.value,
          ),
        )?.port ?? "default",
      );
    if (node.kind === "wait") {
      const [settings] = c.until
        ? await sql`select timezone from public.automation_settings where company_id=${run.company_id}`
        : [];
      return finish(
        run,
        node,
        "next",
        "ready",
        {},
        c.until
          ? zonedDate(
              c.until,
              String(settings?.timezone ?? "America/Sao_Paulo"),
            )
          : new Date(Date.now() + (c.minutes ?? 1) * 60000),
      );
    }
    if (node.kind === "response" || node.kind === "task_wait") {
      if (node.kind === "response") {
        if (run.context.pending_response)
          return finish(run, node, "response", "ready", {
            resposta: run.context.pending_response,
            pending_response: null,
          });
        if (!run.context.last_instance || !run.context.last_chat)
          throw new Error("Envie uma mensagem antes de aguardar resposta");
        await ensureConversation(
          run,
          String(run.context.last_instance),
          String(run.context.last_chat),
          c.minutes ?? 1440,
          String(run.context.last_provider_id ?? ""),
        );
      } else if (!run.context.task_id)
        throw new Error("Crie uma tarefa antes de aguardar conclusão");
      return waitFor(run, node, node.kind === "response" ? "response" : "task");
    }
    if (node.kind === "whatsapp") {
      const root = definition.nodes.find((n) => n.kind === "trigger")!;
      const [person] = run.person_id
        ? await selectAudience(
            run.company_id,
            root.config.filter,
            run.person_id,
          )
        : [];
      if (run.person_id && !person)
        return finish(run, node, "next", "ready", {
          skipped_reason: "Pessoa saiu do público",
        });
      if (run.context.kid_id) {
        const guardian =
          await sql`select id from public.kid_guardians g where g.company_id=${run.company_id} and g.kid_id=${String(run.context.kid_id)}::uuid and g.person_id=${run.person_id} and g.deleted_at is null and g.whatsapp_enabled and exists(select 1 from public.kid_consents c where c.company_id=g.company_id and c.kid_id=g.kid_id and c.consent_type='communication' and c.status='granted')`;
        if (!guardian[0])
          return finish(run, node, "next", "ready", {
            skipped_reason: "Autorização do responsável não está mais válida",
          });
      }
      let chatId = run.context.chat_id
        ? String(run.context.chat_id)
        : whatsappChatId(person?.phone ?? "");
      let sendContext = {
        ...run.context,
        ...(person ? personContext(person) : {}),
      };
      if (c.destination === "group") {
        const [group] =
          await sql`select g.name,g.meeting_time::text,l.full_name as leader_name,g.automation_whatsapp_chat_id from public.groups g left join public.people l on l.id=g.leader_person_id and l.company_id=g.company_id where g.id=${c.cellId!} and g.company_id=${run.company_id} and g.is_active and g.deleted_at is null`;
        if (!group?.automation_whatsapp_chat_id)
          throw new Error("Grupo não vinculado ou célula inativa");
        chatId = String(group.automation_whatsapp_chat_id);
        sendContext = {
          ...run.context,
          nome: group.name,
          primeiro_nome: group.name,
          celula: group.name,
          lider: group.leader_name ?? "",
          horario: group.meeting_time ?? "",
          igreja: person?.company_name ?? "",
        };
        // One delivery per scheduled occurrence and group, regardless of member count.
        const groupKey = run.event_key.replace(/:[0-9a-f-]{36}$/i, "");
        const [claim] =
          await sql`insert into public.automation_group_occurrences(company_id,flow_id,occurrence,node_id,chat_id,run_id) values(${run.company_id},${run.flow_id},${groupKey},${node.id},${chatId},${run.id}) on conflict(company_id,flow_id,occurrence,node_id,chat_id) do update set run_id=automation_group_occurrences.run_id where automation_group_occurrences.run_id=excluded.run_id returning run_id`;
        if (!claim)
          return finish(run, node, "next", "ready", {
            skipped_reason: "Grupo já recebeu esta ocorrência",
          });
      }
      const [opt] =
        await sql`select opted_out from public.automation_contacts where company_id=${run.company_id} and chat_id=${chatId}`;
      if (opt?.opted_out)
        return finish(run, node, "next", "ready", {
          skipped_reason: "Contato descadastrado",
        });
      const [settings] =
        await sql`select timezone,quiet_start::text,quiet_end::text from public.automation_settings where company_id=${run.company_id}`;
      const clock = localClock(
        new Date(),
        String(settings?.timezone ?? "America/Sao_Paulo"),
      );
      if (
        !run.context.inbound &&
        (clock.time < String(settings?.quiet_start ?? "08:00").slice(0, 5) ||
          clock.time >= String(settings?.quiet_end ?? "20:00").slice(0, 5))
      ) {
        await sql`update public.automation_runs set status='ready',due_at=now()+interval '15 minutes',lease_token=null where id=${run.id} and lease_token=${run.lease_token}`;
        return;
      }
      await ensureConversation(run, c.instanceId!, chatId);
      const providerId = await sendAutomationMessage({
        companyId: run.company_id,
        runId: run.id,
        nodeId: node.id,
        instanceId: c.instanceId!,
        chatId,
        message: c.message!,
        context: sendContext,
        fallbackText: c.fallbackText,
      });
      await ensureConversation(run, c.instanceId!, chatId, 1440, providerId);
      return finish(run, node, "next", "ready", {
        last_instance: c.instanceId,
        last_chat: chatId,
        last_provider_id: providerId,
        last_message_node_id: node.id,
      });
    }
    if (node.kind === "ai") {
      const turns = Number(run.context.ai_turns ?? 0);
      if (
        c.mode === "conversation" &&
        (String(run.context.last_chat ?? run.context.chat_id ?? "").endsWith(
          "@g.us",
        ) ||
          turns >= (c.maxTurns ?? 5))
      )
        return finish(run, node, "error", "ready", {
          last_error: "Limite de conversa ou grupo não permitido",
        });
      const response = await callAutomationAI({
        companyId: run.company_id,
        model: c.model!,
        prompt: renderText(c.prompt!, run.context),
        context: run.context,
        requestKey: `${run.id}:${node.id}:${turns}`,
        flowId: run.flow_id,
        runId: run.id,
        maxTokens: c.maxTokens,
      });
      const result = response.result!,
        extra = {
          ai_text: result.text,
          ai_result: result.intent,
          ai_values: result.values ?? {},
          ai_turns: turns + 1,
          ...Object.fromEntries(
            Object.entries(result.values ?? {})
              .filter(([key]) =>
                ["email", "phone", "city", "neighborhood"].includes(key),
              )
              .map(([key, value]) => [`ai_${key}`, value]),
          ),
        };
      if (c.mode !== "conversation" || result.intent === "human")
        return finish(
          run,
          node,
          result.intent === "human" ? "error" : "next",
          "ready",
          extra,
        );
      const root = definition.nodes.find((n) => n.kind === "trigger")!;
      const [p] = run.person_id
        ? await selectAudience(
            run.company_id,
            root.config.filter,
            run.person_id,
          )
        : [];
      if (!p)
        return finish(run, node, "next", "ready", {
          skipped_reason: "Pessoa saiu do público",
        });
      const chat = String(
        run.context.last_chat ??
          run.context.chat_id ??
          whatsappChatId(p?.phone ?? ""),
      );
      const instance = c.instanceId!;
      const [opt] =
        await sql`select opted_out from public.automation_contacts where company_id=${run.company_id} and chat_id=${chat}`;
      if (opt?.opted_out)
        return finish(run, node, "next", "ready", {
          skipped_reason: "Contato descadastrado",
        });
      await ensureConversation(run, instance, chat, c.maxMinutes ?? 30);
      const provider = await sendAutomationMessage({
        companyId: run.company_id,
        runId: run.id,
        nodeId: `${node.id}:turn:${turns}`,
        instanceId: instance,
        chatId: chat,
        message: { type: "text", text: result.text },
        context: run.context,
      });
      run.context = {
        ...run.context,
        ...extra,
        last_instance: instance,
        last_chat: chat,
        last_provider_id: provider,
      };
      await sql`update public.automation_runs set context=context||${JSON.stringify(run.context)}::jsonb where id=${run.id} and lease_token=${run.lease_token}`;
      await ensureConversation(
        run,
        instance,
        chat,
        c.maxMinutes ?? 30,
        provider,
      );
      if (result.done) return finish(run, node, "next", "ready", extra);
      return waitFor(
        run,
        { ...node, config: { ...c, minutes: c.maxMinutes ?? 30 } },
        "ai",
      );
    }
    if (node.kind === "task")
      return finish(run, node, "next", "ready", {
        task_id: await createTask(run, node),
      });
    if (node.kind === "assign")
      return finish(run, node, "next", "ready", {
        responsible_id: c.responsibleId,
      });
    if (node.kind === "interest") {
      if (!run.person_id)
        throw new Error("Interesse exige pessoa identificada");
      await sql`insert into public.automation_interests(company_id,run_id,node_id,person_id,interest) values(${run.company_id},${run.id},${node.id},${run.person_id},${renderText(c.interest!, run.context)}) on conflict(run_id,node_id) do nothing`;
      return finish(run, node, "next");
    }
    if (node.kind === "update") {
      if (!run.person_id) throw new Error("Pessoa não identificada");
      // Contract allowlist is rechecked by parsing the published graph.
      const allowed = [
        "neighborhood",
        "city",
        "phone",
        "email",
        "journey_status",
      ];
      if (!allowed.includes(c.field ?? ""))
        throw new Error("Campo não permitido");
      const value = renderText(c.value ?? "", {
        ...run.context,
        ...(run.context.ai_values as Record<string, unknown>),
      });
      if (c.field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw new Error("Email inválido");
      if (c.field === "phone") whatsappChatId(value);
      if (value.length > 180) throw new Error("Valor excede o limite do campo");
      await sql.begin(async (tx) => {
        await tx`select set_config('app.automation_run_id',${run.id},true)`;
        await tx`update public.people set ${tx({ [c.field!]: value })},updated_at=now() where id=${run.person_id} and company_id=${run.company_id} and deleted_at is null`;
      });
      return finish(run, node, "next");
    }
    if (node.kind === "notify" || node.kind === "handoff") {
      if (node.kind === "handoff") {
        const [person] = run.person_id ? await selectAudience(run.company_id, {}, run.person_id) : [];
        const chat = String(run.context.last_chat ?? run.context.chat_id ?? whatsappChatId(person?.phone ?? ""));
        await ensureConversation(run, String(run.context.last_instance ?? c.instanceId), chat);
      }
      const taskId = await createTask(run, node, node.kind);
      if (c.responsibleId && c.instanceId) {
        const [responsible] =
          await sql`select login_phone as phone from public.profiles where id=${c.responsibleId} and company_id=${run.company_id} and active`;
        if (!responsible?.phone) throw new Error("Responsável sem telefone WhatsApp; revise a tarefa criada");
        await sendAutomationMessage({
            companyId: run.company_id,
            runId: run.id,
            nodeId: `${node.id}:notify`,
            instanceId: c.instanceId,
            chatId: whatsappChatId(String(responsible.phone)),
            message: {
              type: "text",
              text: `${c.title}: {{nome}}. Acesse as tarefas de Automações no Altar Church.`,
            },
            context: run.context,
          });
      }
      if (node.kind === "notify")
        return finish(run, node, "next", "ready", { task_id: taskId });
      await sql`update public.automation_conversations set human=true where run_id=${run.id}`;
      return finish(run, node, "next", "human", { task_id: taskId });
    }
    if (node.kind === "start_flow") {
      const [flow] = await sql<
        ActiveFlow[]
      >`select f.*,v.definition,v.actor_id from public.automation_flows f join public.automation_versions v on v.id=f.published_version_id where f.id=${c.flowId!} and f.company_id=${run.company_id} and f.status='active'`;
      if (!flow) throw new Error("Fluxo destino indisponível");
      await enqueueAutomationRun(
        flow,
        run.person_id,
        `parent:${run.id}:${node.id}`,
        run.context,
        run.ancestry,
      );
      return finish(run, node, "next");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no bloco";
    if (error instanceof UncertainDelivery) {
      await sql`update public.automation_runs set status='review',last_error=${message},lease_token=null where id=${run.id} and lease_token=${run.lease_token}`;
      return;
    }
    return finish(run, node, "error", "ready", { last_error: message });
  }
}
export async function processAutomations(batchSize = 25) {
  await collectAutomationStarts();
  const sql = getSql();
  // Completed tasks can wake their own waiter before the timeout.
  await sql`update public.automation_runs r set due_at=now() where r.status='waiting' and r.wait_kind='task' and exists(select 1 from public.automation_tasks t where t.id=(r.context->>'task_id')::uuid and t.run_id=r.id and t.status='completed')`;
  let processed = 0;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && processed < batchSize) {
    const runs = await sql<
      Run[]
    >`select * from public.claim_automation_runs(1)`;
    if (!runs[0]) break;
    try {
      await step(runs[0]);
    } catch {
      await sql`update public.automation_runs set status='failed',last_error='Falha de processamento; consulte a operação',lease_token=null where id=${runs[0].id} and lease_token=${runs[0].lease_token}`;
    }
    processed++;
  }
  return { processed };
}
