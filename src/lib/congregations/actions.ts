"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { CongregationActionResult, SaveCongregationInput } from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const congregationSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  name: z.string().trim().min(2, "Nome obrigatório"),
  responsible: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  isActive: z.boolean().optional().default(true),
})

const deleteCongregationSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

function toErrorResult(error: unknown): CongregationActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

async function resolveActionCompanyId(inputCompanyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const companyId = requireUserCompanyId(user, inputCompanyId)
  return { user, companyId }
}

function refreshCongregationPaths() {
  revalidatePath("/congregacoes")
  revalidatePath("/pessoas")
  revalidatePath("/informacoes")
  revalidatePath("/dashboard")
}

export async function saveCongregation(input: SaveCongregationInput): Promise<CongregationActionResult> {
  try {
    const parsed = congregationSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    let congregationId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.congregations
        set name = ${parsed.name},
            responsible = ${parsed.responsible},
            address = ${parsed.address},
            is_active = ${parsed.isActive},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      congregationId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.congregations (
          company_id,
          name,
          responsible,
          address,
          is_active,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.name},
          ${parsed.responsible},
          ${parsed.address},
          ${parsed.isActive},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      congregationId = rows[0]?.id ?? null
    }

    if (!congregationId) {
      throw new Error("Congregação não foi salva")
    }

    await writeAuditLog({
      action: "congregation.save",
      entityTable: "congregations",
      entityId: congregationId,
      companyId,
      metadata: {
        isActive: parsed.isActive,
      },
    })
    refreshCongregationPaths()

    return { ok: true, id: congregationId ?? undefined }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteCongregation(input: { id: string; companyId?: string | null }): Promise<CongregationActionResult> {
  try {
    const parsed = deleteCongregationSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.congregations
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const congregationId = rows[0]?.id
    if (!congregationId) {
      throw new Error("Congregação não encontrada")
    }

    await writeAuditLog({
      action: "congregation.delete",
      entityTable: "congregations",
      entityId: congregationId,
      companyId,
      metadata: {},
    })
    refreshCongregationPaths()

    return { ok: true, id: congregationId }
  } catch (error) {
    return toErrorResult(error)
  }
}
