import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import webpush from "npm:web-push@3.6.7"

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type Delivery = {
  id: string
  company_id: string
  volunteer_id: string
  channel: "whatsapp" | "email" | "push"
  recipient: string
  subject: string
  content: string
  attempts: number
  payload: Record<string, unknown>
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const workerSecret = Deno.env.get("VOLUNTEER_WORKER_SECRET") ?? ""
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? ""
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? ""
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? ""
const vapidPublicKey = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? ""
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? ""

function headers(extra: HeadersInit = {}) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character)
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: headers(init.headers) })
  if (!response.ok) throw new Error(`Banco recusou entrega: ${response.status}`)
  return response
}

async function updateDelivery(id: string, patch: Record<string, unknown>) {
  await rest(`volunteer_delivery_outbox?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  })
}

type UazapiCredential = { base_url: string; instance_token: string }
const uazapiCredentials = new Map<string, UazapiCredential>()

async function getUazapiCredential(companyId: string) {
  const cached = uazapiCredentials.get(companyId)
  if (cached) return cached
  const response = await rest("rpc/get_company_uazapi_credential", {
    method: "POST",
    body: JSON.stringify({ p_company_id: companyId }),
  })
  const rows = await response.json() as UazapiCredential[]
  const credential = rows[0]
  if (!credential?.base_url || !credential.instance_token) {
    throw new Error("Igreja sem instância Uazapi conectada")
  }
  credential.base_url = credential.base_url.replace(/\/$/, "")
  uazapiCredentials.set(companyId, credential)
  return credential
}

function retryAt(attempt: number) {
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempt - 1))
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function sendWhatsApp(delivery: Delivery) {
  const credential = await getUazapiCredential(delivery.company_id)
  const response = await fetch(`${credential.base_url}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: credential.instance_token },
    body: JSON.stringify({
      number: delivery.recipient.replace(/\D/g, ""),
      text: delivery.content,
      async: true,
      track_source: "altar_church_volunteers",
      track_id: delivery.id,
      linkPreview: true,
    }),
  })
  if (!response.ok) throw new Error(`Uazapi recusou envio: ${response.status}`)
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  return String(payload.id ?? payload.messageId ?? payload.key ?? "")
}

async function sendEmail(delivery: Delivery) {
  if (!resendApiKey || !resendFrom) throw new Error("Resend não configurado")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `volunteer-delivery/${delivery.id}`,
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [delivery.recipient],
      subject: delivery.subject,
      text: delivery.content,
      html: `<p>${escapeHtml(delivery.content).replace(/\n/g, "<br>")}</p>`,
    }),
  })
  if (!response.ok) throw new Error(`Resend recusou envio: ${response.status}`)
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  return String(payload.id ?? "")
}

async function sendPush(delivery: Delivery) {
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) throw new Error("Web Push não configurado")
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const response = await rest(`volunteer_push_subscriptions?volunteer_id=eq.${encodeURIComponent(delivery.volunteer_id)}&is_active=eq.true&select=id,endpoint,p256dh,auth_key`)
  const subscriptions = await response.json() as { id: string; endpoint: string; p256dh: string; auth_key: string }[]
  if (subscriptions.length === 0) throw new Error("Sem dispositivo push ativo")
  const payload = JSON.stringify({ title: delivery.subject, body: delivery.content, url: "/voluntariado", ...delivery.payload })
  let delivered = 0
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } }, payload, { TTL: 3600, urgency: "high" })
      delivered += 1
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await rest(`volunteer_push_subscriptions?id=eq.${encodeURIComponent(subscription.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_active: false }) })
      }
    }
  }
  if (delivered === 0) throw new Error("Push não entregue")
  return `web-push:${delivered}`
}

async function processDelivery(delivery: Delivery) {
  try {
    const providerId = delivery.channel === "whatsapp" ? await sendWhatsApp(delivery)
      : delivery.channel === "email" ? await sendEmail(delivery) : await sendPush(delivery)
    await updateDelivery(delivery.id, {
      status: delivery.channel === "whatsapp" ? "queued" : "sent",
      provider_id: providerId || null,
      sent_at: new Date().toISOString(),
      locked_at: null,
      last_error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha de entrega"
    await updateDelivery(delivery.id, {
      status: delivery.attempts >= 8 ? "failed" : "pending",
      next_attempt_at: retryAt(delivery.attempts),
      locked_at: null,
      last_error: message,
    })
  }
}

async function reconcileWhatsApp() {
  const response = await rest("volunteer_delivery_outbox?channel=eq.whatsapp&status=eq.queued&select=id,company_id&limit=25")
  const deliveries = await response.json() as { id: string; company_id: string }[]
  for (const delivery of deliveries) {
    let credential: UazapiCredential
    try {
      credential = await getUazapiCredential(delivery.company_id)
    } catch {
      continue
    }
    const lookup = await fetch(`${credential.base_url}/message/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: credential.instance_token },
      body: JSON.stringify({
        track_source: "altar_church_volunteers",
        track_id: delivery.id,
        limit: 1,
      }),
    })
    if (!lookup.ok) continue
    const payload = await lookup.json().catch(() => ({})) as { messages?: Record<string, unknown>[] }
    const message = payload.messages?.[0]
    const status = String(message?.status ?? "").toLowerCase()
    if (["delivered", "read"].includes(status)) await updateDelivery(delivery.id, { status: "delivered", delivered_at: new Date().toISOString() })
    if (["failed", "canceled"].includes(status)) await updateDelivery(delivery.id, { status: "pending", next_attempt_at: retryAt(1), last_error: status })
  }
}

Deno.serve(async (request: Request) => {
  if (!workerSecret || request.headers.get("x-volunteer-worker-secret") !== workerSecret) {
    return new Response("Não autorizado", { status: 401 })
  }
  if (!supabaseUrl || !serviceRole) return new Response("Supabase não configurado", { status: 500 })
  try {
    await reconcileWhatsApp()
    await rest("rpc/prepare_volunteer_delivery", { method: "POST", body: "{}" })
    const response = await rest("rpc/claim_volunteer_delivery_batch", {
      method: "POST",
      body: JSON.stringify({ batch_size: 25 }),
    })
    const deliveries = await response.json() as Delivery[]
    await Promise.all(deliveries.map(processDelivery))
    return Response.json({ processed: deliveries.length })
  } catch {
    return new Response("Worker indisponível", { status: 500 })
  }
})
