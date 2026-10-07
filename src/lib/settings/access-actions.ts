"use server"

import { revalidatePath } from "next/cache"
import { hasAnyRole } from "@/lib/types"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { accessSchema, assertAccessTarget, type SaveAccessInput } from "./access-schema"

type Result = { ok: boolean; error?: string }
type Profile = { id: string; role: string; roles: string[]; auth_user_id: string | null; person_id: string | null; email: string; active: boolean }

async function context() {
  const actor = await getCurrentUser()
  if (!actor?.churchId || !hasAnyRole(actor, ["admin"])) throw new Error("Apenas o administrador da igreja pode gerenciar acessos neste painel")
  await requirePermission("settings.manage_settings", actor.churchId)
  const auth = createSupabaseAdminClient()
  if (!auth) throw new Error("A gestão de acessos precisa ser configurada no servidor")
  return { actor, companyId: actor.churchId, auth }
}

function failure(error: unknown): Result {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message }
  return { ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar o acesso" }
}

export async function saveChurchAccess(input: SaveAccessInput): Promise<Result> {
  let createdAuthId: string | null = null
  let committed = false
  try {
    const { actor, companyId, auth } = await context()
    const parsed = accessSchema.parse(input)
    const roles = [...new Set(parsed.roles ?? [parsed.role])]
    parsed.role = roles[0]
    parsed.roles = roles
    const db = getSql()
    let profileId = parsed.id
    await db.begin(async (tx) => {
      // Serialize church edits, including administrator protection and duplicate checks.
      await tx`select id from public.companies where id = ${companyId} for update`
      const authorized = await tx<{ id: string }[]>`select id from public.profiles
        where id = ${actor.id} and company_id = ${companyId} and 'admin' = any(roles) and active = true and deleted_at is null`
      if (!authorized.length) throw new Error("Seu acesso de administrador não está mais ativo")
      const existing = parsed.id ? (await tx<Profile[]>`
        select id, role, roles, auth_user_id, person_id, email, active from public.profiles
        where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null for update
      `)[0] : null
      if (parsed.id && !existing) throw new Error("Acesso não encontrado nesta igreja")
      if (existing) assertAccessTarget(actor.id, existing, parsed)
      const duplicate = await tx<{ id: string }[]>`
        select id from public.profiles where lower(email) = ${parsed.email}
        and deleted_at is null
        and (${parsed.id ?? null}::uuid is null or id <> ${parsed.id ?? null}) limit 1
      `
      if (duplicate.length) throw new Error("Este e-mail já possui um cadastro. Use outro e-mail")
      const cellIds = roles.includes("cell_leader") ? [...new Set(parsed.cellIds)] : []
      if (cellIds.length) {
        const cells = await tx<{ id: string }[]>`select id from public.groups
          where company_id = ${companyId} and id = any(${cellIds}::uuid[])
          and type = 'cell' and is_active = true and deleted_at is null`
        if (cells.length !== cellIds.length) throw new Error("Selecione somente células ativas desta igreja")
      }
      let authId = existing?.auth_user_id
      if (!authId) {
        if (parsed.password.length < 8) throw new Error("Defina uma senha para criar o login deste acesso")
        // Never adopt or reset an existing Auth account based on its email.
        const result = await auth.auth.admin.createUser({ email: parsed.email, password: parsed.password,
          email_confirm: true, ban_duration: parsed.active ? "none" : "876000h", user_metadata: { name: parsed.name } })
        if (result.error || !result.data.user) throw new Error("Não foi possível criar o login. Confira se o e-mail já está em uso e se a senha atende aos requisitos")
        authId = result.data.user.id
        createdAuthId = authId
      }
      if (existing) {
        await tx`update public.profiles set name = ${parsed.name}, email = ${parsed.email},
          role = ${parsed.role}, roles = ${roles}::text[], active = ${parsed.active}, auth_user_id = ${authId}
          where id = ${existing.id} and company_id = ${companyId}`
      } else {
        const rows = await tx<{ id: string }[]>`insert into public.profiles (company_id, auth_user_id, name, email, role, roles, active)
          values (${companyId}, ${authId}, ${parsed.name}, ${parsed.email}, ${parsed.role}, ${roles}::text[], ${parsed.active}) returning id`
        profileId = rows[0].id
      }
      let personId = existing?.person_id
      if (!personId) {
        const people = await tx<{ id: string }[]>`select id from public.people
          where company_id = ${companyId} and deleted_at is null
          and (profile_id = ${profileId!} or (profile_id is null and lower(email) = ${parsed.email}))
          order by (profile_id = ${profileId!}) desc nulls last, created_at limit 1`
        personId = people[0]?.id
        if (!personId) {
          const rows = await tx<{ id: string }[]>`insert into public.people
            (company_id, first_name, full_name, email, profile_id, access_profile, status, person_type, is_active, created_by, updated_by)
            values (${companyId}, ${parsed.name.split(" ")[0]}, ${parsed.name}, ${parsed.email}, ${profileId!}, ${parsed.role},
              'active', ${["pastor", "ministry_leader", "cell_supervisor", "cell_leader"].includes(parsed.role) ? "leader" : parsed.role === "volunteer" ? "volunteer" : "member"},
              true, ${actor.id}, ${actor.id}) returning id`
          personId = rows[0].id
        }
      }
      await tx`update public.people set profile_id = ${profileId!}, access_profile = ${parsed.role},
        full_name = ${parsed.name}, first_name = ${parsed.name.split(" ")[0]},
        last_name = ${parsed.name.split(" ").slice(1).join(" ")}, email = ${parsed.email}, updated_at = now()
        where id = ${personId} and company_id = ${companyId}`
      await tx`update public.profiles set person_id = ${personId} where id = ${profileId!} and company_id = ${companyId}`
      if (roles.includes("cell_leader") || existing?.roles.includes("cell_leader")) {
        await tx`select public.sync_cell_leader_assignments(${companyId}, ${personId}, ${cellIds}::uuid[])`
      }
      await tx`update public.companies set user_count = (select count(*) from public.profiles
        where company_id = ${companyId} and active = true and deleted_at is null) where id = ${companyId}`
      // Validate and persist all database changes before updating an existing login.
      if (existing?.auth_user_id) {
        const result = await auth.auth.admin.updateUserById(existing.auth_user_id, {
          email: parsed.email, email_confirm: true, ban_duration: parsed.active ? "none" : "876000h",
          user_metadata: { name: parsed.name }, ...(parsed.password ? { password: parsed.password } : {}),
        })
        if (result.error) throw new Error("Não foi possível atualizar o login. Confira o e-mail e os requisitos da senha")
      }
    })
    committed = true
    await writeAuditLog({ action: parsed.id ? "access.update" : "access.create", entityTable: "profiles",
      entityId: profileId, companyId, metadata: { roles, active: parsed.active, passwordChanged: Boolean(parsed.password) } })
    revalidatePath("/configuracoes")
    revalidatePath("/", "layout")
    return { ok: true }
  } catch (error) {
    if (createdAuthId && !committed) {
      await createSupabaseAdminClient()?.auth.admin.deleteUser(createdAuthId).catch(() => undefined)
    }
    return failure(error)
  }
}

