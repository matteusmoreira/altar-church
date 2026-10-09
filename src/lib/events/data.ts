import "server-only"

import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { eventRegistrationOpen } from "./contract"
import type { EventCheckinPreview, EventCheckinSessionPreview, EventDashboardSummary, EventPublicData, EventPublicRegistration, EventReport, EventResourceItem } from "./types"

type DateValue = Date | string | null

export async function listEventTypes() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await requirePermission("events.view", companyId)
  const [row] = await getSql()<{ event_types: string[] }[]>`select event_types from public.church_profiles where company_id = ${companyId}`
  return row?.event_types ?? ["service", "prayer", "youth", "children", "special", "meeting"]
}

function iso(value: DateValue) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function safeToken(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : ""
}

export async function getPublicEventByToken(tokenInput: string): Promise<EventPublicData | null> {
  const token = safeToken(tokenInput)
  if (!token) return null
  const rows = await getSql()<{
    token: string
    company_slug: string
    public_slug: string
    event_timezone: string
    church_name: string
    title: string
    description: string
    type: string
    starts_at: DateValue
    ends_at: DateValue
    location: string
    cover_path: string | null
    value_cents: number
    value_instructions: string
    banner_url: string
    is_online: boolean
    online_link: string
    registration_mode: "internal" | "external"
    external_platform: string
    external_ticket_url: string
    registration_enabled: boolean
    registration_form_slug: string | null
    registration_form_title: string | null
    max_capacity: number
    going_count: number | string
    waitlisted_count: number | string
  }[]>`
    select (select timezone from public.church_profiles where company_id = event.company_id) as event_timezone, event.public_token as token, event.public_slug, company.slug as company_slug, company.name as church_name,
      event.title, event.description, event.type, event.starts_at, event.ends_at, event.location,
      cover.storage_path as cover_path, event.value_cents, event.value_instructions, event.banner_url, event.is_online, event.online_link, event.registration_mode, event.external_platform, event.external_ticket_url, event.registration_enabled, event.max_capacity,
      registration_form.slug as registration_form_slug, registration_form.title as registration_form_title,
      (select count(*)::integer from public.member_event_rsvps rsvp
        where rsvp.company_id = event.company_id and rsvp.event_id = event.id and rsvp.status = 'going')
      + (select count(*)::integer from public.event_guest_registrations guest
        where guest.company_id = event.company_id and guest.event_id = event.id and guest.status = 'going') as going_count,
      (select count(*)::integer from public.member_event_rsvps rsvp
        where rsvp.company_id = event.company_id and rsvp.event_id = event.id and rsvp.status = 'waitlisted')
      + (select count(*)::integer from public.event_guest_registrations guest
        where guest.company_id = event.company_id and guest.event_id = event.id and guest.status = 'waitlisted') as waitlisted_count
    from public.events event
    left join public.app_files cover on cover.id = event.cover_file_id and cover.company_id = event.company_id and cover.is_active and cover.deleted_at is null
    join public.companies company on company.id = event.company_id and company.active and (company.status = 'active' or (company.status = 'test' and company.legacy_id = ${process.env.E2E_COMPANY_LEGACY_ID || ''}))
    left join public.forms registration_form on registration_form.id = event.registration_form_id and registration_form.company_id = event.company_id and registration_form.status = 'published' and registration_form.is_active and registration_form.deleted_at is null
    where event.public_token = ${token}::uuid
      and event.is_public and event.status = 'published' and event.deleted_at is null
    limit 1
  `
  const row = rows[0]
  if (!row) return null
  const goingCount = Number(row.going_count ?? 0)
  const waitlistedCount = Number(row.waitlisted_count ?? 0)
  const maxCapacity = Number(row.max_capacity ?? 0)
  return {
    token: row.token,
    publicPath: `/eventos/publico/${row.company_slug}/${row.public_slug}`,
    companySlug: row.company_slug,
    churchName: row.church_name,
    timezone: row.event_timezone || "America/Sao_Paulo",
    title: row.title,
    description: row.description,
    type: row.type,
    startsAt: iso(row.starts_at) ?? "",
    endsAt: iso(row.ends_at),
    location: row.location,
    valueCents: row.value_cents, valueInstructions: row.value_instructions,
    registrationMode: row.registration_mode, externalPlatform: row.external_platform, externalTicketUrl: row.external_ticket_url,
    registrationOpen: eventRegistrationOpen({ registrationMode: row.registration_mode, startsAt: iso(row.starts_at)!, endsAt: iso(row.ends_at), registrationEnabled: row.registration_enabled }),
    bannerUrl: row.cover_path ? (await createSignedUrlsByStoragePath([row.cover_path])).get(row.cover_path) || row.banner_url : row.banner_url,
    isOnline: row.is_online,
    onlineLink: row.online_link,
    registrationEnabled: row.registration_enabled,
    registrationFormSlug: row.registration_form_slug,
    registrationFormTitle: row.registration_form_title,
    maxCapacity,
    goingCount,
    waitlistedCount,
    capacityRemaining: maxCapacity > 0 ? Math.max(0, maxCapacity - goingCount) : null,
  }
}

