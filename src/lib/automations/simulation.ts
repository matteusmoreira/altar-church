import {
  conditionMatches,
  renderText,
  type FlowDefinition,
  type FlowNode,
} from "./contract";
import { validateQuestionAnswer, type CongregationChoice } from "./questions";

export type SimulationEntry = {
  nodeId: string;
  label: string;
  detail: string;
  port: string;
  context: Record<string, string>;
};
export type SimulationState = {
  nodeId: string | null;
  context: Record<string, string>;
  entries: SimulationEntry[];
  error?: string;
};
export function advanceSimulation(
  definition: FlowDefinition,
  state: SimulationState,
  input: {
    response?: string;
    port?: string;
    aiText?: string;
    audienceMatches?: boolean;
    congregations?: CongregationChoice[];
  } = {},
): SimulationState {
  const node = definition.nodes.find((n) => n.id === state.nodeId);
  if (!node) return { ...state, nodeId: null, error: "Bloco não encontrado" };
  const c = node.config,
    context = { ...state.context };
  if (node.kind === "trigger" && input.audienceMatches === false && !c.allowUnknownContacts)
    return {
      ...state,
      nodeId: null,
      error: "Esta pessoa não atende aos filtros do início",
    };
  let port = "next",
    detail = "Bloco simulado";
  if (node.kind === "question") {
    port = input.port ?? "response";
    if (port === "response") {
      const answer = validateQuestionAnswer(c.questionType, input.response ?? "", input.congregations, Number(context.question_page ?? 0));
      if (answer.value) { context[c.answerVariable!] = answer.value; context.resposta = answer.value; context.question_page = "0"; }
      else return { ...state, context: { ...context, question_page: String(answer.page ?? context.question_page ?? 0) }, error: answer.page !== undefined ? undefined : c.invalidAnswerText || answer.error };
    }
    detail = port === "response" ? `${c.answerVariable}: ${context[c.answerVariable!]}` : `Pergunta: ${port === "timeout" ? "prazo vencido" : "erro"}`;
  }
  if (node.kind === "register_person") {
    port = input.port ?? "next";
    const name = context[c.nameVariable ?? ""] ?? "";
    const email = context[c.emailVariable ?? ""] ?? "";
    if (port === "next" && (!validateQuestionAnswer("full_name", name).value || !validateQuestionAnswer("email", email).value || !input.congregations?.some(g => g.id === context[c.congregationVariable ?? ""]))) port = "error";
    if (port === "next") { context.nome = name; context.primeiro_nome = name.split(" ")[0]; }
    detail = port === "next" ? `Cadastraria ${name} com acesso de membro; nenhum usuário foi criado` : "Erro de cadastro simulado; nenhum usuário foi criado";
  }
  if (node.kind === "condition")
    port = conditionMatches(
      context[c.field ?? "resposta"],
      c.operator,
      renderText(c.value ?? "", context),
    )
      ? "yes"
      : "no";
  if (node.kind === "audience") port = input.audienceMatches ? "yes" : "no";
  if (node.kind === "switch")
    port =
      c.cases?.find((item) =>
        conditionMatches(context[c.field ?? "resposta"], "equals", item.value),
      )?.port ?? "default";
  if (node.kind === "response" || node.kind === "task_wait") {
    port = input.port ?? "response";
    if (node.kind === "response" && port === "response")
      context.resposta = input.response ?? "";
    detail =
      port === "timeout"
        ? "Prazo vencido simulado"
        : node.kind === "response"
          ? `Resposta: ${context.resposta}`
          : "Conclusão de tarefa simulada";
  }
  if (node.kind === "ai") {
    context.ai_text = input.aiText ?? "Resultado de IA simulado";
    context.ai_result = context.ai_text;
    detail = "Resultado informado manualmente; nenhuma chamada de IA";
  }
  if (node.kind === "update") {
    context[c.field ?? ""] = renderText(c.value ?? "", context);
    detail = `Atualizaria ${c.field}: ${context[c.field ?? ""]}`;
  }
  if (node.kind === "whatsapp")
    detail = renderText(c.message?.text ?? "Mensagem não configurada", context);
  if (node.kind === "kanban_move")
    detail = `Moveria o card para a coluna ${c.stageId ?? "não configurada"}; criaria se necessário`;
  if (node.kind === "wait")
    detail = c.until
      ? `Avançou espera até ${c.until}`
      : `Avançou espera de ${c.minutes ?? 1} minutos`;
  if (node.kind === "task")
    detail = `Criaria tarefa: ${renderText(c.title ?? "", context)}; prazo em ${c.dueDays ?? 0} dias`;
  if (node.kind === "assign")
    detail = `Atribuiria o responsável ${c.responsibleId ?? "não configurado"}`;
  if (node.kind === "notify" || node.kind === "handoff")
    detail = `${node.kind === "handoff" ? "Solicitaria atendimento humano" : "Notificaria responsável"}: ${renderText(c.title ?? "", context)}`;
  if (node.kind === "interest")
    detail = `Registraria interesse: ${renderText(c.interest ?? "", context)}`;
  if (node.kind === "start_flow")
    detail = `Iniciaria outro fluxo: ${c.flowId ?? "não configurado"}; somente simulado`;
  if (
    node.kind === "condition" ||
    node.kind === "audience" ||
    node.kind === "switch"
  )
    detail = `Caminho escolhido: ${port}`;
  const entry = {
    nodeId: node.id,
    label: node.label,
    detail,
    port,
    context: { ...context },
  };
  if (state.entries.length >= 150)
    return {
      ...state,
      nodeId: null,
      error: "Limite de blocos da simulação atingido",
    };
  if (node.kind === "end")
    return { context, entries: [...state.entries, entry], nodeId: null };
  const next = definition.edges.find(
    (e) => e.source === node.id && e.port === port,
  )?.target;
  return {
    context,
    entries: [...state.entries, entry],
    nodeId: next ?? null,
    error: next ? undefined : `Conecte a saída ${port} de ${node.label}`,
  };
}

export function simulationPrompt(node: FlowNode) {
  return node.kind === "question" ? node.config.questionText ?? "Informe a resposta recebida" : node.kind === "response"
    ? "Informe a resposta recebida"
    : node.kind === "task_wait"
      ? "Simule a conclusão ou o prazo da tarefa"
      : node.kind === "ai"
        ? "Informe o resultado simulado da IA"
        : node.kind === "wait"
          ? "Avance o tempo de espera"
          : "Avance para simular este bloco";
}
