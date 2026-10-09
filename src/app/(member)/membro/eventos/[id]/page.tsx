import { notFound } from "next/navigation"
import { requireMemberContext } from "@/lib/member/access"
import { getSql } from "@/lib/db/client"
import { eventRegistrationOpen } from "@/lib/events/contract"
import { MemberEventRegistration } from "./registration-client"

export default async function MemberEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { companyId, personId } = await requireMemberContext()
  const [event] = await getSql()<{ id: string; title: string; registration_mode: "internal" | "external"; external_platform: string; external_ticket_url: string; description: string; timezone: string; location: string; starts_at: Date; ends_at: Date | null; registration_enabled: boolean; value_cents: number; value_instructions: string; status: "going" | "waitlisted" | "canceled" | null; token: string | null }[]>`select (select timezone from public.church_profiles where company_id = event.company_id) as timezone, event.id, event.title, event.registration_mode, event.external_platform, event.external_ticket_url, event.description, event.location, event.starts_at, event.ends_at, event.registration_enabled, event.value_cents, event.value_instructions, own.status, attendee.token
    from public.events event
    left join lateral (select id, status from public.member_event_rsvps where event_id = event.id and company_id = event.company_id and person_id = ${personId} order by (status <> 'canceled') desc, updated_at desc limit 1) own on true
    left join public.event_attendee_tokens attendee on attendee.member_rsvp_id = own.id and attendee.company_id = event.company_id
    where event.id = ${id} and event.company_id = ${companyId} and event.status = 'published' and event.deleted_at is null
      and (event.ministry_id is null or exists(select 1 from public.ministry_memberships where company_id = ${companyId} and ministry_id = event.ministry_id and person_id = ${personId} and status = 'active' and left_at is null))`
  if (!event) notFound()
  return <MemberEventRegistration event={{ id: event.id, title: event.title, registrationMode: event.registration_mode, externalPlatform: event.external_platform, externalTicketUrl: event.external_ticket_url, description: event.description, timezone: event.timezone || "America/Sao_Paulo", location: event.location, startsAt: event.starts_at.toISOString(), valueCents: event.value_cents, valueInstructions: event.value_instructions, status: event.status, token: event.token, open: eventRegistrationOpen({ registrationMode: event.registration_mode, startsAt: event.starts_at.toISOString(), endsAt: event.ends_at?.toISOString() ?? null, registrationEnabled: event.registration_enabled }) }} />
}
