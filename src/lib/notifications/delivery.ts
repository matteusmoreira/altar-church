import webpush from "web-push"
import { getSql } from "@/lib/db/client"

type DeliveryRow = {
  id: string
  notification_id: string
  company_id: string
  person_id: string | null
  channel: "push" | "email" | "whatsapp"
  recipient: string
  recipient_name: string
  attempts: number
}

type ProviderResult = { providerId: string; responseStatus: number | null }

const BACKOFF_MINUTES = [1, 5, 15, 60, 120, 360, 720, 1440]
const MAX_ATTEMPTS = 8
const FETCH_TIMEOUT_MS = 15_000

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function retryDelayMinutes(attempts: number) {
  return BACKOFF_MINUTES[Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)] ?? 1440
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function sendEmail(delivery: DeliveryRow, title: string, content: string): Promise<ProviderResult> {
  const apiKey = process.env.RESEND_API_KEY ?? ""
  const from = process.env.RESEND_FROM_EMAIL ?? ""
  if (!apiKey || !from) throw new Error("Resend não configurado")

  const response = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification-delivery/${delivery.id}`,
    },
    body: JSON.stringify({
      from,
      to: [delivery.recipient],
      subject: title,
      text: content,
      html: `<p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>`,
    }),
  })
  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string }
  if (!response.ok) throw new Error(`Resend recusou envio: ${response.status} ${payload.message ?? ""}`.trim())
  return { providerId: payload.id ?? "", responseStatus: response.status }
}

async function getUazapiCredential(companyId: string) {
  const rows = await getSql()<{ base_url: string; instance_token: string }[]>`
    select base_url, instance_token
    from public.get_company_uazapi_credential(${companyId})
  `
  const credential = rows[0]
  if (!credential?.base_url || !credential.instance_token) {
    throw new Error("Igreja sem instância Uazapi conectada")
  }
  return { baseUrl: credential.base_url.replace(/\/$/, ""), token: credential.instance_token }
}

async function sendWhatsApp(delivery: DeliveryRow, content: string): Promise<ProviderResult> {
  const credential = await getUazapiCredential(delivery.company_id)
  const response = await fetchWithTimeout(`${credential.baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: credential.token },
    body: JSON.stringify({
      number: delivery.recipient,
      text: content,
      async: true,
      track_source: "altar_church_notifications",
      track_id: delivery.id,
      linkPreview: false,
    }),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(`Uazapi recusou envio: ${response.status}`)
  return { providerId: String(payload.id ?? payload.messageId ?? payload.key ?? ""), responseStatus: response.status }
}

async function sendPush(delivery: DeliveryRow, title: string, content: string): Promise<ProviderResult> {
  if (!delivery.person_id) throw new Error("Destinatário sem pessoa para push")
  const subject = process.env.VAPID_SUBJECT ?? ""
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? ""
  if (!subject || !publicKey || !privateKey) throw new Error("Web Push não configurado")

  const rows = await getSql()<{ endpoint: string; p256dh: string; auth_key: string }[]>`
    select endpoint, p256dh, auth_key
    from public.notification_push_subscriptions
    where company_id = ${delivery.company_id}
      and person_id = ${delivery.person_id}
      and endpoint = ${delivery.recipient}
      and is_active = true
    limit 1
  `
  const subscription = rows[0]
  if (!subscription) throw new Error("Endpoint push inativo ou removido")

  webpush.setVapidDetails(subject, publicKey, privateKey)
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } },
    JSON.stringify({ title, body: content, url: "/membro" }),
    { TTL: 300, urgency: "normal" },
  )
  return { providerId: `webpush:${delivery.recipient}`, responseStatus: 201 }
}

async function campaignText(notificationId: string) {
  const rows = await getSql()<{ title: string; content: string }[]>`
    select title, content from public.notifications where id = ${notificationId} limit 1
  `
  if (!rows[0]) throw new Error("Campanha não encontrada")
  return rows[0]
}

