import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { buildUazapiPayload, directMediaTypeMatches, parseDirectMessageConfig, renderDirectMessage } from "./direct-message"
import type { FormDirectMessage } from "./types"

type Queryable = ReturnType<typeof getSql>

type DeliveryRow = {
  id: string
  company_id: string
  form_id: string
  submission_id: string
  person_id: string | null
  uazapi_instance_id: string | null
  recipient: string
  recipient_name: string
  message_type: "text" | "button" | "list" | "carousel"
  message_snapshot: unknown
  attempts: number
}

type ProviderResult = { providerId: string; responseStatus: number }

const BACKOFF_MINUTES = [1, 5, 15, 60, 120, 360, 720, 1440]
const MAX_ATTEMPTS = 8
const FETCH_TIMEOUT_MS = 15_000

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

function mediaIds(message: FormDirectMessage) {
  if (message.type !== "carousel") return []
  return [...new Set(message.cards.map((card) => card.mediaFileId).filter(Boolean))] as string[]
}

async function getMediaUrls(sql: Queryable, delivery: DeliveryRow, message: FormDirectMessage) {
  const ids = mediaIds(message)
  if (ids.length === 0) return new Map<string, string>()

  const files = await sql<{ id: string; storage_path: string; mime_type: string }[]>`
    select id, storage_path, mime_type
    from public.app_files
    where company_id = ${delivery.company_id}
      and id = any(${sql.array(ids)}::uuid[])
      and bucket = 'church-assets'
      and entity_table = 'forms'
      and entity_id = ${delivery.form_id}
      and purpose = 'whatsapp-media'
      and is_active = true
      and deleted_at is null
  `
  if (files.length !== ids.length) throw new Error("MÃ­dia do carrossel nÃ£o encontrada")

  if (message.type === "carousel") {
    const mimeById = new Map(files.map((file) => [file.id, file.mime_type]))
    for (const card of message.cards) {
      if (!card.mediaFileId || !card.mediaType || !directMediaTypeMatches(card.mediaType, mimeById.get(card.mediaFileId) ?? "")) {
        throw new Error("O tipo da mÃƒÂ­dia do carrossel nÃƒÂ£o corresponde ao arquivo enviado")
      }
    }
  }

  const signed = await createSignedUrlsByStoragePath(files.map((file) => file.storage_path), 3600)
  const urls = new Map<string, string>()
  for (const file of files) {
    const url = signed.get(file.storage_path)
    if (!url) throw new Error("NÃ£o foi possÃ­vel gerar a URL da mÃ­dia")
    urls.set(file.id, url)
  }
  return urls
}

async function getCredential(sql: Queryable, companyId: string, instanceId: string) {
  const rows = await sql<{ base_url: string; instance_token: string }[]>`
    select base_url, instance_token
    from public.get_uazapi_instance_credential(${companyId}, ${instanceId})
  `
  const credential = rows[0]
  if (!credential?.base_url || !credential.instance_token) {
    throw new Error("InstÃ¢ncia UAZAPI desconectada ou removida")
  }
  return { baseUrl: credential.base_url.replace(/\/$/, ""), token: credential.instance_token }
}

