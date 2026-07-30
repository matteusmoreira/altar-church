import webpush from "web-push"
import { getSql } from "@/lib/db/client"

interface ChatDelivery {
  id: string
  target_profile_id: string
  subject: string
  content: string
  payload: Record<string, unknown>
  attempts: number
}

function retryAt(attempt: number) {
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempt - 1))
  return new Date(Date.now() + minutes * 60_000)
}

export async function processVolunteerChatPushOutbox(limit = 25, messageId?: string) {
  const vapidSubject = process.env.VAPID_SUBJECT ?? ""
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? ""
  if (!vapidSubject || !publicKey || !privateKey) {
    throw new Error("Web Push não configurado")
  }
  webpush.setVapidDetails(vapidSubject, publicKey, privateKey)
  const sql = getSql()
  const deliveries = await sql<ChatDelivery[]>`
    with candidates as (
      select id from public.volunteer_delivery_outbox
      where chat_message_id is not null and channel = 'push'
        and status in ('pending', 'failed') and next_attempt_at <= now() and attempts < 8
        and (${messageId ?? null}::uuid is null or chat_message_id = ${messageId ?? null}::uuid)
      order by next_attempt_at, created_at
      for update skip locked
      limit ${Math.max(1, Math.min(limit, 100))}
    )
    update public.volunteer_delivery_outbox delivery
    set status = 'processing', attempts = delivery.attempts + 1, locked_at = now(), updated_at = now()
    from candidates where delivery.id = candidates.id
    returning delivery.id, delivery.target_profile_id, delivery.subject, delivery.content, delivery.payload, delivery.attempts
  `
  let sent = 0
  let failed = 0
  for (const delivery of deliveries) {
    try {
      const subscriptions = await sql<{ id: string; endpoint: string; p256dh: string; auth_key: string }[]>`
        select id, endpoint, p256dh, auth_key from public.volunteer_push_subscriptions
        where profile_id = ${delivery.target_profile_id} and is_active
      `
      if (subscriptions.length === 0) throw new Error("Sem dispositivo push ativo")
      let delivered = 0
      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          }, JSON.stringify({
            title: delivery.subject,
            body: delivery.content,
            url: "/voluntariado",
            ...delivery.payload,
          }), { TTL: 3600, urgency: "high" })
          delivered += 1
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            await sql`update public.volunteer_push_subscriptions set is_active = false, updated_at = now() where id = ${subscription.id}`
          }
        }
      }
      if (delivered === 0) throw new Error("Push não entregue")
      await sql`
        update public.volunteer_delivery_outbox set status = 'sent', provider_id = ${`web-push:${delivered}`},
          sent_at = now(), locked_at = null, last_error = null, updated_at = now() where id = ${delivery.id}
      `
      sent += 1
    } catch (error) {
      await sql`
        update public.volunteer_delivery_outbox set status = 'failed', locked_at = null,
          next_attempt_at = ${retryAt(delivery.attempts)}, last_error = ${error instanceof Error ? error.message.slice(0, 500) : "Falha de entrega"},
          updated_at = now() where id = ${delivery.id}
      `
      failed += 1
    }
  }
  return { processed: deliveries.length, sent, failed }
}
