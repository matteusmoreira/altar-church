import { requirePermission } from "@/lib/auth/permissions"
import { getCellContext } from "@/lib/cells/access"
import { getSql } from "@/lib/db/client"
import { parseJsonbObject } from "@/lib/db/jsonb"
import { parseDirectMessageConfig } from "@/lib/forms/direct-message"
import type { FormDirectMessage, FormUazapiInstanceOption } from "@/lib/forms/types"
import type {
  CellRequestsFilterState,
  CellRequestsMetrics,
  CellRequestsTabInitialData,
  CellVisitRequestItem,
  CellVisitRequestStatus,
  CellWhatsAppSettings,
} from "./requests-types"

function defaultLeaderMessage(): FormDirectMessage {
  return {
    type: "text",
    text: "🔔 *Novo Visitante Interessado na sua Célula!*\n\nOlá, *{{lider_nome}}*! Um visitante acabou de preencher o formulário para visitar a célula *{{celula_nome}}*.\n\n👤 *Nome:* {{visitante_nome}}\n📱 *WhatsApp:* {{visitante_telefone}}\n📍 *Bairro:* {{visitante_bairro}}\n💬 *Mensagem:* {{visitante_mensagem}}\n\nEntre em contato para acolhê-lo(a) e passar o endereço do encontro! 🙏",
  }
}

function defaultVisitorMessage(): FormDirectMessage {
  return {
    type: "text",
    text: "Olá, *{{visitante_nome}}*! 👋\n\nRecebemos seu pedido para visitar a célula *{{celula_nome}}*!\nO líder *{{lider_nome}}* entrará em contato em breve para te dar as boas-vindas e passar todos os detalhes do encontro.\n\nFicamos muito felizes pelo seu contato! Que Deus te abençoe! 🙏",
  }
}

