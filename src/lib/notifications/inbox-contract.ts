import { z } from "zod"

export const inboxModules = { ministries: "Ministérios", volunteers: "Voluntariado", cells: "Células", events: "Eventos", forms: "Formulários", kids: "Kids", tasks: "Tarefas", automations: "Automações", prayer: "Oração", content: "Comunicados", finance: "Financeiro", deliveries: "Envios" } as const
export const inboxQuerySchema = z.object({
  module: z.enum(Object.keys(inboxModules) as [keyof typeof inboxModules, ...(keyof typeof inboxModules)[]]).optional(),
  unread: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(200).optional(),
})
export const inboxCursorSchema = z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
export const inboxReadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.string().uuid() }),
  z.object({ action: z.literal("read-all"), through: inboxCursorSchema }),
])
export interface InboxItem { id: string; module: keyof typeof inboxModules; kind: string; title: string; summary: string; href: string; createdAt: string; readAt: string | null }
export interface InboxPage { items: InboxItem[]; unread: number; nextCursor: string | null; through: z.infer<typeof inboxCursorSchema> | null }
