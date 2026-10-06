/** Telefone mascarado para listagens: (11) 9****-1234. Safe for browser imports. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 4) return "****"
  const last4 = digits.slice(-4)
  if (digits.length >= 10) return `(${digits.slice(0, 2)}) ${digits[2] === "9" ? "9" : ""}****-${last4}`
  return `****-${last4}`
}
