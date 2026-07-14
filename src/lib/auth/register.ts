"use server"

import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type RegisterResult = {
  ok: boolean
  error?: string
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  companySlug: z
    .string()
    .trim()
    .min(2, "Slug da igreja obrigatório")
    .regex(/^[a-z0-9-]+$/, "Use o slug da igreja (letras minúsculas, números e hífen)"),
})

export async function registerSelfServiceUser(input: z.input<typeof registerSchema>): Promise<RegisterResult> {
  try {
    const parsed = registerSchema.parse(input)
    const email = parsed.email.toLowerCase()
    const sql = getSql()

    const companies = await sql<{ id: string; name: string; active: boolean }[]>`
      select id, name, active
      from public.companies
      where slug = ${parsed.companySlug}
      limit 1
    `
    const company = companies[0]
    if (!company) throw new Error("Igreja não encontrada. Confira o slug informado.")
    if (!company.active) throw new Error("Esta igreja está inativa no momento.")

    const existing = await sql<{ id: string }[]>`
      select id
      from public.profiles
      where lower(email) = ${email}
      limit 1
    `
    if (existing[0]) throw new Error("Já existe um usuário com este e-mail.")

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
        role: "reader",
        company_id: company.id,
      },
    })

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Não foi possível criar o usuário de autenticação")
    }

    const authUserId = created.data.user.id

    try {
      const rows = await sql<{ id: string }[]>`
        insert into public.profiles (company_id, auth_user_id, name, email, role, active)
        values (${company.id}, ${authUserId}, ${parsed.name}, ${email}, 'reader', true)
        returning id
      `

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
        entityId: rows[0]?.id ?? null,
        companyId: company.id,
        metadata: { email, role: "reader", companySlug: parsed.companySlug },
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
