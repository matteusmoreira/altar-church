import "server-only"
import type { TransactionSql } from "postgres"

// Callers lock the event first: registration, cancellation and entrance share this lock.
export async function promoteEventWaitlist(tx: TransactionSql, eventId: string, companyId: string) {
  const [event] = await tx<{ max_capacity: number; available: boolean }[]>`select max_capacity,
    status = 'published' and registration_mode = 'internal' and registration_enabled and now() < coalesce(ends_at, starts_at + interval '3 hours') as available
    from public.events where id = ${eventId} and company_id = ${companyId} and deleted_at is null`
  if (!event?.available) return
  const [count] = await tx<{ total: number }[]>`select
    (select count(*) from public.member_event_rsvps where event_id = ${eventId} and company_id = ${companyId} and status = 'going') +
    (select count(*) from public.event_guest_registrations where event_id = ${eventId} and company_id = ${companyId} and status = 'going') as total`
  let slots = event.max_capacity > 0 ? Math.max(0, event.max_capacity - Number(count.total)) : Infinity
  const waiting = await tx<{ id: string; kind: string }[]>`select id, kind from (
    select id, 'member' as kind, created_at from public.member_event_rsvps where event_id = ${eventId} and company_id = ${companyId} and status = 'waitlisted'
    union all select id, 'guest' as kind, created_at from public.event_guest_registrations where event_id = ${eventId} and company_id = ${companyId} and status = 'waitlisted'
  ) waiting order by created_at, id`
  for (const candidate of waiting) {
    if (slots-- <= 0) break
    if (candidate.kind === "member") {
      await tx`update public.member_event_rsvps set status = 'going', updated_at = now() where id = ${candidate.id} and company_id = ${companyId} and status = 'waitlisted'`
      await tx`insert into public.event_attendee_tokens(company_id, event_id, member_rsvp_id) values (${companyId}, ${eventId}, ${candidate.id}) on conflict do nothing`
    } else {
      await tx`update public.event_guest_registrations set status = 'going', updated_at = now() where id = ${candidate.id} and company_id = ${companyId} and status = 'waitlisted'`
      await tx`insert into public.event_attendee_tokens(company_id, event_id, guest_registration_id) values (${companyId}, ${eventId}, ${candidate.id}) on conflict do nothing`
    }
  }
}

export async function recordEventEntrance(tx: TransactionSql, input: { companyId: string; eventId: string; kind: "member" | "guest"; attendeeId: string; source: "qr" | "manual"; registeredBy?: string | null; registeredByName: string; sessionToken?: string | null }) {
  const [event] = await tx<{ title: string; timezone: string }[]>`select event.title, coalesce(settings.timezone, 'America/Sao_Paulo') as timezone
    from public.events event left join public.church_profiles settings on settings.company_id = event.company_id
    where event.id = ${input.eventId} and event.company_id = ${input.companyId} and event.status = 'published' and event.registration_mode = 'internal' and event.deleted_at is null for update of event`
  if (!event) throw new Error("Evento publicado não encontrado")
  const [session] = await tx<{ token: string }[]>`select token from public.event_checkin_sessions where event_id = ${input.eventId} and company_id = ${input.companyId}
    and closed_at is null and now() between opens_at and expires_at and (${input.sessionToken ?? null}::uuid is null or token = ${input.sessionToken ?? null}::uuid) order by opens_at desc limit 1 for update`
  if (!session) throw new Error("Check-in fechado ou expirado")
  const [participant] = input.kind === "member"
    ? await tx<{ name: string; person_id: string | null; status: string }[]>`select person.full_name as name, person.id as person_id, rsvp.status from public.member_event_rsvps rsvp
        join public.people person on person.id = rsvp.person_id and person.company_id = rsvp.company_id and person.deleted_at is null
        where rsvp.id = ${input.attendeeId} and rsvp.company_id = ${input.companyId} and rsvp.event_id = ${input.eventId} for update of rsvp`
    : await tx<{ name: string; person_id: string | null; status: string }[]>`select full_name as name, null::uuid as person_id, status from public.event_guest_registrations
        where id = ${input.attendeeId} and company_id = ${input.companyId} and event_id = ${input.eventId} for update`
  if (!participant || participant.status !== "going") throw new Error("A inscrição precisa estar confirmada para entrar")
  const [existing] = await tx<{ id: string }[]>`select id from public.attendance_records where company_id = ${input.companyId} and event_ref_id = ${input.eventId}
    and event_type = 'event' and status = 'present' and deleted_at is null
    and ((${participant.person_id}::uuid is not null and person_id = ${participant.person_id}::uuid) or (${input.kind === "guest"} and guest_registration_id = ${input.attendeeId}::uuid))`
  if (existing) return { id: existing.id, name: participant.name, alreadyCheckedIn: true }
  const guestId = input.kind === "guest" ? input.attendeeId : null
  const [saved] = await tx<{ id: string }[]>`insert into public.attendance_records(company_id, person_id, person_name, event_type, event_ref_id, event_ref_name,
    occurred_on, occurred_time, status, registered_by, registered_by_name, guest_registration_id, checkin_source, event_checkin_session_token, checkin_at)
    values (${input.companyId}, ${participant.person_id}, ${participant.name}, 'event', ${input.eventId}, ${event.title},
      (now() at time zone ${event.timezone})::date, (now() at time zone ${event.timezone})::time, 'present', ${input.registeredBy ?? null}, ${input.registeredByName}, ${guestId}, ${input.source}, ${session.token}::uuid, now())
    on conflict ${input.kind === "member" ? tx`(company_id, event_ref_id, person_id) where event_type = 'event' and person_id is not null and deleted_at is null` : tx`(company_id, event_ref_id, guest_registration_id) where event_type = 'event' and guest_registration_id is not null and deleted_at is null`}
    do update set status = 'present', checkin_at = coalesce(attendance_records.checkin_at, excluded.checkin_at), updated_at = now() returning id`
  if (guestId) await tx`update public.event_guest_registrations set checked_in_at = coalesce(checked_in_at, now()), updated_at = now() where id = ${guestId} and company_id = ${input.companyId}`
  return { id: saved.id, name: participant.name, alreadyCheckedIn: false }
}