export async function getPublicEventBySlug(companySlug: string, eventSlug: string): Promise<EventPublicData | null> {
  if (![companySlug, eventSlug].every(value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))) return null
  const rows = await getSql()<{ public_token: string }[]>`
    select event.public_token from public.events event
    join public.companies company on company.id = event.company_id and company.active and (company.status = 'active' or (company.status = 'test' and company.legacy_id = ${process.env.E2E_COMPANY_LEGACY_ID || ''}))
    where company.slug = ${companySlug} and event.public_slug = ${eventSlug}
      and event.is_public and event.status = 'published' and event.deleted_at is null limit 1
  `
  return rows[0] ? getPublicEventByToken(rows[0].public_token) : null
}

export async function getPublicEventRegistration(tokenInput: string): Promise<EventPublicRegistration | null> {
  const token = safeToken(tokenInput)
  if (!token) return null
  const rows = await getSql()<{
    id: string
    confirmation_token: string
    event_token: string
    event_title: string
    value_cents: number
    value_instructions: string
    attendee_token: string | null
    company_slug: string
    public_slug: string
    full_name: string
    email: string
    phone: string
    status: EventPublicRegistration["status"]
  }[]>`
    select guest.id, guest.confirmation_token, event.public_token as event_token, event.title as event_title, event.value_cents, event.value_instructions,
      (select token from public.event_attendee_tokens where guest_registration_id = guest.id and company_id = guest.company_id) as attendee_token,
      (select slug from public.companies where id = event.company_id) as company_slug, event.public_slug,
      guest.full_name, guest.email, guest.phone, guest.status
    from public.event_guest_registrations guest
    join public.events event on event.id = guest.event_id and event.registration_mode = 'internal' and event.deleted_at is null
    where guest.confirmation_token = ${token}::uuid
    limit 1
  `
  const row = rows[0]
  return row ? {
    id: row.id,
    token: row.confirmation_token,
    eventToken: row.event_token,
    eventPublicPath: `/eventos/publico/${row.company_slug}/${row.public_slug}`,
    eventTitle: row.event_title, valueCents: row.value_cents, valueInstructions: row.value_instructions, attendeeToken: row.attendee_token,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
  } : null
}

export async function getEventCheckinPreview(tokenInput: string): Promise<EventCheckinPreview | null> {
  const token = safeToken(tokenInput)
  if (!token) return null
  const rows = await getSql()<{
    token: string
    event_id: string
    event_title: string
    event_location: string
    event_starts_at: DateValue
    attendee_name: string
    attendee_kind: "member" | "guest"
    already_checked_in: boolean
    session_open: boolean
  }[]>`
    select attendee.token, event.id as event_id, event.title as event_title, event.location as event_location,
      event.starts_at as event_starts_at,
      coalesce(person.full_name, guest.full_name) as attendee_name,
      case when attendee.member_rsvp_id is not null then 'member' else 'guest' end as attendee_kind,
      case when attendee.member_rsvp_id is not null then exists(
        select 1 from public.attendance_records attendance
        where attendance.company_id = attendee.company_id and attendance.event_ref_id = event.id
          and attendance.event_type = 'event' and attendance.person_id = person.id
          and attendance.status = 'present' and attendance.deleted_at is null
      ) else guest.checked_in_at is not null end as already_checked_in,
      exists(
        select 1 from public.event_checkin_sessions session
        where session.company_id = attendee.company_id and session.event_id = event.id
          and session.closed_at is null and now() between session.opens_at and session.expires_at
      ) as session_open
    from public.event_attendee_tokens attendee
    join public.events event on event.id = attendee.event_id and event.status = 'published' and event.registration_mode = 'internal' and event.deleted_at is null
    left join public.member_event_rsvps rsvp on rsvp.id = attendee.member_rsvp_id
    left join public.people person on person.id = rsvp.person_id
    left join public.event_guest_registrations guest on guest.id = attendee.guest_registration_id
    where attendee.token = ${token}::uuid and (attendee.expires_at is null or attendee.expires_at > now()) and coalesce(rsvp.status, guest.status) = 'going'
    limit 1
  `
  const row = rows[0]
  return row ? {
    token: row.token,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventLocation: row.event_location,
    eventStartsAt: iso(row.event_starts_at) ?? "",
    attendeeName: row.attendee_name,
    attendeeKind: row.attendee_kind,
    available: row.session_open && !row.already_checked_in,
    alreadyCheckedIn: row.already_checked_in,
  } : null
}

