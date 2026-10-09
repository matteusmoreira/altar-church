import { sanitizeCellNoticeHtml, stripCellNoticeHtml } from "@/lib/cells/rich-content"

export const notificationHtml = sanitizeCellNoticeHtml

export function notificationPlainText(content: string) {
  const safe = notificationHtml(content)
  return stripCellNoticeHtml(safe).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity
    const point = code.toLowerCase().startsWith("#x") ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ""
  })
}

export function prepareNotificationContent(content: string, channel: string) {
  if (channel !== "push") return content
  if (content.length > 20_000) throw new Error("Conteúdo muito longo. Use até 20.000 caracteres.")
  const html = notificationHtml(content)
  if (!notificationPlainText(html).trim()) throw new Error("Conteúdo obrigatório")
  return html
}
