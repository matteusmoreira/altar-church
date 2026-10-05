import { z } from "zod"

export const followUpConfigSchema = z.object({
  daysThreshold: z.number().int().min(1).max(180).optional(),
  dueDays: z.number().int().min(0).max(60).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  responsibleProfileId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
}).passthrough()

export function parseFollowUpConfig(input: unknown) {
  const parsed = followUpConfigSchema.safeParse(input)
  if (!parsed.success) throw new Error("Revise os dias, a prioridade e o responsável da regra. Use dias inteiros dentro dos limites informados.")
  return parsed.data
}
