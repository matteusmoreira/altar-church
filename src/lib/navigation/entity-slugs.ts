import "server-only"

import { requireUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"

const tables = {
  people: "people", ministries: "ministries", forms: "forms", events: "events",
  notifications: "notifications", classrooms: "kid_classrooms", rooms: "kid_session_classrooms",
} as const

export type SlugEntity = keyof typeof tables
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve only within the authenticated church. Call the entity's permission check before redirecting. */
export async function resolveEntityRoute(kind: SlugEntity, identifier: string, companyIdInput?: string | null) {
  const user = await requireUser()
  const companyId = requireUserCompanyId(user, companyIdInput)
  const sql = getSql()
  const table = tables[kind]
  const value = identifier.trim().toLowerCase()
  if (!uuidPattern.test(value) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return null
  const condition = uuidPattern.test(value)
    ? sql`entity.id = ${value}::uuid`
    : sql`exists (select 1 from route_private.slug_reservations reservation
        where reservation.company_id = entity.company_id and reservation.kind = ${table}
          and reservation.entity_id = entity.id and reservation.slug = ${value})`
  const active = kind === "rooms"
    ? sql`exists (select 1 from public.kid_sessions session join public.kid_classrooms classroom
        on classroom.id = entity.classroom_id and classroom.company_id = entity.company_id
        where session.id = entity.session_id and session.company_id = entity.company_id
          and session.deleted_at is null and classroom.deleted_at is null)`
    : sql`entity.deleted_at is null`
  const rows = await sql<{ id: string; slug: string; company_id: string }[]>`
    select entity.id, entity.slug, entity.company_id from public.${sql(table)} entity
    where entity.company_id = ${companyId} and ${condition} and ${active} limit 1
  `
  return rows[0] ?? null
}

export { canonicalEntityPath, type RouteSearchParams } from "./routes"
