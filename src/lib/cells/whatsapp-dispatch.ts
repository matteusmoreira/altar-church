import { getSql } from "@/lib/db/client"
import { jsonbParam, parseJsonbObject } from "@/lib/db/jsonb"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { buildUazapiPayload, parseDirectMessageConfig, renderDirectMessage } from "@/lib/forms/direct-message"
import type { FormDirectMessage } from "@/lib/forms/types"

type Queryable = ReturnType<typeof getSql>

const FETCH_TIMEOUT_MS = 15_000

export function normalizePhoneForWhatsapp(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }
  return digits
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

async function getCredential(sql: Queryable, companyId: string, instanceId: string) {
  const rows = await sql<{ base_url: string; instance_token: string }[]>`
    select base_url, instance_token
    from public.get_uazapi_instance_credential(${companyId}, ${instanceId})
  `
  const credential = rows[0]
  if (!credential?.base_url || !credential.instance_token) {
    throw new Error("Instância UAZAPI desconectada ou removida")
  }
  return { baseUrl: credential.base_url.replace(/\/$/, ""), token: credential.instance_token }
}

async function getMediaUrls(sql: Queryable, companyId: string, message: FormDirectMessage) {
  if (message.type !== "carousel") return new Map<string, string>()
  const ids = [...new Set(message.cards.map((card) => card.mediaFileId).filter(Boolean))] as string[]
  if (ids.length === 0) return new Map<string, string>()

  const files = await sql<{ id: string; storage_path: string }[]>`
    select id, storage_path
    from public.app_files
    where company_id = ${companyId}
      and id = any(${sql.array(ids)}::uuid[])
      and bucket = 'church-assets'
      and is_active = true
      and deleted_at is null
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

export async function sendUazapiDirectMessage({
  sql,
  companyId,
  instanceId,
  recipient,
  message,
  variables,
  trackId,
}: {
  sql: Queryable
  companyId: string
  instanceId: string
  recipient: string
  message: FormDirectMessage
  variables: Record<string, unknown>
  trackId?: string
}) {
  const cleanPhone = normalizePhoneForWhatsapp(recipient)
  if (cleanPhone.length < 10) throw new Error("Telefone destinatário inválido")

  const rendered = renderDirectMessage(message, variables)
  const credential = await getCredential(sql, companyId, instanceId)
  const mediaUrls = await getMediaUrls(sql, companyId, rendered)
  const payload = buildUazapiPayload(rendered, {
    number: cleanPhone,
    trackId: trackId || "cell-direct",
    mediaUrls,
  })

  const response = await fetchWithTimeout(`${credential.baseUrl}${payload.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: credential.token },
    body: JSON.stringify(payload.body),
  })

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const errorText = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : ""
    throw new Error(`UAZAPI retornou erro (${response.status}): ${errorText}`)
  }

  return {
    ok: true,
    providerId: String(body.id ?? body.messageId ?? body.key ?? body.message ?? ""),
    responseStatus: response.status,
  }
}

