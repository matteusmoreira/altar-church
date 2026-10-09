import "server-only"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { unauthorized, notFound, badRequest } from "@/lib/api/errors"
import { inboxCursorSchema, inboxQuerySchema, inboxReadSchema, type InboxItem, type InboxPage } from "./inbox-contract"

async function context() {
  const user = await getCurrentUser()
  if (!user) throw unauthorized()
  return { profileId: user.id, companyId: requireUserCompanyId(user) }
}
export async function listMyInbox(input: unknown): Promise<InboxPage> {
  const query = inboxQuerySchema.parse(input)
  const { profileId, companyId } = await context()
  let cursor = null
  if (query.cursor) { try { cursor = inboxCursorSchema.parse(JSON.parse(query.cursor)) } catch { throw badRequest("Página inválida") } }
  const sql = getSql()
  const [rows, counts, latest] = await Promise.all([
    sql<{ id: string; module: InboxItem["module"]; kind: string; title: string; summary: string; href: string; created_at: Date; read_at: Date | null }[]>`
      select n.id,n.module,n.kind,n.title,n.summary,n.href,n.created_at,n.read_at from public.notification_inbox n
      where n.company_id=${companyId} and n.profile_id=${profileId} and private.notification_source_access(n)
        and (${query.module ?? null}::text is null or n.module=${query.module ?? null})
        and (${query.unread === "true"}::boolean=false or n.read_at is null)
        and (${cursor?.id ?? null}::uuid is null or (n.created_at,n.id)<(${cursor?.createdAt ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
      order by n.created_at desc,n.id desc limit 31`,
    sql<{ total: number }[]>`select count(*)::int as total from public.notification_inbox n where n.company_id=${companyId} and n.profile_id=${profileId} and n.read_at is null and private.notification_source_access(n)`,
    sql<{ id: string; created_at: Date }[]>`select n.id,n.created_at from public.notification_inbox n where n.company_id=${companyId} and n.profile_id=${profileId} and private.notification_source_access(n) order by n.created_at desc,n.id desc limit 1`,
  ])
  const items = rows.slice(0, 30).map(row => ({ id: row.id, module: row.module, kind: row.kind, title: row.title, summary: row.summary, href: row.href, createdAt: new Date(row.created_at).toISOString(), readAt: row.read_at ? new Date(row.read_at).toISOString() : null }))
  const last = items.at(-1)
  return { items, unread: Number(counts[0]?.total ?? 0), nextCursor: rows.length > 30 && last ? JSON.stringify({ createdAt: last.createdAt, id: last.id }) : null, through: latest[0] ? { id: latest[0].id, createdAt: new Date(latest[0].created_at).toISOString() } : null }
}
export async function markMyInboxRead(input: unknown) {
  const command = inboxReadSchema.parse(input)
  const { profileId, companyId } = await context()
  const sql = getSql()
  if (command.action === "read") {
    const rows = await sql<{ id: string; href: string }[]>`update public.notification_inbox n set read_at=coalesce(n.read_at,now()) where n.id=${command.id} and n.company_id=${companyId} and n.profile_id=${profileId} and private.notification_source_access(n) returning id,href`
    if (!rows[0]) throw notFound("Aviso indisponível ou acesso removido")
    return rows[0]
  }
  await sql`update public.notification_inbox n set read_at=now() where n.company_id=${companyId} and n.profile_id=${profileId} and n.read_at is null
    and (n.created_at,n.id)<=(${command.through.createdAt}::timestamptz,${command.through.id}::uuid) and private.notification_source_access(n)`
  return { ok: true }
}

export async function getMyInboxSubject(id: string) {
  const validId = inboxCursorSchema.shape.id.parse(id)
  const { profileId, companyId } = await context()
  const rows = await getSql()<{ title: string; summary: string; scope_kind: string; scope_id: string | null; href: string; source_table: string; source_id: string; kind: string }[]>`
    select n.title,n.summary,n.scope_kind,n.scope_id,n.href,n.source_table,n.source_id,n.kind from public.notification_inbox n
    where n.id=${validId} and n.company_id=${companyId} and n.profile_id=${profileId} and private.notification_source_access(n)`
  if (!rows[0]) throw notFound("Aviso indisponível ou acesso removido")
  return rows[0]
}

