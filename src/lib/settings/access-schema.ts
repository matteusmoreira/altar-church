import { z } from "zod"

export const churchRoles = ["admin", "pastor", "ministry_leader", "cell_supervisor", "cell_leader", "communication", "finance", "volunteer", "member"] as const

export const accessSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome").max(160),
  email: z.string().trim().email("Informe um e-mail válido").toLowerCase(),
  role: z.enum(churchRoles),
  roles: z.array(z.enum(churchRoles)).min(1, "Selecione ao menos um perfil de acesso").max(churchRoles.length).optional(),
  active: z.boolean(),
  password: z.string().max(128).default(""),
  cellIds: z.array(z.string().uuid()).max(100).default([]),
}).superRefine((value, ctx) => {
  if ((!value.id || value.password) && value.password.length < 8) {
    ctx.addIssue({ code: "custom", path: ["password"], message: "A senha deve ter pelo menos 8 caracteres" })
  }
  if ((value.roles ?? [value.role]).includes("cell_leader") && !value.cellIds.length) {
    ctx.addIssue({ code: "custom", path: ["cellIds"], message: "Selecione ao menos uma célula" })
  }
})

export type SaveAccessInput = z.input<typeof accessSchema>

export function assertAccessTarget(actorId: string, target: { id: string; role: string; roles?: string[] }, next?: { role: string; roles?: string[]; active: boolean }) {
  if (target.role === "superadmin") throw new Error("O acesso SuperAdmin é gerenciado pelo console")
  if (target.id === actorId && (!next || !next.active || JSON.stringify([...(next.roles ?? [next.role])].sort()) !== JSON.stringify([...(target.roles ?? [target.role])].sort()))) {
    throw new Error("Você não pode excluir, desativar ou alterar a função do seu próprio acesso")
  }
}
