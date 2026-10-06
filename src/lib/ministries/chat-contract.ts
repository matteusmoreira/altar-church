import { z } from "zod"

export const CHAT_BUCKET = "ministry-chat-assets"
export const CHAT_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_EMOJIS = ["👍", "❤️", "🙏", "😂", "🎉"] as const
export const CHAT_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "audio/webm": ["webm"], "audio/ogg": ["ogg"], "audio/mp4": ["m4a", "mp4"],
}
export const chatUploadSchema = z.object({
  name: z.string().trim().min(1).max(200).refine(name => !/[\x00-\x1f]/.test(name), "Nome inválido"),
  mimeType: z.string(), sizeBytes: z.number().int().min(1).max(CHAT_MAX_BYTES),
}).superRefine((data, ctx) => {
  const extension = data.name.split(".").pop()?.toLowerCase() ?? ""
  if (!CHAT_MIME_EXTENSIONS[data.mimeType]?.includes(extension)) ctx.addIssue({ code: "custom", path: ["mimeType"], message: "Formato de arquivo inválido" })
})
export const chatSendSchema = z.object({
  clientId: z.string().uuid(), body: z.string().trim().max(5000).default(""),
  replyToId: z.string().uuid().nullable().optional(), attachmentIds: z.array(z.string().uuid()).max(5).default([]),
}).refine(data => data.body.length > 0 || data.attachmentIds.length > 0, "Escreva uma mensagem ou escolha um anexo")
.refine(data => new Set(data.attachmentIds).size === data.attachmentIds.length, "Anexos duplicados")
export const chatCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), messageId: z.string().uuid(), body: z.string().trim().max(5000) }),
  z.object({ action: z.literal("delete"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("react"), messageId: z.string().uuid(), emoji: z.enum(CHAT_EMOJIS), active: z.boolean() }),
  z.object({ action: z.literal("pin"), messageId: z.string().uuid(), pinned: z.boolean() }),
  z.object({ action: z.literal("read"), messageId: z.string().uuid() }),
  z.object({ action: z.literal("preferences"), muted: z.boolean().optional(), pushEnabled: z.boolean().optional() }),
])
export const chatCursorSchema = z.object({ at: z.string().datetime({ offset: true }), id: z.string().uuid() })
export type ChatCursor = z.infer<typeof chatCursorSchema>
export interface MinistryChatAttachment { id: string; name: string; mimeType: string; sizeBytes: number; durationSeconds: number | null; url: string }
export interface MinistryChatMessage {
  id: string; senderId: string; senderName: string; senderPhoto: string | null; body: string; createdAt: string
  editedAt: string | null; deletedAt: string | null; pinnedAt: string | null
  reply: { id: string; senderName: string; body: string; deleted: boolean } | null
  attachments: MinistryChatAttachment[]; reactions: { emoji: string; count: number; mine: boolean }[]
}
export interface MinistryChatPage {
  messages: MinistryChatMessage[]; pinned: MinistryChatMessage[]; nextCursor: ChatCursor | null
  actorId: string; canManage: boolean; muted: boolean; pushEnabled: boolean; ministryName: string
}
export interface MinistryChatSummary { id: string; name: string; lastMessage: string; lastMessageAt: string | null; unread: number; muted: boolean }

export function validChatSignature(bytes: Uint8Array, mime: string) {
  const match = (values: number[], offset = 0) => values.every((value, index) => bytes[offset + index] === value)
  const ascii = (value: string, offset = 0) => match([...value].map(char => char.charCodeAt(0)), offset)
  switch (mime) {
    case "image/jpeg": return match([255, 216, 255])
    case "image/png": return match([137, 80, 78, 71, 13, 10, 26, 10])
    case "image/webp": return ascii("RIFF") && ascii("WEBP", 8)
    case "application/pdf": return ascii("%PDF-")
    case "audio/ogg": return ascii("OggS")
    case "audio/mp4": return ascii("ftyp", 4)
    case "audio/webm": return match([26, 69, 223, 163])
    default: return mime.includes("openxmlformats") && match([80, 75, 3, 4])
  }
}
