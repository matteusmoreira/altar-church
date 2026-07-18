import "server-only"

import { getSql } from "@/lib/db/client"
import { jsonbParam } from "@/lib/db/jsonb"

const BACKOFF_MINUTES = [1, 5, 15, 60, 120, 360, 720, 1440]
const MAX_ATTEMPTS = 8
const UAZAPI_TRACK_SOURCE = "altar_church_kids"

// ---------------------------------------------------------------------------
// Templates (puros — nunca incluem saúde, PIN ou token)
// ---------------------------------------------------------------------------

export type KidTemplateKind = "checkin" | "checkout" | "guardian_call" | "lesson_report"

export interface KidTemplateVars {
  childName?: string
  classroomName?: string
  sessionTitle?: string
  companyName?: string
  reason?: string
  reportTitle?: string
  time?: string
}

export function renderKidTemplate(kind: KidTemplateKind, vars: KidTemplateVars): { subject: string; body: string } {
  const child = vars.childName ?? "seu filho(a)"
  const room = vars.classroomName ?? "sala Kids"
  const session = vars.sessionTitle ? ` (${vars.sessionTitle})` : ""
  const time = vars.time ?? ""
  const company = vars.companyName ?? "Igreja"

  switch (kind) {
    case "checkin":
      return {
        subject: `Check-in confirmado · ${child}`,
        body: `✅ ${child} entrou na sala ${room}${session} às ${time}. — ${company} Kids`,
      }
    case "checkout":
      return {
        subject: `Retirada confirmada · ${child}`,
        body: `👋 ${child} foi retirado(a) da sala ${room} às ${time}. — ${company} Kids`,
      }
    case "guardian_call":
      return {
        subject: `Chamado Kids · ${child}`,
        body: `🔔 ${company} Kids: sua presença é necessária na sala ${room} para ${child}. Motivo: ${vars.reason ?? "chamado da sala"}.`,
      }
    case "lesson_report":
      return {
        subject: `Relatório da aula · ${vars.reportTitle ?? ""}`,
        body: `📘 Relatório da aula — ${vars.reportTitle ?? ""} (${room}). Veja detalhes no Portal da Família. — ${company} Kids`,
      }
  }
}

// ---------------------------------------------------------------------------
// Preferências e canais (puros, testáveis)
// ---------------------------------------------------------------------------

export function normalizePhoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "")
}

export function canSendWhatsApp(input: { whatsappEnabled: boolean; phone: string | null }): boolean {
  return input.whatsappEnabled && normalizePhoneDigits(input.phone).length >= 10
}

export function canSendEmail(input: { emailEnabled: boolean; email: string | null }): boolean {
  return input.emailEnabled && Boolean(input.email && input.email.includes("@"))
}

export function nextBackoffMinutes(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1)
  return BACKOFF_MINUTES[index]
}

// ---------------------------------------------------------------------------
// Destinatários e fan-out
// ---------------------------------------------------------------------------

interface GuardianRecipient {
  guardianId: string
  name: string
  phone: string
  email: string | null
  whatsappEnabled: boolean
  emailEnabled: boolean
}

async function resolveGuardiansForKid(companyId: string, kidId: string): Promise<GuardianRecipient[]> {
  const sql = getSql()
  const rows = await sql<{
    guardian_id: string
    full_name: string
    phone: string
    email: string | null
    whatsapp_enabled: boolean
    email_enabled: boolean
  }[]>`
    select
      guardian.id as guardian_id,
      person.full_name,
      person.phone,
      person.email,
      guardian.whatsapp_enabled,
      guardian.email_enabled
    from public.kid_guardians guardian
    join public.people person on person.id = guardian.person_id and person.deleted_at is null
    where guardian.company_id = ${companyId}
      and guardian.kid_id = ${kidId}
      and guardian.deleted_at is null
  `
  return rows.map((row) => ({
    guardianId: row.guardian_id,
    name: row.full_name,
    phone: row.phone ?? "",
    email: row.email,
    whatsappEnabled: row.whatsapp_enabled,
    emailEnabled: row.email_enabled,
  }))
}

