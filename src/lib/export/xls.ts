export type XlsCell = string | number | boolean | null | undefined

function escapeXml(value: XlsCell) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function cellType(value: XlsCell) {
  if (typeof value === "number") return "Number"
  if (typeof value === "boolean") return "Boolean"
  return "String"
}

/** SpreadsheetML 2003: arquivo .xls aberto nativamente pelo Excel. */
export function xlsResponse(filename: string, rows: XlsCell[][]) {
  const worksheet = rows
    .map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="${cellType(value)}">${escapeXml(value)}</Data></Cell>`).join("")}</Row>`)
    .join("")
  const body = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Dados"><Table>${worksheet}</Table></Worksheet></Workbook>`

  return new Response(body, {
    headers: {
      "content-type": "application/vnd.ms-excel; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  })
}
