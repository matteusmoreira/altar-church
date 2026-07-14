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

const profileSchema = z
  .object({
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
    password: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    const password = data.password?.trim() ?? ""
    const isCreate = !data.id
    if (isCreate && password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Senha deve ter no mínimo 8 caracteres",
        path: ["password"],
      })
      return
    }
    if (!isCreate && password.length > 0 && password.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Senha deve ter no mínimo 8 caracteres",
        path: ["password"],
      })
    }
  })

const profileIdSchema = z.string().uuid()
const passwordSchema = z.string().min(8, "Senha deve ter no mínimo 8 caracteres")

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

async function findAuthUserIdByEmail(email: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return null

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) {
    throw new Error(`Consulta Auth falhou: ${users.error.message}`)
  }

  return users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null
}

async function ensureAuthUserForProfile(profile: z.infer<typeof profileSchema>) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    return null
  }

  const password = profile.password?.trim() ?? ""
  const userMetadata = {
    name: profile.name,
    role: profile.role,
    company_id: profile.companyId,
  }

  if (password) {
    const created = await supabase.auth.admin.createUser({
      email: profile.email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    })

    if (!created.error && created.data.user?.id) {
      return created.data.user.id
    }

    const message = created.error?.message ?? ""
    if (!/already|registered|exists/i.test(message)) {
      throw new Error(`Auth falhou: ${message || "não foi possível criar o usuário"}`)
    }

    const existingId = await findAuthUserIdByEmail(profile.email)
    if (!existingId) {
      throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
    }

    const update = await supabase.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: userMetadata,
    })
    if (update.error) {
      throw new Error(`Atualização Auth falhou: ${update.error.message}`)
    }

    return existingId
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

  const existingId = await findAuthUserIdByEmail(profile.email)
  if (!existingId) {
    throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
  }

  const update = await supabase.auth.admin.updateUserById(existingId, {
    user_metadata: userMetadata,
  })
  if (update.error) {
    throw new Error(`Atualização Auth falhou: ${update.error.message}`)
  }

  return existingId
}

async function setAuthPasswordForProfile(input: {
  profileId: string
  email: string
  name: string
  role: z.infer<typeof profileSchema>["role"]
  companyId: string | null
  authUserId: string | null
  password: string
}) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY obrigatória para definir senha")
  }

  const userMetadata = {
    name: input.name,
    role: input.role,
    company_id: input.companyId,
  }

  let authUserId = input.authUserId

  if (authUserId) {
    const update = await supabase.auth.admin.updateUserById(authUserId, {
      password: input.password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: userMetadata,
    })
    if (update.error) {
      throw new Error(`Redefinição de senha falhou: ${update.error.message}`)
    }
    return authUserId
  }

  const created = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: userMetadata,
  })

  if (!created.error && created.data.user?.id) {
    authUserId = created.data.user.id
  } else {
    const message = created.error?.message ?? ""
    if (!/already|registered|exists/i.test(message)) {
      throw new Error(`Auth falhou: ${message || "não foi possível criar o usuário"}`)
    }

    authUserId = await findAuthUserIdByEmail(input.email)
    if (!authUserId) {
      throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
    }

    const update = await supabase.auth.admin.updateUserById(authUserId, {
      password: input.password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: userMetadata,
    })
    if (update.error) {
      throw new Error(`Redefinição de senha falhou: ${update.error.message}`)
    }
  }

  await getSql()`
    update public.profiles
    set auth_user_id = coalesce(${authUserId}, auth_user_id)
    where id = ${input.profileId}
  `

  return authUserId
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
    const password = parsed.password?.trim() ?? ""
    const existingAuthUserId = await getExistingProfileAuthUserId(parsed.id)

    let authUserId = existingAuthUserId
    if (parsed.active) {
      authUserId = await ensureAuthUserForProfile(parsed)
    } else if (password && existingAuthUserId) {
      const supabase = createSupabaseAdminClient()
      if (supabase) {
        const update = await supabase.auth.admin.updateUserById(existingAuthUserId, { password })
        if (update.error) {
          throw new Error(`Atualização de senha falhou: ${update.error.message}`)
        }
      }
    }

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
      metadata: {
        email: parsed.email,
        role: parsed.role,
        active: parsed.active,
        authUserLinked: Boolean(authUserId),
        authAccessBlocked,
        passwordSet: Boolean(password),
      },
    })
    await refreshAdminPaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function setProfilePassword(profileId: string, password: string): Promise<ActionResult> {
  try {
    await assertSuperadmin()
    const id = profileIdSchema.parse(profileId)
    const parsedPassword = passwordSchema.parse(password.trim())

    const rows = await getSql()<{
      id: string
      company_id: string | null
      email: string
      name: string
      role: z.infer<typeof profileSchema>["role"]
      auth_user_id: string | null
    }[]>`
      select id, company_id, email, name, role, auth_user_id
      from public.profiles
      where id = ${id}
      limit 1
    `

    const profile = rows[0]
    if (!profile) {
      throw new Error("Usuário não encontrado")
    }

    const authUserId = await setAuthPasswordForProfile({
      profileId: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      companyId: profile.company_id,
      authUserId: profile.auth_user_id,
      password: parsedPassword,
    })

    await writeAuditLog({
      action: "profile.password_reset",
      entityTable: "profiles",
      entityId: profile.id,
      companyId: profile.company_id,
      metadata: {
        email: profile.email,
        authUserLinked: Boolean(authUserId),
        method: "set_password",
      },
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
      name: string
      role: z.infer<typeof profileSchema>["role"]
      auth_user_id: string | null
    }[]>`
      select id, company_id, email, name, role, auth_user_id
      from public.profiles
      where id = ${id}
      limit 1
    `

    const profile = rows[0]
    if (!profile) {
      throw new Error("Usuário não encontrado")
    }

    let authUserId = profile.auth_user_id
    if (!authUserId) {
      authUserId = await findAuthUserIdByEmail(profile.email)
      if (authUserId) {
        await getSql()`
          update public.profiles
          set auth_user_id = ${authUserId}
          where id = ${profile.id}
        `
      }
    }

    if (!authUserId) {
      throw new Error("Usuário sem conta Auth. Defina uma senha pelo ícone de redefinição.")
    }

    const link = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
    })

    if (link.error) {
      throw new Error(`Reset Auth falhou: ${link.error.message}`)
    }

    const resetLink =
      link.data.properties?.action_link ??
      (link.data as { action_link?: string }).action_link ??
      undefined

    await writeAuditLog({
      action: "profile.password_reset",
      entityTable: "profiles",
      entityId: profile.id,
      companyId: profile.company_id,
      metadata: {
        email: profile.email,
        authUserLinked: Boolean(authUserId),
        method: "recovery_link",
        hasResetLink: Boolean(resetLink),
      },
    })
    await refreshAdminPaths()

    return { ok: true, resetLink }
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
