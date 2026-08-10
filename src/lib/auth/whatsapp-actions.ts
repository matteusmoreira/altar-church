"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { normalizeBrazilianWhatsapp } from "./phone"

const whatsappSchema = z.string().trim().min(1, "Informe seu WhatsApp")

function splitName(name: string) {
  const parts = name.trim().split(/\s+/)
  return { firstName: parts[0] ?? name, lastName: parts.slice(1).join(" ") }
}

export async function saveOwnWhatsapp(phoneInput: string) {
  try {
    const phone = normalizeBrazilianWhatsapp(whatsappSchema.parse(phoneInput))
    if (!phone) throw new Error("Informe um WhatsApp móvel válido com DDD")
    const user = await getCurrentUser()
    if (!user || user.role === "superadmin" || !user.churchId) {
      throw new Error("Acesso negado")
    }
    const companyId = user.churchId
    const sql = getSql()
    const personId = await sql.begin(async (tx) => {
      const profiles = await tx<{
        id: string
        name: string
        email: string
        role: string
        person_id: string | null
      }[]>`
        select id, name, email, role, person_id
        from public.profiles
        where id = ${user.id}
          and company_id = ${companyId}
          and active = true
        for update
      `
      const profile = profiles[0]
      if (!profile) throw new Error("Perfil não encontrado")

      const duplicate = await tx<{ id: string }[]>`
        select id
        from public.profiles
        where login_phone = ${phone} and id <> ${profile.id}
        limit 1
      `
      if (duplicate[0]) {
        throw new Error("Este WhatsApp já está vinculado a outra conta")
      }

      const people = await tx<{ id: string }[]>`
        select id
        from public.people
        where company_id = ${companyId}
          and deleted_at is null
          and (id = ${profile.person_id} or profile_id = ${profile.id})
        order by (profile_id = ${profile.id}) desc, created_at
        limit 1
        for update
      `
      let resolvedPersonId = people[0]?.id
      if (!resolvedPersonId) {
        const name = splitName(profile.name)
        const inserted = await tx<{ id: string }[]>`
          insert into public.people (
            company_id, first_name, last_name, full_name, email, phone,
            access_profile, status, person_type, is_active, profile_id,
            created_by, updated_by
          )
          values (
            ${companyId}, ${name.firstName}, ${name.lastName}, ${profile.name},
            ${profile.email}, ${phone}, ${profile.role}, 'active', 'member', true,
            ${profile.id}, ${profile.id}, ${profile.id}
          )
          returning id
        `
        resolvedPersonId = inserted[0]?.id
      } else {
        await tx`
          update public.people
          set phone = ${phone}, profile_id = ${profile.id}, updated_by = ${profile.id}, updated_at = now()
          where id = ${resolvedPersonId}
            and company_id = ${companyId}
            and deleted_at is null
        `
      }
      if (!resolvedPersonId) throw new Error("Não foi possível vincular o cadastro")

      await tx`
        update public.profiles
        set login_phone = ${phone}, person_id = ${resolvedPersonId}, updated_at = now()
        where id = ${profile.id} and company_id = ${companyId}
      `
      return resolvedPersonId
    })

    await writeAuditLog({
      action: "auth.whatsapp.updated",
      entityTable: "profiles",
      entityId: user.id,
      companyId,
      metadata: { personId },
    })
    revalidatePath("/dashboard")
    revalidatePath("/membro")
    return { ok: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "WhatsApp inválido" }
    }
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar" }
  }
}
