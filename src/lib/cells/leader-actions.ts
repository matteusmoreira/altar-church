"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { requireCellLeaderContext, requireOwnedLeaderCell } from "./access"
import type {
  CellActionResult,
  CreateCellLeaderPersonInput,
  LinkCellLeaderPersonInput,
  SaveLeaderCellInput,
  SearchCellLeaderPeopleInput,
} from "./types"

const uuid = z.string().uuid()
const nullableUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((value) => value || null)
const nullableTime = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal(""), z.null()]).optional().transform((value) => value || null)
const nullableInt = z.union([z.number().int().min(0), z.null()]).optional().transform((value) => value ?? null)

const cellSchema = z.object({
  id: nullableUuid,
  categoryId: nullableUuid,
  congregationId: nullableUuid,
  name: z.string().trim().min(3, "Nome da célula obrigatório").max(160),
  description: z.string().trim().max(3000).optional().default(""),
  meetingDay: z.string().trim().max(40).optional().default(""),
  meetingTime: nullableTime,
  meetingLocation: z.string().trim().max(300).optional().default(""),
  postalCode: z.string().trim().transform((value) => value.replace(/\D/g, "")).refine((value) => value === "" || /^\d{8}$/.test(value), "CEP inválido").optional().default(""),
  addressNumber: z.string().trim().max(40).optional().default(""),
  addressComplement: z.string().trim().max(120).optional().default(""),
  neighborhood: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().max(160).optional().default(""),
  state: z.string().trim().max(2).transform((value) => value.toUpperCase()).optional().default(""),
  maxCapacity: z.number().int().min(0).max(100000).optional().default(0),
  minAge: nullableInt,
  maxAge: nullableInt,
  acceptsRequests: z.boolean().optional().default(true),
  coordinatorPersonId: nullableUuid,
}).refine((value) => value.minAge === null || value.maxAge === null || value.minAge <= value.maxAge, {
  message: "Idade mínima não pode ser maior que a máxima",
  path: ["minAge"],
})

const personSchema = z.object({
  cellId: uuid,
  fullName: z.string().trim().min(2, "Nome obrigatório").max(200),
  phone: z.string().trim().max(30).optional().default(""),
  email: z.union([z.string().trim().email("E-mail inválido"), z.literal(""), z.null()]).optional().transform((value) => value || null),
})

const linkSchema = z.object({ cellId: uuid, personId: uuid })
const searchSchema = z.object({ query: z.string().trim().min(2, "Digite pelo menos 2 caracteres"), cellId: nullableUuid })

function result(error: unknown): CellActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

function refresh() {
  revalidatePath("/membro")
  revalidatePath("/membro/celulas")
  revalidatePath("/celulas")
  revalidatePath("/pessoas")
}

