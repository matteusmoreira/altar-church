"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { processFollowUpTriggers } from "./follow-up"

const uuid = z.string().uuid()
const priority = z.enum(["low", "normal", "high", "urgent"])
const status = z.enum(["open", "in_progress", "completed", "canceled"])
const triggerKind = z.enum([
  "new_visitor", "visitor_without_contact", "recurring_absence",
  "new_prayer_request", "without_cell", "without_portal_access",
])

function formText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function formOptionalUuid(formData: FormData, key: string) {
  const value = formText(formData, key)
  return value || null
}

function parseDueAt(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error("Prazo inválido")
  return parsed.toISOString()
}

async function context(formData: FormData, permission: "members.edit" | "crm.edit") {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, formOptionalUuid(formData, "companyId"))
  await requirePermission(permission, companyId)
  return { user, companyId }
}

export async function savePersonFollowUpTask(formData: FormData) {
  try {
    const personId = uuid.parse(formText(formData, "personId"))
    const title = formText(formData, "title")
    if (title.length < 3 || title.length > 180) throw new Error("Título deve ter entre 3 e 180 caracteres")
    const selectedPriority = priority.parse(formText(formData, "priority") || "normal")
    const selectedStatus = status.parse(formText(formData, "status") || "open")
    const dueAt = parseDueAt(formText(formData, "dueAt"))
    const responsibleProfileId = formOptionalUuid(formData, "responsibleProfileId")
    const { user, companyId } = await context(formData, "members.edit")
    const sql = getSql()

    const people = await sql<{ id: string }[]>`
      select id from public.people
      where id = ${personId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    if (!people[0]) throw new Error("Pessoa não encontrada")
    if (responsibleProfileId) {
      const responsible = await sql<{ id: string }[]>`
        select id from public.profiles
        where id = ${responsibleProfileId} and company_id = ${companyId} and active = true
        limit 1
      `
      if (!responsible[0]) throw new Error("Responsável inválido")
    }
    const cards = await sql<{ id: string }[]>`
      select id from public.crm_cards
      where company_id = ${companyId} and person_id = ${personId} and deleted_at is null
      order by updated_at desc, created_at desc
      limit 1
    `
    const rows = await sql<{ id: string }[]>`
      insert into public.person_follow_up_tasks (
        company_id, person_id, responsible_profile_id, crm_card_id,
        title, notes, due_at, priority, status, origin, created_by, updated_by, completed_at
      ) values (
        ${companyId}, ${personId}, ${responsibleProfileId}, ${cards[0]?.id ?? null},
        ${title}, ${formText(formData, "notes")}, ${dueAt}, ${selectedPriority}, ${selectedStatus}, 'manual',
        ${user.id}, ${user.id}, ${selectedStatus === "completed" ? new Date().toISOString() : null}
      )
      returning id
    `
    if (!rows[0]) throw new Error("Tarefa não foi criada")
    await writeAuditLog({
      action: "person_follow_up_task.create",
      entityTable: "person_follow_up_tasks",
      entityId: rows[0].id,
      companyId,
      metadata: { personId, crmCardId: cards[0]?.id ?? null, profileId: user.id },
    })
    revalidatePath(`/pessoas/${personId}`)
    revalidatePath("/pessoas/follow-up")
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível criar a tarefa" }
  }
}

export async function updatePersonFollowUpTask(formData: FormData) {
  try {
    const taskId = uuid.parse(formText(formData, "taskId"))
    const selectedStatus = status.parse(formText(formData, "status"))
    const responsibleProfileId = formOptionalUuid(formData, "responsibleProfileId")
    const dueAt = parseDueAt(formText(formData, "dueAt"))
    const { user, companyId } = await context(formData, "members.edit")
    const rows = await getSql()<{ id: string; person_id: string }[]>`
      update public.person_follow_up_tasks
      set status = ${selectedStatus}, responsible_profile_id = ${responsibleProfileId},
          due_at = ${dueAt}, notes = ${formText(formData, "notes")},
          completed_at = case when ${selectedStatus} = 'completed' then coalesce(completed_at, now()) else null end,
          updated_by = ${user.id}, updated_at = now()
      where id = ${taskId} and company_id = ${companyId} and deleted_at is null
      returning id, person_id
    `
    if (!rows[0]) throw new Error("Tarefa não encontrada")
    await writeAuditLog({
      action: "person_follow_up_task.update",
      entityTable: "person_follow_up_tasks",
      entityId: rows[0].id,
      companyId,
      metadata: { status: selectedStatus, profileId: user.id },
    })
    revalidatePath(`/pessoas/${rows[0].person_id}`)
    revalidatePath("/pessoas/follow-up")
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível atualizar a tarefa" }
  }
}

export async function savePersonFollowUpTrigger(formData: FormData) {
  try {
    const triggerId = formOptionalUuid(formData, "id")
    const selectedKind = triggerKind.parse(formText(formData, "triggerKind"))
    const name = formText(formData, "name")
    if (name.length < 3 || name.length > 180) throw new Error("Nome do gatilho inválido")
    const { user, companyId } = await context(formData, "crm.edit")
    const isActive = formText(formData, "isActive") === "true"
    const configText = formText(formData, "config") || "{}"
    let config: Record<string, unknown>
    try {
      const parsed = JSON.parse(configText)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error()
      config = parsed as Record<string, unknown>
    } catch {
      throw new Error("Configuração do gatilho deve ser um objeto JSON")
    }
    const sql = getSql()
    const existing = triggerId
      ? await sql<{ id: string }[]>`
          select id from public.person_follow_up_triggers
          where id = ${triggerId} and company_id = ${companyId} and deleted_at is null limit 1
        `
      : await sql<{ id: string }[]>`
          select id from public.person_follow_up_triggers
          where company_id = ${companyId} and trigger_kind = ${selectedKind} and deleted_at is null limit 1
        `
    const rows = existing[0]
      ? await sql<{ id: string }[]>`
          update public.person_follow_up_triggers
          set trigger_kind = ${selectedKind}, name = ${name}, is_active = ${isActive}, config = ${JSON.stringify(config)}::jsonb,
              updated_by = ${user.id}, updated_at = now()
          where id = ${existing[0].id} and company_id = ${companyId}
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.person_follow_up_triggers (company_id, trigger_kind, name, is_active, config, created_by, updated_by)
          values (${companyId}, ${selectedKind}, ${name}, ${isActive}, ${JSON.stringify(config)}::jsonb, ${user.id}, ${user.id})
          returning id
        `
    if (!rows[0]) throw new Error("Gatilho não foi salvo")
    await writeAuditLog({
      action: "person_follow_up_trigger.save",
      entityTable: "person_follow_up_triggers",
      entityId: rows[0].id,
      companyId,
      metadata: { triggerKind: selectedKind, isActive, profileId: user.id },
    })
    revalidatePath("/pessoas/follow-up")
    revalidatePath("/configuracoes/follow-up")
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível salvar o gatilho" }
  }
}

export async function runPersonFollowUpTriggers(formData: FormData) {
  try {
    const { companyId } = await context(formData, "crm.edit")
    const result = await processFollowUpTriggers(companyId, 100)
    revalidatePath("/pessoas/follow-up")
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível executar os gatilhos" }
  }
}
