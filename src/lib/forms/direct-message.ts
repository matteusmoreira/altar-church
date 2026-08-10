import { z } from "zod"
import type {
  FormButtonAction,
  FormDirectButton,
  FormDirectCarouselCard,
  FormDirectListItem,
  FormDirectListSection,
  FormDirectMessage,
} from "./types"

const uuid = z.string().uuid()
const templateText = z.string().trim().min(1).max(4096)

const buttonSchema = z.object({
  label: templateText.max(120),
  action: z.enum(["reply", "url", "call", "copy"]),
  value: z.string().trim().min(1).max(500),
})

const listItemSchema = z.object({
  label: templateText.max(120),
  id: z.string().trim().max(120).default(""),
  description: z.string().trim().max(200).default(""),
})

const listSectionSchema = z.object({
  title: templateText.max(120),
  items: z.array(listItemSchema).min(1).max(10),
})

const carouselCardSchema = z.object({
  text: templateText.max(4096),
  mediaFileId: uuid,
  mediaType: z.enum(["image", "video", "document"]),
  filename: z.string().trim().max(180).default(""),
  buttons: z.array(buttonSchema).min(1).max(3),
})

export const directMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: templateText }),
  z.object({
    type: z.literal("button"),
    text: templateText,
    footer: z.string().trim().max(500).default(""),
    buttons: z.array(buttonSchema).min(1).max(3),
  }),
  z.object({
    type: z.literal("list"),
    text: templateText,
    footer: z.string().trim().max(500).default(""),
    listButton: templateText.max(80),
    sections: z.array(listSectionSchema).min(1).max(10),
  }).refine((value) => value.sections.reduce((total, section) => total + section.items.length, 0) <= 10, {
    message: "A lista pode ter no máximo 10 itens",
    path: ["sections"],
  }),
  z.object({
    type: z.literal("carousel"),
    text: templateText,
    cards: z.array(carouselCardSchema).min(1).max(10),
  }),
])

export type DirectMessageInput = z.input<typeof directMessageSchema>

const placeholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g

export function emptyDirectMessage(type: FormDirectMessage["type"] = "text"): FormDirectMessage {
  if (type === "button") {
    return {
      type,
      text: "",
      footer: "",
      buttons: [{ label: "", action: "reply", value: "" }],
    }
  }
  if (type === "list") {
    return {
      type,
      text: "",
      footer: "",
      listButton: "Ver opções",
      sections: [{ title: "Opções", items: [{ label: "", id: "", description: "" }] }],
    }
  }
  if (type === "carousel") {
    return {
      type,
      text: "",
      cards: [
        {
          text: "",
          mediaFileId: null,
          mediaType: "image",
          filename: "",
          buttons: [{ label: "", action: "reply", value: "" }],
        },
      ],
    }
  }
  return { type: "text", text: "" }
}

export function parseDirectMessageConfig(value: unknown): FormDirectMessage | null {
  const parsed = directMessageSchema.safeParse(value)
  return parsed.success ? (parsed.data as FormDirectMessage) : null
}

function collectStrings(value: unknown, output: string[]) {
  if (typeof value === "string") {
    output.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output))
    return
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectStrings(item, output))
  }
}

export function collectTemplateVariables(message: unknown) {
  const strings: string[] = []
  collectStrings(message, strings)
  const variables = new Set<string>()
  for (const value of strings) {
    for (const match of value.matchAll(placeholderPattern)) {
      if (match[1]) variables.add(match[1])
    }
  }
  return [...variables]
}

export function validateTemplateVariables(message: unknown, allowedKeys: ReadonlySet<string>) {
  const invalid = collectTemplateVariables(message).filter((key) => !allowedKeys.has(key))
  if (invalid.length > 0) {
    throw new Error(`Variável(is) inválida(s): ${invalid.map((key) => `{{${key}}}`).join(", ")}`)
  }
}

export function renderTemplate(value: string, variables: Record<string, unknown>) {
  return value.replace(placeholderPattern, (_full, key: string) => {
    const resolved = variables[key]
    if (resolved === true) return "Sim"
    if (resolved === false) return "Não"
    return resolved == null ? "" : String(resolved)
  })
}

function renderButton(button: FormDirectButton, variables: Record<string, unknown>): FormDirectButton {
  return {
    label: renderTemplate(button.label, variables),
    action: button.action,
    value: renderTemplate(button.value, variables),
  }
}

