const BRAZILIAN_MOBILE_PATTERN = /^[1-9][0-9]9[0-9]{8}$/
const BRAZILIAN_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
])

export function phoneDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 13)
}

export function normalizeBrazilianWhatsapp(value: string | null | undefined): string | null {
  let digits = phoneDigits(value)
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2)
  return BRAZILIAN_MOBILE_PATTERN.test(digits) && BRAZILIAN_DDDS.has(digits.slice(0, 2))
    ? digits
    : null
}

export function formatBrazilianWhatsapp(value: string | null | undefined) {
  let digits = phoneDigits(value)
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2)
  digits = digits.slice(0, 11)
  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function toUazapiNumber(value: string) {
  const phone = normalizeBrazilianWhatsapp(value)
  if (!phone) throw new Error("WhatsApp inválido")
  return `55${phone}`
}

export function maskBrazilianWhatsapp(value: string | null | undefined) {
  const phone = normalizeBrazilianWhatsapp(value)
  if (!phone) return "(**) *****-****"
  return `(${phone.slice(0, 2)}) 9****-${phone.slice(-4)}`
}