export async function deleteChurchAccess(profileId: string): Promise<Result> {
  try {
    const { actor, companyId, auth } = await context()
    const id = z.string().uuid().parse(profileId)
    const db = getSql()
    const deleted = await db.begin(async (tx) => {
      await tx`select id from public.companies where id = ${companyId} for update`
      const authorized = await tx<{ id: string }[]>`select id from public.profiles
        where id = ${actor.id} and company_id = ${companyId} and 'admin' = any(roles) and active = true and deleted_at is null`
      if (!authorized.length) throw new Error("Seu acesso de administrador não está mais ativo")
      const target = (await tx<Profile[]>`select id, role, roles, auth_user_id, person_id, email, active
        from public.profiles where id = ${id} and company_id = ${companyId} and deleted_at is null for update`)[0]
      if (!target) throw new Error("Acesso não encontrado nesta igreja")
      assertAccessTarget(actor.id, target)
      // Block existing application sessions before deleting the Auth identity.
      await tx`update public.profiles set active = false where id = ${id} and company_id = ${companyId}`
      await tx`update public.companies set user_count = (select count(*) from public.profiles
        where company_id = ${companyId} and active = true and deleted_at is null) where id = ${companyId}`
      if (target.auth_user_id) {
        const result = await auth.auth.admin.deleteUser(target.auth_user_id)
        if (result.error && result.error.code !== "user_not_found") return false
      }
      await tx`update public.people set profile_id = null, access_profile = null, updated_at = now()
        where profile_id = ${id} and company_id = ${companyId}`
      await tx`update public.profiles set deleted_at = now(), auth_user_id = null, person_id = null, active = false
        where id = ${id} and company_id = ${companyId}`
      return true
    })
    revalidatePath("/configuracoes")
    if (!deleted) throw new Error("O acesso foi desativado, mas o login não pôde ser excluído. Tente excluir novamente")
    await writeAuditLog({ action: "access.delete", entityTable: "profiles", entityId: id, companyId })
    return { ok: true }
  } catch (error) { return failure(error) }
}