export async function getEventCheckinSessionPreview(tokenInput: string): Promise<EventCheckinSessionPreview | null> {
  const token = safeToken(tokenInput)
  if (!token) return null
  const rows = await getSql()<{
    token: string; event_id: string; event_title: string; event_location: string; event_starts_at: DateValue; available: boolean
  }[]>`
    select session.token, event.id as event_id, event.title as event_title, event.location as event_location,
      event.starts_at as event_starts_at,
      session.closed_at is null and now() between session.opens_at and session.expires_at as available
    from public.event_checkin_sessions session
    join public.events event on event.id = session.event_id and event.status = 'published' and event.registration_mode = 'internal' and event.deleted_at is null
    where session.token = ${token}::uuid
    limit 1
  `
  const row = rows[0]
  return row ? {
    token: row.token,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventLocation: row.event_location,
    eventStartsAt: iso(row.event_starts_at) ?? "",
    available: row.available,
  } : null
}

export async function getEventReport(eventId: string, companyIdInput?: string | null): Promise<EventReport> {
  const user = await getCurrentUser()
  const companyId = requireUserCompanyId(user!, companyIdInput)
  await requirePermission("events.view", companyId)
  const sql = getSql()
  const [countRows, absentRows, notificationRows] = await Promise.all([
    sql<{ going: number; waitlisted: number; canceled: number; present: number; guest_going: number; guest_present: number; capacity: number }[]>`
      select event.max_capacity as capacity,
        (select count(*)::integer from public.member_event_rsvps where company_id = ${companyId} and event_id = ${eventId} and status = 'going')
          + (select count(*)::integer from public.event_guest_registrations where company_id = ${companyId} and event_id = ${eventId} and status = 'going') as going,
        (select count(*)::integer from public.member_event_rsvps where company_id = ${companyId} and event_id = ${eventId} and status = 'waitlisted')
          + (select count(*)::integer from public.event_guest_registrations where company_id = ${companyId} and event_id = ${eventId} and status = 'waitlisted') as waitlisted,
        (select count(*)::integer from public.member_event_rsvps where company_id = ${companyId} and event_id = ${eventId} and status = 'canceled')
          + (select count(*)::integer from public.event_guest_registrations where company_id = ${companyId} and event_id = ${eventId} and status = 'canceled') as canceled,
        (select count(*)::integer from public.attendance_records where company_id = ${companyId} and event_ref_id = ${eventId} and event_type = 'event' and status = 'present' and deleted_at is null) as present,
        (select count(*)::integer from public.event_guest_registrations where company_id = ${companyId} and event_id = ${eventId} and status = 'going') as guest_going,
        (select count(*)::integer from public.event_guest_registrations where company_id = ${companyId} and event_id = ${eventId} and status = 'going' and checked_in_at is not null) as guest_present
      from public.events event where event.id = ${eventId} and event.company_id = ${companyId} and event.deleted_at is null limit 1
    `,
    sql<{ id: string; name: string; email: string | null; phone: string }[]>`
      select person.id, person.full_name as name, coalesce(person.email, '') as email, person.phone
      from public.member_event_rsvps rsvp
      join public.people person on person.id = rsvp.person_id and person.company_id = rsvp.company_id
      where rsvp.company_id = ${companyId} and rsvp.event_id = ${eventId} and rsvp.status = 'going'
        and not exists (
          select 1 from public.attendance_records attendance
          where attendance.company_id = rsvp.company_id and attendance.event_ref_id = rsvp.event_id
            and attendance.event_type = 'event' and attendance.person_id = rsvp.person_id
            and attendance.status = 'present' and attendance.deleted_at is null
        )
      order by person.full_name limit 500
    `,
    sql<{ id: string; event_template_key: string | null; status: string; scheduled_at: DateValue; delivery_count: number }[]>`
      select notification.id, notification.event_template_key, notification.status, notification.scheduled_at,
        (select count(*)::integer from public.notification_deliveries delivery where delivery.notification_id = notification.id) as delivery_count
      from public.notifications notification
      where notification.company_id = ${companyId} and notification.event_id = ${eventId} and notification.deleted_at is null
      order by notification.created_at desc limit 50
    `,
  ])
  const count = countRows[0]
  const going = Number(count?.going ?? 0)
  const present = Number(count?.present ?? 0)
  return {
    going,
    waitlisted: Number(count?.waitlisted ?? 0),
    canceled: Number(count?.canceled ?? 0),
    present,
    absent: Math.max(0, going - present),
    guestGoing: Number(count?.guest_going ?? 0),
    guestPresent: Number(count?.guest_present ?? 0),
    capacity: Number(count?.capacity ?? 0),
    attendanceRate: going > 0 ? Math.round((present / going) * 1000) / 10 : null,
    followUpCandidates: absentRows.map((row) => ({ id: row.id, name: row.name, email: row.email ?? "", phone: row.phone })),
    notifications: notificationRows.map((row) => ({
      id: row.id,
      templateKey: row.event_template_key ?? "manual",
      status: row.status,
      scheduledAt: iso(row.scheduled_at),
      deliveryCount: Number(row.delivery_count ?? 0),
    })),
  }
}

