export function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN
  if (typeof value !== "string") return NaN
  const input = value.trim()
  if (!input) return NaN
  const normalized = input.includes(",")
    ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(input)
      ? input.replace(/\./g, "").replace(",", ".")
      : ""
    : /^-?\d+(?:\.\d{1,2})?$/.test(input) ? input : ""
  return normalized ? Number(normalized) : NaN
}
