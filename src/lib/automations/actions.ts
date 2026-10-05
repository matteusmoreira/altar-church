"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { writeAuditLog } from "@/lib/auth/permissions";
import {
  flowSchema,
  parseStoredFlowDefinition,
  validateFlow,
  type FlowDefinition,
} from "./contract";
import {
  automationAccess,
  assertDefinitionPermissions,
  selectAudience,
  personContext,
} from "./data";
import { callAutomationAI, openRouterModels } from "./ai";
import {
  uploadManagedFile,
  getOptionalFile,
  createSignedUrlsByStoragePath,
} from "@/lib/files/server";
import { randomBytes, createHash } from "node:crypto";
import { enqueueAutomationRun } from "./runtime";
import { SHARED_DELIVERY_EVENTS } from "./ownership";
import { sendAutomationTestMessage } from "./delivery";

const uuid = z.string().uuid();
export async function automationMediaPreview(id: string) {
  const { companyId } = await automationAccess();
  const [file] =
    await getSql()`select storage_path from public.app_files where id=${uuid.parse(id)} and company_id=${companyId} and is_active and deleted_at is null and mime_type like 'image/%'`;
  if (!file) return "";
  return (
    (await createSignedUrlsByStoragePath([String(file.storage_path)], 600)).get(
      String(file.storage_path),
    ) ?? ""
  );
}
export async function sendAutomationDraftTest(input: {
  definition: FlowDefinition;
  nodeId: string;
  requestId: string;
  instanceId: string;
  phone: string;
  personId: string;
  context: Record<string, string>;
}) {
  const { user, companyId } = await automationAccess("automations.operate");
  await automationAccess("communication.send");
  const definition = flowSchema.parse(input.definition);
  assertDefinitionPermissions(user.role, definition);
  const node = definition.nodes.find(
    (n) => n.id === input.nodeId && n.kind === "whatsapp",
  );
  if (!node?.config.message) throw new Error("Selecione um bloco de mensagem");
  const [person] = await selectAudience(
    companyId,
    undefined,
    uuid.parse(input.personId),
  );
  if (!person) throw new Error("Pessoa não disponível nesta igreja");
  const context = z
    .record(z.string().max(80), z.string().max(4096))
    .parse(input.context);
  if (Object.keys(context).length > 40)
    throw new Error("Contexto de teste inválido");
  const testNode = {
    ...node,
    id: "message",
    config: {
      ...node.config,
      instanceId: uuid.parse(input.instanceId),
      destination: "person" as const,
    },
  };
  const messageIssues = validateFlow({
    schemaVersion: 1,
    nodes: [
      {
        id: "start",
        kind: "trigger",
        label: "Início",
        position: { x: 0, y: 0 },
        config: { mode: "manual" },
      },
      testNode,
      {
        id: "end",
        kind: "end",
        label: "Fim",
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "a", source: "start", target: "message", port: "next" },
      { id: "b", source: "message", target: "end", port: "next" },
      { id: "c", source: "message", target: "end", port: "error" },
    ],
  });
  if (messageIssues.length)
    throw new Error(messageIssues.map((i) => i.message).join("; "));
  const result = await sendAutomationTestMessage({
    companyId,
    actorId: user.id,
    requestId: uuid.parse(input.requestId),
    nodeId: node.id,
    instanceId: testNode.config.instanceId,
    phone: z.string().min(10).max(30).parse(input.phone),
    message: node.config.message,
    context: { ...personContext(person), ...context },
  });
  await writeAuditLog({
    action: "automation.message_test",
    entityTable: "automation_test_deliveries",
    entityId: input.requestId,
    companyId,
    metadata: { status: result.status },
  });
  return result;
}
export async function saveAutomation(input: {
  id?: string;
  name: string;
  description?: string;
  definition: FlowDefinition;
  revision?: number;
}) {
  const { user, companyId } = await automationAccess("automations.edit");
  const definition = flowSchema.parse(input.definition),
    name = z.string().trim().min(3).max(160).parse(input.name);
  assertDefinitionPermissions(user.role, definition);
  const sql = getSql(),
    body = sql.json(definition);
  const rows = input.id
    ? await sql`update public.automation_flows set name=${name},description=${input.description ?? ""},draft=${body}::jsonb,revision=revision+1,updated_at=now() where id=${uuid.parse(input.id)} and company_id=${companyId} and revision=${input.revision ?? 0} and status<>'archived' returning id,revision`
    : await sql`insert into public.automation_flows(company_id,name,description,draft,created_by) values(${companyId},${name},${input.description ?? ""},${body}::jsonb,${user.id}) returning id,revision`;
  if (!rows[0])
    throw new Error(
      "Este fluxo foi alterado em outra aba. Atualize antes de salvar.",
    );
  await writeAuditLog({
    action: "automation.save",
    entityTable: "automation_flows",
    entityId: rows[0].id,
    companyId,
  });
  revalidatePath("/automacoes");
  return { id: String(rows[0].id), revision: Number(rows[0].revision) };
}
export async function publishAutomation(id: string, revision: number) {
  const { user, companyId } = await automationAccess("automations.publish"),
    sql = getSql();
  await sql.begin(async (tx) => {
    const [flow] =
      await tx`select * from public.automation_flows where id=${uuid.parse(id)} and company_id=${companyId} for update`;
    if (!flow || flow.revision !== revision)
      throw new Error("Salve a versão atual antes de publicar");
    const definition = parseStoredFlowDefinition(flow.draft);
    assertDefinitionPermissions(user.role, definition);
    const issues = validateFlow(definition);
    if (issues.length)
      throw new Error(
        issues
          .map((i) => i.message)
          .slice(0, 5)
          .join("; "),
      );
    const root = definition.nodes.find((n) => n.kind === "trigger")!;
    if (
      root.config.deliveryOwner === "existing" &&
      definition.nodes.some(
        (n) =>
          n.kind === "whatsapp" ||
          (n.kind === "ai" && n.config.mode === "conversation"),
      )
    )
      throw new Error(
        "O envio existente está selecionado; remova envios WhatsApp deste fluxo ou transfira a responsabilidade",
      );
    await tx`delete from public.automation_source_owners where company_id=${companyId} and flow_id=${id}`;
    if (
      SHARED_DELIVERY_EVENTS.includes(
        root.config.event as (typeof SHARED_DELIVERY_EVENTS)[number],
      ) &&
      root.config.deliveryOwner === "automation"
    ) {
      const purpose = root.config.event === "form.submitted" && root.config.formId ? `form.submitted:${root.config.formId}` : root.config.event!;
      if (root.config.event === "form.submitted" && (await tx`select flow_id from public.automation_source_owners where company_id=${companyId} and purpose='form.submitted'`)[0])
        throw new Error("Um fluxo anterior controla todos os formulários. Arquive-o antes de transferir o envio deste formulário.");
      const owners =
        await tx`insert into public.automation_source_owners(company_id,purpose,flow_id) values(${companyId},${purpose},${id}) on conflict(company_id,purpose) do update set flow_id=excluded.flow_id where automation_source_owners.flow_id=excluded.flow_id returning flow_id`;
      if (!owners[0])
        throw new Error(
          "Outro fluxo já é responsável por esta finalidade. Arquive-o antes de transferir.",
        );
    }
    const [settings] =
      await tx`select allowed_models,monthly_budget_usd from public.automation_settings where company_id=${companyId}`;
    for (const node of definition.nodes) {
      const c = node.config;
      if (node.kind === "trigger" && c.mode === "event" && c.event === "form.submitted") {
        const [form] = await tx`select id from public.forms where id=${c.formId!} and company_id=${companyId} and deleted_at is null and (create_person or create_account_after_submit)`;
        if (!form) throw new Error("Escolha um formulário desta igreja que crie ou vincule a pessoa");
      }
      if (node.kind === "kanban_move" && !(await tx`select id from public.crm_stages where id=${c.stageId!} and company_id=${companyId} and deleted_at is null`)[0])
        throw new Error("Coluna do Kanban não disponível nesta igreja");
      if (
        node.kind === "ai" &&
        (!settings?.allowed_models.includes(c.model) ||
          Number(settings.monthly_budget_usd) <= 0 ||
          !process.env.OPENROUTER_API_KEY)
      )
        throw new Error(
          "IA exige modelo autorizado, orçamento e chave central configurada",
        );
      for (const instance of [c.instanceId].filter(Boolean))
        if (
          !(
            await tx`select id from public.uazapi_instances where id=${instance!} and company_id=${companyId} and active and status='connected'`
          )[0]
        )
          throw new Error("Instância não conectada nesta igreja");
      if (
        c.responsibleId &&
        !(
          await tx`select id from public.profiles where id=${c.responsibleId} and company_id=${companyId} and active`
        )[0]
      )
        throw new Error("Responsável inválido");
      if (["notify", "handoff"].includes(node.kind)) {
        const [responsible] = await tx`select login_phone from public.profiles where id=${c.responsibleId!} and company_id=${companyId} and active`;
        if (!responsible?.login_phone || !/^\d{10,15}$/.test(String(responsible.login_phone).replace(/\D/g, "")))
          throw new Error("Cadastre um telefone WhatsApp válido para o responsável pelo aviso");
      }
      if (c.flowId) {
        if (c.flowId === id)
          throw new Error("Um fluxo não pode iniciar a si mesmo");
        if (
          !(
            await tx`select id from public.automation_flows where id=${c.flowId} and company_id=${companyId} and status='active'`
          )[0]
        )
          throw new Error("Fluxo de destino precisa estar ativo nesta igreja");
      }
      if (
        c.destination === "group" &&
        !(
          await tx`select id from public.groups where id=${c.cellId!} and company_id=${companyId} and type='cell' and is_active and deleted_at is null and automation_whatsapp_chat_id is not null`
        )[0]
      )
        throw new Error("Vincule um grupo WhatsApp à célula nas configurações");
    }
    const [version] =
      await tx`insert into public.automation_versions(company_id,flow_id,number,definition,actor_id) select ${companyId},${id},coalesce(max(number),0)+1,${tx.json(definition)}::jsonb,${user.id} from public.automation_versions where flow_id=${id} returning id`;
    await tx`update public.automation_flows set status='active',published_version_id=${version.id},published_at=now(),updated_at=now() where id=${id}`;
  });
  await writeAuditLog({
    action: "automation.publish",
    entityTable: "automation_flows",
    entityId: id,
    companyId,
  });
  revalidatePath("/automacoes");
}
export async function setAutomationStatus(
  id: string,
  status: "paused" | "active" | "archived",
) {
  const { companyId } = await automationAccess("automations.operate"),
    sql = getSql();
  z.enum(["paused", "active", "archived"]).parse(status);
  const rows =
    await sql`update public.automation_flows set status=${status},updated_at=now() where id=${uuid.parse(id)} and company_id=${companyId} and (published_version_id is not null or ${status}='archived') returning id`;
  if (!rows[0]) throw new Error("Publique o fluxo antes de ativar");
  if (status === "archived")
    await sql`update public.automation_runs set status='canceled',lease_token=null where flow_id=${id} and company_id=${companyId} and status not in ('completed','failed','canceled','skipped')`;
  if (status === "archived")
    await sql`delete from public.automation_source_owners where flow_id=${id} and company_id=${companyId}`;
  await writeAuditLog({
    action: `automation.${status}`,
    entityTable: "automation_flows",
    entityId: id,
    companyId,
  });
  revalidatePath("/automacoes");
}
export async function simulateAutomation(definition: FlowDefinition) {
  const { user, companyId } = await automationAccess(),
    parsed = flowSchema.parse(definition);
  assertDefinitionPermissions(user.role, parsed);
  const filter =
    parsed.nodes.find((n) => n.kind === "trigger")?.config.filter ?? {};
  const people = await selectAudience(companyId, filter),
    all = await selectAudience(companyId);
  const ids = new Set(people.map((p) => p.id));
  const audienceNodes = parsed.nodes.filter(n => n.kind === "audience");
  const audiences: Record<string, string[]> = Object.fromEntries(await Promise.all(audienceNodes.map(async n => [n.id, (await selectAudience(companyId, n.config.filter)).map(p => p.id)] as const)));
  const root = parsed.nodes.find(n => n.kind === "trigger");
  if (root) audiences[root.id] = people.map(p => p.id);
  return {
    issues: validateFlow(parsed),
    audiences,
    total: people.length,
    included: people.map((p) => ({
      id: p.id,
      name: p.full_name,
      reason: "Atende aos filtros do início",
      context: personContext(p),
    })),
    excluded: all
      .filter((p) => !ids.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        reason: "Não atende aos filtros configurados",
        context: personContext(p),
      })),
    path: parsed.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
  };
}
export async function generateAutomation(prompt: string, model: string) {
  const { companyId } = await automationAccess("automations.edit");
  const response = await callAutomationAI({
    companyId,
    prompt: z.string().min(10).max(4096).parse(prompt),
    model,
    context: {},
    requestKey: `draft:${crypto.randomUUID()}`,
    generation: true,
  });
  return response.flow!;
}
export async function listAutomationModels() {
  await automationAccess();
  return (await openRouterModels()).map((m) => ({
    id: m.id,
    pricing: m.pricing,
  }));
}
export async function saveAutomationSettings(input: {
  timezone: string;
  start: string;
  end: string;
  knowledge: string;
  models?: string[];
  budget?: number;
}) {
  const { user, companyId } = await automationAccess("automations.edit"),
    sql = getSql();
  if (!["superadmin", "admin", "pastor"].includes(user.role))
    throw new Error("Somente administração pode alterar estas configurações");
  if (
    (input.models !== undefined || input.budget !== undefined) &&
    user.role !== "superadmin"
  )
    throw new Error("Somente superadmin define modelos e orçamento");
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.timezone });
  } catch {
    throw new Error("Fuso inválido");
  }
  const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  time.parse(input.start);
  time.parse(input.end);
  if (input.start >= input.end)
    throw new Error("O início deve ser anterior ao fim da janela de envios");
  await sql`insert into public.automation_settings(company_id,timezone,quiet_start,quiet_end,knowledge) values(${companyId},${input.timezone},${input.start}::time,${input.end}::time,${z.string().max(8000).parse(input.knowledge)}) on conflict(company_id) do update set timezone=excluded.timezone,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,knowledge=excluded.knowledge,updated_at=now()`;
  if (input.models !== undefined || input.budget !== undefined) {
    if (user.role !== "superadmin")
      throw new Error("Somente superadmin define modelos e orçamento");
    await sql`update public.automation_settings set allowed_models=${sql.array(
      z
        .array(z.string().max(180))
        .max(20)
        .parse(input.models ?? []),
    )}::text[],monthly_budget_usd=${z
      .number()
      .min(0)
      .max(100000)
      .parse(input.budget ?? 0)} where company_id=${companyId}`;
  }
  await writeAuditLog({
    action: "automation.settings",
    entityTable: "automation_settings",
    companyId,
  });
  revalidatePath("/automacoes");
}
export async function saveAutomationGroup(cellId: string, chatId: string) {
  const { companyId } = await automationAccess("automations.edit");
  const chat = chatId.trim()
    ? z
        .string()
        .regex(/^\d+(?:-\d+)?@g\.us$/)
        .parse(chatId.trim())
    : null;
  await getSql()`update public.groups set automation_whatsapp_chat_id=${chat} where id=${uuid.parse(cellId)} and company_id=${companyId} and type='cell' and deleted_at is null`;
  revalidatePath("/automacoes");
}
export async function operateAutomationTask(
  id: string,
  action: "claim" | "complete" | "resume",
) {
  z.enum(["claim", "complete", "resume"]).parse(action);
  const { user, companyId } = await automationAccess("automations.tasks"),
    sql = getSql();
  await sql.begin(async (tx) => {
    const [task] =
      await tx`select * from public.automation_tasks where id=${uuid.parse(id)} and company_id=${companyId} for update`;
    if (
      !task ||
      (!["admin", "pastor", "superadmin"].includes(user.role) &&
        task.responsible_id !== user.id)
    )
      throw new Error("Tarefa não disponível para seu perfil");
    if (action === "claim")
      await tx`update public.automation_tasks set status='in_progress',responsible_id=${user.id} where id=${id}`;
    if (action === "complete")
      await tx`update public.automation_tasks set status='completed',completed_at=now() where id=${id}`;
    if (action === "resume") {
      if (task.kind !== "handoff")
        throw new Error(
          "Somente tarefas de atendimento podem liberar a conversa",
        );
      await tx`update public.automation_conversations set human=false where run_id=${task.run_id} and company_id=${companyId}`;
      const resumed =
        await tx`update public.automation_runs set status='ready',due_at=now(),lease_token=null,wait_kind=null,waiting_node_id=null,context=context-'pending_response' where id=${task.run_id} and company_id=${companyId} and status='human' returning id`;
      if (!resumed[0])
        throw new Error("A execução não está aguardando atendimento humano");
    }
  });
  await writeAuditLog({
    action: `automation.task.${action}`,
    entityTable: "automation_tasks",
    entityId: id,
    companyId,
  });
  revalidatePath("/automacoes");
}
export async function cancelAutomationRun(id: string) {
  const { companyId } = await automationAccess("automations.operate"),
    sql = getSql();
  await sql`update public.automation_runs set status='canceled',lease_token=null where id=${uuid.parse(id)} and company_id=${companyId} and status not in ('completed','canceled')`;
  await sql`delete from public.automation_conversations where run_id=${id} and company_id=${companyId}`;
  revalidatePath("/automacoes");
}

