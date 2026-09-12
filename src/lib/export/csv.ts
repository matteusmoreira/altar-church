export type CsvCell = string | number | boolean | null | undefined

function neutralizeFormula(value: CsvCell) {
  if (typeof value !== "string") return value == null ? "" : String(value)
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
}

export function escapeCsvCell(value: CsvCell) {
  const text = neutralizeFormula(value)
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(escapeCsvCell).join(";")).join("\n")
}

export function csvResponse(filename: string, rows: CsvCell[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