export async function getCellWhatsAppSettings(companyIdInput?: string | null): Promise<CellWhatsAppSettings> {
  const { companyId } = await getCellContext(companyIdInput)
  const sql = getSql()

  const rows = await sql<{
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

  const row = rows[0]
  if (!row) {
    return {
      isEnabled: true,
      whatsappInstanceId: null,
      sendToLeader: true,
      sendToVisitor: false,
      leaderMessage: defaultLeaderMessage(),
      visitorMessage: defaultVisitorMessage(),
    }
  }

  return {
    isEnabled: row.is_enabled ?? true,
    whatsappInstanceId: row.whatsapp_instance_id ?? null,
    sendToLeader: row.send_to_leader ?? true,
    sendToVisitor: row.send_to_visitor ?? false,
    leaderMessage: parseDirectMessageConfig(parseJsonbObject(row.leader_message)) ?? defaultLeaderMessage(),
    visitorMessage: parseDirectMessageConfig(parseJsonbObject(row.visitor_message)) ?? defaultVisitorMessage(),
  }
}

export async function listCellVisitRequests(
  filters: CellRequestsFilterState = {},
  companyIdInput?: string | null,
): Promise<{ requests: CellVisitRequestItem[]; totalCount: number }> {
  const { companyId } = await getCellContext(companyIdInput)
  await requirePermission("groups.view", companyId)
  const sql = getSql()

  const search = filters.search?.trim() ?? ""
  const cellId = filters.cellId && filters.cellId !== "all" ? filters.cellId : null
  const status = filters.status && filters.status !== "all" ? filters.status : null
  const period = filters.period && filters.period !== "all" ? filters.period : null

  let periodInterval: string | null = null
  if (period === "today") periodInterval = "1 day"
  else if (period === "7d") periodInterval = "7 days"
  else if (period === "30d") periodInterval = "30 days"

  const countRows = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.cell_visit_requests r
    left join public.groups g on g.id = r.group_id and g.company_id = r.company_id
    where r.company_id = ${companyId}
      ${cellId ? sql`and r.group_id = ${cellId}` : sql``}
      ${status ? sql`and r.status = ${status}` : sql``}
      ${periodInterval ? sql`and r.created_at >= now() - ${periodInterval}::interval` : sql``}
      ${search ? sql`and (
        r.full_name ilike ${`%${search}%`}
        or r.phone ilike ${`%${search}%`}
        or r.neighborhood ilike ${`%${search}%`}
        or g.name ilike ${`%${search}%`}
      )` : sql``}
  `
  const totalCount = Number(countRows[0]?.count ?? 0)

  const limit = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 50
  const page = filters.page && filters.page > 0 ? filters.page : 1
  const offset = (page - 1) * limit

  const rows = await sql<{
    id: string
    company_id: string
    group_id: string
    cell_name: string
    cell_category: string | null
    leader_name: string | null
    leader_phone: string | null
    person_id: string | null
    full_name: string
    phone: string
    neighborhood: string
    notes: string
    status: CellVisitRequestStatus
    crm_card_id: string | null
    follow_up_task_id: string | null
    created_at: Date
    updated_at: Date
    contacted_at: Date | null
    accepted_at: Date | null
    archived_at: Date | null
  }[]>`
    select
      r.id,
      r.company_id,
      r.group_id,
      coalesce(g.name, 'Célula desconhecida') as cell_name,
      cat.name as cell_category,
      leader.full_name as leader_name,
      leader.phone as leader_phone,
      r.person_id,
      r.full_name,
      r.phone,
      r.neighborhood,
      r.notes,
      r.status,
      r.crm_card_id,
      r.follow_up_task_id,
      r.created_at,
      r.updated_at,
      r.contacted_at,
      r.accepted_at,
      r.archived_at
    from public.cell_visit_requests r
    left join public.groups g on g.id = r.group_id and g.company_id = r.company_id
    left join public.group_categories cat on cat.id = g.category_id
    left join public.people leader on leader.id = g.leader_person_id and leader.deleted_at is null
    where r.company_id = ${companyId}
      ${cellId ? sql`and r.group_id = ${cellId}` : sql``}
      ${status ? sql`and r.status = ${status}` : sql``}
      ${periodInterval ? sql`and r.created_at >= now() - ${periodInterval}::interval` : sql``}
      ${search ? sql`and (
        r.full_name ilike ${`%${search}%`}
        or r.phone ilike ${`%${search}%`}
        or r.neighborhood ilike ${`%${search}%`}
        or g.name ilike ${`%${search}%`}
      )` : sql``}
    order by r.created_at desc
    limit ${limit}
    offset ${offset}
  `

  const requests: CellVisitRequestItem[] = rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    groupId: row.group_id,
    cellName: row.cell_name,
    cellCategory: row.cell_category,
    leaderName: row.leader_name,
    leaderPhone: row.leader_phone,
    personId: row.person_id,
    fullName: row.full_name,
    phone: row.phone,
    neighborhood: row.neighborhood,
    notes: row.notes,
    status: row.status,
    crmCardId: row.crm_card_id,
    followUpTaskId: row.follow_up_task_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    contactedAt: row.contacted_at?.toISOString() ?? null,
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
  }))

  return { requests, totalCount }
}

export async function getCellRequestsMetrics(companyIdInput?: string | null): Promise<CellRequestsMetrics> {
  const { companyId } = await getCellContext(companyIdInput)
  const sql = getSql()

  const rows = await sql<{
    total: string
    pending: string
    contacted: string
    accepted: string
  }[]>`
    select
      count(*)::text as total,
      count(*) filter (where status = 'pending')::text as pending,
      count(*) filter (where status = 'contacted')::text as contacted,
      count(*) filter (where status = 'accepted')::text as accepted
    from public.cell_visit_requests
    where company_id = ${companyId}
  `

  return {
    total: Number(rows[0]?.total ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    contacted: Number(rows[0]?.contacted ?? 0),
    accepted: Number(rows[0]?.accepted ?? 0),
  }
}

export async function listUazapiInstancesForCells(companyIdInput?: string | null): Promise<FormUazapiInstanceOption[]> {
  const { companyId } = await getCellContext(companyIdInput)
  const sql = getSql()

  const rows = await sql<FormUazapiInstanceOption[]>`
    select
      id,
      name,
      phone,
      status
    from public.uazapi_instances
    where company_id = ${companyId}
      and active = true
    order by is_default desc, name asc
  `
  return rows
}

export async function getCellRequestsTabInitialData(
  companyIdInput?: string | null,
): Promise<CellRequestsTabInitialData> {
  const { companyId } = await getCellContext(companyIdInput)
  const sql = getSql()

  const [requestsResult, metrics, settings, instances, cellRows] = await Promise.all([
    listCellVisitRequests({}, companyId),
    getCellRequestsMetrics(companyId),
    getCellWhatsAppSettings(companyId),
    listUazapiInstancesForCells(companyId),
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.groups
      where company_id = ${companyId}
        and type = 'cell'
        and deleted_at is null
      order by name asc
    `,
  ])

  return {
    requests: requestsResult.requests,
    totalCount: requestsResult.totalCount,
    metrics,
    settings,
    instances,
    cellsList: cellRows,
  }
}
