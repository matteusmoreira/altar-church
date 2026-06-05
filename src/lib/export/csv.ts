export type CsvCell = string | number | boolean | null | undefined

function escapeCell(value: CsvCell) {
  const text = value == null ? "" : String(value)
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export function toCsv(rows: CsvCell[][]) {
  return rows.map((row) => row.map(escapeCell).join(";")).join("\n")
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
