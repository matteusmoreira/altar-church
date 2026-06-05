"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assertSuperadmin } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ActionResult } from "./types"

const moduleIdsSchema = z.array(z.string().regex(/^[a-z0-9_-]+$/))

const companySchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2, "Nome da empresa obrigatorio"),
  responsibleName: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().max(2).optional().default(""),
  phone: z.string().trim().optional().default(""),
  email: z.string().trim().email("E-mail invalido").optional().or(z.literal("")).default(""),
  planId: z.string().uuid("Plano obrigatorio"),
  status: z.enum(["active", "blocked", "test"]),
  active: z.boolean(),
  moduleIds: moduleIdsSchema,
})

const planSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  code: z.string().trim().regex(/^[a-z0-9_]+$/, "Codigo deve usar letras minusculas, numeros ou _"),
  name: z.string().trim().min(2, "Nome do plano obrigatorio"),
  description: z.string().trim().optional().default(""),
  price: z.coerce.number().min(0),
  billingCycle: z.enum(["free", "monthly", "yearly", "custom"]),
  active: z.boolean(),
  moduleIds: moduleIdsSchema,
})

const profileSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  companyId: z.string().uuid().nullable(),
  name: z.string().trim().min(2, "Nome obrigatorio"),
  email: z.string().trim().email("E-mail invalido"),
  role: z.enum([
    "superadmin",
    "admin",
    "pastor",
    "ministry_leader",
    "cell_leader",
    "communication",
    "finance",
    "volunteer",
    "reader",
  ]),
  active: z.boolean(),
})

const profileIdSchema = z.string().uuid()

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados invalidos" }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

async function refreshAdminPaths() {
  revalidatePath("/admin")
  revalidatePath("/admin/churches")
  revalidatePath("/admin/users")
}

async function ensureAuthUserForProfile(profile: z.infer<typeof profileSchema>) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    return null
  }

  const userMetadata = {
    name: profile.name,
    role: profile.role,
    company_id: profile.companyId,
  }

  const invite = await supabase.auth.admin.inviteUserByEmail(profile.email, {
    data: userMetadata,
  })

  if (!invite.error && invite.data.user?.id) {
    return invite.data.user.id
  }

  const message = invite.error?.message ?? ""
  if (!/already|registered|exists/i.test(message)) {
    throw new Error(`Convite Auth falhou: ${message}`)
  }

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) {
    throw new Error(`Consulta Auth falhou: ${users.error.message}`)
  }

  const existing = users.data.users.find((user) => user.email?.toLowerCase() === profile.email.toLowerCase())
  if (!existing) {
    throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
  }

  const update = await supabase.auth.admin.updateUserById(existing.id, {
    user_metadata: userMetadata,
  })
  if (update.error) {
    throw new Error(`Atualização Auth falhou: ${update.error.message}`)
  }

  return existing.id
}

async function getExistingProfileAuthUserId(profileId?: string | null) {
  if (!profileId) return null

  const rows = await getSql()<{
    auth_user_id: string | null
  }[]>`
    select auth_user_id
    from public.profiles
    where id = ${profileId}
    limit 1
  `

  return rows[0]?.auth_user_id ?? null
}

async function syncAuthAccessForProfile(authUserId: string | null, parsed: z.infer<typeof profileSchema>) {
  if (!authUserId) return false

  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    return false
  }

  const update = await supabase.auth.admin.updateUserById(authUserId, {
    ban_duration: parsed.active ? "none" : "876000h",
    user_metadata: {
      name: parsed.name,
      role: parsed.role,
      company_id: parsed.companyId,
    },
  })

  if (update.error) {
    throw new Error(`Atualização Auth falhou: ${update.error.message}`)
  }

  return !parsed.active
}

