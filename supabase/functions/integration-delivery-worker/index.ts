import "jsr:@supabase/functions-js/edge-runtime.d.ts"

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

type OutboxRow = {
  id: string
  company_id: string
  endpoint_id: string
  event_type: string
  event_key: string
  payload: Record<string, unknown>
  status: string
  attempts: number
}

type EndpointRow = {
  id: string
  url: string
  secret: string
  is_active: boolean
  deleted_at: string | null
}

const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "")
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const workerSecret = Deno.env.get("INTEGRATION_WORKER_SECRET") ?? ""

const BACKOFF_MINUTES = [1, 5, 15, 60, 120, 360, 720, 1440]
const MAX_ATTEMPTS = 8
const FETCH_TIMEOUT_MS = 10_000

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function restHeaders(extra: HeadersInit = {}) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: restHeaders(init.headers),
  })
  return response
}

async function rpcClaim(batchSize: number): Promise<OutboxRow[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_integration_delivery_batch`, {
    method: "POST",
    headers: restHeaders(),
    body: JSON.stringify({ batch_size: batchSize }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`claim failed: ${response.status} ${text}`)
  }
  const data = await response.json()
  return Array.isArray(data) ? (data as OutboxRow[]) : []
}

async function patchOutbox(id: string, patch: Record<string, unknown>) {
  const response = await rest(`integration_delivery_outbox?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`patch outbox failed: ${response.status} ${text}`)
  }
}

async function loadEndpoint(id: string): Promise<EndpointRow | null> {
  const response = await rest(
    `integration_webhook_endpoints?id=eq.${encodeURIComponent(id)}&select=id,url,secret,is_active,deleted_at`,
    { method: "GET", headers: { Accept: "application/json" } },
  )
  if (!response.ok) return null
  const rows = (await response.json()) as EndpointRow[]
  return rows[0] ?? null
}

function signWebhookBody(secret: string, timestamp: string, rawBody: string) {
  // SubtleCrypto HMAC-SHA256
  return crypto.subtle
    .importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    .then(async (key) => {
      const sig = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${timestamp}.${rawBody}`),
      )
      const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
      return `sha256=${hex}`
    })
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (host === "localhost" || host === "0.0.0.0" || host === "::" || host === "::1" || host === "metadata.google.internal" || host === "metadata.google") return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const parts = m.slice(1).map(Number)
    if (parts.some((part) => part > 255)) return true
    const [a, b] = parts
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (!host.includes(":")) return false
  const dottedMapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dottedMapped?.[1]) return isPrivateHost(dottedMapped[1])
  const halves = host.split("::")
  if (halves.length > 2) return false
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return false
  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((part) => Number.parseInt(part, 16))
  if (parts.length !== 8 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return false
  if (parts.every((part) => part === 0) || (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)) return true
  if ((parts[0] & 0xfe00) === 0xfc00 || (parts[0] & 0xffc0) === 0xfe80) return true
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    return isPrivateHost(`${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`)
  }
  return false
}

function assertSafeWebhookUrl(urlString: string) {
  const url = new URL(urlString)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Protocolo de webhook não suportado")
  }
  if (url.protocol !== "https:" && Deno.env.get("INTEGRATION_WEBHOOK_HTTPS_ONLY") !== "0") {
    throw new Error("Webhook deve usar HTTPS")
  }
  if (url.username || url.password) {
    throw new Error("URL de webhook não pode conter credenciais")
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("URL de webhook não pode apontar para rede privada")
  }
  return url
}

async function assertResolvableSafeWebhookUrl(urlString: string) {
  const url = assertSafeWebhookUrl(urlString)
  if (/^[^:]+$/.test(url.hostname)) {
    const resolveDns = (
      Deno as unknown as {
        resolveDns?: (hostname: string, recordType: "A" | "AAAA") => Promise<string[]>
      }
    ).resolveDns
    if (typeof resolveDns !== "function") return url
    const records: string[] = (
      await Promise.all(
        (["A", "AAAA"] as const).map(async (recordType) => {
          try {
            return await resolveDns(url.hostname, recordType)
          } catch {
            return []
          }
        }),
      )
    ).flat()
    if (records.length === 0 || records.some((address) => isPrivateHost(address))) {
      throw new Error("URL de webhook resolve para rede privada ou não pôde ser validada")
    }
  }
  return url
}

function backoffMinutes(attempts: number) {
  return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1440
}

async function markFailed(row: OutboxRow, lastError: string, responseStatus: number | null) {
  if (row.attempts >= MAX_ATTEMPTS) {
    await patchOutbox(row.id, {
      status: "dead",
      last_error: lastError,
      response_status: responseStatus,
      updated_at: new Date().toISOString(),
    })
    return
  }
  const minutes = backoffMinutes(row.attempts)
  await patchOutbox(row.id, {
    status: "failed",
    last_error: lastError,
    response_status: responseStatus,
    next_attempt_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  })
}

async function processBatch(batchSize: number) {
  const claimed = await rpcClaim(batchSize)
  let sent = 0
  let failed = 0

  for (const row of claimed) {
    const endpoint = await loadEndpoint(row.endpoint_id)
    if (!endpoint || !endpoint.is_active || endpoint.deleted_at) {
      await patchOutbox(row.id, {
        status: "dead",
        last_error: "Endpoint inativo ou removido",
        updated_at: new Date().toISOString(),
      })
      failed += 1
      continue
    }

    try {
      await assertResolvableSafeWebhookUrl(endpoint.url)
      const rawBody = JSON.stringify(row.payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = await signWebhookBody(endpoint.secret, timestamp, rawBody)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(endpoint.url, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "AltarChurch-Webhooks/1.0",
            "X-Altar-Event": row.event_type,
            "X-Altar-Delivery-Id": row.id,
            "X-Altar-Timestamp": timestamp,
            "X-Altar-Signature": signature,
          },
          body: rawBody,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) {
        await patchOutbox(row.id, {
          status: "sent",
          response_status: response.status,
          last_error: null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        sent += 1
      } else {
        const bodyPreview = (await response.text().catch(() => "")).slice(0, 300)
        await markFailed(row, `HTTP ${response.status}: ${bodyPreview}`, response.status)
        failed += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no envio"
      await markFailed(row, message, null)
      failed += 1
    }
  }

  return { processed: claimed.length, sent, failed }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: { message: "Method not allowed" } }, 405)
  }

  if (!supabaseUrl || !serviceRole) {
    return json({ error: { message: "Supabase env ausente" } }, 500)
  }

  const provided =
    request.headers.get("x-integration-worker-secret") ??
    request.headers.get("X-Integration-Worker-Secret")
  if (!workerSecret || provided !== workerSecret) {
    return json({ error: { message: "Não autorizado" } }, 401)
  }

  try {
    const body = await request.json().catch(() => ({})) as { batchSize?: number }
    const batchSize = Number(body.batchSize ?? 25)
    const result = await processBatch(Number.isFinite(batchSize) ? batchSize : 25)
    return json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no worker"
    return json({ error: { message } }, 500)
  }
})