async function hasCommunicationConsent(companyId: string, kidId: string): Promise<boolean> {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select id from public.kid_consents
    where company_id = ${companyId} and kid_id = ${kidId} and consent_type = 'communication' and status = 'granted'
    limit 1
  `
  return Boolean(rows[0]?.id)
}

interface FanOutInput {
  companyId: string
  messageId: string | null
  kidIds: string[]
  channel: "whatsapp" | "email" | "both"
  subject: string
  body: string
  idempotencyPrefix: string
  requireCommunicationConsent: boolean
}

/** Cria linhas de outbox por responsável/canal respeitando preferências; idempotente por chave. */
async function fanOutToGuardians(input: FanOutInput): Promise<number> {
  const sql = getSql()
  let enqueued = 0
  for (const kidId of input.kidIds) {
    if (input.requireCommunicationConsent && !(await hasCommunicationConsent(input.companyId, kidId))) {
      continue
    }
    const guardians = await resolveGuardiansForKid(input.companyId, kidId)
    for (const guardian of guardians) {
      const channels: ("whatsapp" | "email")[] = []
      if (["whatsapp", "both"].includes(input.channel) && canSendWhatsApp(guardian)) channels.push("whatsapp")
      if (["email", "both"].includes(input.channel) && canSendEmail(guardian)) channels.push("email")
      for (const channel of channels) {
        // Fallback: WhatsApp falha definitiva tenta email somente quando autorizado.
        const fallbackEmail = channel === "whatsapp" && canSendEmail(guardian) ? guardian.email : null
        const key = `${input.idempotencyPrefix}:${guardian.guardianId}:${channel}`
        const inserted = await sql<{ id: string }[]>`
          insert into public.kid_delivery_outbox (
            company_id, message_id, channel, recipient, subject, body, idempotency_key, fallback_email
          )
          values (
            ${input.companyId}, ${input.messageId}, ${channel},
            ${channel === "whatsapp" ? normalizePhoneDigits(guardian.phone) : guardian.email},
            ${input.subject}, ${input.body}, ${key}, ${fallbackEmail}
          )
          on conflict (company_id, idempotency_key) do nothing
          returning id
        `
        if (inserted[0]?.id) enqueued += 1
      }
    }
  }
  return enqueued
}

// ---------------------------------------------------------------------------
// Mensagens operacionais (entrada, saída, chamado urgente, relatório de aula)
// ---------------------------------------------------------------------------

export async function enqueueOperationalMessage(input: {
  companyId: string
  kind: KidTemplateKind
  kidId: string
  sessionId: string | null
  attendanceId: string | null
  vars: KidTemplateVars
  createdBy?: string | null
}): Promise<{ enqueued: number }> {
  const sql = getSql()
  const companyRows = await sql<{ name: string }[]>`
    select name from public.companies where id = ${input.companyId} limit 1
  `
  const { subject, body } = renderKidTemplate(input.kind, {
    ...input.vars,
    companyName: companyRows[0]?.name ?? "Igreja",
  })

  const messageRows = await sql<{ id: string }[]>`
    insert into public.kid_messages (company_id, session_id, kid_id, audience, channel, subject, body, status, created_by, updated_by)
    values (${input.companyId}, ${input.sessionId}, ${input.kidId}, 'guardian', 'internal', ${subject}, ${body}, 'queued', ${input.createdBy ?? null}, ${input.createdBy ?? null})
    returning id
  `
  const messageId = messageRows[0]?.id ?? null

  const enqueued = await fanOutToGuardians({
    companyId: input.companyId,
    messageId,
    kidIds: [input.kidId],
    channel: "both",
    subject,
    body,
    idempotencyPrefix: `${input.kind}:${input.attendanceId ?? input.kidId}`,
    requireCommunicationConsent: false,
  })
  return { enqueued }
}

/** Relatório de aula compartilhado: individual (kidId) ou coletivo (sala/sessão). */
export async function enqueueLessonReportNotification(input: {
  companyId: string
  reportId: string
  sessionId: string
  sessionClassroomId: string | null
  kidId: string | null
  classroomName: string
  reportTitle: string
  createdBy?: string | null
}): Promise<{ enqueued: number }> {
  const sql = getSql()
  const companyRows = await sql<{ name: string }[]>`
    select name from public.companies where id = ${input.companyId} limit 1
  `
  const { subject, body } = renderKidTemplate("lesson_report", {
    classroomName: input.classroomName,
    reportTitle: input.reportTitle,
    companyName: companyRows[0]?.name ?? "Igreja",
  })

  const messageRows = await sql<{ id: string }[]>`
    insert into public.kid_messages (company_id, session_id, kid_id, audience, channel, subject, body, status, created_by, updated_by)
    values (
      ${input.companyId}, ${input.sessionId}, ${input.kidId},
      ${input.kidId ? "guardian" : "classroom"}, 'internal', ${subject}, ${body}, 'queued',
      ${input.createdBy ?? null}, ${input.createdBy ?? null}
    )
    returning id
  `
  const messageId = messageRows[0]?.id ?? null

  let kidIds: string[] = []
  if (input.kidId) {
    kidIds = [input.kidId]
  } else if (input.sessionClassroomId) {
    const rows = await sql<{ kid_id: string }[]>`
      select distinct kid_id from public.kid_attendances
      where company_id = ${input.companyId} and session_classroom_id = ${input.sessionClassroomId}
        and status in ('checked_in', 'checkout_requested', 'checked_out')
    `
    kidIds = rows.map((row) => row.kid_id)
  } else {
    const rows = await sql<{ kid_id: string }[]>`
      select distinct kid_id from public.kid_attendances
      where company_id = ${input.companyId} and session_id = ${input.sessionId}
    `
    kidIds = rows.map((row) => row.kid_id)
  }

  const enqueued = await fanOutToGuardians({
    companyId: input.companyId,
    messageId,
    kidIds,
    channel: "both",
    subject,
    body,
    idempotencyPrefix: `lesson_report:${input.reportId}`,
    requireCommunicationConsent: false,
  })
  return { enqueued }
}

// ---------------------------------------------------------------------------
// Campanhas segmentadas
// ---------------------------------------------------------------------------

export interface KidCampaignSegment {
  congregationId?: string | null
  classroomId?: string | null
  minAgeMonths?: number | null
  maxAgeMonths?: number | null
  kidId?: string | null
}

/** Resolve crianças do segmento (congregação + sala + idade combinados com AND). */
export async function resolveSegmentKidIds(companyId: string, segment: KidCampaignSegment): Promise<string[]> {
  const sql = getSql()
  if (segment.kidId) return [segment.kidId]

  const minBirth = segment.maxAgeMonths != null
    ? new Date(Date.now() - (segment.maxAgeMonths + 1) * 30.44 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : null
  const maxBirth = segment.minAgeMonths != null
    ? new Date(Date.now() - segment.minAgeMonths * 30.44 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : null

  const rows = await sql<{ kid_id: string }[]>`
    select distinct kid.id as kid_id
    from public.kid_profiles kid
    join public.people person on person.id = kid.person_id and person.deleted_at is null
    where kid.company_id = ${companyId}
      and kid.deleted_at is null
      and kid.status = 'active'
      and (${segment.congregationId ?? null}::uuid is null or person.congregation_id = ${segment.congregationId ?? null})
      and (${minBirth}::date is null or person.birth_date >= ${minBirth})
      and (${maxBirth}::date is null or person.birth_date <= ${maxBirth})
      and (
        ${segment.classroomId ?? null}::uuid is null
        or exists (
          select 1 from public.kid_attendances attendance
          join public.kid_session_classrooms sc on sc.id = attendance.session_classroom_id
          where attendance.kid_id = kid.id
            and sc.classroom_id = ${segment.classroomId ?? null}
            and attendance.checked_in_at > now() - interval '90 days'
        )
      )
  `
  return rows.map((row) => row.kid_id)
}

export async function enqueueCampaignMessage(input: {
  companyId: string
  channel: "whatsapp" | "email"
  subject: string
  body: string
  segment: KidCampaignSegment
  sessionId?: string | null
  createdBy: string
}): Promise<{ messageId: string; enqueued: number }> {
  const sql = getSql()
  const messageRows = await sql<{ id: string }[]>`
    insert into public.kid_messages (
      company_id, session_id, kid_id, audience, channel, subject, body, segment, status, created_by, updated_by
    )
    values (
      ${input.companyId}, ${input.sessionId ?? null}, ${input.segment.kidId ?? null},
      ${input.segment.kidId ? "guardian" : "segment"}, ${input.channel}, ${input.subject}, ${input.body},
      ${jsonbParam(sql, input.segment)}, 'queued', ${input.createdBy}, ${input.createdBy}
    )
    returning id
  `
  const messageId = messageRows[0]?.id
  if (!messageId) throw new Error("Mensagem não foi criada")

  const kidIds = await resolveSegmentKidIds(input.companyId, input.segment)
  const enqueued = await fanOutToGuardians({
    companyId: input.companyId,
    messageId,
    kidIds,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    idempotencyPrefix: `campaign:${messageId}`,
    requireCommunicationConsent: true,
  })

  await sql`
    update public.kid_messages
    set status = ${enqueued > 0 ? "queued" : "cancelled"}, updated_at = now()
    where id = ${messageId}
  `
  return { messageId, enqueued }
}

// ---------------------------------------------------------------------------
// Envio (worker): Uazapi WhatsApp + Resend email
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function sendWhatsApp(recipient: string, body: string, trackId: string): Promise<string> {
  const baseUrl = (process.env.UAZAPI_BASE_URL ?? "").replace(/\/$/, "")
  const token = process.env.UAZAPI_INSTANCE_TOKEN ?? ""
  if (!baseUrl || !token) throw new Error("Uazapi não configurado (UAZAPI_BASE_URL/UAZAPI_INSTANCE_TOKEN)")

  const response = await fetch(`${baseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      number: recipient,
      text: body,
      async: true,
      track_source: UAZAPI_TRACK_SOURCE,
      track_id: trackId,
      linkPreview: false,
    }),
  })
  if (!response.ok) throw new Error(`Uazapi recusou envio: ${response.status}`)
  const payload = (await response.json()) as Record<string, unknown>
  return String(payload.id ?? payload.messageId ?? payload.key ?? "")
}

