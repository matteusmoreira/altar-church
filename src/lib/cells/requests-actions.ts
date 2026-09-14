"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission } from "@/lib/auth/permissions"
import { getCellContext } from "@/lib/cells/access"
import { getSql } from "@/lib/db/client"
import { jsonbParam } from "@/lib/db/jsonb"
import { directMessageSchema } from "@/lib/forms/direct-message"
import type { FormDirectMessage } from "@/lib/forms/types"
import { sendUazapiDirectMessage } from "./whatsapp-dispatch"

const updateStatusSchema = z.object({
  requestId: z.string().uuid("ID da solicitação inválido"),
  status: z.enum(["pending", "contacted", "accepted", "archived"]),
  notes: z.string().trim().max(1000).optional(),
})

const acceptRequestSchema = z.object({
  requestId: z.string().uuid("ID da solicitação inválido"),
  role: z.enum(["visitor", "member"]).default("visitor"),
})

const saveSettingsSchema = z.object({
  isEnabled: z.boolean().default(true),
  whatsappInstanceId: z.string().uuid().nullable().optional(),
  sendToLeader: z.boolean().default(true),
  sendToVisitor: z.boolean().default(false),
  leaderMessage: z.unknown(),
  visitorMessage: z.unknown(),
})

export async function updateCellRequestStatusAction(input: z.infer<typeof updateStatusSchema>) {
  try {
    const parsed = updateStatusSchema.parse(input)
    const { companyId } = await getCellContext()
    await requirePermission("groups.edit", companyId)
    const sql = getSql()

    let contactedSql = sql``
    let acceptedSql = sql``
    let archivedSql = sql``

    if (parsed.status === "contacted") contactedSql = sql`, contacted_at = coalesce(contacted_at, now())`
    if (parsed.status === "accepted") acceptedSql = sql`, accepted_at = coalesce(accepted_at, now())`
    if (parsed.status === "archived") archivedSql = sql`, archived_at = coalesce(archived_at, now())`

    await sql`
      update public.cell_visit_requests
      set
        status = ${parsed.status},
        notes = case when ${parsed.notes != null} then ${parsed.notes ?? ""} else notes end,
        updated_at = now()
        ${contactedSql}
        ${acceptedSql}
        ${archivedSql}
      where id = ${parsed.requestId}
        and company_id = ${companyId}
    `

    revalidatePath("/celulas")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar status" }
  }
}

