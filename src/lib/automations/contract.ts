import { z } from "zod";

export const EVENT_OPTIONS = [
  ["person.created", "Pessoa cadastrada"],
  ["person.updated", "Pessoa alterada"],
  ["person.baptized", "Batismo registrado"],
  ["cell.joined", "Entrada na célula"],
  ["cell.left", "Saída da célula"],
  ["cell.visit_requested", "Visita à célula solicitada"],
  ["ministry.joined", "Entrada no ministério"],
  ["ministry.left", "Saída do ministério"],
  ["attendance.present", "Presença registrada"],
  ["attendance.absent", "Ausência registrada"],
  ["event.registered", "Inscrição em evento"],
  ["event.upcoming", "Evento próximo"],
  ["event.present", "Presença no evento"],
  ["event.absent", "Ausência no evento"],
  ["volunteer.assigned", "Escala atribuída"],
  ["volunteer.confirmed", "Escala confirmada"],
  ["volunteer.declined", "Escala recusada"],
  ["volunteer.upcoming", "Serviço próximo"],
  ["discipleship.enrolled", "Inscrição no discipulado"],
  ["discipleship.progress", "Etapa do discipulado"],
  ["discipleship.completed", "Discipulado concluído"],
  ["form.submitted", "Formulário enviado"],
  ["crm.created", "Card criado"],
  ["crm.updated", "Card alterado"],
  ["prayer.created", "Pedido de oração recebido"],
  ["prayer.updated", "Situação do pedido alterada"],
  ["kids.checkin", "Entrada no Kids"],
  ["kids.checkout", "Saída do Kids"],
  ["kids.guardian_called", "Responsável chamado"],
  ["content.published", "Conteúdo publicado"],
  ["congregation.updated", "Congregação alterada"],
  ["finance.updated", "Registro financeiro alterado"],
] as const;

export const KINDS = [
  "trigger",
  "audience",
  "condition",
  "switch",
  "wait",
  "response",
  "task_wait",
  "whatsapp",
  "kanban_move",
  "ai",
  "interest",
  "update",
  "task",
  "assign",
  "notify",
  "handoff",
  "start_flow",
  "end",
] as const;
export type NodeKind = (typeof KINDS)[number];
export const LABELS: Record<NodeKind, string> = {
  trigger: "Início",
  audience: "Público",
  condition: "Se / senão",
  switch: "Múltiplos caminhos",
  wait: "Esperar",
  response: "Aguardar resposta",
  task_wait: "Aguardar tarefa",
  whatsapp: "Enviar WhatsApp",
  kanban_move: "Mover no Kanban",
  ai: "Inteligência artificial",
  interest: "Registrar interesse",
  update: "Atualizar pessoa",
  task: "Criar tarefa",
  assign: "Atribuir responsável",
  notify: "Aviso interno",
  handoff: "Atendimento humano",
  start_flow: "Iniciar outro fluxo",
  end: "Encerrar",
};
export const VARIABLES = [
  "nome",
  "primeiro_nome",
  "igreja",
  "celula",
  "lider",
  "horario",
  "evento",
  "resposta",
  "ai_text",
  "ai_result",
  "ai_email",
  "ai_phone",
  "ai_city",
  "ai_neighborhood",
] as const;
export const EDITABLE_FIELDS = [
  "neighborhood",
  "city",
  "phone",
  "email",
  "journey_status",
] as const;
const uuid = z.string().uuid();
const text = z.string().max(4096);
const button = z.object({
  label: z.string().max(120),
  action: z.enum(["reply", "url", "call", "copy"]),
  value: z.string().max(500),
});
const draftFile = z.union([uuid, z.literal("")]);
export const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text }),
  z.object({
    type: z.literal("button"),
    text,
    footer: text.default(""),
    buttons: z.array(button).max(3),
  }),
  z.object({
    type: z.literal("list"),
    text,
    footer: text.default(""),
    listButton: z.string(),
    sections: z
      .array(
        z.object({
          title: text,
          items: z
            .array(
              z.object({
                label: text,
                id: text,
                description: text.default(""),
              }),
            )
            .max(10),
        }),
      )
      .max(10),
  }),
  z.object({
    type: z.literal("carousel"),
    text,
    cards: z
      .array(
        z.object({
          text,
          mediaFileId: draftFile,
          mediaType: z.literal("image"),
          filename: text.default(""),
          buttons: z.array(button).max(3),
        }),
      )
      .max(10),
  }),
  z.object({
    type: z.enum(["image", "video", "audio", "document"]),
    text: text.default(""),
    mediaFileId: draftFile,
    filename: text.default(""),
  }),
]);
export type AutomationMessage = z.infer<typeof messageSchema>;

