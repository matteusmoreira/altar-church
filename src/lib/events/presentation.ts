export const defaultEventTypes = ["service", "prayer", "youth", "children", "special", "meeting"]

const labels: Record<string, string> = { service: "Culto", prayer: "Oração", youth: "Jovens", children: "Crianças", special: "Especial", meeting: "Reunião", cleaning: "Limpeza", rehearsal: "Ensaio", outreach: "Evangelismo", other: "Outro" }
export function eventTypeLabel(type: string) { return labels[type] || type }
export const EVENT_COVER_MAX_BYTES = 20 * 1024 * 1024
export const EVENT_COVER_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

export function templateDisplayOptions(templates: { id: string; name: string }[]) {
  const names = templates.map(item => item.name.replace(/\s*(?:·|-)\s*[a-f0-9]{8}(?:-[a-f0-9-]+)?$/i, "").trim())
  const seen = new Map<string, number>()
  return templates.map((item, index) => {
    const name = names[index]
    const count = (seen.get(name) || 0) + 1
    seen.set(name, count)
    return { ...item, name: names.filter(value => value === name).length > 1 ? `${name} — modelo ${count}` : name }
  })
}
