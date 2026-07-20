"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import type { KidsActionResult } from "./types"

const fieldSchema = z.object({
  id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional().transform((value) => value || null),
  name: z.string().trim().min(2, "Nome do campo obrigatório").max(120),
  fieldType: z.enum(["text", "textarea", "number", "date", "single", "multiple", "boolean"]),
  options: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  targets: z.array(z.enum(["child", "guardian"])).min(1, "Escolha Criança ou Responsável"),
  surfaces: z.array(z.enum(["internal", "public", "portal"])).min(1, "Escolha onde exibir o campo"),
  required: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

async function context() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await requirePermission("kids.settings.manage", companyId)
  return { user, companyId }
}

function result(error: unknown): KidsActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

function refresh() {
  revalidatePath("/kids")
  revalidatePath("/membro/kids")
}

export async function saveKidCustomField(input: z.input<typeof fieldSchema>): Promise<KidsActionResult> {
  try {
    const parsed = fieldSchema.parse(input)
    if (["single", "multiple"].includes(parsed.fieldType) && parsed.options.length === 0) throw new Error("Informe ao menos uma opção")
    const { user, companyId } = await context()
    const sql = getSql()
    let id = parsed.id
    if (id) {
      const current = await sql<{ field_type: string; value_count: number }[]>`
        select field.field_type,
          (select count(*)::int from public.person_custom_field_values value where value.field_id = field.id) as value_count
        from public.person_custom_fields field
        where field.id = ${id} and field.company_id = ${companyId} and field.source_module = 'kids' and field.deleted_at is null
        limit 1
      `
      if (!current[0]) throw new Error("Campo não encontrado")
      if (current[0].field_type !== parsed.fieldType && Number(current[0].value_count) > 0) {
        throw new Error("Não é possível alterar o tipo de um campo que já possui respostas")
      }
      const rows = await sql<{ id: string }[]>`
        update public.person_custom_fields set
          name = ${parsed.name}, field_type = ${parsed.fieldType}, options = ${sql.json(parsed.options)},
          kids_targets = ${parsed.targets},
          show_in_kids_internal = ${parsed.surfaces.includes("internal")},
          show_in_kids_public = ${parsed.surfaces.includes("public")},
          show_in_kids_portal = ${parsed.surfaces.includes("portal")},
          is_required = ${parsed.required}, is_active = ${parsed.isActive},
          updated_by = ${user.id}, updated_at = now()
        where id = ${id} and company_id = ${companyId} and source_module = 'kids' and deleted_at is null
        returning id
      `
      if (!rows[0]?.id) throw new Error("Campo não encontrado")
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.person_custom_fields (
          company_id, name, field_type, options, source_module, kids_targets,
          show_in_kids_internal, show_in_kids_public, show_in_kids_portal,
          is_required, sort_order, is_active, created_by, updated_by
        ) values (
          ${companyId}, ${parsed.name}, ${parsed.fieldType}, ${sql.json(parsed.options)}, 'kids', ${parsed.targets},
          ${parsed.surfaces.includes("internal")}, ${parsed.surfaces.includes("public")}, ${parsed.surfaces.includes("portal")},
          ${parsed.required},
          coalesce((select max(sort_order) + 1 from public.person_custom_fields where company_id = ${companyId} and source_module = 'kids' and deleted_at is null), 0),
          ${parsed.isActive}, ${user.id}, ${user.id}
        ) returning id
      `
      id = rows[0]?.id ?? null
    }
    if (!id) throw new Error("Campo não foi salvo")
    await writeAuditLog({ action: "kids.custom_field.save", entityTable: "person_custom_fields", entityId: id, companyId, metadata: { targets: parsed.targets, surfaces: parsed.surfaces } })
    refresh()
    return { ok: true, id }
  } catch (error) {
    return result(error)
  }
}

export async function reorderKidCustomFields(input: unknown): Promise<KidsActionResult> {
  try {
    const ids = z.array(z.string().uuid()).max(100).parse(input)
    const { user, companyId } = await context()
    const sql = getSql()
    await sql.begin(async (tx) => {
      for (const [sortOrder, id] of ids.entries()) {
        await tx`
          update public.person_custom_fields set sort_order = ${sortOrder}, updated_by = ${user.id}, updated_at = now()
          where id = ${id} and company_id = ${companyId} and source_module = 'kids' and deleted_at is null
        `
      }
    })
    refresh()
    return { ok: true }
  } catch (error) {
    return result(error)
  }
}

export async function deleteKidCustomField(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context()
    const rows = await getSql()<{ id: string }[]>`
      update public.person_custom_fields set deleted_at = now(), is_active = false, updated_by = ${user.id}, updated_at = now()
      where id = ${id} and company_id = ${companyId} and source_module = 'kids' and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Campo não encontrado")
    await writeAuditLog({ action: "kids.custom_field.delete", entityTable: "person_custom_fields", entityId: id, companyId, metadata: {} })
    refresh()
    return { ok: true, id }
  } catch (error) {
    return result(error)
  }
}