export const filterSchema = z.object({
  personType: z.string().max(40).optional(),
  status: z.string().max(40).optional(),
  congregationId: uuid.optional(),
  cellId: uuid.optional(),
  ministryId: uuid.optional(),
  activityId: uuid.optional(),
  withoutCell: z.boolean().optional(),
  inCell: z.boolean().optional(),
  minAge: z.number().int().min(0).max(120).optional(),
  maxAge: z.number().int().min(0).max(120).optional(),
  absenceDays: z.number().int().min(1).max(365).optional(),
});
export type AudienceFilter = z.infer<typeof filterSchema>;
const configSchema = z
  .object({
    deliveryOwner: z.enum(["existing", "automation"]).optional(),
    mode: z.string().max(80).optional(),
    event: z.string().max(100).optional(),
    formId: uuid.optional(),
    stageId: uuid.optional(),
    schedule: z.enum(["once", "daily", "weekly", "monthly"]).optional(),
    at: z.string().max(60).optional(),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    dateField: z.enum(["baptism_date", "birth_date"]).optional(),
    offsetDays: z.number().int().min(-365).max(365).optional(),
    filter: filterSchema.optional(),
    field: z.string().max(80).optional(),
    operator: z
      .enum(["equals", "contains", "exists", "greater", "less"])
      .optional(),
    value: text.optional(),
    cases: z
      .array(z.object({ value: text, port: z.string().min(1).max(80) }))
      .max(20)
      .optional(),
    minutes: z.number().int().min(1).max(525600).optional(),
    until: z.string().max(60).optional(),
    message: messageSchema.optional(),
    destination: z.enum(["person", "group"]).optional(),
    cellId: uuid.optional(),
    groupChatId: z
      .string()
      .regex(/^\d+(?:-\d+)?@g\.us$/)
      .optional(),
    fallbackText: text.optional(),
    instanceId: uuid.optional(),
    prompt: text.optional(),
    model: z.string().max(180).optional(),
    maxTokens: z.number().int().min(32).max(4096).optional(),
    maxTurns: z.number().int().min(1).max(20).optional(),
    maxMinutes: z.number().int().min(1).max(1440).optional(),
    title: z.string().max(180).optional(),
    responsibleId: uuid.optional(),
    dueDays: z.number().int().min(0).max(365).optional(),
    flowId: uuid.optional(),
    interest: z.string().max(180).optional(),
  })
  .strict();
const nodeSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(KINDS),
  label: z.string().min(1).max(120),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  config: configSchema,
});
export const flowSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(nodeSchema).min(1).max(150),
    edges: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          source: z.string(),
          target: z.string(),
          port: z.string().default("next"),
        }),
      )
      .max(400),
  })
  .strict();
export type FlowDefinition = z.infer<typeof flowSchema>;

export function parseStoredFlowDefinition(value: unknown): FlowDefinition {
  return flowSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}
export type FlowNode = FlowDefinition["nodes"][number];
export type ValidationIssue = { nodeId: string; message: string };