async function sendDelivery(delivery: DeliveryRow, title: string, content: string) {
  if (delivery.channel === "email") return sendEmail(delivery, title, content)
  if (delivery.channel === "whatsapp") return sendWhatsApp(delivery, content)
  return sendPush(delivery, title, content)
}

async function markFailure(delivery: DeliveryRow, error: unknown) {
  const sql = getSql()
  const message = error instanceof Error ? error.message : "Falha no envio"
  const invalidPushEndpoint = delivery.channel === "push" && /404|410|inativo|removido/i.test(message)
  if (invalidPushEndpoint) {
    await sql`
      update public.notification_push_subscriptions
      set is_active = false, updated_at = now()
      where company_id = ${delivery.company_id} and person_id = ${delivery.person_id} and endpoint = ${delivery.recipient}
    `
  }

  if (invalidPushEndpoint || delivery.attempts >= MAX_ATTEMPTS) {
    await sql`
      update public.notification_deliveries
      set status = 'dead', last_error = ${message}, locked_at = null, updated_at = now()
      where id = ${delivery.id}
    `
    return "dead" as const
  }

  const delay = retryDelayMinutes(delivery.attempts)
  await sql`
    update public.notification_deliveries
    set status = 'failed',
        last_error = ${message},
        next_attempt_at = now() + (${delay}::text || ' minutes')::interval,
        locked_at = null,
        updated_at = now()
    where id = ${delivery.id}
  `
  return "failed" as const
}

async function refreshCampaignStatus(notificationId: string) {
  const sql = getSql()
  await sql`
    with totals as (
      select
        count(*)::int as total,
        count(*) filter (where status in ('pending', 'processing', 'failed'))::int as open,
        count(*) filter (where status = 'dead')::int as dead,
        count(*) filter (where status = 'sent')::int as sent
      from public.notification_deliveries
      where notification_id = ${notificationId}
    )
    update public.notifications campaign
    set status = case
      when totals.open = 0 and totals.dead = 0 and totals.total > 0 then 'completed'
      when totals.open = 0 and totals.dead > 0 then 'failed'
      else 'processing'
    end,
    completed_at = case when totals.open = 0 then coalesce(campaign.completed_at, now()) else null end,
    updated_at = now()
    from totals
    where campaign.id = ${notificationId}
      and campaign.status not in ('canceled', 'draft')
  `
}

export async function processNotificationOutbox(batchSize = 25) {
  const sql = getSql()
  const claimed = await sql<DeliveryRow[]>`
    select * from public.claim_notification_delivery_batch(${batchSize})
  `
  let sent = 0
  let failed = 0
  let dead = 0

  for (const delivery of claimed) {
    try {
      const campaign = await campaignText(delivery.notification_id)
      const result = await sendDelivery(delivery, campaign.title, campaign.content)
      await sql`
        update public.notification_deliveries
        set status = 'sent', provider_id = ${result.providerId}, response_status = ${result.responseStatus},
            sent_at = now(), delivered_at = now(), last_error = null, locked_at = null, updated_at = now()
        where id = ${delivery.id}
      `
      sent += 1
    } catch (error) {
      const state = await markFailure(delivery, error)
      if (state === "dead") dead += 1
      else failed += 1
    }
    await refreshCampaignStatus(delivery.notification_id)
  }

  return { processed: claimed.length, sent, failed, dead }
}

export async function retryNotificationDelivery(deliveryId: string, companyId: string) {
  const rows = await getSql()<{ id: string; notification_id: string }[]>`
    update public.notification_deliveries
    set status = 'pending', next_attempt_at = now(), last_error = null, locked_at = null, updated_at = now()
    where id = ${deliveryId}
      and company_id = ${companyId}
      and status in ('failed', 'dead')
    returning id, notification_id
  `
  return rows[0] ?? null
}
