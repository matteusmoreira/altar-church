/**
 * Gera um slug amigável e limpo a partir do nome de um ministério.
 * Remove prefixos comuns ("Ministério de", "Ministério da", "Min.", etc.)
 * para que nomes como "Ministério de Homens" resultem diretamente no slug "homens".
 */
export function slugifyMinistry(value: string): string {
  if (!value) return "ministerio"

  // Remove prefixos ministeriais comuns se houver texto subsequente
  const trimmed = value.trim()
  const cleaned = trimmed.replace(
    /^(?:minist[eé]rio\s+(?:d[eoa]s?\s+)?|min\.?\s+(?:d[eoa]s?\s+)?)/i,
    "",
  ).trim() || trimmed

  const slug = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // substitui caracteres não alfanuméricos por hífen
    .replace(/^-+|-+$/g, "") // remove hífens no início e fim
    .slice(0, 80)

  return slug || "ministerio"
}

/**
 * Valida e formata um slug digitado pelo usuário.
 */
export function normalizeMinistrySlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
