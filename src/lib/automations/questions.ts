import { z } from "zod";
import type { AutomationMessage, FlowNode } from "./contract";

export type CongregationChoice = { id: string; name: string };
export function matchesKeyword(text: string, keyword?: string) {
  return !keyword?.trim() || text.trim().toLocaleLowerCase("pt-BR") === keyword.trim().toLocaleLowerCase("pt-BR");
}
export function validateQuestionAnswer(type: FlowNode["config"]["questionType"], input: string, choices: CongregationChoice[] = [], page = 0) {
  const value = input.trim().replace(/\s+/g, " ");
  if (type === "congregation") {
    const pages = Math.ceil(choices.length / 8);
    if (["__next", "próxima", "proxima"].includes(value.toLocaleLowerCase("pt-BR")) && page + 1 < pages && choices.length > 10) return { page: page + 1 };
    if (["__previous", "anterior"].includes(value.toLocaleLowerCase("pt-BR")) && page > 0) return { page: page - 1 };
    const visible = choices.length <= 10 ? choices : choices.slice(page * 8, page * 8 + 8);
    const chosen = visible.find(c => c.id === value) ?? (/^\d+$/.test(value) ? visible[Number(value) - 1] : undefined);
    return chosen ? { value: chosen.id } : { error: "Selecione uma congregação das opções enviadas." };
  }
  if (type === "email") return z.string().max(254).email().safeParse(value).success
    ? { value: value.toLowerCase() } : { error: "Informe um e-mail válido." };
  if (type === "full_name" && (value.length > 180 || !/^\p{L}[\p{L}\p{M}'’-]*(?:\s+[\p{L}\p{M}'’-]+)+$/u.test(value)))
    return { error: "Informe seu nome completo, com nome e sobrenome." };
  return value && value.length <= 180 ? { value } : { error: "Informe uma resposta de até 180 caracteres." };
}
export function congregationQuestion(text: string, choices: CongregationChoice[], page = 0): { message: AutomationMessage; fallbackText: string } {
  if (!choices.length) throw new Error("Nenhuma congregação disponível nesta igreja");
  const visible = choices.length <= 10 ? choices : choices.slice(page * 8, page * 8 + 8);
  const fallbackText = `${text}\n${visible.map((c, i) => `${i + 1}. ${c.name}`).join("\n")}\nResponda com o número da opção.${page > 0 ? '\nDigite “anterior” para voltar uma página.' : ""}${choices.length > 10 && (page + 1) * 8 < choices.length ? '\nDigite “próxima” para ver mais opções.' : ""}`;
  if (choices.length <= 3) return {
    message: { type: "button", text, footer: "", buttons: visible.map(c => ({ label: c.name.slice(0, 20), action: "reply", value: c.id })) }, fallbackText,
  };
  const items = visible.map(c => ({ label: c.name.slice(0, 24), id: c.id, description: c.name.slice(0, 72) }));
  if (page > 0) items.push({ label: "Página anterior", id: "__previous", description: "" });
  if (choices.length > 10 && (page + 1) * 8 < choices.length) items.push({ label: "Próxima página", id: "__next", description: "" });
  return { message: { type: "list", text, footer: "", listButton: "Escolher congregação", sections: [{ title: "Congregações", items }] }, fallbackText };
}
