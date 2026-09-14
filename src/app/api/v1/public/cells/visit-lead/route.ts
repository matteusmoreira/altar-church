import { NextResponse } from "next/server"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { dispatchCellVisitWhatsAppAutomation } from "@/lib/cells/whatsapp-dispatch"

const visitLeadSchema = z.object({
  churchSlug: z.string().trim().min(1, "Slug da igreja obrigatório"),
  cellId: z.string().uuid("ID da célula inválido"),
  fullName: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(160),
  phone: z.string().trim().max(30).transform((value) => value.replace(/\D/g, "")).refine((value) => /^\d{10,11}$/.test(value), "Informe um WhatsApp válido com DDD"),
  neighborhood: z.string().trim().max(160).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
})

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const parsed = visitLeadSchema.parse(json)
    let createdRequestId: string | null = null
    let resolvedChurchId: string | null = null

    const response = await getSql().begin(async (sql) => {
      // 1. Resolve church
      const churchRows = await sql<{ id: string; name: string }[]>`
        select id, name
        from public.companies
        where slug = ${parsed.churchSlug}
          and active = true
          and status = 'active'
        limit 1
      `
      const church = churchRows[0]
      if (!church) {
        return NextResponse.json({ error: "Igreja não encontrada" }, { status: 404 })
      }
      resolvedChurchId = church.id

      // 2. Resolve cell
      const cellRows = await sql<{ id: string; name: string; leader_name: string | null; leader_phone: string | null }[]>`
        select g.id, g.name, leader.full_name as leader_name,
          case when g.is_leader_whatsapp_public then leader.phone else null end as leader_phone
        from public.groups g
        left join public.people leader on leader.id = g.leader_person_id and leader.company_id = g.company_id and leader.deleted_at is null
        where g.id = ${parsed.cellId}
          and g.company_id = ${church.id}
          and g.type = 'cell'
          and g.is_active = true
          and g.accepts_requests = true
          and g.deleted_at is null
        limit 1
      `
      const cell = cellRows[0]
      if (!cell) {
        return NextResponse.json({ error: "Célula não encontrada" }, { status: 404 })
      }

      const cleanPhone = parsed.phone.replace(/\D/g, "")

      // 3. Find or create person
      const existingPeople = await sql<{ id: string }[]>`
        select id from public.people
        where company_id = ${church.id}
          and deleted_at is null
          and regexp_replace(phone, '\\D', '', 'g') = ${cleanPhone}
        order by created_at desc
        limit 1
      `

      let personId = existingPeople[0]?.id
      if (!personId) {
        const nameParts = parsed.fullName.trim().split(/\s+/)
        const firstName = nameParts.shift() ?? parsed.fullName.trim()
        const lastName = nameParts.join(" ")

        const createdPeople = await sql<{ id: string }[]>`
          insert into public.people (
            company_id,
            first_name,
            last_name,
            full_name,
            phone,
            status,
            person_type,
            journey_status,
            neighborhood,
            internal_notes,
            is_active
          )
          values (
            ${church.id},
            ${firstName},
            ${lastName},
            ${parsed.fullName},
            ${parsed.phone},
            'visitor',
            'visitor',
            'new',
            ${parsed.neighborhood},
            ${`Interesse em visitar célula: ${cell.name}${parsed.notes ? ` - Mensagem: ${parsed.notes}` : ""}`},
            true
          )
          returning id
        `
        personId = createdPeople[0]?.id
      }

      if (!personId) {
        throw new Error("Erro ao registrar contato")
      }

      // 4. Create CRM card in default stage
      const stageRows = await sql<{ id: string }[]>`
        select id from public.crm_stages
        where company_id = ${church.id}
          and deleted_at is null
        order by is_default desc, sort_order asc, created_at asc
        limit 1
      `
      const stageId = stageRows[0]?.id
      let crmCardId: string | null = null

      if (stageId) {
        const cards = await sql<{ id: string }[]>`
          insert into public.crm_cards (
            company_id,
            person_id,
            person_name,
            person_phone,
            stage_id,
            source,
            notes
          )
          values (
            ${church.id},
            ${personId},
            ${parsed.fullName},
            ${parsed.phone},
            ${stageId},
            ${`Célula Pública: ${cell.name}`},
            ${parsed.notes ? `Mensagem do visitante: ${parsed.notes}` : `Interesse registrado pelo mapa público 3D para a célula ${cell.name}`}
          )
          returning id
        `
        crmCardId = cards[0]?.id ?? null
      }

      // 5. Create follow-up task
      const followUpRows = await sql<{ id: string }[]>`
        insert into public.person_follow_up_tasks (
          company_id,
          person_id,
          title,
          crm_card_id,
          notes,
          status,
          origin
        )
        values (
          ${church.id},
          ${personId},
          ${`Novo visitante da célula: ${cell.name}`},
          ${crmCardId},
          ${`O visitante ${parsed.fullName} solicitou visita à célula ${cell.name}. Telefone: ${parsed.phone}. Bairro: ${parsed.neighborhood || "Não informado"}.${parsed.notes ? ` Mensagem: ${parsed.notes}` : ""}`},
          'open',
          'without_cell'
        )
        returning id
      `
      const followUpTaskId = followUpRows[0]?.id ?? null

      // 6. Record in cell_visit_requests
      const requestRows = await sql<{ id: string }[]>`
        insert into public.cell_visit_requests (
          company_id,
          group_id,
          person_id,
          full_name,
          phone,
          neighborhood,
          notes,
          status,
          crm_card_id,
          follow_up_task_id
        )
        values (
          ${church.id},
          ${cell.id},
          ${personId},
          ${parsed.fullName},
          ${parsed.phone},
          ${parsed.neighborhood},
          ${parsed.notes},
          'pending',
          ${crmCardId},
          ${followUpTaskId}
        )
        returning id
      `
      createdRequestId = requestRows[0]?.id ?? null

      // 7. Record public acquisition event
      await sql`
        insert into public.public_acquisition_events (
          company_id,
          event_kind,
          source_kind,
          source_label,
          landing_path,
          person_id,
          crm_card_id
        )
        values (
          ${church.id},
          'conversion',
          'site',
          ${`Mapa 3D - Célula ${cell.name}`},
          ${`/church/${parsed.churchSlug}/celulas`},
          ${personId},
          ${crmCardId}
        )
      `

      return NextResponse.json({
        ok: true,
        requestId: createdRequestId,
        cellName: cell.name,
        leaderName: cell.leader_name,
        leaderPhone: cell.leader_phone ? cell.leader_phone.replace(/\D/g, "") : null,
        message: "Seu pedido de visita foi registrado para acompanhamento pela igreja.",
      })
    })

    // Dispara automação WhatsApp de forma não-bloqueante
    if (createdRequestId && resolvedChurchId) {
      void dispatchCellVisitWhatsAppAutomation({
        companyId: resolvedChurchId,
        cellId: parsed.cellId,
        requestId: createdRequestId,
        visitorName: parsed.fullName,
        visitorPhone: parsed.phone,
        visitorNeighborhood: parsed.neighborhood,
        visitorNotes: parsed.notes,
      })
    }

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 })
    }
    return NextResponse.json({ error: "Não foi possível registrar sua solicitação. Tente novamente em instantes." }, { status: 500 })
  }
}