export async function startAutomationManually(
  id: string,
  people: string[],
  test = false,
) {
  const { companyId } = await automationAccess("automations.operate"),
    sql = getSql();
  const [company] =
    await sql`select status from public.companies where id=${companyId}`;
  if (test && company?.status !== "test")
    throw new Error(
      "Envios de teste só são permitidos em igreja com status de teste",
    );
  const [flow] =
    await sql`select f.*,v.definition,v.actor_id from public.automation_flows f join public.automation_versions v on v.id=f.published_version_id where f.id=${uuid.parse(id)} and f.company_id=${companyId} and f.status='active'`;
  if (!flow) throw new Error("Publique o fluxo antes de iniciar");
  const definition = flowSchema.parse(flow.definition),
    root = definition.nodes.find((n) => n.kind === "trigger")!;
  if (!test && root.config.mode !== "manual")
    throw new Error("Este fluxo é iniciado pelo gatilho configurado");
  const ids = z.array(uuid).min(1).max(1000).parse(people);
  const audience = await selectAudience(companyId, root.config.filter),
    selected = audience.filter((p) => ids.includes(p.id)),
    batch = crypto.randomUUID();
  for (const p of selected)
    await enqueueAutomationRun(
      {
        id: String(flow.id),
        company_id: companyId,
        published_version_id: String(flow.published_version_id),
        published_at: flow.published_at,
        definition,
        actor_id: String(flow.actor_id),
      },
      p.id,
      `${test ? "test" : "manual"}:${batch}:${p.id}`,
      personContext(p),
    );
  await writeAuditLog({
    action: test ? "automation.test" : "automation.manual_start",
    entityTable: "automation_flows",
    entityId: id,
    companyId,
    metadata: { recipients: selected.length },
  });
  revalidatePath("/automacoes");
  return { count: selected.length };
}
export async function uploadAutomationMedia(form: FormData) {
  const { companyId, user } = await automationAccess("automations.edit"),
    file = getOptionalFile(form, "file");
  if (!file) throw new Error("Selecione um arquivo");
  const result = await uploadManagedFile({
    file,
    companyId,
    ownerProfileId: user.id,
    entityTable: "automation_flows",
    purpose: "whatsapp-media",
    visibility: "private",
    allowedMimeTypes: new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/mp4",
      "audio/wav",
      "application/pdf",
    ]),
    maxSizeBytes: 10 * 1024 * 1024,
  });
  return { id: result.id, name: result.originalName };
}
export async function connectAutomationWebhook(instanceId: string) {
  const { companyId } = await automationAccess("automations.publish"),
    sql = getSql();
  const [credential] = await sql<
    { base_url: string; instance_token: string }[]
  >`select * from public.get_uazapi_instance_credential(${companyId},${uuid.parse(instanceId)})`;
  if (!credential) throw new Error("Instância indisponível");
  const [already] =
    await sql`select instance_id from public.automation_webhook_secrets where instance_id=${instanceId} and company_id=${companyId}`;
  if (already) throw new Error("Webhook já configurado para esta instância");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!origin)
    throw new Error(
      "Configure APP_URL com a URL pública HTTPS do Altar Church",
    );
  const url = new URL(origin);
  if (url.protocol !== "https:")
    throw new Error("Configure a URL pública HTTPS do Altar Church");
  const secret = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(secret).digest("hex");
  // Additional webhook preserves existing integrations and receives human outbound messages too.
  await sql`insert into public.automation_webhook_secrets(instance_id,company_id,secret_hash) values(${instanceId},${companyId},${hash})`;
  try {
    const response = await fetch(
      `${credential.base_url.replace(/\/$/, "")}/webhook`,
      {
        method: "POST",
        headers: {
          token: credential.instance_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "add",
          url: `${url.origin}/api/webhooks/automations/${instanceId}/${secret}`,
          enabled: true,
          events: ["messages", "messages_update", "connection"],
          excludeMessages: ["wasSentByApi"],
          addUrlEvents: false,
          addUrlTypesMessages: false,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      await sql`delete from public.automation_webhook_secrets where instance_id=${instanceId} and secret_hash=${hash}`;
      throw new Error(`Uazapi recusou configuração (${response.status})`);
    }
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.startsWith("Uazapi")
        ? error.message
        : "Configuração não confirmada. Verifique webhooks da instância antes de tentar novamente.",
    );
  }
  await writeAuditLog({
    action: "automation.webhook.connect",
    entityTable: "uazapi_instances",
    entityId: instanceId,
    companyId,
  });
  revalidatePath("/automacoes");
}
