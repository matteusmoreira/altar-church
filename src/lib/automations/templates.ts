import {
  LABELS,
  type FlowDefinition,
  type FlowNode,
  type NodeKind,
} from "./contract";

export function newNode(
  kind: NodeKind,
  id = crypto.randomUUID(),
  x = 80,
  y = 80,
): FlowNode {
  const config: FlowNode["config"] =
    kind === "trigger"
      ? { mode: "manual" }
      : kind === "whatsapp"
        ? {
            destination: "person",
            message: { type: "text", text: "Olá, {{primeiro_nome}}!" },
          }
        : kind === "wait"
          ? { minutes: 1440 }
          : kind === "response" || kind === "task_wait"
            ? { minutes: 1440 }
            : kind === "ai"
              ? {
                  mode: "write",
                  prompt:
                    "Escreva uma mensagem acolhedora para {{primeiro_nome}}.",
                  maxTokens: 512,
                  maxTurns: 5,
                  maxMinutes: 30,
                }
              : kind === "condition"
                ? { field: "resposta", operator: "contains", value: "sim" }
                : {};
  return { id, kind, label: LABELS[kind], position: { x, y }, config };
}
function template(
  trigger: FlowNode["config"],
  message: string,
  followup = false,
): FlowDefinition {
  const nodes = [
    newNode("trigger", "start"),
    newNode("whatsapp", "message", 80, 250),
    newNode("end", "end", 80, 440),
    newNode("end", "error", 380, 440),
  ];
  nodes[0].config = trigger;
  nodes[1].config.message = { type: "text", text: message };
  nodes[3].label = "Encerrar com registro da falha";
  const edges: FlowDefinition["edges"] = [
    { id: "a", source: "start", target: "message", port: "next" },
    { id: "b", source: "message", target: "end", port: "next" },
    { id: "c", source: "message", target: "error", port: "error" },
  ];
  if (followup) {
    const response = newNode("response", "response", 80, 440),
      task = newNode("task", "task", 80, 620);
    task.config = { title: "Acompanhar resposta", dueDays: 1 };
    nodes.push(response, task);
    nodes[2].position.y = 820;
    edges[1].target = "response";
    edges.push(
      { id: "d", source: "response", target: "task", port: "response" },
      { id: "e", source: "response", target: "end", port: "timeout" },
      { id: "f", source: "response", target: "error", port: "error" },
      { id: "g", source: "task", target: "end", port: "next" },
      { id: "h", source: "task", target: "error", port: "error" },
    );
  }
  return { schemaVersion: 1, nodes, edges };
}
export const TEMPLATES = [
  {
    id: "weekly_cell",
    name: "Mensagem semanal da célula",
    description: "Selecione a célula e a instância antes de publicar.",
    definition: template(
      {
        mode: "schedule",
        schedule: "weekly",
        weekday: 1,
        time: "09:00",
        filter: { inCell: true },
      },
      "Olá, {{primeiro_nome}}! Vamos nos reunir esta semana na célula {{celula}}. Esperamos você!",
    ),
  },
  {
    id: "birthday",
    name: "Aniversariantes",
    description: "Felicitação anual no dia do aniversário.",
    definition: template(
      { mode: "birthday", time: "09:00" },
      "Feliz aniversário, {{primeiro_nome}}! Sua família {{igreja}} deseja um dia cheio de bênçãos.",
    ),
  },
  {
    id: "baptism",
    name: "Uma semana depois do batismo",
    description: "Usa a data real do batismo, sem disparos retroativos.",
    definition: template(
      {
        mode: "relative_date",
        dateField: "baptism_date",
        offsetDays: 7,
        time: "09:00",
      },
      "Olá, {{primeiro_nome}}! Há uma semana celebramos seu batismo. Quer conhecer os próximos passos do discipulado?",
      true,
    ),
  },
  {
    id: "cell_invite",
    name: "Convite para participar de célula",
    description: "Começa com membros que ainda não participam de célula.",
    definition: template(
      { mode: "manual", filter: { personType: "member", withoutCell: true } },
      "Olá, {{primeiro_nome}}! Quer participar de uma célula da {{igreja}}? Responda SIM para receber ajuda.",
      true,
    ),
  },
  {
    id: "visitor",
    name: "Acolhimento de visitante",
    description: "Boas-vindas a novos visitantes e acompanhamento da resposta.",
    definition: template(
      {
        mode: "event",
        event: "person.created",
        filter: { personType: "visitor" },
      },
      "Olá, {{primeiro_nome}}! Seja bem-vindo à {{igreja}}. Como podemos ajudar você?",
      true,
    ),
  },
  {
    id: "absence",
    name: "Acompanhamento de ausências",
    description: "Contato diário com pessoas sem presença recente.",
    definition: template(
      {
        mode: "schedule",
        schedule: "weekly",
        weekday: 2,
        time: "10:00",
        filter: { absenceDays: 21 },
      },
      "Olá, {{primeiro_nome}}! Sentimos sua falta. Está tudo bem?",
      true,
    ),
  },
  {
    id: "event",
    name: "Lembrete de evento",
    description: "Lembrete no dia anterior, para inscritos.",
    definition: template(
      { mode: "event", event: "event.upcoming", offsetDays: 1 },
      "Olá, {{primeiro_nome}}! Lembrete: {{evento}} acontece em breve. Esperamos você!",
      true,
    ),
  },
  {
    id: "shift",
    name: "Confirmação de escala",
    description: "Contato após atribuição da escala.",
    definition: template(
      { mode: "event", event: "volunteer.assigned" },
      "Olá, {{primeiro_nome}}! Você foi escalado para servir. Pode confirmar sua participação?",
      true,
    ),
  },
];