export async function getMyInboxKidsDetails(id: string) {
  const item = await getMyInboxSubject(id)
  if (item.scope_kind !== "kids") throw notFound("Aviso Kids indisponível")
  const { companyId } = await context()
  const sql = getSql()
  if (item.source_table === "kid_conversation_messages") {
    const messages = await sql<{ id: string; body: string; sender_name: string; created_at: Date }[]>`
      select m.id,m.body,coalesce(p.name,'Equipe Kids') as sender_name,m.created_at
      from public.kid_conversation_messages m left join public.profiles p on p.id=m.sender_profile_id and p.company_id=${companyId}
      where m.company_id=${companyId} and m.deleted_at is null and m.conversation_id=(select conversation_id from public.kid_conversation_messages where id=${item.source_id} and company_id=${companyId})
      order by m.created_at desc,m.id desc limit 50`
    return { messages: messages.reverse().map(m=>({ id:m.id,body:m.body,senderName:m.sender_name,createdAt:new Date(m.created_at).toISOString() })), session:null, description:"" }
  }
  let sessionId: string | null = null
  let description = ""
  if (item.source_table === "kid_incidents") {
    const [row] = await sql<{ session_id: string | null; title: string; description: string }[]>`select session_id,title,description from public.kid_incidents where id=${item.source_id} and company_id=${companyId} and deleted_at is null`
    sessionId=row?.session_id ?? null;description=row ? `${row.title}\n${row.description}` : ""
  } else if (item.source_table === "kid_attendances") {
    const [row] = await sql<{ session_id: string; classroom_name: string }[]>`select session_id,classroom_name from public.kid_attendances where id=${item.source_id} and company_id=${companyId}`
    sessionId=row?.session_id ?? null;description=row?.classroom_name ?? ""
  } else if (item.source_table === "kid_staff_assignments") {
    const [row] = await sql<{ session_id: string; assignment_role: string }[]>`select session_id,assignment_role from public.kid_staff_assignments where id=${item.source_id} and company_id=${companyId}`
    sessionId=row?.session_id ?? null;description=row?.assignment_role ?? ""
  } else if (item.source_table === "kid_sessions") sessionId=item.source_id
  else throw notFound("Aviso Kids indisponível")
  const [session] = sessionId ? await sql<{ title: string; status: string; starts_at: Date | null; ends_at: Date | null }[]>`select title,status,starts_at,ends_at from public.kid_sessions where id=${sessionId} and company_id=${companyId} and deleted_at is null` : []
  return { messages: [], description, session: session ? {title:session.title,status:session.status,startsAt:session.starts_at ? new Date(session.starts_at).toISOString() : null,endsAt:session.ends_at ? new Date(session.ends_at).toISOString() : null} : null }
}

export async function getMyInboxEventDetails(id: string) {
  const item = await getMyInboxSubject(id)
  const {companyId} = await context()
  const sql = getSql()
  let eventId: string | undefined
  if (item.source_table === "events") eventId=item.source_id
  else if (["member_event_rsvps","event_guest_registrations","event_registrations"].includes(item.source_table)) {
    const [source] = await sql.unsafe<{event_id:string}[]>(`select event_id from public.${item.source_table} where id=$1 and company_id=$2`,[item.source_id,companyId])
    eventId=source?.event_id
  }
  if (!eventId) throw notFound("Evento indisponível")
  const [event] = await sql<{id:string;title:string;description:string;location:string;starts_at:Date;ends_at:Date|null;status:string}[]>`select id,title,description,location,starts_at,ends_at,status from public.events where id=${eventId} and company_id=${companyId} and deleted_at is null and status <> 'draft'`
  if (!event) throw notFound("Evento indisponível")
  return {id:event.id,title:event.title,description:event.description,location:event.location,status:event.status,startsAt:new Date(event.starts_at).toISOString(),endsAt:event.ends_at?new Date(event.ends_at).toISOString():null}
}

export async function getMyInboxVolunteerDetails(id: string) {
  const item = await getMyInboxSubject(id)
  if (item.kind !== "volunteer.registration" || item.source_table !== "volunteer_profiles") throw notFound("Pedido indisponível")
  const {companyId} = await context()
  const [volunteer] = await getSql()<{name:string;registration_status:string}[]>`select person.full_name as name,v.registration_status from public.volunteer_profiles v join public.people person on person.id=v.person_id and person.company_id=${companyId} and person.deleted_at is null where v.id=${item.source_id} and v.company_id=${companyId} and v.deleted_at is null`
  if (!volunteer) throw notFound("Pedido indisponível")
  return {name:volunteer.name,status:volunteer.registration_status}
}