export function validateFlow(input: FlowDefinition): ValidationIssue[] {
  const parsed = flowSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      nodeId: String(
        i.path[0] === "nodes" ? (input.nodes[Number(i.path[1])]?.id ?? "") : "",
      ),
      message: i.message,
    }));
  const issues: ValidationIssue[] = [];
  const add = (nodeId: string, message: string) =>
    issues.push({ nodeId, message });
  const ids = new Set(input.nodes.map((n) => n.id));
  if (ids.size !== input.nodes.length)
    add("", "Há blocos com identificadores repetidos");
  const roots = input.nodes.filter((n) => n.kind === "trigger");
  if (roots.length !== 1) add("", "O fluxo precisa de exatamente um início");
  if (
    roots[0]?.config.event === "finance.updated" &&
    input.nodes.some((n) =>
      [
        "whatsapp",
        "ai",
        "start_flow",
        "update",
        "interest",
        "audience",
        "kanban_move",
      ].includes(n.kind),
    )
  )
    add(
      roots[0].id,
      "Avisos financeiros permitem apenas tarefas e notificações internas",
    );
  if (
    roots[0]?.config.event?.startsWith("kids.") &&
    input.nodes.some(
      (n) =>
        (n.kind === "whatsapp" && n.config.destination === "group") ||
        (n.kind === "ai" && n.config.mode === "conversation"),
    )
  )
    add(
      roots[0].id,
      "Eventos do Kids exigem mensagens privadas guiadas para responsáveis autorizados",
    );
  const ports = new Set<string>();
  for (const edge of input.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target))
      add(edge.source, "Conexão aponta para bloco inexistente");
    const source = input.nodes.find((n) => n.id === edge.source);
    if (source && !requiredPorts(source).includes(edge.port))
      add(edge.source, "Conexão usa uma saída inexistente");
    const key = `${edge.source}:${edge.port}`;
    if (ports.has(key))
      add(edge.source, "Cada saída deve ter apenas uma conexão");
    ports.add(key);
    if (roots.some((n) => n.id === edge.target))
      add(edge.target, "O início não pode receber conexões");
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) {
      add(id, "Ciclos não são permitidos; use recorrência no início");
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    input.edges.filter((e) => e.source === id).forEach((e) => visit(e.target));
    visiting.delete(id);
    visited.add(id);
  }
  if (roots[0]) visit(roots[0].id);
  for (const node of input.nodes) {
    const c = node.config;
    if (!visited.has(node.id)) add(node.id, "Bloco desconectado do início");
    for (const port of requiredPorts(node))
      if (!ports.has(`${node.id}:${port}`))
        add(node.id, `Conecte a saída ${port}`);
    if (node.kind === "trigger") {
      if (
        ![
          "manual",
          "schedule",
          "birthday",
          "relative_date",
          "event",
          "message",
        ].includes(c.mode ?? "")
      )
        add(node.id, "Escolha o gatilho");
      if (c.mode === "event" && !EVENT_OPTIONS.some(([key]) => key === c.event))
        add(node.id, "Escolha um evento disponível");
      if (c.mode === "event" && c.event === "form.submitted" && !c.formId)
        add(node.id, "Escolha o formulário que inicia esta automação");
      if (
        c.mode === "event" &&
        [
          "form.submitted",
          "cell.visit_requested",
          "volunteer.assigned",
          "volunteer.upcoming",
        ].includes(c.event ?? "") &&
        !c.deliveryOwner
      )
        add(
          node.id,
          "Escolha qual mecanismo será responsável pelo envio desta finalidade",
        );
      if (
        c.mode === "schedule" &&
        (!c.schedule || (c.schedule === "once" ? !c.at : !c.time))
      )
        add(node.id, "Configure a agenda");
      if (
        c.mode === "schedule" &&
        c.schedule === "once" &&
        Number.isNaN(Date.parse(c.at ?? ""))
      )
        add(node.id, "Data inválida");
      if (c.mode === "relative_date" && !c.dateField)
        add(node.id, "Escolha a data de referência");
    }
    if (node.kind === "whatsapp" && (!c.message || !c.instanceId))
      add(node.id, "Configure a mensagem e a instância");
    if (node.kind === "kanban_move" && !c.stageId)
      add(node.id, "Escolha a coluna do Kanban");
    if (c.message) {
      const m = c.message;
      if (
        ["text", "button", "list", "carousel"].includes(m.type) &&
        !m.text.trim()
      )
        add(node.id, "Escreva o texto da mensagem");
      if ("mediaFileId" in m && !uuid.safeParse(m.mediaFileId).success)
        add(node.id, "Selecione a mídia");
      const buttons =
        m.type === "button"
          ? m.buttons
          : m.type === "carousel"
            ? m.cards.flatMap((card) => card.buttons)
            : [];
      if (
        (m.type === "button" && !m.buttons.length) ||
        (m.type === "carousel" &&
          (!m.cards.length ||
            m.cards.some(
              (card) =>
                !card.text.trim() ||
                !uuid.safeParse(card.mediaFileId).success ||
                !card.buttons.length,
            )))
      )
        add(node.id, "Complete os cartões e botões");
      if (
        buttons.some(
          (b) =>
            !b.label.trim() ||
            !b.value.trim() ||
            (b.action === "url" && !/^https?:\/\//i.test(b.value)),
        )
      )
        add(node.id, "Complete o texto e a ação dos botões");
      if (m.type === "list") {
        const items = m.sections.flatMap((s) => s.items);
        if (
          !m.listButton.trim() ||
          !m.sections.length ||
          m.sections.some((s) => !s.items.length) ||
          items.some((i) => !i.label.trim() || !i.id.trim()) ||
          new Set(items.map((i) => i.id)).size !== items.length
        )
          add(node.id, "Complete os itens da lista com identificadores únicos");
      }
    }
    if (node.kind === "whatsapp" && c.destination === "group" && !c.cellId)
      add(node.id, "Vincule o grupo a uma célula");
    if (node.kind === "trigger" && c.mode === "message" && !c.instanceId)
      add(node.id, "Escolha a instância para receber mensagens");
    if (["condition", "switch", "update"].includes(node.kind) && !c.field)
      add(node.id, "Escolha o campo");
    if (
      node.kind === "update" &&
      !EDITABLE_FIELDS.includes(c.field as (typeof EDITABLE_FIELDS)[number])
    )
      add(node.id, "Campo não permitido para alteração");
    if (node.kind === "wait" && !c.minutes && !c.until)
      add(node.id, "Configure a duração ou a data");
    if (node.kind === "wait" && c.until && Number.isNaN(Date.parse(c.until)))
      add(node.id, "Data inválida");
    if (
      node.kind === "ai" &&
      (!c.prompt ||
        !c.model ||
        !["write", "classify", "extract", "conversation"].includes(
          c.mode ?? "",
        ))
    )
      add(node.id, "Configure modo, modelo e instruções da IA");
    if (node.kind === "ai" && c.mode === "conversation" && !c.instanceId)
      add(node.id, "Selecione a instância para conversar");
    if (["task", "handoff", "notify"].includes(node.kind) && !c.title)
      add(node.id, "Informe o título");
    if (["handoff", "assign", "notify"].includes(node.kind) && !c.responsibleId)
      add(node.id, "Escolha o responsável");
    if (["handoff", "notify"].includes(node.kind) && !c.instanceId)
      add(node.id, "Escolha a instância para avisar o responsável");
    if (node.kind === "interest" && !c.interest)
      add(node.id, "Informe o interesse");
    if (node.kind === "start_flow" && !c.flowId)
      add(node.id, "Escolha o fluxo de destino");
    if (
      c.message?.type === "list" &&
      c.message.sections.reduce((sum, s) => sum + s.items.length, 0) > 10
    )
      add(node.id, "Listas permitem até 10 itens");
    const templates =
      JSON.stringify(c.message ?? {}) +
      (c.prompt ?? "") +
      (c.value ?? "") +
      (c.title ?? "") +
      (c.interest ?? "") +
      (c.fallbackText ?? "");
    for (const match of templates.matchAll(/{{\s*([\w]+)\s*}}/g))
      if (!VARIABLES.includes(match[1] as (typeof VARIABLES)[number]))
        add(node.id, `Variável desconhecida: ${match[1]}`);
  }
  return issues;
}

