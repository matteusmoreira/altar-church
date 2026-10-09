import webpush from "web-push"
import { toUazapiNumber } from "@/lib/auth/phone"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { isPermanentProviderError } from "@/lib/delivery/retry-policy"
import { buildUazapiPayload, parseDirectMessageConfig, renderDirectMessage } from "@/lib/forms/direct-message"
import type { FormDirectMessage } from "@/lib/forms/types"
import { notificationPlainText } from "./content"

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

type UazapiCredential = { baseUrl: string; token: string }

async function postUazapi(credential: UazapiCredential, endpoint: string, body: Record<string, unknown>) {
  return fetchWithTimeout(`${credential.baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: credential.token },
    body: JSON.stringify(body),
  })
}

async function getCarouselMediaUrls(companyId: string, message: FormDirectMessage) {
  if (message.type !== "carousel") return new Map<string, string>()
  const ids = [...new Set(message.cards.map((card) => card.mediaFileId).filter(Boolean))] as string[]
  if (ids.length === 0) return new Map<string, string>()
  const sql = getSql()
  const files = await sql<{ id: string; storage_path: string }[]>`
    select id, storage_path from public.app_files
    where company_id = ${companyId} and id = any(${sql.array(ids)}::uuid[])
      and bucket = 'church-assets' and is_active = true and deleted_at is null
  `
  if (files.length === 0) return new Map<string, string>()
  const signed = await createSignedUrlsByStoragePath(files.map((file) => file.storage_path), 3600)
  const urls = new Map<string, string>()
  for (const file of files) {
    const url = signed.get(file.storage_path)
    if (url) urls.set(file.id, url)
  }
  return urls
}

async function sendWhatsApp(delivery: DeliveryRow, content: string, whatsappMessage: unknown): Promise<ProviderResult> {
  const credential = await getUazapiCredential(delivery.company_id)
  const number = toUazapiNumber(delivery.recipient)
  const textBody: Record<string, unknown> = {
    number,
    text: content,
    async: true,
    track_source: "altar_church_notifications",
    track_id: delivery.id,
    linkPreview: false,
  }
  const interactive = parseDirectMessageConfig(whatsappMessage)
  if (interactive && interactive.type !== "text") {
    const nome = delivery.recipient_name.trim()
    const rendered = renderDirectMessage(interactive, { nome, primeiro_nome: nome.split(/\s+/)[0] ?? "" })
    const mediaUrls = await getCarouselMediaUrls(delivery.company_id, rendered)
    const payload = buildUazapiPayload(rendered, { number, trackId: delivery.id, mediaUrls })
    let response = await postUazapi(credential, payload.endpoint, payload.body as Record<string, unknown>)
    // Provedor recusou a estrutura interativa: cai para o texto simples da campanha.
    if (response.status === 400) {
      response = await postUazapi(credential, "/send/text", { ...textBody, track_id: `${delivery.id}:fallback` })
    }
    const payloadJson = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(`Uazapi recusou envio: ${response.status}`)
    return { providerId: String(payloadJson.id ?? payloadJson.messageId ?? payloadJson.key ?? ""), responseStatus: response.status }
  }
  const response = await postUazapi(credential, "/send/text", textBody)
  const payloadJson = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(`Uazapi recusou envio: ${response.status}`)
  return { providerId: String(payloadJson.id ?? payloadJson.messageId ?? payloadJson.key ?? ""), responseStatus: response.status }
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
    JSON.stringify({ title, body: notificationPlainText(content).slice(0, 500), url: `/avisos/${delivery.notification_id}` }),
    { TTL: 86400, urgency: "normal", timeout: FETCH_TIMEOUT_MS },
  )
  return { providerId: `webpush:${delivery.recipient}`, responseStatus: 201 }
}

type CampaignRow = { title: string; content: string; whatsapp_message: unknown }

async function campaignText(notificationId: string): Promise<CampaignRow> {
  const rows = await getSql()<CampaignRow[]>`
    select title, content, whatsapp_message from public.notifications where id = ${notificationId} limit 1
  `
  if (!rows[0]) throw new Error("Campanha não encontrada")
  return rows[0]
}

async function sendDelivery(delivery: DeliveryRow, campaign: CampaignRow) {
  if (delivery.channel === "email") return sendEmail(delivery, campaign.title, campaign.content)
  if (delivery.channel === "whatsapp") return sendWhatsApp(delivery, campaign.content, campaign.whatsapp_message)
  return sendPush(delivery, campaign.title, campaign.content)
}

async function markFailure(delivery: DeliveryRow, error: unknown) {
  const sql = getSql()
  const message = error instanceof Error ? error.message : "Falha no envio"
  const statusCode = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : null
  const invalidPushEndpoint = delivery.channel === "push" && (statusCode === 404 || statusCode === 410 || /\b404\b|\b410\b|inativo|removido/i.test(message))
  if (invalidPushEndpoint) {
    await sql`
      update public.notification_push_subscriptions
      set is_active = false, updated_at = now()
      where company_id = ${delivery.company_id} and person_id = ${delivery.person_id} and endpoint = ${delivery.recipient}
    `
  }

  if (invalidPushEndpoint || delivery.attempts >= MAX_ATTEMPTS || isPermanentProviderError(error)) {
    await sql`
      update public.notification_deliveries
      set status = 'dead', last_error = ${message}, locked_at = null, updated_at = now()
      where id = ${delivery.id} and status = 'processing'
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
    where id = ${delivery.id} and status = 'processing'
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

export async function processNotificationOutbox(batchSize = 25, notificationId: string | null = null, companyId: string | null = null) {
  const sql = getSql()
  const claimed = await sql<DeliveryRow[]>`
    select * from public.claim_notification_delivery_batch(${batchSize}, ${notificationId}::uuid, ${companyId}::uuid)
  `
  let sent = 0
  let failed = 0
  let dead = 0

  async function processClaimedDelivery(delivery: DeliveryRow) {
    try {
      const activeRows = await sql<{ id: string }[]>`
        select delivery.id from public.notification_deliveries delivery
        join public.notifications campaign on campaign.id = delivery.notification_id and campaign.company_id = delivery.company_id
        where delivery.id = ${delivery.id} and delivery.status = 'processing'
          and campaign.deleted_at is null and campaign.status not in ('canceled', 'draft')
          and (delivery.channel <> 'push' or exists (
            select 1 from public.people person
            where person.id = delivery.person_id and person.company_id = delivery.company_id
              and person.deleted_at is null and person.is_active = true and person.status <> 'inactive'
          ))
          and not exists (
            select 1 from public.notification_channel_preferences preference
            where preference.company_id = delivery.company_id and preference.person_id = delivery.person_id
              and preference.channel = delivery.channel and preference.opted_out = true
          )
        limit 1
      `
      if (!activeRows[0]) {
        await sql`update public.notification_deliveries set status = 'canceled', locked_at = null, updated_at = now()
          where id = ${delivery.id} and status = 'processing'`
        return
      }
      const campaign = await campaignText(delivery.notification_id)
      const result = await sendDelivery(delivery, campaign)
      await sql`
        update public.notification_deliveries
        set status = 'sent', provider_id = ${result.providerId}, response_status = ${result.responseStatus},
            sent_at = now(), delivered_at = null, last_error = null, locked_at = null, updated_at = now()
        where id = ${delivery.id} and status = 'processing'
      `
      sent += 1
    } catch (error) {
      const state = await markFailure(delivery, error)
      if (state === "dead") dead += 1
      else failed += 1
    }
  }

  if (claimed.every((delivery) => delivery.channel === "push")) {
    // Bound concurrency and avoid one slow device delaying every other push.
    for (let offset = 0; offset < claimed.length; offset += 5) {
      await Promise.all(claimed.slice(offset, offset + 5).map(processClaimedDelivery))
    }
  } else {
    for (const delivery of claimed) await processClaimedDelivery(delivery)
  }
  for (const campaignId of new Set(claimed.map((delivery) => delivery.notification_id))) {
    await refreshCampaignStatus(campaignId)
  }

  return { processed: claimed.length, sent, failed, dead }
}

export async function retryNotificationDelivery(deliveryId: string, companyId: string) {
  const rows = await getSql()<{ id: string; notification_id: string }[]>`
    update public.notification_deliveries
    set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, locked_at = null, updated_at = now()
    where id = ${deliveryId}
      and company_id = ${companyId}
      and status in ('failed', 'dead')
      and exists (select 1 from public.notifications campaign where campaign.id = notification_deliveries.notification_id
        and campaign.company_id = ${companyId} and campaign.deleted_at is null and campaign.status not in ('canceled', 'draft'))
    returning id, notification_id
  `
  return rows[0] ?? null
}

export async function prepareImmediatePush(notificationId: string, companyId: string) {
  return getSql().begin(async (tx) => {
    const campaigns = await tx<{ id: string; status: string }[]>`
      select id, status from public.notifications
      where id = ${notificationId} and company_id = ${companyId}
        and method = 'push' and deleted_at is null and status not in ('canceled', 'draft')
      for update
    `
    const campaign = campaigns[0]
    if (!campaign) throw new Error("Campanha push não encontrada ou cancelada")
    // Only an explicitly repeated, finished campaign may resend successful deliveries.
    const deliveries = await tx<{ id: string }[]>`
      update public.notification_deliveries
      set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null,
          provider_id = null, response_status = null, sent_at = null, delivered_at = null,
          locked_at = null, updated_at = now()
      where notification_id = ${notificationId} and company_id = ${companyId} and channel = 'push'
        and (status in ('pending', 'failed', 'dead') or (status = 'sent' and ${campaign.status} = 'completed'))
      returning id
    `
    if (deliveries.length) {
      await tx`
        update public.notifications set status = 'queued', scheduled_send = false, scheduled_at = null,
          completed_at = null, updated_at = now()
        where id = ${notificationId} and company_id = ${companyId}
      `
    }
    return deliveries.length
  })
}