export async function listEventResources(eventId: string, companyIdInput?: string | null): Promise<EventResourceItem[]> {
  const user = await getCurrentUser()
  const companyId = requireUserCompanyId(user!, companyIdInput)
  await requirePermission("events.view", companyId)
  const rows = await getSql()<{
    id: string; title: string; notes: string; external_url: string | null; file_id: string | null;
    visibility: EventResourceItem["visibility"]; created_at: DateValue
  }[]>`
    select id, title, notes, external_url, file_id, visibility, created_at
    from public.event_resources
    where company_id = ${companyId} and event_id = ${eventId} and deleted_at is null
    order by created_at desc limit 100
  `
  return rows.map((row) => ({
    id: row.id, title: row.title, notes: row.notes, externalUrl: row.external_url,
    fileId: row.file_id, visibility: row.visibility, createdAt: iso(row.created_at) ?? "",
  }))
}

export async function getEventDashboardSummary(companyIdInput?: string | null): Promise<EventDashboardSummary> {
  const user = await getCurrentUser()
  const companyId = requireUserCompanyId(user!, companyIdInput)
  await requirePermission("reports.view", companyId)
  const sql = getSql()
  const [summaryRows, typeRows] = await Promise.all([
    sql<{ total: number; published: number; canceled: number; registrations: number; present: number }[]>`
      select count(*)::integer as total,
        count(*) filter (where event.status = 'published')::integer as published,
        count(*) filter (where event.status = 'cancelled')::integer as canceled,
        coalesce(sum((select count(*) from public.member_event_rsvps rsvp where rsvp.company_id = event.company_id and rsvp.event_id = event.id and rsvp.status = 'going') + (select count(*) from public.event_guest_registrations guest where guest.company_id = event.company_id and guest.event_id = event.id and guest.status = 'going')), 0)::integer as registrations,
        coalesce(sum((select count(*) from public.attendance_records attendance where attendance.company_id = event.company_id and attendance.event_ref_id = event.id and attendance.event_type = 'event' and attendance.status = 'present' and attendance.deleted_at is null)), 0)::integer as present
      from public.events event
      where event.company_id = ${companyId} and event.deleted_at is null
        and event.starts_at >= date_trunc('month', now()) and event.starts_at < date_trunc('month', now()) + interval '1 month'
    `,
    sql<{ type: string; value: number }[]>`
      select event.type, count(*)::integer as value from public.events event
      where event.company_id = ${companyId} and event.deleted_at is null
        and event.starts_at >= date_trunc('month', now()) and event.starts_at < date_trunc('month', now()) + interval '1 month'
      group by event.type order by value desc
    `,
  ])
  const summary = summaryRows[0]
  const registrations = Number(summary?.registrations ?? 0)
  return {
    total: Number(summary?.total ?? 0),
    published: Number(summary?.published ?? 0),
    canceled: Number(summary?.canceled ?? 0),
    registrations,
    present: Number(summary?.present ?? 0),
    attendanceRate: registrations > 0 ? Math.round((Number(summary?.present ?? 0) / registrations) * 1000) / 10 : null,
    byType: typeRows.map((row) => ({ label: row.type, value: Number(row.value ?? 0) })),
  }
}

export async function getEventActiveCheckinSession(eventId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await requirePermission("events.view", companyId)
  const [session] = await getSql()<{ token: string; expires_at: Date }[]>`select session.token, session.expires_at from public.event_checkin_sessions session join public.events event on event.id = session.event_id and event.company_id = session.company_id
    where session.event_id = ${eventId} and session.company_id = ${companyId} and event.status = 'published' and event.registration_mode = 'internal' and event.deleted_at is null and closed_at is null and now() between opens_at and expires_at order by opens_at desc limit 1`
  return session ? { token: session.token, expiresAt: session.expires_at.toISOString() } : null
}
