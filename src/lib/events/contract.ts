export function parseEventValue(value: string): number {
  const input = value.trim()
  if (!input) return 0
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(input)) throw new Error("Informe o valor em reais, como 150,50")
  const [whole, fraction = ""] = input.replaceAll(".", "").split(",")
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw new Error("Valor inválido")
  return cents
}

export function eventValueLabel(cents = 0): string {
  return cents === 0 ? "Gratuito" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

export type EventRegistrationSettings = {
  registrationMode?: "internal" | "external"
  externalPlatform?: string
  externalTicketUrl?: string
}

export function parseEventRegistrationSettings(mode = "internal", platform = "Sympla", ticketUrl = ""): Required<EventRegistrationSettings> {
  if (mode !== "internal" && mode !== "external") throw new Error("Modalidade de inscrição inválida")
  if (mode === "internal") return { registrationMode: mode, externalPlatform: "Sympla", externalTicketUrl: "" }
  platform = platform.trim() || "Sympla"
  if (platform.length < 2 || platform.length > 80) throw new Error("Informe uma plataforma com 2 a 80 caracteres")
  if (/\s/.test(ticketUrl.trim())) throw new Error("Informe um link de ingressos HTTPS válido")
  let url: URL
  try { url = new URL(ticketUrl.trim()) } catch { throw new Error("Informe um link de ingressos HTTPS válido") }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.href.length > 2000) throw new Error("Informe um link de ingressos HTTPS válido")
  return { registrationMode: mode, externalPlatform: platform, externalTicketUrl: url.href }
}

export function eventPriceLabel(event: EventRegistrationSettings & { valueCents?: number }) {
  return event.registrationMode === "external" && !event.valueCents ? `Consulte os valores no ${event.externalPlatform || "Sympla"}` : eventValueLabel(event.valueCents)
}

export function eventLocalDateTime(value: string, timeZone = "America/Sao_Paulo") {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function eventRegistrationOpen(event: EventRegistrationSettings & { startsAt: string; endsAt: string | null; registrationEnabled: boolean }, now = Date.now()) {
  const ends = event.endsAt ? Date.parse(event.endsAt) : Date.parse(event.startsAt) + 3 * 60 * 60 * 1000
  return event.registrationMode !== "external" && event.registrationEnabled && now < ends
}
