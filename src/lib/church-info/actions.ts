"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { ChurchInfoActionResult, SaveChurchInfoInput } from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value || null)

const socialLinkSchema = z.object({
  platform: z.string().trim().min(1, "Rede social obrigatória"),
  url: z.string().trim().optional().default(""),
  sortOrder: z.number().int().min(0).optional().default(0),
  isActive: z.boolean().optional().default(true),
})

const churchInfoSchema = z.object({
  companyId: nullableUuidSchema,
  publicName: z.string().trim().min(2, "Nome público obrigatório"),
  responsibleName: z.string().trim().optional().default(""),
  email: z.string().trim().email("E-mail inválido"),
  phone: z.string().trim().optional().default(""),
  website: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  country: z.string().trim().optional().default("Brasil"),
  timezone: z.string().trim().optional().default("America/Sao_Paulo"),
  history: z.string().trim().optional().default(""),
  socialLinks: z.array(socialLinkSchema).max(12).default([]),
})

function toErrorResult(error: unknown): ChurchInfoActionResult {
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

function refreshChurchInfoPaths() {
  revalidatePath("/informacoes")
  revalidatePath("/church/[slug]", "page")
  revalidatePath("/dashboard")
}

export async function saveChurchInfo(input: SaveChurchInfoInput): Promise<ChurchInfoActionResult> {
  try {
    const parsed = churchInfoSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    let profileId: string | null = null

    await sql.begin(async (tx) => {
      const profileRows = await tx<{ id: string }[]>`
        insert into public.church_profiles (
          company_id,
          public_name,
          responsible_name,
          email,
          phone,
          website,
          address,
          city,
          state,
          country,
          timezone,
          history,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.publicName},
          ${parsed.responsibleName},
          ${parsed.email},
          ${parsed.phone},
          ${parsed.website},
          ${parsed.address},
          ${parsed.city},
          ${parsed.state.toUpperCase()},
          ${parsed.country},
          ${parsed.timezone},
          ${parsed.history},
          ${user.id},
          ${user.id}
        )
        on conflict (company_id) do update
        set public_name = excluded.public_name,
            responsible_name = excluded.responsible_name,
            email = excluded.email,
            phone = excluded.phone,
            website = excluded.website,
            address = excluded.address,
            city = excluded.city,
            state = excluded.state,
            country = excluded.country,
            timezone = excluded.timezone,
            history = excluded.history,
            updated_by = excluded.updated_by,
            updated_at = now()
        returning id
      `

      profileId = profileRows[0]?.id ?? null
      if (!profileId) {
        throw new Error("Perfil da igreja não foi salvo")
      }

      await tx`
        update public.social_links
        set deleted_at = now(),
            is_active = false,
            updated_by = ${user.id},
            updated_at = now()
        where company_id = ${companyId}
          and deleted_at is null
      `

      for (const [index, link] of parsed.socialLinks.entries()) {
        await tx`
          insert into public.social_links (
            company_id,
            church_profile_id,
            platform,
            url,
            sort_order,
            is_active,
            created_by,
            updated_by
          )
          values (
            ${companyId},
            ${profileId},
            ${link.platform},
            ${link.url},
            ${link.sortOrder ?? index},
            ${link.isActive},
            ${user.id},
            ${user.id}
          )
        `
      }
    })

    await writeAuditLog({
      action: "church_profile.save",
      entityTable: "church_profiles",
      entityId: profileId,
      companyId,
      metadata: {
        socialLinkCount: parsed.socialLinks.length,
      },
    })
    refreshChurchInfoPaths()

    return { ok: true, id: profileId ?? undefined }
  } catch (error) {
    return toErrorResult(error)
  }
}