async function sendDelivery(sql: Queryable, delivery: DeliveryRow): Promise<ProviderResult> {
  if (!delivery.recipient) throw new Error("FormulÃ¡rio sem telefone para envio")
  if (!delivery.uazapi_instance_id) throw new Error("FormulÃ¡rio sem instÃ¢ncia UAZAPI selecionada")

  const message = parseDirectMessageConfig(delivery.message_snapshot)
  if (!message) throw new Error("Mensagem direta invÃ¡lida ou nÃ£o configurada")
  const mediaUrls = await getMediaUrls(sql, delivery, message)
  const request = buildUazapiPayload(message, {
    number: delivery.recipient,
    trackId: delivery.id,
    mediaUrls,
  })
  const credential = await getCredential(sql, delivery.company_id, delivery.uazapi_instance_id)
  const response = await fetchWithTimeout(`${credential.baseUrl}${request.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: credential.token },
    body: JSON.stringify(request.body),
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const messageText = typeof payload.message === "string" ? payload.message : typeof payload.error === "string" ? payload.error : ""
    throw new Error(`UAZAPI recusou envio: ${response.status}${messageText ? ` ${messageText}` : ""}`)
  }
  return {
    providerId: String(payload.id ?? payload.messageId ?? payload.key ?? payload.message ?? ""),
    responseStatus: response.status,
  }
}

async function markFailure(sql: Queryable, delivery: DeliveryRow, error: unknown) {
  const message = error instanceof Error ? error.message : "Falha no envio"
  if (delivery.attempts >= MAX_ATTEMPTS) {
    await sql`
      update public.form_whatsapp_deliveries
      set status = 'dead', last_error = ${message}, locked_at = null, updated_at = now()
      where id = ${delivery.id}
    `
    return "dead" as const
  }

  const delay = retryDelayMinutes(delivery.attempts)
  await sql`
    update public.form_whatsapp_deliveries
    set status = 'failed',
        last_error = ${message},
        next_attempt_at = now() + (${delay}::text || ' minutes')::interval,
        locked_at = null,
        updated_at = now()
    where id = ${delivery.id}
  `
  return "failed" as const
}

export async function enqueueFormWhatsappDelivery(input: {
  companyId: string
  formId: string
  submissionId: string
  personId: string | null
  instanceId: string | null
  recipient: string
  recipientName: string
  message: unknown
  templateFields: Record<string, unknown>
}) {
  const sql = getSql()
  const messageConfig = parseDirectMessageConfig(input.message)
  let snapshot: FormDirectMessage | null = null
  let errorMessage: string | null = null

  if (!messageConfig) {
    errorMessage = "Mensagem direta invÃ¡lida ou nÃ£o configurada"
  } else {
    try {
      snapshot = renderDirectMessage(messageConfig, input.templateFields)
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "NÃ£o foi possÃ­vel preencher a mensagem"
    }
  }

  if (!input.recipient) errorMessage = "FormulÃ¡rio sem telefone para envio"
  if (!input.instanceId) errorMessage = errorMessage ?? "FormulÃ¡rio sem instÃ¢ncia UAZAPI selecionada"

  const messageType = snapshot?.type ?? messageConfig?.type ?? "text"
  await sql`
    insert into public.form_whatsapp_deliveries (
      company_id, form_id, submission_id, person_id, uazapi_instance_id,
      recipient, recipient_name, message_type, message_snapshot,
      status, next_attempt_at, last_error, delivery_key
    )
    values (
      ${input.companyId}, ${input.formId}, ${input.submissionId}, ${input.personId}, ${input.instanceId},
      ${input.recipient}, ${input.recipientName}, ${messageType}, ${JSON.stringify(snapshot ?? messageConfig ?? {})}::jsonb,
      ${errorMessage ? "dead" : "pending"}, now(), ${errorMessage}, ${`form_whatsapp:${input.submissionId}`}
    )
    on conflict (delivery_key) do nothing
  `
}

export async function processFormWhatsappOutbox(batchSize = 25) {
  const sql = getSql()
  const claimed = await sql<DeliveryRow[]>`
    select * from public.claim_form_whatsapp_delivery_batch(${batchSize})
  `
  let sent = 0
  let failed = 0
  let dead = 0

  for (const delivery of claimed) {
    try {
      const result = await sendDelivery(sql, delivery)
      await sql`
        update public.form_whatsapp_deliveries
        set status = 'sent', provider_id = ${result.providerId}, response_status = ${result.responseStatus},
            sent_at = now(), last_error = null, locked_at = null, updated_at = now()
        where id = ${delivery.id}
      `
      sent += 1
    } catch (error) {
      const state = await markFailure(sql, delivery, error)
      if (state === "dead") dead += 1
      else failed += 1
    }
  }

  return { processed: claimed.length, sent, failed, dead }
}

export async function retryFormWhatsappDelivery(deliveryId: string, companyId: string) {
  const rows = await getSql()<
    { id: string; form_id: string }[]
  >`
    update public.form_whatsapp_deliveries
    set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, locked_at = null, updated_at = now()
    where id = ${deliveryId}
      and company_id = ${companyId}
      and status in ('failed', 'dead')
    returning id, form_id
  `
  return rows[0] ?? null
}