export async function saveLeaderCell(input: SaveLeaderCellInput): Promise<CellActionResult> {
  try {
    const parsed = cellSchema.parse(input)
    const context = await requireCellLeaderContext()
    const sql = getSql()
    let cellId: string | null = parsed.id

    if (parsed.coordinatorPersonId) {
      const supervisors = await sql<{ id: string }[]>`
        select id
        from public.people
        where id = ${parsed.coordinatorPersonId}
          and company_id = ${context.companyId}
          and deleted_at is null
          and is_active = true
        limit 1
      `
      if (!supervisors[0]) throw new Error("Supervisor inválido para esta igreja")
    }
    if (parsed.categoryId) {
      const categories = await sql<{ id: string }[]>`
        select id from public.group_categories
        where id = ${parsed.categoryId} and company_id = ${context.companyId} and deleted_at is null and is_active = true
        limit 1
      `
      if (!categories[0]) throw new Error("Categoria inválida para esta igreja")
    }
    if (parsed.congregationId) {
      const congregations = await sql<{ id: string }[]>`
        select id from public.congregations
        where id = ${parsed.congregationId} and company_id = ${context.companyId} and deleted_at is null and is_active = true
        limit 1
      `
      if (!congregations[0]) throw new Error("Congregação inválida para esta igreja")
    }

    if (parsed.id) {
      await requireOwnedLeaderCell(context, parsed.id)
      const rows = await sql<{ id: string }[]>`
        update public.groups
        set category_id = ${parsed.categoryId},
            congregation_id = ${parsed.congregationId},
            name = ${parsed.name},
            description = ${parsed.description},
            meeting_day = ${parsed.meetingDay},
            meeting_time = ${parsed.meetingTime},
            meeting_location = ${parsed.meetingLocation},
            coordinator_person_id = ${parsed.coordinatorPersonId},
            postal_code = ${parsed.postalCode},
            address_number = ${parsed.addressNumber},
            address_complement = ${parsed.addressComplement},
            neighborhood = ${parsed.neighborhood},
            city = ${parsed.city},
            state = ${parsed.state},
            max_capacity = ${parsed.maxCapacity},
            min_age = ${parsed.minAge},
            max_age = ${parsed.maxAge},
            accepts_requests = ${parsed.acceptsRequests},
            updated_by = ${context.user.id}
        where id = ${parsed.id}
          and company_id = ${context.companyId}
          and type = 'cell'
          and leader_person_id = ${context.personId}
          and deleted_at is null
        returning id
      `
      cellId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.groups (
          company_id, category_id, congregation_id, name, description, type, leader_person_id, coordinator_person_id,
          meeting_day, meeting_time, meeting_location, postal_code,
          address_number, address_complement, neighborhood, city, state,
          max_capacity, min_age, max_age, accepts_requests, is_active,
          created_by, updated_by
        ) values (
          ${context.companyId}, ${parsed.categoryId}, ${parsed.congregationId}, ${parsed.name}, ${parsed.description}, 'cell', ${context.personId}, ${parsed.coordinatorPersonId},
          ${parsed.meetingDay}, ${parsed.meetingTime}, ${parsed.meetingLocation}, ${parsed.postalCode},
          ${parsed.addressNumber}, ${parsed.addressComplement}, ${parsed.neighborhood}, ${parsed.city}, ${parsed.state},
          ${parsed.maxCapacity}, ${parsed.minAge}, ${parsed.maxAge}, ${parsed.acceptsRequests}, true,
          ${context.user.id}, ${context.user.id}
        ) returning id
      `
      cellId = rows[0]?.id ?? null
    }

    if (!cellId) throw new Error("Célula não foi salva")
    await writeAuditLog({
      action: parsed.id ? "cell.leader.update" : "cell.leader.create",
      entityTable: "groups",
      entityId: cellId,
      companyId: context.companyId,
      metadata: { leaderPersonId: context.personId, coordinatorPersonId: parsed.coordinatorPersonId },
    })
    refresh()
    return { ok: true, id: cellId }
  } catch (error) {
    return result(error)
  }
}

export async function createCellLeaderPerson(input: CreateCellLeaderPersonInput): Promise<CellActionResult> {
  try {
    const parsed = personSchema.parse(input)
    const context = await requireCellLeaderContext()
    await requireOwnedLeaderCell(context, parsed.cellId)
    const names = parsed.fullName.split(/\s+/)
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.people (
        company_id, first_name, last_name, full_name, email, phone,
        status, person_type, is_active, created_by, updated_by
      ) values (
        ${context.companyId}, ${names[0]}, ${names.slice(1).join(" ")}, ${parsed.fullName}, ${parsed.email}, ${parsed.phone},
        'active', 'member', true, ${context.user.id}, ${context.user.id}
      ) returning id
    `
    const personId = rows[0]?.id
    if (!personId) throw new Error("Pessoa não foi criada")
    await sql`
      insert into public.group_members (company_id, group_id, person_id, role, status, created_by, updated_by)
      values (${context.companyId}, ${parsed.cellId}, ${personId}, 'member', 'active', ${context.user.id}, ${context.user.id})
      on conflict (group_id, person_id) do update
      set status = 'active', left_at = null, updated_by = ${context.user.id}
    `
    await writeAuditLog({
      action: "cell.leader.person.create",
      entityTable: "people",
      entityId: personId,
      companyId: context.companyId,
      metadata: { cellId: parsed.cellId },
    })
    refresh()
    return { ok: true, id: personId }
  } catch (error) {
    return result(error)
  }
}

export async function linkCellLeaderPerson(input: LinkCellLeaderPersonInput): Promise<CellActionResult> {
  try {
    const parsed = linkSchema.parse(input)
    const context = await requireCellLeaderContext()
    await requireOwnedLeaderCell(context, parsed.cellId)
    const sql = getSql()
    const people = await sql<{ id: string }[]>`
      select id from public.people
      where id = ${parsed.personId}
        and company_id = ${context.companyId}
        and deleted_at is null
        and is_active = true
      limit 1
    `
    if (!people[0]) throw new Error("Pessoa inválida para esta igreja")
    await sql`
      insert into public.group_members (company_id, group_id, person_id, role, status, created_by, updated_by)
      values (
        ${context.companyId}, ${parsed.cellId}, ${parsed.personId},
        case when exists (
          select 1 from public.groups where id = ${parsed.cellId} and leader_person_id = ${parsed.personId}
        ) then 'leader' else 'member' end,
        'active', ${context.user.id}, ${context.user.id}
      )
      on conflict (group_id, person_id) do update
      set status = 'active', left_at = null, updated_by = ${context.user.id}
    `
    await writeAuditLog({
      action: "cell.leader.person.link",
      entityTable: "group_members",
      companyId: context.companyId,
      metadata: { cellId: parsed.cellId, personId: parsed.personId },
    })
    refresh()
    return { ok: true, id: parsed.personId }
  } catch (error) {
    return result(error)
  }
}

export async function searchCellLeaderPeople(input: SearchCellLeaderPeopleInput) {
  const parsed = searchSchema.parse(input)
  const context = await requireCellLeaderContext()
  if (parsed.cellId) await requireOwnedLeaderCell(context, parsed.cellId)
  const pattern = `%${parsed.query}%`
  return await getSql()<{ id: string; name: string; phone: string }[]>`
    select id, full_name as name, coalesce(phone, '') as phone
    from public.people
    where company_id = ${context.companyId}
      and deleted_at is null
      and is_active = true
      and (full_name ilike ${pattern} or coalesce(phone, '') ilike ${pattern})
    order by full_name
    limit 20
  `
}