export async function saveCompany(input: z.input<typeof companySchema>): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const parsed = companySchema.parse(input)
    const slug = slugify(parsed.name)
    const db = getSql()
    let auditCompanyId: string | null = parsed.id ?? null

    await db.begin(async (tx) => {
      let companyId = parsed.id ?? null

      if (companyId) {
        await tx`
          update public.companies
          set name = ${parsed.name},
              slug = ${slug},
              responsible_name = ${parsed.responsibleName},
              address = ${parsed.address},
              city = ${parsed.city},
              state = ${parsed.state.toUpperCase()},
              phone = ${parsed.phone},
              email = ${parsed.email},
              plan_id = ${parsed.planId},
              status = ${parsed.status},
              active = ${parsed.active}
          where id = ${companyId}
        `
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.companies (
            name,
            slug,
            responsible_name,
            address,
            city,
            state,
            phone,
            email,
            plan_id,
            status,
            active
          )
          values (
            ${parsed.name},
            ${slug},
            ${parsed.responsibleName},
            ${parsed.address},
            ${parsed.city},
            ${parsed.state.toUpperCase()},
            ${parsed.phone},
            ${parsed.email},
            ${parsed.planId},
            ${parsed.status},
            ${parsed.active}
          )
          returning id
        `
        companyId = rows[0]?.id ?? null
      }

      if (!companyId) {
        throw new Error("Empresa nao foi salva")
      }
      auditCompanyId = companyId

      await tx`delete from public.company_modules where company_id = ${companyId}`
      const modules = await tx<{ id: string }[]>`select id from public.system_modules`
      const enabledModuleIds = new Set(parsed.moduleIds)

      for (const systemModule of modules) {
        await tx`
          insert into public.company_modules (company_id, module_id, enabled)
          values (${companyId}, ${systemModule.id}, ${enabledModuleIds.has(systemModule.id)})
        `
      }
    })

    await writeAuditLog({
      action: "company.save",
      entityTable: "companies",
      entityId: auditCompanyId,
      companyId: auditCompanyId,
      metadata: { name: parsed.name, status: parsed.status, active: parsed.active },
    })
    await refreshAdminPaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function savePlan(input: z.input<typeof planSchema>): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const parsed = planSchema.parse(input)
    const db = getSql()
    let auditPlanId: string | null = parsed.id ?? null

    await db.begin(async (tx) => {
      let planId = parsed.id ?? null

      if (planId) {
        await tx`
          update public.system_plans
          set code = ${parsed.code},
              name = ${parsed.name},
              description = ${parsed.description},
              price = ${parsed.price},
              billing_cycle = ${parsed.billingCycle},
              active = ${parsed.active}
          where id = ${planId}
        `
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.system_plans (code, name, description, price, billing_cycle, active)
          values (${parsed.code}, ${parsed.name}, ${parsed.description}, ${parsed.price}, ${parsed.billingCycle}, ${parsed.active})
          returning id
        `
        planId = rows[0]?.id ?? null
      }

      if (!planId) {
        throw new Error("Plano nao foi salvo")
      }
      auditPlanId = planId

      await tx`delete from public.plan_modules where plan_id = ${planId}`
      for (const moduleId of parsed.moduleIds) {
        await tx`
          insert into public.plan_modules (plan_id, module_id, included)
          values (${planId}, ${moduleId}, true)
        `
      }
    })

    await writeAuditLog({
      action: "plan.save",
      entityTable: "system_plans",
      entityId: auditPlanId,
      metadata: { code: parsed.code, active: parsed.active, moduleCount: parsed.moduleIds.length },
    })
    await refreshAdminPaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const parsed = profileSchema.parse(input)
    const existingAuthUserId = await getExistingProfileAuthUserId(parsed.id)
    const authUserId = parsed.active ? await ensureAuthUserForProfile(parsed) : existingAuthUserId
    const authAccessBlocked = await syncAuthAccessForProfile(authUserId, parsed)
    const db = getSql()
    let auditProfileId: string | null = parsed.id ?? null

    await db.begin(async (tx) => {
      if (parsed.id) {
        await tx`
          update public.profiles
          set company_id = ${parsed.companyId},
              auth_user_id = coalesce(${authUserId}, auth_user_id),
              name = ${parsed.name},
              email = ${parsed.email},
              role = ${parsed.role},
              active = ${parsed.active}
          where id = ${parsed.id}
        `
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.profiles (company_id, auth_user_id, name, email, role, active)
          values (${parsed.companyId}, ${authUserId}, ${parsed.name}, ${parsed.email}, ${parsed.role}, ${parsed.active})
          returning id
        `
        auditProfileId = rows[0]?.id ?? null
      }

      await tx`
        update public.companies c
        set user_count = counts.total
        from (
          select company_id, count(*)::integer as total
          from public.profiles
          where company_id is not null and active = true
          group by company_id
        ) counts
        where c.id = counts.company_id
      `
    })

    await writeAuditLog({
      action: "profile.save",
      entityTable: "profiles",
      entityId: auditProfileId,
      companyId: parsed.companyId,
      metadata: { email: parsed.email, role: parsed.role, active: parsed.active, authUserLinked: Boolean(authUserId), authAccessBlocked },
    })
    await refreshAdminPaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function sendProfilePasswordReset(profileId: string): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const id = profileIdSchema.parse(profileId)
    const supabase = createSupabaseAdminClient()
    if (!supabase) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY obrigatória para reset de senha")
    }

    const rows = await getSql()<{
      id: string
      company_id: string | null
      email: string
      auth_user_id: string | null
    }[]>`
      select id, company_id, email, auth_user_id
      from public.profiles
      where id = ${id}
      limit 1
    `

    const profile = rows[0]
    if (!profile) {
      throw new Error("Usuário não encontrado")
    }

    const link = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
    })

    if (link.error) {
      throw new Error(`Reset Auth falhou: ${link.error.message}`)
    }

    await writeAuditLog({
      action: "profile.password_reset",
      entityTable: "profiles",
      entityId: profile.id,
      companyId: profile.company_id,
      metadata: {
        email: profile.email,
        authUserLinked: Boolean(profile.auth_user_id),
      },
    })
    await refreshAdminPaths()

    return { ok: true, resetLink: link.data.properties?.action_link }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function setModuleActive(moduleId: string, active: boolean): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const parsedModuleId = z.string().regex(/^[a-z0-9_-]+$/).parse(moduleId)
    const sql = getSql()
    await sql`
      update public.system_modules
      set active = ${active}
      where id = ${parsedModuleId}
    `
    await writeAuditLog({
      action: "module.set_active",
      entityTable: "system_modules",
      entityId: parsedModuleId,
      metadata: { active },
    })
    await refreshAdminPaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}
