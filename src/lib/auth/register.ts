"use server"

import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { normalizeBrazilianWhatsapp } from "./phone"

export type RegisterResult = {
  ok: boolean
  error?: string
}

export type PublicChurch = {
  id: string
  name: string
}

export async function getPublicChurches(): Promise<PublicChurch[]> {
  const sql = getSql()

  return sql<PublicChurch[]>`
    select id, name
    from public.companies
    where active = true and status = 'active'
    order by lower(name), name
  `
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  whatsapp: z.string().trim().transform((value, context) => {
    const phone = normalizeBrazilianWhatsapp(value)
    if (!phone) {
      context.addIssue({ code: "custom", message: "Informe um WhatsApp móvel válido com DDD" })
      return z.NEVER
    }
    return phone
  }),
  companyId: z.string().uuid("Selecione uma igreja"),
})

export async function registerSelfServiceUser(input: z.input<typeof registerSchema>): Promise<RegisterResult> {
  try {
    const parsed = registerSchema.parse(input)
    const email = parsed.email.toLowerCase()
    const sql = getSql()

    const companies = await sql<{ id: string; name: string; active: boolean }[]>`
      select id, name, active
      from public.companies
      where id = ${parsed.companyId}
        and active = true
        and status = 'active'
      limit 1
    `
    const company = companies[0]
    if (!company) throw new Error("Igreja não encontrada ou indisponível.")

    const existing = await sql<{ id: string }[]>`
      select id
      from public.profiles
      where lower(email) = ${email}
      limit 1
    `
    if (existing[0]) throw new Error("Já existe um usuário com este e-mail.")

    const existingPhone = await sql<{ id: string }[]>`
      select id
      from public.profiles
      where login_phone = ${parsed.whatsapp}
      limit 1
    `
    if (existingPhone[0]) throw new Error("Este WhatsApp já está vinculado a outra conta.")

    const supabase = createSupabaseAdminClient()
    if (!supabase) {
      throw new Error("Cadastro indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.")
    }

    const created = await supabase.auth.admin.createUser({
      email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        name: parsed.name,
        role: "member",
        company_id: company.id,
      },
    })

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Não foi possível criar o usuário de autenticação")
    }

    const authUserId = created.data.user.id

    try {
      const profileId = await sql.begin(async (tx) => {
        const rows = await tx<{ id: string }[]>`
          insert into public.profiles (
            company_id, auth_user_id, name, email, login_phone, role, active
          )
          values (
            ${company.id}, ${authUserId}, ${parsed.name}, ${email}, ${parsed.whatsapp}, 'member', true
          )
          returning id
        `
        const id = rows[0]?.id
        if (!id) throw new Error("Perfil não foi criado")

        const nameParts = parsed.name.trim().split(/\s+/)
        const firstName = nameParts[0] ?? parsed.name
        const lastName = nameParts.slice(1).join(" ")
        const people = await tx<{ id: string; phone: string }[]>`
          select id, phone
          from public.people
          where company_id = ${company.id}
            and lower(coalesce(email, '')) = ${email}
            and deleted_at is null
            and profile_id is null
          order by created_at
          limit 1
        `
        const existingPersonPhone = people[0]?.phone
          ? normalizeBrazilianWhatsapp(people[0].phone)
          : null
        if (people[0]?.phone && existingPersonPhone !== parsed.whatsapp) {
          throw new Error("O WhatsApp não confere com o cadastro existente. Procure a administração da igreja.")
        }
        const personId = people[0]?.id ?? (
          await tx<{ id: string }[]>`
            insert into public.people (
              company_id, first_name, last_name, full_name, email, phone, access_profile,
              status, person_type, is_active, profile_id, created_by, updated_by
            )
            values (
              ${company.id}, ${firstName}, ${lastName}, ${parsed.name}, ${email}, ${parsed.whatsapp}, 'member',
              'active', 'member', true, ${id}, ${id}, ${id}
            )
            returning id
          `
        )[0]?.id
        if (!personId) throw new Error("Identidade do membro não foi criada")

        await tx`
          update public.people
          set profile_id = ${id}, phone = ${parsed.whatsapp}, access_profile = 'member', updated_at = now()
          where id = ${personId} and (profile_id is null or profile_id = ${id})
        `
        await tx`
          update public.profiles set person_id = ${personId}, updated_at = now() where id = ${id}
        `
        return id
      })

      await sql`
        update public.companies c
        set user_count = counts.total
        from (
          select company_id, count(*)::integer as total
          from public.profiles
          where company_id is not null and active = true
          group by company_id
        ) counts
        where c.id = counts.company_id
          and c.id = ${company.id}
      `

      await writeAuditLog({
        action: "auth.self_register",
        entityTable: "profiles",
        entityId: profileId,
        companyId: company.id,
        metadata: { email, role: "member", companyId: company.id, whatsappRegistered: true },
      }).catch(() => {
        // Audit may fail without session; registration should still succeed.
      })
    } catch (error) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined)
      throw error
    }

    return { ok: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
    }
    if (error instanceof Error) {
      return { ok: false, error: error.message }
    }
    return { ok: false, error: "Erro inesperado no cadastro" }
  }
}
