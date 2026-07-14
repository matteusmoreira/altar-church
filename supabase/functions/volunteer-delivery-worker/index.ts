import "jsr:@supabase/functions-js/edge-runtime.d.ts"

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type Delivery = {
  id: string
  channel: "whatsapp" | "email"
  recipient: string
  subject: string
  content: string
  attempts: number
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const workerSecret = Deno.env.get("VOLUNTEER_WORKER_SECRET") ?? ""
const uazapiBaseUrl = Deno.env.get("UAZAPI_BASE_URL")?.replace(/\/$/, "") ?? ""
const uazapiToken = Deno.env.get("UAZAPI_INSTANCE_TOKEN") ?? ""
const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? ""
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") ?? ""

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

function retryAt(attempt: number) {
  const minutes = Math.min(360, 5 * 2 ** Math.max(0, attempt - 1))
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function sendWhatsApp(delivery: Delivery) {
  if (!uazapiBaseUrl || !uazapiToken) throw new Error("Uazapi não configurada")
  const response = await fetch(`${uazapiBaseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: uazapiToken },
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

async function processDelivery(delivery: Delivery) {
  try {
    const providerId = delivery.channel === "whatsapp" ? await sendWhatsApp(delivery) : await sendEmail(delivery)
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
  if (!uazapiBaseUrl || !uazapiToken) return
  const response = await rest("volunteer_delivery_outbox?channel=eq.whatsapp&status=eq.queued&select=id&limit=25")
  const deliveries = await response.json() as { id: string }[]
  for (const delivery of deliveries) {
    const url = new URL(`${uazapiBaseUrl}/message/find`)
    url.searchParams.set("track_source", "altar_church_volunteers")
    url.searchParams.set("track_id", delivery.id)
    url.searchParams.set("limit", "1")
    const lookup = await fetch(url, { headers: { token: uazapiToken } })
    if (!lookup.ok) continue
    const payload = await lookup.json().catch(() => []) as unknown
    const message = Array.isArray(payload) ? payload[0] as Record<string, unknown> | undefined : undefined
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