export async function acceptCellRequestAction(input: z.infer<typeof acceptRequestSchema>) {
  try {
    const parsed = acceptRequestSchema.parse(input)
    const { companyId, user } = await getCellContext()
    await requirePermission("groups.edit", companyId)
    const sql = getSql()

    // 1. Resolve request
    const requestRows = await sql<{
      id: string
      group_id: string
      person_id: string | null
      full_name: string
      phone: string
      neighborhood: string
    }[]>`
      select id, group_id, person_id, full_name, phone, neighborhood
      from public.cell_visit_requests
      where id = ${parsed.requestId}
        and company_id = ${companyId}
      limit 1
    `
    const requestItem = requestRows[0]
    if (!requestItem) throw new Error("Solicitação não encontrada")

    let personId = requestItem.person_id

    // If person doesn't exist yet, find or create
    if (!personId) {
      const cleanPhone = requestItem.phone.replace(/\D/g, "")
      const existing = await sql<{ id: string }[]>`
        select id from public.people
        where company_id = ${companyId}
          and deleted_at is null
          and regexp_replace(phone, '\\D', '', 'g') = ${cleanPhone}
        limit 1
      `
      if (existing[0]) {
        personId = existing[0].id
      } else {
        const nameParts = requestItem.full_name.trim().split(/\s+/)
        const firstName = nameParts.shift() ?? requestItem.full_name.trim()
        const lastName = nameParts.join(" ")
        const created = await sql<{ id: string }[]>`
          insert into public.people (
            company_id, first_name, last_name, full_name, phone,
            status, person_type, journey_status, neighborhood, is_active
          )
          values (
            ${companyId}, ${firstName}, ${lastName}, ${requestItem.full_name}, ${requestItem.phone},
            'visitor', 'visitor', 'new', ${requestItem.neighborhood}, true
          )
          returning id
        `
        personId = created[0]?.id ?? null
      }
    }

    if (!personId) throw new Error("Não foi possível resolver o cadastro da pessoa")

    // 2. Add to group_members
    await sql`
      insert into public.group_members (
        company_id,
        group_id,
        person_id,
        role,
        status,
        joined_at,
        created_by,
        updated_by
      )
      values (
        ${companyId},
        ${requestItem.group_id},
        ${personId},
        ${parsed.role},
        'active',
        current_date,
        ${user.id},
        ${user.id}
      )
      on conflict (group_id, person_id) do update
      set
        role = excluded.role,
        status = 'active',
        left_at = null,
        updated_by = excluded.updated_by,
        updated_at = now()
    `

    // 3. Mark request as accepted
    await sql`
      update public.cell_visit_requests
      set
        status = 'accepted',
        person_id = ${personId},
        accepted_at = coalesce(accepted_at, now()),
        updated_at = now()
      where id = ${parsed.requestId}
        and company_id = ${companyId}
    `

    revalidatePath("/celulas")
    return { ok: true, personId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao aceitar solicitação na célula" }
  }
}

export async function archiveCellRequestAction(requestId: string) {
  try {
    const { companyId } = await getCellContext()
    await requirePermission("groups.edit", companyId)
    const sql = getSql()

    await sql`
      update public.cell_visit_requests
      set
        status = 'archived',
        archived_at = coalesce(archived_at, now()),
        updated_at = now()
      where id = ${requestId}
        and company_id = ${companyId}
    `

    revalidatePath("/celulas")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao arquivar solicitação" }
  }
}

export async function saveCellWhatsAppSettingsAction(input: z.infer<typeof saveSettingsSchema>) {
  try {
    const parsed = saveSettingsSchema.parse(input)
    const { companyId } = await getCellContext()
    await requirePermission("groups.edit", companyId)
    const sql = getSql()

    let leaderMessage: FormDirectMessage | null = null
    let visitorMessage: FormDirectMessage | null = null

    if (parsed.leaderMessage != null) {
      const result = directMessageSchema.safeParse(parsed.leaderMessage)
      if (!result.success) throw new Error("Mensagem para o líder inválida: " + result.error.issues[0]?.message)
      leaderMessage = result.data as FormDirectMessage
    }

    if (parsed.visitorMessage != null) {
      const result = directMessageSchema.safeParse(parsed.visitorMessage)
      if (!result.success) throw new Error("Mensagem para o visitante inválida: " + result.error.issues[0]?.message)
      visitorMessage = result.data as FormDirectMessage
    }

    await sql`
      insert into public.cell_whatsapp_settings (
        company_id,
        is_enabled,
        whatsapp_instance_id,
        send_to_leader,
        send_to_visitor,
        leader_message,
        visitor_message,
        updated_at
      )
      values (
        ${companyId},
        ${parsed.isEnabled},
        ${parsed.whatsappInstanceId ?? null},
        ${parsed.sendToLeader},
        ${parsed.sendToVisitor},
        ${leaderMessage ? jsonbParam(sql, leaderMessage) : sql`'{}'::jsonb`},
        ${visitorMessage ? jsonbParam(sql, visitorMessage) : sql`'{}'::jsonb`},
        now()
      )
      on conflict (company_id) do update
      set
        is_enabled = excluded.is_enabled,
        whatsapp_instance_id = excluded.whatsapp_instance_id,
        send_to_leader = excluded.send_to_leader,
        send_to_visitor = excluded.send_to_visitor,
        leader_message = excluded.leader_message,
        visitor_message = excluded.visitor_message,
        updated_at = now()
    `

    revalidatePath("/celulas")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao salvar configurações de WhatsApp" }
  }
}

export async function sendCellWhatsAppTestAction(input: {
  instanceId: string
  recipientPhone: string
  message: unknown
}) {
  try {
    const { companyId } = await getCellContext()
    await requirePermission("groups.edit", companyId)
    const sql = getSql()

    const parsedMessage = directMessageSchema.safeParse(input.message)
    if (!parsedMessage.success) {
      throw new Error("Formato de mensagem inválido: " + parsedMessage.error.issues[0]?.message)
    }

    const testVariables: Record<string, unknown> = {
      visitante_nome: "Maria Teste",
      nome: "Maria Teste",
      visitante_telefone: "(11) 99999-9999",
      telefone: "(11) 99999-9999",
      visitante_bairro: "Centro",
      bairro: "Centro",
      visitante_mensagem: "Gostaria de conhecer o grupo e participar das reuniões!",
      mensagem: "Gostaria de conhecer o grupo e participar das reuniões!",
      celula_nome: "Célula Esperança",
      celula: "Célula Esperança",
      lider_nome: "João Silva",
      lider: "João Silva",
      encontro_dia: "Quinta-feira",
      encontro_horario: "20:00",
      encontro_local: "Rua das Flores, 123",
      igreja_nome: "Altar Church",
    }

    const result = await sendUazapiDirectMessage({
      sql,
      companyId,
      instanceId: input.instanceId,
      recipient: input.recipientPhone,
      message: parsedMessage.data as FormDirectMessage,
      variables: testVariables,
      trackId: "test-message",
    })

    return { ok: true, providerId: result.providerId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao enviar teste pelo WhatsApp" }
  }
}