export async function dispatchCellVisitWhatsAppAutomation({
  companyId,
  cellId,
  requestId,
  visitorName,
  visitorPhone,
  visitorNeighborhood,
  visitorNotes,
}: {
  companyId: string
  cellId: string
  requestId: string
  visitorName: string
  visitorPhone: string
  visitorNeighborhood?: string
  visitorNotes?: string
}) {
  const sql = getSql()

  try {
    // 1. Resolve cell and leader
    const cellRows = await sql<{
      name: string
      meeting_day: string
      meeting_time: string | null
      meeting_location: string
      custom_whatsapp_message: boolean
      whatsapp_message: unknown
      leader_name: string | null
      leader_phone: string | null
      church_name: string
    }[]>`
      select
        g.name,
        g.meeting_day,
        g.meeting_time::text as meeting_time,
        g.meeting_location,
        g.custom_whatsapp_message,
        g.whatsapp_message,
        leader.full_name as leader_name,
        leader.phone as leader_phone,
        c.name as church_name
      from public.groups g
      join public.companies c on c.id = g.company_id
      left join public.people leader on leader.id = g.leader_person_id and leader.deleted_at is null
      where g.id = ${cellId}
        and g.company_id = ${companyId}
        and g.deleted_at is null
      limit 1
    `
    const cell = cellRows[0]
    if (!cell) return

    // 2. Resolve settings
    const settingsRows = await sql<{
      is_enabled: boolean
      whatsapp_instance_id: string | null
      send_to_leader: boolean
      send_to_visitor: boolean
      leader_message: unknown
      visitor_message: unknown
    }[]>`
      select
        is_enabled,
        whatsapp_instance_id,
        send_to_leader,
        send_to_visitor,
        leader_message,
        visitor_message
      from public.cell_whatsapp_settings
      where company_id = ${companyId}
      limit 1
    `
    const settings = settingsRows[0]
    if (!settings || !settings.is_enabled || !settings.whatsapp_instance_id) {
      return
    }

    const variables: Record<string, unknown> = {
      visitante_nome: visitorName,
      nome: visitorName,
      name: visitorName,
      visitante_telefone: visitorPhone,
      telefone: visitorPhone,
      phone: visitorPhone,
      visitante_bairro: visitorNeighborhood || "Não informado",
      bairro: visitorNeighborhood || "Não informado",
      visitante_mensagem: visitorNotes || "Nenhuma mensagem adicional",
      mensagem: visitorNotes || "Nenhuma mensagem adicional",
      notes: visitorNotes || "Nenhuma mensagem adicional",
      celula_nome: cell.name,
      celula: cell.name,
      lider_nome: cell.leader_name || "Líder",
      lider: cell.leader_name || "Líder",
      encontro_dia: cell.meeting_day || "A combinar",
      encontro_horario: cell.meeting_time || "",
      encontro_local: cell.meeting_location || "",
      igreja_nome: cell.church_name,
    }

    // Determine leader message: custom from group or church general
    let leaderMessage: FormDirectMessage | null = null
    if (cell.custom_whatsapp_message && cell.whatsapp_message) {
      leaderMessage = parseDirectMessageConfig(parseJsonbObject(cell.whatsapp_message))
    }
    if (!leaderMessage && settings.leader_message) {
      leaderMessage = parseDirectMessageConfig(parseJsonbObject(settings.leader_message))
    }

    // Determine visitor message
    let visitorMessage: FormDirectMessage | null = null
    if (settings.visitor_message) {
      visitorMessage = parseDirectMessageConfig(parseJsonbObject(settings.visitor_message))
    }

    // 3. Send to Leader if enabled
    if (settings.send_to_leader && leaderMessage && cell.leader_phone) {
      const cleanLeaderPhone = cell.leader_phone.replace(/\D/g, "")
      if (cleanLeaderPhone.length >= 10) {
        try {
          const result = await sendUazapiDirectMessage({
            sql,
            companyId,
            instanceId: settings.whatsapp_instance_id,
            recipient: cleanLeaderPhone,
            message: leaderMessage,
            variables,
            trackId: `cell-lead-${requestId}`,
          })

          await sql`
            insert into public.cell_whatsapp_deliveries (
              company_id,
              request_id,
              group_id,
              recipient,
              recipient_name,
              recipient_role,
              uazapi_instance_id,
              message_type,
              message_snapshot,
              status,
              provider_id,
              sent_at
            )
            values (
              ${companyId},
              ${requestId},
              ${cellId},
              ${cleanLeaderPhone},
              ${cell.leader_name || "Líder da Célula"},
              'leader',
              ${settings.whatsapp_instance_id},
              ${leaderMessage.type},
              ${jsonbParam(sql, leaderMessage)},
              'sent',
              ${result.providerId},
              now()
            )
          `
        } catch (leaderErr) {
          const errMsg = leaderErr instanceof Error ? leaderErr.message : "Erro no disparo para o líder"
          console.error("Erro ao disparar WhatsApp para o líder:", errMsg)
          await sql`
            insert into public.cell_whatsapp_deliveries (
              company_id,
              request_id,
              group_id,
              recipient,
              recipient_name,
              recipient_role,
              uazapi_instance_id,
              message_type,
              message_snapshot,
              status,
              last_error
            )
            values (
              ${companyId},
              ${requestId},
              ${cellId},
              ${cleanLeaderPhone},
              ${cell.leader_name || "Líder da Célula"},
              'leader',
              ${settings.whatsapp_instance_id},
              ${leaderMessage.type},
              ${jsonbParam(sql, leaderMessage)},
              'failed',
              ${errMsg}
            )
          `
        }
      }
    }

    // 4. Send to Visitor if enabled
    if (settings.send_to_visitor && visitorMessage) {
      const cleanVisitorPhone = visitorPhone.replace(/\D/g, "")
      if (cleanVisitorPhone.length >= 10) {
        try {
          const result = await sendUazapiDirectMessage({
            sql,
            companyId,
            instanceId: settings.whatsapp_instance_id,
            recipient: cleanVisitorPhone,
            message: visitorMessage,
            variables,
            trackId: `cell-visit-${requestId}`,
          })

          await sql`
            insert into public.cell_whatsapp_deliveries (
              company_id,
              request_id,
              group_id,
              recipient,
              recipient_name,
              recipient_role,
              uazapi_instance_id,
              message_type,
              message_snapshot,
              status,
              provider_id,
              sent_at
            )
            values (
              ${companyId},
              ${requestId},
              ${cellId},
              ${cleanVisitorPhone},
              ${visitorName},
              'visitor',
              ${settings.whatsapp_instance_id},
              ${visitorMessage.type},
              ${jsonbParam(sql, visitorMessage)},
              'sent',
              ${result.providerId},
              now()
            )
          `
        } catch (visitorErr) {
          const errMsg = visitorErr instanceof Error ? visitorErr.message : "Erro no disparo para o visitante"
          console.error("Erro ao disparar WhatsApp para o visitante:", errMsg)
          await sql`
            insert into public.cell_whatsapp_deliveries (
              company_id,
              request_id,
              group_id,
              recipient,
              recipient_name,
              recipient_role,
              uazapi_instance_id,
              message_type,
              message_snapshot,
              status,
              last_error
            )
            values (
              ${companyId},
              ${requestId},
              ${cellId},
              ${cleanVisitorPhone},
              ${visitorName},
              'visitor',
              ${settings.whatsapp_instance_id},
              ${visitorMessage.type},
              ${jsonbParam(sql, visitorMessage)},
              'failed',
              ${errMsg}
            )
          `
        }
      }
    }
  } catch (globalErr) {
    console.error("Falha geral na automação de WhatsApp de células:", globalErr)
  }
}
