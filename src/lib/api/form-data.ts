/** Convert a plain JSON object into FormData for legacy P4 server actions. */
export function objectToFormData(record: Record<string, unknown>): FormData {
  const formData = new FormData()

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) {
      continue
    }

    if (value instanceof Blob) {
      formData.append(key, value)
      continue
    }

    if (typeof value === "boolean" || typeof value === "number") {
      formData.append(key, String(value))
      continue
    }

    if (typeof value === "object") {
      formData.append(key, JSON.stringify(value))
      continue
    }

    formData.append(key, String(value))
  }

  return formData
}