export function requiredPorts(node: FlowNode): string[] {
  if (node.kind === "end") return [];
  if (node.kind === "kanban_move") return ["next", "error"];
  if (node.kind === "condition" || node.kind === "audience")
    return ["yes", "no"];
  if (node.kind === "switch")
    return [...(node.config.cases ?? []).map((c) => c.port), "default"];
  if (node.kind === "response" || node.kind === "task_wait")
    return ["response", "timeout", "error"];
  if (
    [
      "whatsapp",
      "ai",
      "interest",
      "update",
      "task",
      "assign",
      "notify",
      "handoff",
      "start_flow",
    ].includes(node.kind)
  )
    return ["next", "error"];
  return ["next"];
}

export function renderText(template: string, context: Record<string, unknown>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) =>
    String(context[key] ?? ""),
  );
}
export function conditionMatches(
  actual: unknown,
  operator: string | undefined,
  expected: string,
) {
  const a = String(actual ?? "").toLocaleLowerCase("pt-BR"),
    b = expected.toLocaleLowerCase("pt-BR");
  if (operator === "exists")
    return actual !== null && actual !== undefined && a !== "";
  if (operator === "contains") return a.includes(b);
  if (operator === "greater") return Number(actual) > Number(expected);
  if (operator === "less") return Number(actual) < Number(expected);
  return a === b;
}
/** Interpret datetime-local values in the church's timezone, never the worker's timezone. */
export function zonedDate(value: string, timezone = "America/Sao_Paulo"): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return new Date(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match) return new Date(NaN);
  const target = Date.UTC(
    ...([
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] ?? 0),
    ] as [number, number, number, number, number, number]),
  );
  let result = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(result)).map((p) => [p.type, p.value]),
    );
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    if (actual === target) return new Date(result);
    result += target - actual;
  }
  return new Date(NaN); // Nonexistent local time during a daylight-saving transition.
}
export function localClock(now: Date, timezone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay(),
  };
}
export function isBirthday(date: string, today: ReturnType<typeof localClock>) {
  const [, month, day] = date.slice(0, 10).split("-").map(Number);
  const leap = new Date(Date.UTC(today.year, 1, 29)).getUTCMonth() === 1;
  return (
    month === today.month &&
    (day === today.day ||
      (month === 2 && day === 29 && !leap && today.day === 28))
  );
}
export function scheduleKey(
  node: FlowNode,
  now: Date,
  timezone: string,
): string | null {
  const c = node.config,
    today = localClock(now, timezone);
  if (c.mode !== "schedule") return null;
  if (c.schedule === "once")
    return c.at && now.getTime() >= zonedDate(c.at, timezone).getTime()
      ? `once:${c.at}`
      : null;
  if (today.time < (c.time ?? "08:00")) return null;
  if (c.schedule === "weekly" && today.weekday !== (c.weekday ?? 1))
    return null;
  if (c.schedule === "monthly" && today.day !== (c.monthDay ?? 1)) return null;
  return `${c.schedule}:${today.date}`;
}
