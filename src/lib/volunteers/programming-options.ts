export const PROGRAMMING_KIND_LABELS: Record<string, string> = {
  service: "Culto",
  cleaning: "Faxina",
  rehearsal: "Ensaio",
  meeting: "Reunião",
  outreach: "Ação",
  other: "Outro",
};

export const DEFAULT_PROGRAMMING_KINDS = Object.keys(PROGRAMMING_KIND_LABELS);

export function programmingOptionLabel(value: string, field: "kind" | "location") {
  return field === "kind" ? PROGRAMMING_KIND_LABELS[value] ?? value : value;
}

export function changeProgrammingOptions(
  options: string[], field: "kind" | "location", operation: "add" | "delete", value: string,
) {
  const normalized = value.trim();
  if (!normalized || normalized.length > (field === "kind" ? 100 : 240))
    throw new Error("Informe uma opção válida");
  if (operation === "delete") return options.filter((option) => option !== normalized);
  const label = programmingOptionLabel(normalized, field).toLocaleLowerCase("pt-BR");
  if (options.some((option) => programmingOptionLabel(option, field).toLocaleLowerCase("pt-BR") === label))
    throw new Error("Esta opção já está cadastrada");
  if (options.length >= 200) throw new Error("Limite de 200 opções atingido");
  return [...options, normalized];
}