function renderListItem(item: FormDirectListItem, variables: Record<string, unknown>): FormDirectListItem {
  return {
    label: renderTemplate(item.label, variables),
    id: renderTemplate(item.id, variables),
    description: renderTemplate(item.description, variables),
  }
}

function renderListSection(section: FormDirectListSection, variables: Record<string, unknown>): FormDirectListSection {
  return {
    title: renderTemplate(section.title, variables),
    items: section.items.map((item) => renderListItem(item, variables)),
  }
}

function renderCard(card: FormDirectCarouselCard, variables: Record<string, unknown>): FormDirectCarouselCard {
  return {
    ...card,
    text: renderTemplate(card.text, variables),
    filename: renderTemplate(card.filename, variables),
    buttons: card.buttons.map((button) => renderButton(button, variables)),
  }
}

export function renderDirectMessage(message: FormDirectMessage, variables: Record<string, unknown>): FormDirectMessage {
  if (message.type === "text") return { type: "text", text: renderTemplate(message.text, variables) }
  if (message.type === "button") {
    return {
      ...message,
      text: renderTemplate(message.text, variables),
      footer: renderTemplate(message.footer, variables),
      buttons: message.buttons.map((button) => renderButton(button, variables)),
    }
  }
  if (message.type === "list") {
    return {
      ...message,
      text: renderTemplate(message.text, variables),
      footer: renderTemplate(message.footer, variables),
      listButton: renderTemplate(message.listButton, variables),
      sections: message.sections.map((section) => renderListSection(section, variables)),
    }
  }
  return {
    ...message,
    text: renderTemplate(message.text, variables),
    cards: message.cards.map((card) => renderCard(card, variables)),
  }
}

export function collectDirectMessageMediaFileIds(message: FormDirectMessage | null | undefined) {
  if (!message) return []
  const ids: string[] = []
  if (message.type === "carousel") {
    for (const card of message.cards) {
      if (card.mediaFileId) ids.push(card.mediaFileId)
    }
  }
  return [...new Set(ids)]
}

export function directMediaTypeMatches(mediaType: "image" | "video" | "document", mimeType: string) {
  if (mediaType === "image") return ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
  if (mediaType === "video") return mimeType === "video/mp4"
  return mimeType === "application/pdf"
}

function buttonChoice(button: FormDirectButton) {
  const value = button.value.trim() || button.label.trim()
  if (button.action === "call") return `${button.label}|call:${value}`
  if (button.action === "copy") return `${button.label}|copy:${value}`
  if (button.action === "url") return `${button.label}|url:${value}`
  return `${button.label}|${value}`
}

function actionType(action: FormButtonAction) {
  return action.toUpperCase() as "REPLY" | "URL" | "CALL" | "COPY"
}

export function buildUazapiPayload(
  message: FormDirectMessage,
  input: {
    number: string
    trackId: string
    mediaUrls?: ReadonlyMap<string, string>
  },
) {
  const common = {
    number: input.number,
    async: true,
    track_source: "altar_church_form",
    track_id: input.trackId,
  }

  if (message.type === "text") {
    return { endpoint: "/send/text", body: { ...common, text: message.text, linkPreview: false } }
  }

  if (message.type === "button") {
    return {
      endpoint: "/send/menu",
      body: {
        ...common,
        type: "button",
        text: message.text,
        footerText: message.footer || undefined,
        choices: message.buttons.map(buttonChoice),
      },
    }
  }

  if (message.type === "list") {
    return {
      endpoint: "/send/menu",
      body: {
        ...common,
        type: "list",
        text: message.text,
        footerText: message.footer || undefined,
        listButton: message.listButton,
        choices: message.sections.flatMap((section) => [
          `[${section.title}]`,
          ...section.items.map((item) => [item.label, item.id || item.label, item.description].filter(Boolean).join("|")),
        ]),
      },
    }
  }

  return {
    endpoint: "/send/carousel",
    body: {
      ...common,
      text: message.text,
      carousel: message.cards.map((card) => {
        const mediaUrl = card.mediaFileId ? input.mediaUrls?.get(card.mediaFileId) : ""
        if (!mediaUrl) throw new Error("Mídia do carrossel não encontrada")
        return {
          text: card.text,
          ...(card.mediaType === "video" ? { video: mediaUrl } : card.mediaType === "document" ? { document: mediaUrl, filename: card.filename || "arquivo.pdf" } : { image: mediaUrl }),
          buttons: card.buttons.map((button) => ({ id: button.value, text: button.label, type: actionType(button.action) })),
        }
      }),
    },
  }
}