async function sendEmail(recipient: string, subject: string, body: string, deliveryId: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY ?? ""
  const from = process.env.RESEND_FROM_EMAIL ?? ""
  if (!apiKey || !from) throw new Error("Resend não configurado (RESEND_API_KEY/RESEND_FROM_EMAIL)")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `kids-delivery/${deliveryId}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject,
      text: body,
      html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    }),
  })
  if (!response.ok) throw new Error(`Resend recusou envio: ${response.status}`)
  const payload = (await response.json()) as { id?: string }
  return payload.id ?? ""
}

interface DeliveryRow {
  id: string
  company_id: string
  message_id: string | null
  channel: "whatsapp" | "email"
  recipient: string
  subject: string
  body: string
  idempotency_key: string
  fallback_email: string | null
  attempts: number
}

/** Falha definitiva do WhatsApp → fallback de email somente quando autorizado. */
async function enqueueEmailFallback(sql: ReturnType<typeof getSql>, row: DeliveryRow): Promise<void> {
  if (!row.fallback_email) return
  await sql`
    insert into public.kid_delivery_outbox (
      company_id, message_id, channel, recipient, subject, body, idempotency_key
    )
    values (
      ${row.company_id}, ${row.message_id}, 'email', ${row.fallback_email},
      ${row.subject}, ${row.body}, ${`${row.idempotency_key}:email-fallback`}
    )
    on conflict (company_id, idempotency_key) do nothing
  `
}

export async function processKidDeliveryOutbox(batchSize = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const sql = getSql()
  const rows = await sql<DeliveryRow[]>`
    select * from public.claim_kid_delivery_batch(${batchSize})
  `
  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      if (row.channel === "whatsapp") {
        const providerId = await sendWhatsApp(row.recipient, row.body, row.id)
        await sql`
          update public.kid_delivery_outbox
          set status = 'queued', provider_id = ${providerId || null}, last_error = null, updated_at = now()
          where id = ${row.id}
        `
      } else {
        const providerId = await sendEmail(row.recipient, row.subject, row.body, row.id)
        await sql`
          update public.kid_delivery_outbox
          set status = 'sent', provider_id = ${providerId || null}, sent_at = now(), last_error = null, updated_at = now()
          where id = ${row.id}
        `
      }
      sent += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : "Erro de envio"
      if (row.attempts >= MAX_ATTEMPTS) {
        await sql`
          update public.kid_delivery_outbox
          set status = 'failed', last_error = ${message}, updated_at = now()
          where id = ${row.id}
        `
        if (row.channel === "whatsapp") await enqueueEmailFallback(sql, row)
      } else {
        const backoff = nextBackoffMinutes(row.attempts)
        await sql`
          update public.kid_delivery_outbox
          set status = 'failed',
              last_error = ${message},
              next_attempt_at = now() + (${backoff}::text || ' minutes')::interval,
              updated_at = now()
          where id = ${row.id}
        `
      }
    }
  }

  return { processed: rows.length, sent, failed }
}

/** Reconcilia WhatsApp assíncrono (queued → delivered/failed) via consulta ao provedor. */
export async function reconcileKidWhatsApp(limit = 25): Promise<{ checked: number; delivered: number; failed: number }> {
  const baseUrl = (process.env.UAZAPI_BASE_URL ?? "").replace(/\/$/, "")
  const token = process.env.UAZAPI_INSTANCE_TOKEN ?? ""
  if (!baseUrl || !token) return { checked: 0, delivered: 0, failed: 0 }

  const sql = getSql()
  const rows = await sql<DeliveryRow[]>`
    select * from public.kid_delivery_outbox
    where channel = 'whatsapp'
      and status = 'queued'
      and updated_at < now() - interval '60 seconds'
    order by updated_at
    limit ${limit}
  `
  let delivered = 0
  let failed = 0

  for (const row of rows) {
    try {
      const response = await fetch(`${baseUrl}/message/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token },
        body: JSON.stringify({ track_source: UAZAPI_TRACK_SOURCE, track_id: row.id, limit: 1 }),
      })
      if (!response.ok) continue
      const payload = (await response.json()) as { messages?: { status?: string }[] }
      const status = String(payload.messages?.[0]?.status ?? "").toLowerCase()
      if (["delivered", "read"].includes(status)) {
        await sql`
          update public.kid_delivery_outbox
          set status = 'delivered', delivered_at = now(), updated_at = now()
          where id = ${row.id}
        `
        delivered += 1
      } else if (["failed", "canceled", "cancelled"].includes(status)) {
        await sql`
          update public.kid_delivery_outbox
          set status = 'failed', last_error = ${`provedor: ${status}`}, updated_at = now()
          where id = ${row.id}
        `
        await enqueueEmailFallback(sql, row)
        failed += 1
      }
    } catch {
      /* provedor instável: tenta na próxima reconciliação */
    }
  }

  return { checked: rows.length, delivered, failed }
}
