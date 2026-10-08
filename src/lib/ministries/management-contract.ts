import { z } from "zod"

export const reportPeriodSchema = z.object({
  from: z.string().date(), to: z.string().date(),
}).refine(value => value.from <= value.to, "O início deve ser anterior ao fim do período")

export function reportPeriod(days = 30, timezone = "America/Sao_Paulo", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)!.value
  const to = `${get("year")}-${get("month")}-${get("day")}`
  const start = new Date(`${to}T12:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return { from: start.toISOString().slice(0, 10), to }
}

export function attendanceRate(present: number, absent: number, justified: number) {
  const total = present + absent + justified
  return total ? Math.round(present / total * 100) : null
}

export const followUpSchema = z.object({
  ministryId: z.string().uuid(), id: z.string().uuid().optional(), personId: z.string().uuid(),
  title: z.string().trim().min(3).max(180), notes: z.string().trim().max(10000).default(""),
  nextAction: z.string().trim().max(2000).default(""),
  responsibleProfileId: z.string().uuid().nullable(), dueAt: z.string().datetime({ offset: true }).nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  status: z.enum(["open", "in_progress", "completed", "canceled"]).default("open"),
})

export interface MinistryFollowUp {
  id: string; personId: string; personName: string; title: string; notes: string; nextAction: string
  responsibleProfileId: string | null; responsibleName: string | null; dueAt: string | null
  priority: "low" | "normal" | "high" | "urgent"; status: "open" | "in_progress" | "completed" | "canceled"
}
export interface MinistryManagementData {
  timezone: string
  attendance: { eventId: string; title: string; day: string; present: number; absent: number; justified: number }[]
  followUps: MinistryFollowUp[]
  responsibles: { id: string; name: string }[]
}
export interface MinistryPersonHistory {
  assignments: { id: string; title: string; startsAt: string; roleName: string; status: string }[]
  attendance: { id: string; title: string; day: string; status: string }[]
}
