const allowedTags = new Set(["p", "strong", "b", "em", "i", "u", "ul", "ol", "li", "br", "a"])

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function safeHref(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

function linkifyPlainText(value: string) {
  return escapeHtml(value).replace(/https?:\/\/[^\s<]+/gi, (match) => {
    const href = safeHref(match.replaceAll("&amp;", "&"))
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${match}</a>` : match
  })
}

export function stripCellNoticeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Allow small, authored rich text while removing scripts, styles and unsafe URLs. */
export function sanitizeCellNoticeHtml(value: string) {
  const source = value.trim()
  if (!source) return ""
  const html = /<\/?[a-z][\s\S]*>/i.test(source)
    ? source
    : linkifyPlainText(source).replace(/\r?\n/g, "<br>")

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<([a-z0-9]+)([^>]*)>/gi, (_match, rawTag: string, rawAttributes: string) => {
      const tag = rawTag.toLowerCase() === "div" ? "p" : rawTag.toLowerCase()
      if (!allowedTags.has(tag)) return ""
      if (tag !== "a") return `<${tag}>`

      const hrefMatch = rawAttributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)
      const href = hrefMatch ? safeHref(hrefMatch[1]) : null
      if (!href) return ""
      const isButton = /\bdata-cell-button\s*=\s*["']true["']/i.test(rawAttributes)
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${isButton ? ' data-cell-button="true"' : ""}>`
    })
    .replace(/<\/([a-z0-9]+)>/gi, (_match, rawTag: string) => {
      const tag = rawTag.toLowerCase() === "div" ? "p" : rawTag.toLowerCase()
      return allowedTags.has(tag) ? `</${tag}>` : ""
    })
}
