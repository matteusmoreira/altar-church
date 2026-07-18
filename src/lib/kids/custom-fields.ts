import "server-only"

import type postgres from "postgres"
import { getSql } from "@/lib/db/client"
import type {
  KidCustomFieldDefinition,
  KidCustomFieldSurface,
  KidCustomFieldTarget,
  KidCustomFieldType,
  KidCustomFieldValue,
} from "./types"

type Tx = postgres.TransactionSql

interface FieldRow {
  id: string
  name: string
  field_type: KidCustomFieldType
  options: unknown
  kids_targets: string[] | null
  show_in_kids_internal: boolean
  show_in_kids_public: boolean
  show_in_kids_portal: boolean
  is_required: boolean
  sort_order: number
  is_active: boolean
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function toDefinition(row: FieldRow): KidCustomFieldDefinition {
  const surfaces: KidCustomFieldSurface[] = []
  if (row.show_in_kids_internal) surfaces.push("internal")
  if (row.show_in_kids_public) surfaces.push("public")
  if (row.show_in_kids_portal) surfaces.push("portal")
  return {
    id: row.id,
    name: row.name,
    fieldType: row.field_type,
    options: stringArray(row.options),
    targets: stringArray(row.kids_targets).filter((item): item is KidCustomFieldTarget => item === "child" || item === "guardian"),
    surfaces,
    required: row.is_required,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

export async function listKidCustomFields(companyId: string, options: { surface?: KidCustomFieldSurface; includeInactive?: boolean } = {}) {
  const sql = getSql()
  const surfaceColumn = options.surface === "public"
    ? "show_in_kids_public"
    : options.surface === "portal"
      ? "show_in_kids_portal"
      : options.surface === "internal"
        ? "show_in_kids_internal"
        : null
  const rows = await sql<FieldRow[]>`
    select id, name, field_type, options, kids_targets,
           show_in_kids_internal, show_in_kids_public, show_in_kids_portal,
           is_required, sort_order, is_active
    from public.person_custom_fields
    where company_id = ${companyId}
      and source_module = 'kids'
      and deleted_at is null
      and (${options.includeInactive ?? false} or is_active = true)
      and (${surfaceColumn}::text is null or
        case ${surfaceColumn}
          when 'show_in_kids_public' then show_in_kids_public
          when 'show_in_kids_portal' then show_in_kids_portal
          else show_in_kids_internal
        end)
    order by sort_order, name
  `
  return rows.map(toDefinition)
}

export async function listPersonKidCustomValues(personIds: string[]) {
  if (personIds.length === 0) return new Map<string, KidCustomFieldValue[]>()
  const sql = getSql()
  const rows = await sql<{
    person_id: string
    field_id: string
    field_type: KidCustomFieldType
    value_text: string | null
    value_date: Date | string | null
    value_json: unknown
  }[]>`
    select value.person_id, value.field_id, field.field_type,
           value.value_text, value.value_date, value.value_json
    from public.person_custom_field_values value
    join public.person_custom_fields field on field.id = value.field_id
    where value.person_id = any(${personIds}::uuid[])
      and field.source_module = 'kids'
      and field.deleted_at is null
  `
  const result = new Map<string, KidCustomFieldValue[]>()
  for (const row of rows) {
    let value: KidCustomFieldValue["value"] = row.value_text ?? ""
    if (row.field_type === "date") value = row.value_date ? String(row.value_date).slice(0, 10) : ""
    if (row.field_type === "multiple") value = stringArray(row.value_json)
    if (row.field_type === "boolean") value = row.value_json === true
    const items = result.get(row.person_id) ?? []
    items.push({ fieldId: row.field_id, value })
    result.set(row.person_id, items)
  }
  return result
}

function isEmpty(value: KidCustomFieldValue["value"] | undefined) {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
}

export function validateKidCustomValues(
  definitions: KidCustomFieldDefinition[],
  target: KidCustomFieldTarget,
  surface: KidCustomFieldSurface,
  values: KidCustomFieldValue[],
) {
  const applicable = definitions.filter((field) => field.isActive && field.targets.includes(target) && field.surfaces.includes(surface))
  const allowed = new Map(applicable.map((field) => [field.id, field]))
  const received = new Map<string, KidCustomFieldValue["value"]>()
  for (const item of values) {
    const field = allowed.get(item.fieldId)
    if (!field) throw new Error("Campo personalizado inválido")
    if ((field.fieldType === "single" || field.fieldType === "multiple") && !([] as string[]).concat(item.value as never).every((value) => field.options.includes(String(value)))) {
      throw new Error(`Opção inválida em ${field.name}`)
    }
    if (field.fieldType === "number" && item.value !== "" && !Number.isFinite(Number(item.value))) throw new Error(`Número inválido em ${field.name}`)
    if (field.fieldType === "date" && item.value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.value))) throw new Error(`Data inválida em ${field.name}`)
    if (field.fieldType === "boolean" && typeof item.value !== "boolean") throw new Error(`Valor inválido em ${field.name}`)
    received.set(item.fieldId, item.value)
  }
  const missing = applicable.find((field) => field.required && isEmpty(received.get(field.id)))
  if (missing) throw new Error(`${missing.name} é obrigatório`)
  return applicable.flatMap((field) => received.has(field.id) ? [{ field, value: received.get(field.id)! }] : [])
}

export async function saveKidCustomValues(tx: Tx, companyId: string, personId: string, actorId: string | null, validated: ReturnType<typeof validateKidCustomValues>) {
  for (const { field, value } of validated) {
    const valueText = ["text", "textarea", "number", "single"].includes(field.fieldType) ? String(value) : null
    const valueDate = field.fieldType === "date" && value ? String(value) : null
    const valueJson = field.fieldType === "multiple" || field.fieldType === "boolean" ? value : {}
    await tx`
      insert into public.person_custom_field_values (
        company_id, person_id, field_id, value_text, value_date, value_json, created_by, updated_by
      ) values (
        ${companyId}, ${personId}, ${field.id}, ${valueText}, ${valueDate}, ${tx.json(valueJson as never)}, ${actorId}, ${actorId}
      )
      on conflict (person_id, field_id) do update set
        value_text = excluded.value_text,
        value_date = excluded.value_date,
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = now()
    `
  }
}

