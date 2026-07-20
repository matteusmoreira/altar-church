"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createClient } from "@/lib/supabase/server"
import { requireMemberContext } from "./access"

type Result = { ok: boolean; error?: string }
const ministrySchema = z.object({ ministryId: z.string().uuid() })
const ownMinistrySettingsSchema = z.object({
  ministryId: z.string().uuid(),
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  description: z.string().trim().max(2000).default(""),
  contact: z.string().trim().max(200).default(""),
  isActive: z.boolean(),
})
const reviewSchema = z.object({
  membershipId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "remove"]),
})

function errorResult(error: unknown): Result {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

export async function requestMinistryMembership(input: z.input<typeof ministrySchema>): Promise<Result> {
  try {
    const parsed = ministrySchema.parse(input)
    const { user, companyId, personId } = await requireMemberContext()
    const sql = getSql()
    const ministries = await sql<{ id: string }[]>`
      select id from public.ministries
      where id = ${parsed.ministryId} and company_id = ${companyId}
        and deleted_at is null and is_active = true
      limit 1
    `
    if (!ministries[0]) throw new Error("Ministério não encontrado")

    const rows = await sql<{ id: string; status: string }[]>`
      insert into public.ministry_memberships (
        company_id, ministry_id, person_id, role, status, requested_by, requested_at
      )
      values (${companyId}, ${parsed.ministryId}, ${personId}, 'member', 'pending', ${user.id}, now())
      on conflict (ministry_id, person_id) do update
      set status = 'pending', role = 'member', requested_by = ${user.id},
          requested_at = now(), reviewed_by = null, reviewed_at = null, joined_at = null
      where public.ministry_memberships.status in ('rejected', 'inactive')
      returning id, status
    `
    if (!rows[0]) throw new Error("Você já possui solicitação ou vínculo ativo neste ministério")
    await writeAuditLog({
      action: "ministry.membership.request",
      entityTable: "ministry_memberships",
      entityId: rows[0].id,
      companyId,
      metadata: { ministryId: parsed.ministryId },
    })
    revalidatePath("/membro")
    revalidatePath("/membro/ministerios")
    revalidatePath("/ministerios")
    return { ok: true }
  } catch (error) {
    return errorResult(error)
  }
}

export async function cancelMinistryMembershipRequest(input: z.input<typeof ministrySchema>): Promise<Result> {
  try {
    const parsed = ministrySchema.parse(input)
    const { user, companyId, personId } = await requireMemberContext()
    const rows = await getSql()<{ id: string }[]>`
      update public.ministry_memberships
      set status = 'inactive', reviewed_by = null, reviewed_at = now()
      where ministry_id = ${parsed.ministryId} and company_id = ${companyId}
        and person_id = ${personId} and status = 'pending'
      returning id
    `
    if (!rows[0]) throw new Error("Solicitação pendente não encontrada")
    await writeAuditLog({
      action: "ministry.membership.cancel",
      entityTable: "ministry_memberships",
      entityId: rows[0].id,
      companyId,
      metadata: { ministryId: parsed.ministryId, actor: user.id },
    })
    revalidatePath("/membro/ministerios")
    revalidatePath("/ministerios")
    return { ok: true }
  } catch (error) {
    return errorResult(error)
  }
}

export async function updateOwnMinistrySettings(
  input: z.input<typeof ownMinistrySettingsSchema>,
): Promise<Result> {
  try {
    const parsed = ownMinistrySettingsSchema.parse(input)
    const { user, companyId, personId } = await requireMemberContext()
    const rows = await getSql()<{ id: string }[]>`
      update public.ministries
      set name = ${parsed.name},
          description = ${parsed.description},
          contact = ${parsed.contact},
          is_active = ${parsed.isActive},
          updated_by = ${user.id}
      where id = ${parsed.ministryId}
        and company_id = ${companyId}
        and leader_person_id = ${personId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]) throw new Error("Você só pode configurar ministérios que lidera")
    await writeAuditLog({
      action: "ministry.self.settings.update",
      entityTable: "ministries",
      entityId: parsed.ministryId,
      companyId,
      metadata: {
        fields: ["name", "description", "contact", "is_active"],
        isActive: parsed.isActive,
      },
    })
    revalidatePath("/membro")
    revalidatePath("/membro/ministerios")
    revalidatePath("/ministerios")
    return { ok: true }
  } catch (error) {
    return errorResult(error)
  }
}

export async function reviewMinistryMembership(input: z.input<typeof reviewSchema>): Promise<Result> {
  try {
    const parsed = reviewSchema.parse(input)
    const user = await getCurrentUser()
    if (!user?.churchId || !["superadmin", "admin", "pastor"].includes(user.role)) {
      throw new Error("Acesso negado")
    }
    const sql = getSql()
    const memberships = await sql<{ id: string; ministry_id: string; status: string }[]>`
      select membership.id, membership.ministry_id, membership.status
      from public.ministry_memberships membership
      join public.ministries ministry on ministry.id = membership.ministry_id
      where membership.id = ${parsed.membershipId}
        and membership.company_id = ${user.churchId}
        and ministry.deleted_at is null
      limit 1
    `
    const membership = memberships[0]
    if (!membership) throw new Error("Participação não encontrada")
    if (parsed.decision !== "remove" && membership.status !== "pending") {
      throw new Error("Solicitação já foi revisada")
    }
    if (parsed.decision === "remove" && membership.status !== "active") {
      throw new Error("Participante não está ativo")
    }
    const status = parsed.decision === "approve" ? "active" : parsed.decision === "reject" ? "rejected" : "inactive"
    await sql`
      update public.ministry_memberships
      set status = ${status}, reviewed_by = ${user.id}, reviewed_at = now(),
          joined_at = case when ${status} = 'active' then coalesce(joined_at, now()) else joined_at end
      where id = ${membership.id} and company_id = ${user.churchId}
    `
    await writeAuditLog({
      action: `ministry.membership.${parsed.decision}`,
      entityTable: "ministry_memberships",
      entityId: membership.id,
      companyId: user.churchId,
      metadata: { ministryId: membership.ministry_id, status },
    })
    revalidatePath("/ministerios")
    revalidatePath("/membro")
    revalidatePath("/membro/ministerios")
    return { ok: true }
  } catch (error) {
    return errorResult(error)
  }
}

export async function signOutMember() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
