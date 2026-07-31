import type postgres from "postgres"

type TransactionSql = postgres.TransactionSql

export type NotificationAudience = "all" | "cell" | "ministry" | "visitors" | "birthdays" | "manual"
export type NotificationChannel = "push" | "email" | "whatsapp"

type PersonRow = {
  id: string
  full_name: string
  email: string | null
  phone: string
}

type CampaignInput = {
  notificationId: string
  companyId: string
  channel: NotificationChannel
  audience: NotificationAudience
  audienceRefId: string | null
  personIds: string[]
  nextAttemptAt: string | null
}

function assertAudienceReference(input: CampaignInput) {
  if ((input.audience === "cell" || input.audience === "ministry") && !input.audienceRefId) {
    throw new Error("Selecione célula ou ministério")
  }
  if (input.audience === "manual" && input.personIds.length === 0) {
    throw new Error("Selecione ao menos uma pessoa")
  }
}

async function findAudiencePeople(tx: TransactionSql, input: CampaignInput) {
  assertAudienceReference(input)
  const base = () => tx<PersonRow[]>`
    select id, full_name, email, phone
    from public.people
    where company_id = ${input.companyId}
      and deleted_at is null
      and is_active = true
      and status <> 'inactive'
  `

  if (input.audience === "all") {
    return base()
  }
  if (input.audience === "visitors") {
    return tx<PersonRow[]>`
      ${base()}
      and (status = 'visitor' or person_type = 'visitor')
      order by full_name, id
    `
  }
  if (input.audience === "birthdays") {
    return tx<PersonRow[]>`
      ${base()}
      and birth_date is not null
      and extract(month from birth_date) = extract(month from current_date)
      and extract(day from birth_date) = extract(day from current_date)
      order by full_name, id
    `
  }
  if (input.audience === "cell") {
    return tx<PersonRow[]>`
      ${base()}
      and exists (
        select 1
        from public.group_members member
        where member.company_id = ${input.companyId}
          and member.group_id = ${input.audienceRefId}
          and member.person_id = people.id
          and member.status = 'active'
      )
      order by full_name, id
    `
  }
  if (input.audience === "ministry") {
    return tx<PersonRow[]>`
      ${base()}
      and exists (
        select 1
        from public.ministry_memberships membership
        where membership.company_id = ${input.companyId}
          and membership.ministry_id = ${input.audienceRefId}
          and membership.person_id = people.id
          and membership.status = 'active'
      )
      order by full_name, id
    `
  }
  return tx<PersonRow[]>`
    ${base()}
    and id = any(${tx.array(input.personIds)}::uuid[])
    order by full_name, id
  `
}

export async function createNotificationCampaignDeliveries(tx: TransactionSql, input: CampaignInput) {
  const people = await findAudiencePeople(tx, input)
  if (people.length === 0) throw new Error("Nenhum destinatário elegível para esta campanha")

  const personIds = people.map((person) => person.id)
  let inserted = 0

  if (input.channel === "push") {
    const rows = await tx<{ id: string }[]>`
      insert into public.notification_deliveries (
        notification_id, company_id, person_id, channel, recipient, recipient_name,
        status, next_attempt_at, delivery_key
      )
      select
        ${input.notificationId}, subscription.company_id, subscription.person_id, 'push',
        subscription.endpoint, person.full_name, 'pending',
        coalesce(${input.nextAttemptAt}::timestamptz, now()),
        ${input.notificationId} || ':' || subscription.person_id::text || ':push:' || md5(subscription.endpoint)
      from public.notification_push_subscriptions subscription
      join public.people person on person.id = subscription.person_id and person.company_id = subscription.company_id
      where subscription.company_id = ${input.companyId}
        and subscription.person_id = any(${tx.array(personIds)}::uuid[])
        and subscription.is_active = true
        and not exists (
          select 1 from public.notification_channel_preferences preference
          where preference.company_id = subscription.company_id
            and preference.person_id = subscription.person_id
            and preference.channel = 'push'
            and preference.opted_out = true
        )
      on conflict (delivery_key) do nothing
      returning id
    `
    inserted = rows.length
  } else if (input.channel === "email") {
    const rows = await tx<{ id: string }[]>`
      insert into public.notification_deliveries (
        notification_id, company_id, person_id, channel, recipient, recipient_name,
        status, next_attempt_at, delivery_key
      )
      select
        ${input.notificationId}, person.company_id, person.id, 'email',
        lower(btrim(person.email)), person.full_name, 'pending',
        coalesce(${input.nextAttemptAt}::timestamptz, now()),
        ${input.notificationId} || ':' || person.id::text || ':email'
      from public.people person
      where person.company_id = ${input.companyId}
        and person.id = any(${tx.array(personIds)}::uuid[])
        and person.email is not null
        and btrim(person.email) <> ''
        and not exists (
          select 1 from public.notification_channel_preferences preference
          where preference.company_id = person.company_id
            and preference.person_id = person.id
            and preference.channel = 'email'
            and preference.opted_out = true
        )
      on conflict (delivery_key) do nothing
      returning id
    `
    inserted = rows.length
  } else {
    const rows = await tx<{ id: string }[]>`
      insert into public.notification_deliveries (
        notification_id, company_id, person_id, channel, recipient, recipient_name,
        status, next_attempt_at, delivery_key
      )
      select
        ${input.notificationId}, person.company_id, person.id, 'whatsapp',
        regexp_replace(person.phone, '\\D', '', 'g'), person.full_name, 'pending',
        coalesce(${input.nextAttemptAt}::timestamptz, now()),
        ${input.notificationId} || ':' || person.id::text || ':whatsapp'
      from public.people person
      where person.company_id = ${input.companyId}
        and person.id = any(${tx.array(personIds)}::uuid[])
        and length(regexp_replace(person.phone, '\\D', '', 'g')) >= 8
        and not exists (
          select 1 from public.notification_channel_preferences preference
          where preference.company_id = person.company_id
            and preference.person_id = person.id
            and preference.channel = 'whatsapp'
            and preference.opted_out = true
        )
      on conflict (delivery_key) do nothing
      returning id
    `
    inserted = rows.length
  }

  if (inserted === 0) throw new Error("Nenhum destinatário possui contato ou consentimento para este canal")
  return { recipientCount: people.length, deliveryCount: inserted }
}