/** An editable invitation with paginated lists; every cell has its own interest and leader notification. */
export function cellInvitationTemplate(
  cells: { id: string; name: string; responsible_id?: string | null }[],
): FlowDefinition {
  const flow = template(
    { mode: "manual", filter: { personType: "member", withoutCell: true } },
    "Olá, {{primeiro_nome}}! Quer conhecer uma célula da {{igreja}}?",
    true,
  );
  flow.nodes.find((n) => n.id === "message")!.config.message = {
    type: "button",
    text: "Olá, {{primeiro_nome}}! Quer conhecer uma célula da {{igreja}}?",
    footer: "",
    buttons: [
      { label: "Quero participar", action: "reply", value: "sim" },
      { label: "Agora não", action: "reply", value: "nao" },
    ],
  };
  const decision = newNode("condition", "decision", 80, 600);
  decision.config = { field: "resposta", operator: "equals", value: "sim" };
  flow.nodes.push(decision);
  flow.edges.find(
    (e) => e.source === "response" && e.port === "response",
  )!.target = "decision";
  flow.edges.push({
    id: "decline",
    source: "decision",
    port: "no",
    target: "end",
  });
  // Keep the graph within the contract cap. Larger catalogs use the fallback pastoral task.
  const available = cells.slice(0, 45);
  if (!available.length) {
    flow.edges.push({
      id: "no-cells",
      source: "decision",
      port: "yes",
      target: "task",
    });
    return flow;
  }
  for (let page = 0; page < Math.ceil(available.length / 9); page++) {
    const pageCells = available.slice(page * 9, page * 9 + 9),
      more = (page + 1) * 9 < available.length;
    const list = newNode("whatsapp", `cells-${page}`, 80, page * 600 + 800);
    list.config = {
      destination: "person",
      message: {
        type: "list",
        text: "Qual célula você gostaria de conhecer?",
        footer: "",
        listButton: "Ver células",
        sections: [
          {
            title: "Células disponíveis",
            items: [
              ...pageCells.map((c) => ({
                label: c.name,
                id: c.id,
                description: "Quero conhecer esta célula",
              })),
              ...(more
                ? [
                    {
                      label: "Mais células",
                      id: `more-${page}`,
                      description: "Ver outras opções",
                    },
                  ]
                : [
                    {
                      label: "Preciso de ajuda",
                      id: "help",
                      description:
                        "Conhecer outras células ou falar com a equipe",
                    },
                  ]),
            ],
          },
        ],
      },
    };
    const response = newNode(
        "response",
        `choice-${page}`,
        80,
        page * 600 + 980,
      ),
      choice = newNode("switch", `route-${page}`, 80, page * 600 + 1160);
    choice.config = {
      field: "resposta",
      cases: [
        ...pageCells.map((c) => ({ value: c.id, port: `cell-${c.id}` })),
        ...(more ? [{ value: `more-${page}`, port: "more" }] : []),
      ],
    };
    flow.nodes.push(list, response, choice);
    flow.edges.push(
      { id: `ask-${page}`, source: list.id, port: "next", target: response.id },
      {
        id: `send-fail-${page}`,
        source: list.id,
        port: "error",
        target: "error",
      },
      {
        id: `answer-${page}`,
        source: response.id,
        port: "response",
        target: choice.id,
      },
      {
        id: `timeout-${page}`,
        source: response.id,
        port: "timeout",
        target: "end",
      },
      {
        id: `response-fail-${page}`,
        source: response.id,
        port: "error",
        target: "error",
      },
      {
        id: `other-${page}`,
        source: choice.id,
        port: "default",
        target: "task",
      },
    );
    if (page === 0)
      flow.edges.push({
        id: "accept",
        source: "decision",
        port: "yes",
        target: list.id,
      });
    if (more)
      flow.edges.push({
        id: `more-${page}`,
        source: choice.id,
        port: "more",
        target: `cells-${page + 1}`,
      });
    for (const [index, cell] of pageCells.entries()) {
      const interest = newNode(
        "interest",
        `interest-${cell.id}`,
        400 + index * 270,
        page * 600 + 1360,
      );
      interest.config = { interest: `Quero conhecer a célula ${cell.name}` };
      const notify = newNode(
        "notify",
        `leader-${cell.id}`,
        400 + index * 270,
        page * 600 + 1540,
      );
      notify.config = {
        title: `Interesse na célula ${cell.name}`,
        responsibleId: cell.responsible_id ?? undefined,
        dueDays: 1,
      };
      flow.nodes.push(interest, notify);
      flow.edges.push(
        {
          id: `pick-${cell.id}`,
          source: choice.id,
          port: `cell-${cell.id}`,
          target: interest.id,
        },
        {
          id: `interest-ok-${cell.id}`,
          source: interest.id,
          port: "next",
          target: notify.id,
        },
        {
          id: `interest-fail-${cell.id}`,
          source: interest.id,
          port: "error",
          target: "error",
        },
        {
          id: `notify-ok-${cell.id}`,
          source: notify.id,
          port: "next",
          target: "end",
        },
        {
          id: `notify-fail-${cell.id}`,
          source: notify.id,
          port: "error",
          target: "error",
        },
      );
    }
  }
  flow.nodes.find((n) => n.id === "task")!.config.title =
    "Ajudar {{nome}} a escolher uma célula";
  return flow;
}
