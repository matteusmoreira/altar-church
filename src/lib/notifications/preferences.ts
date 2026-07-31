import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"

export const notificationChannels = ["push", "email", "whatsapp"] as const
export type NotificationChannel = (typeof notificationChannels)[number]

const channelSchema = z.enum(notificationChannels)
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(16).max(512),
  auth: z.string().min(8).max(512),
  userAgent: z.string().max(500).optional().default(""),
})

async function ownPerson() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  const rows = await getSql()<{ id: string }[]>`
    select people.id from public.people
    where people.company_id = ${companyId}
      and (people.profile_id = ${user.id} or people.id = (select profile.person_id from public.profiles profile where profile.id = ${user.id} and profile.company_id = ${companyId}))
    order by (people.deleted_at is null) desc, (people.profile_id = ${user.id}) desc
    limit 1
  `
  return { user, companyId, personId: rows[0]?.id ?? null }
}

export async function getMyNotificationPreferences() {
  const { companyId, personId } = await ownPerson()
  if (!personId) return Object.fromEntries(notificationChannels.map((channel) => [channel, false])) as Record<NotificationChannel, boolean>
  const rows = await getSql()<{ channel: NotificationChannel; opted_out: boolean }[]>`
    select channel, opted_out
    from public.notification_channel_preferences
    where company_id = ${companyId} and person_id = ${personId}
  `
  return Object.fromEntries(notificationChannels.map((channel) => [
    channel,
    rows.find((row) => row.channel === channel)?.opted_out ?? false,
  ])) as Record<NotificationChannel, boolean>
}

export async function saveMyNotificationPreference(channelInput: string, optedOut: boolean) {
  "use server"
  const channel = channelSchema.parse(channelInput)
  const { user, companyId, personId } = await ownPerson()
  if (!personId) throw new Error("Conta sem pessoa vinculada")
  await getSql()`
    insert into public.notification_channel_preferences (company_id, person_id, channel, opted_out, updated_by)
    values (${companyId}, ${personId}, ${channel}, ${Boolean(optedOut)}, ${user.id})
    on conflict (company_id, person_id, channel)
    do update set opted_out = excluded.opted_out, updated_by = excluded.updated_by, updated_at = now()
  `
  await writeAuditLog({
    action: "notification.preference.save",
    entityTable: "notification_channel_preferences",
    entityId: personId,
    companyId,
    metadata: { channel, optedOut: Boolean(optedOut) },
  })
  return { ok: true }
}

export async function saveMyNotificationPushSubscription(input: unknown) {
  const parsed = subscriptionSchema.parse(input)
  const { user, companyId, personId } = await ownPerson()
  if (!personId) throw new Error("Conta sem pessoa vinculada")
  await getSql()`
    insert into public.notification_push_subscriptions (
      company_id, person_id, endpoint, p256dh, auth_key, user_agent, is_active
    )
    values (${companyId}, ${personId}, ${parsed.endpoint}, ${parsed.p256dh}, ${parsed.auth}, ${parsed.userAgent}, true)
    on conflict (endpoint)
    do update set company_id = excluded.company_id, person_id = excluded.person_id,
      p256dh = excluded.p256dh, auth_key = excluded.auth_key, user_agent = excluded.user_agent,
      is_active = true, updated_at = now()
  `
  await writeAuditLog({
    action: "notification.push_subscription.save",
    entityTable: "notification_push_subscriptions",
    entityId: parsed.endpoint,
    companyId,
    metadata: { personId, profileId: user.id },
  })
  return { ok: true }
}
