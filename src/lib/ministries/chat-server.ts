import "server-only"
import { randomUUID } from "node:crypto"
import { parseBuffer } from "music-metadata"
import { z } from "zod"
import type { TransactionSql } from "postgres"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { badRequest, forbidden, notFound, unauthorized, ApiError } from "@/lib/api/errors"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { afterResponse } from "@/lib/performance/after-response"
import { resolveMinistryAccess } from "./access"
import { processMinistryChatPush } from "./chat-push"
import { CHAT_BUCKET, chatCommandSchema, chatCursorSchema, chatSendSchema, chatUploadSchema, validChatSignature } from "./chat-contract"
import type { MinistryChatMessage, MinistryChatPage, MinistryChatSummary } from "./chat-contract"

type Sql = ReturnType<typeof getSql>
type Tx = TransactionSql
const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null
function storage() {
  const client = createSupabaseAdminClient()
  if (!client) throw new Error("Armazenamento do chat não configurado")
  return client.storage.from(CHAT_BUCKET)
}
async function actor() {
  const user = await getCurrentUser()
  if (!user) throw unauthorized()
  return { user, companyId: requireUserCompanyId(user) }
}
export async function requireChatAccess(identifier: string) {
  let access
  try { access = await resolveMinistryAccess(identifier) }
  catch { throw forbidden("Você não tem acesso a este chat") }
  const rows = await getSql()<{ allowed: boolean }[]>`select private.ministry_chat_profile_access(${access.user.id}::uuid, ${access.ministryId}::uuid) as allowed`
  if (!rows[0]?.allowed) throw forbidden("Você não tem acesso a este chat")
  return access
}

interface MessageRow {
  id: string; sender_profile_id: string; sender_name: string; photo_path: string | null; avatar_url: string | null
  body: string; created_at: Date; edited_at: Date | null; deleted_at: Date | null; pinned_at: Date | null
  reply_to_id: string | null; reply_body: string | null; reply_deleted_at: Date | null; reply_sender_name: string | null
}
async function hydrateMessages(sql: Sql | Tx, ministryId: string, actorId: string, ids: string[]): Promise<MinistryChatMessage[]> {
  if (!ids.length) return []
  const [rows, files, reactions] = await Promise.all([
    sql<MessageRow[]>`
      select m.*, p.name as sender_name, p.avatar_url, photo.storage_path as photo_path,
        reply.body as reply_body, reply.deleted_at as reply_deleted_at, rp.name as reply_sender_name
      from public.ministry_chat_messages m join public.profiles p on p.id = m.sender_profile_id
      left join public.people person on person.company_id = m.company_id and person.deleted_at is null
        and person.id = (select linked.id from public.people linked where linked.company_id = m.company_id and linked.deleted_at is null
          and (linked.profile_id = p.id or linked.id = p.person_id) order by (linked.profile_id = p.id) desc limit 1)
      left join public.app_files photo on photo.id = person.photo_file_id and photo.company_id = m.company_id and photo.is_active and photo.deleted_at is null
      left join public.ministry_chat_messages reply on reply.id = m.reply_to_id and reply.ministry_id = m.ministry_id
      left join public.profiles rp on rp.id = reply.sender_profile_id
      where m.ministry_id = ${ministryId} and m.id = any(${sql.array(ids)}::uuid[]) order by m.created_at, m.id
    `,
    sql<{ id: string; message_id: string; name: string; mime_type: string; size_bytes: number; duration_seconds: number | null }[]>`
      select f.id, f.message_id, f.name, f.mime_type, f.size_bytes, f.duration_seconds
      from public.ministry_chat_attachments f join public.ministry_chat_messages m on m.id = f.message_id
      where f.ministry_id = ${ministryId} and m.deleted_at is null and f.verified_at is not null and f.message_id = any(${sql.array(ids)}::uuid[]) order by f.created_at, f.id
    `,
    sql<{ message_id: string; emoji: string; count: number; mine: boolean }[]>`
      select message_id, emoji, count(*)::int as count, bool_or(profile_id = ${actorId}) as mine
      from public.ministry_chat_reactions where ministry_id = ${ministryId} and active and message_id = any(${sql.array(ids)}::uuid[])
      group by message_id, emoji
    `,
  ])
  const photos = await createSignedUrlsByStoragePath(rows.flatMap(row => row.photo_path ? [row.photo_path] : []), 300)
  return rows.map(row => ({
    id: row.id, senderId: row.sender_profile_id, senderName: row.sender_name,
    senderPhoto: row.photo_path ? photos.get(row.photo_path) ?? null : row.avatar_url,
    body: row.deleted_at ? "" : row.body, createdAt: iso(row.created_at)!, editedAt: iso(row.edited_at), deletedAt: iso(row.deleted_at), pinnedAt: iso(row.pinned_at),
    reply: row.reply_to_id ? { id: row.reply_to_id, senderName: row.reply_sender_name ?? "Integrante", body: row.reply_deleted_at ? "Mensagem removida" : row.reply_body || "Anexo", deleted: Boolean(row.reply_deleted_at) } : null,
    attachments: files.filter(f => f.message_id === row.id).map(f => ({ id: f.id, name: f.name, mimeType: f.mime_type, sizeBytes: f.size_bytes, durationSeconds: f.duration_seconds === null ? null : Number(f.duration_seconds), url: `/api/v1/ministries/${ministryId}/chat/files/${f.id}` })),
    reactions: row.deleted_at ? [] : reactions.filter(r => r.message_id === row.id).map(r => ({ emoji: r.emoji, count: r.count, mine: r.mine })),
  }))
}

export async function listMinistryChat(identifier: string, before?: string | null, snapshot?: string | null): Promise<MinistryChatPage> {
  const access = await requireChatAccess(identifier)
  let cursor
  let snapshotIds: string[] | null
  try {
    cursor = before ? chatCursorSchema.parse(JSON.parse(before)) : null
    snapshotIds = snapshot ? z.array(z.string().uuid()).min(1).max(100).parse(JSON.parse(snapshot)) : null
  } catch { throw badRequest("Paginação inválida") }
  const sql = getSql()
  // Snapshot batches refresh loaded history, including edits/deletions/reactions.
  const [rows, pins, settings, ministry, unread] = await Promise.all([
    sql<{ id: string; created_at: Date }[]>`
      select id, created_at from public.ministry_chat_messages where ministry_id = ${access.ministryId}
        and (${cursor?.at ?? null}::timestamptz is null or (created_at, id) < (${cursor?.at ?? null}::timestamptz, ${cursor?.id ?? null}::uuid))
        and (${snapshotIds === null} or id = any(${sql.array(snapshotIds ?? [])}::uuid[]))
      order by created_at desc, id desc limit ${snapshotIds ? 100 : 51}
    `,
    sql<{ id: string }[]>`select id from public.ministry_chat_messages where ministry_id = ${access.ministryId} and pinned_at is not null and deleted_at is null order by pinned_at desc limit 5`,
    sql<{ muted: boolean; push_enabled: boolean }[]>`select muted, push_enabled from public.ministry_chat_reads where ministry_id = ${access.ministryId} and profile_id = ${access.user.id}`,
    sql<{ name: string }[]>`select name from public.ministries where id = ${access.ministryId}`,
    sql<{ id: string }[]>`select m.id from public.ministry_chat_messages m
      left join public.ministry_chat_reads r on r.ministry_id=m.ministry_id and r.profile_id=${access.user.id}
      where m.ministry_id=${access.ministryId} and m.deleted_at is null and m.sender_profile_id<>${access.user.id}
        and (r.last_read_at is null or (m.created_at,m.id)>(r.last_read_at,r.last_read_id))
      order by m.created_at,m.id limit 1`,
  ])
  const limit = snapshotIds ? 100 : 50
  const page = rows.slice(0, limit)
  const oldest = page.at(-1)
  const all = await hydrateMessages(sql, access.ministryId, access.user.id, [...new Set([...page.map(row => row.id), ...pins.map(row => row.id)])])
  return {
    messages: all.filter(row => page.some(item => item.id === row.id)), pinned: pins.map(pin => all.find(row => row.id === pin.id)!).filter(Boolean),
    nextCursor: rows.length > limit && oldest ? { at: iso(oldest.created_at)!, id: oldest.id } : null,
    firstUnreadId: unread[0]?.id ?? null,
    actorId: access.user.id, canManage: access.canManage, muted: settings[0]?.muted ?? false,
    pushEnabled: settings[0]?.push_enabled ?? !["superadmin", "admin", "pastor"].includes(access.user.role), ministryName: ministry[0].name,
  }
}

export async function listMinistryChats(): Promise<MinistryChatSummary[]> {
  const { user, companyId } = await actor()
  const rows = await getSql()<{ id: string; name: string; last_body: string | null; last_deleted: Date | null; last_at: Date | null; unread: number; muted: boolean | null }[]>`
    select m.id, m.name, last.body as last_body, last.deleted_at as last_deleted, last.created_at as last_at, r.muted,
      (select count(*)::int from public.ministry_chat_messages msg where msg.ministry_id = m.id and msg.sender_profile_id <> ${user.id} and msg.deleted_at is null
        and (r.last_read_at is null or (msg.created_at, msg.id) > (r.last_read_at, r.last_read_id))) as unread
    from public.ministries m left join public.ministry_chat_reads r on r.ministry_id = m.id and r.profile_id = ${user.id}
    left join lateral (select body, deleted_at, created_at from public.ministry_chat_messages where ministry_id = m.id order by created_at desc, id desc limit 1) last on true
    where m.company_id = ${companyId} and private.ministry_chat_profile_access(${user.id}::uuid, m.id)
    order by last.created_at desc nulls last, m.name
  `
  return rows.map(row => ({ id: row.id, name: row.name, lastMessage: row.last_deleted ? "Mensagem removida" : row.last_body || (row.last_at ? "Anexo" : "Comece a conversa"), lastMessageAt: iso(row.last_at), unread: row.unread, muted: row.muted ?? false }))
}

export async function prepareChatUpload(identifier: string, input: unknown) {
  const access = await requireChatAccess(identifier)
  const data = chatUploadSchema.parse(input)
  const verdict = await consumeRateLimit({ bucket: "ministry.chat.upload", identifier: access.user.id, max: 30, windowSeconds: 60 })
  if (!verdict.allowed) throw new ApiError(429, "BAD_REQUEST", "Aguarde um minuto antes de enviar mais arquivos")
  const id = randomUUID()
  const extension = data.name.split(".").pop()!.toLowerCase()
  const path = `${access.companyId}/${access.ministryId}/${access.user.id}/${id}.${extension}`
  const bucket = storage()
  const signed = await bucket.createSignedUploadUrl(path, { upsert: false })
  if (signed.error) throw new Error("Não foi possível preparar o upload")
  await getSql()`insert into public.ministry_chat_attachments(id, company_id, ministry_id, owner_profile_id, storage_path, name, mime_type, size_bytes)
    values (${id}, ${access.companyId}, ${access.ministryId}, ${access.user.id}, ${path}, ${data.name}, ${data.mimeType}, ${data.sizeBytes})`
  return { id, path, token: signed.data.token, bucket: CHAT_BUCKET }
}

export async function finalizeChatUpload(identifier: string, idInput: string) {
  const access = await requireChatAccess(identifier)
  const id = z.string().uuid().parse(idInput)
  const sql = getSql()
  const rows = await sql<{ storage_path: string; mime_type: string; size_bytes: number; name: string; verified_at: Date | null }[]>`
    select storage_path, mime_type, size_bytes, name, verified_at from public.ministry_chat_attachments
    where id = ${id} and ministry_id = ${access.ministryId} and owner_profile_id = ${access.user.id} and message_id is null and created_at > now() - interval '2 hours'
  `
  const row = rows[0]
  if (!row) throw notFound("Anexo não encontrado")
  if (row.verified_at) return { id }
  const bucket = storage()
  const downloaded = await bucket.download(row.storage_path)
  if (downloaded.error || !downloaded.data) throw badRequest("Upload incompleto. Tente novamente")
  const bytes = Buffer.from(await downloaded.data.arrayBuffer())
  let duration: number | null = null
  try {
    if (bytes.length !== row.size_bytes || !validChatSignature(bytes, row.mime_type)) throw badRequest("Conteúdo do arquivo inválido")
    if (row.mime_type.includes("openxmlformats") && !bytes.includes(Buffer.from(row.name.toLowerCase().endsWith("docx") ? "word/" : "xl/"))) throw badRequest("Documento inválido")
    if (row.mime_type.startsWith("audio/")) {
      const metadata = await parseBuffer(bytes, { mimeType: row.mime_type }, { duration: true, skipCovers: true })
      duration = metadata.format.duration ?? null
      if (!duration || duration > 180 || metadata.format.trackInfo?.some(track => track.type === 1)) throw badRequest("Áudio deve conter apenas som e durar até três minutos")
    }
  } catch (error) {
    const removed = await bucket.remove([row.storage_path])
    if (!removed.error) await sql`delete from public.ministry_chat_attachments where id = ${id} and message_id is null`
    throw error instanceof ApiError ? error : badRequest("Não foi possível validar o áudio")
  }
  await sql`update public.ministry_chat_attachments set verified_at = now(), duration_seconds = ${duration} where id = ${id} and message_id is null`
  return { id }
}

export async function sendMinistryChat(identifier: string, input: unknown) {
  const access = await requireChatAccess(identifier)
  const data = chatSendSchema.parse(input)
  const sql = getSql()
  const existing = await sql<{ id: string }[]>`select id from public.ministry_chat_messages where ministry_id = ${access.ministryId} and sender_profile_id = ${access.user.id} and client_id = ${data.clientId}`
  if (existing[0]) return { id: existing[0].id }
  const verdict = await consumeRateLimit({ bucket: "ministry.chat.send", identifier: access.user.id, max: 30, windowSeconds: 60 })
  if (!verdict.allowed) throw new ApiError(429, "BAD_REQUEST", "Aguarde um minuto antes de enviar mais mensagens")
  const id = await sql.begin(async tx => {
    await tx`select id from public.ministries where id = ${access.ministryId} for update`
    const allowed = await tx<{ allowed: boolean }[]>`select private.ministry_chat_profile_access(${access.user.id}::uuid, ${access.ministryId}::uuid) as allowed`
    if (!allowed[0]?.allowed) throw forbidden()
    const repeated = await tx<{ id: string }[]>`select id from public.ministry_chat_messages where ministry_id = ${access.ministryId} and sender_profile_id = ${access.user.id} and client_id = ${data.clientId}`
    if (repeated[0]) return repeated[0].id
    if (data.replyToId) {
      const reply = await tx`select id from public.ministry_chat_messages where id = ${data.replyToId} and ministry_id = ${access.ministryId} and deleted_at is null`
      if (!reply[0]) throw badRequest("Mensagem de resposta inválida")
    }
    const attachments = data.attachmentIds.length ? await tx<{ id: string }[]>`
      select id from public.ministry_chat_attachments where id = any(${tx.array(data.attachmentIds)}::uuid[]) and ministry_id = ${access.ministryId}
        and owner_profile_id = ${access.user.id} and message_id is null and verified_at is not null and created_at > now() - interval '2 hours' for update
    ` : []
    if (attachments.length !== data.attachmentIds.length) throw badRequest("Anexos inválidos ou expirados. Envie-os novamente")
    const messages = await tx<{ id: string }[]>`
      insert into public.ministry_chat_messages(company_id, ministry_id, sender_profile_id, client_id, body, reply_to_id, created_at)
      values (${access.companyId}, ${access.ministryId}, ${access.user.id}, ${data.clientId}, ${data.body}, ${data.replyToId ?? null},
        greatest(date_trunc('milliseconds', clock_timestamp()), (select max(created_at) + interval '1 millisecond' from public.ministry_chat_messages where ministry_id = ${access.ministryId}))) returning id
    `
    const messageId = messages[0].id
    if (data.attachmentIds.length) await tx`update public.ministry_chat_attachments set message_id = ${messageId} where id = any(${tx.array(data.attachmentIds)}::uuid[])`
    await tx`
      insert into public.ministry_chat_push_outbox(company_id, ministry_id, message_id, target_profile_id, subscription_id)
      select ${access.companyId}, ${access.ministryId}, ${messageId}, p.id, s.id
      from public.profiles p join public.notification_push_subscriptions s on s.profile_id = p.id and s.company_id = ${access.companyId} and s.is_active
      left join public.ministry_chat_reads r on r.ministry_id = ${access.ministryId} and r.profile_id = p.id
      where p.id <> ${access.user.id} and private.ministry_chat_profile_access(p.id, ${access.ministryId}::uuid)
        and not coalesce(r.muted, false) and coalesce(r.push_enabled, p.role not in ('superadmin','admin','pastor'))
        and not exists(select 1 from public.notification_channel_preferences pref where pref.company_id = s.company_id and pref.person_id = s.person_id and pref.channel = 'push' and pref.opted_out)
      on conflict (message_id, subscription_id) do nothing
    `
    return messageId
  })
  afterResponse("ministry chat push", () => processMinistryChatPush(50, id))
  return { id }
}

export async function commandMinistryChat(identifier: string, input: unknown) {
  const access = await requireChatAccess(identifier)
  const data = chatCommandSchema.parse(input)
  const sql = getSql()
  if (data.action === "clear") {
    if (!access.canManage) throw forbidden()
    const paths = await sql.begin(async tx => {
      await tx`select id from public.ministries where id = ${access.ministryId} and company_id = ${access.companyId} for update`
      const allowed = await tx<{ allowed: boolean }[]>`
        select private.ministry_chat_profile_access(p.id, ${access.ministryId}::uuid) and
          (coalesce(p.roles, array[p.role]) && array['superadmin','admin','pastor']::text[] or exists (
            select 1 from public.ministry_memberships mm join public.people person on person.id = mm.person_id
            where mm.ministry_id = ${access.ministryId} and mm.company_id = ${access.companyId}
              and mm.status = 'active' and mm.left_at is null and mm.role in ('leader','coordinator')
              and person.company_id = ${access.companyId} and person.is_active and person.deleted_at is null and person.status <> 'inactive'
              and (person.profile_id = p.id or person.id = p.person_id)
          )) as allowed from public.profiles p where p.id = ${access.user.id}
      `
      if (!allowed[0]?.allowed) throw forbidden()
      const files = await tx<{ storage_path: string }[]>`
        select storage_path from public.ministry_chat_attachments
        where ministry_id = ${access.ministryId} and company_id = ${access.companyId} and message_id is not null
      `
      await tx`delete from public.ministry_chat_messages where ministry_id = ${access.ministryId} and company_id = ${access.companyId}`
      await tx`update public.ministry_chat_reads set last_read_at = null, last_read_id = null
        where ministry_id = ${access.ministryId} and company_id = ${access.companyId}`
      return files.map(file => file.storage_path)
    })
    if (paths.length) afterResponse("ministry chat cleared attachments", async () => {
      for (let index = 0; index < paths.length; index += 100) {
        const result = await storage().remove(paths.slice(index, index + 100))
        if (result.error) throw new Error("Falha ao remover arquivos do chat limpo")
      }
    })
    await writeAuditLog({ action: "ministry.chat.clear", companyId: access.companyId, entityTable: "ministries", entityId: access.ministryId })
    return { ok: true }
  }
  if (data.action === "preferences") {
    const defaultPush = !["superadmin", "admin", "pastor"].includes(access.user.role)
    await sql`insert into public.ministry_chat_reads(company_id, ministry_id, profile_id, muted, push_enabled, push_opted_out)
      values (${access.companyId}, ${access.ministryId}, ${access.user.id}, ${data.muted ?? false}, ${data.pushEnabled ?? defaultPush}, ${data.pushEnabled === false})
      on conflict(ministry_id, profile_id) do update set muted = coalesce(${data.muted ?? null}::boolean, ministry_chat_reads.muted), push_enabled = coalesce(${data.pushEnabled ?? null}::boolean, ministry_chat_reads.push_enabled),
        push_opted_out = case when ${data.pushEnabled ?? null}::boolean is null then ministry_chat_reads.push_opted_out else not ${data.pushEnabled ?? null}::boolean end`
    return { ok: true }
  }
  await sql.begin(async tx => {
    await tx`select id from public.ministries where id = ${access.ministryId} for update`
    const allowed = await tx<{ allowed: boolean }[]>`select private.ministry_chat_profile_access(${access.user.id}::uuid, ${access.ministryId}::uuid) as allowed`
    if (!allowed[0]?.allowed) throw forbidden()
    const rows = await tx<{ sender_profile_id: string; created_at: Date; deleted_at: Date | null; pinned_at: Date | null }[]>`
      select sender_profile_id, created_at, deleted_at, pinned_at from public.ministry_chat_messages where id = ${data.messageId} and ministry_id = ${access.ministryId} for update
    `
    const message = rows[0]
    if (!message) throw notFound("Mensagem não encontrada")
    if (data.action === "read") {
      await tx`insert into public.ministry_chat_reads(company_id, ministry_id, profile_id, last_read_at, last_read_id, push_enabled)
        values (${access.companyId}, ${access.ministryId}, ${access.user.id}, ${message.created_at}, ${data.messageId}, ${!["superadmin", "admin", "pastor"].includes(access.user.role)})
        on conflict(ministry_id, profile_id) do update set last_read_at = excluded.last_read_at, last_read_id = excluded.last_read_id
          where ministry_chat_reads.last_read_at is null or (ministry_chat_reads.last_read_at, ministry_chat_reads.last_read_id) < (excluded.last_read_at, excluded.last_read_id)`
      return
    }
    if (message.deleted_at) throw badRequest("Mensagem removida")
    if (data.action === "edit") {
      if (message.sender_profile_id !== access.user.id) throw forbidden()
      if (!data.body && !(await tx`select id from public.ministry_chat_attachments where message_id = ${data.messageId}`)[0]) throw badRequest("Mensagem vazia")
      await tx`update public.ministry_chat_messages set body = ${data.body}, edited_at = now() where id = ${data.messageId}`
    } else if (data.action === "delete") {
      if (message.sender_profile_id !== access.user.id && !access.canManage) throw forbidden()
      await tx`update public.ministry_chat_messages set body = '', deleted_at = now(), pinned_at = null, pinned_by = null where id = ${data.messageId}`
      await tx`update public.ministry_chat_reactions set active = false where message_id = ${data.messageId}`
      await tx`update public.ministry_chat_push_outbox set status = 'canceled' where message_id = ${data.messageId} and status in ('pending','failed')`
    } else if (data.action === "react") {
      await tx`insert into public.ministry_chat_reactions(company_id, ministry_id, message_id, profile_id, emoji, active)
        values (${access.companyId}, ${access.ministryId}, ${data.messageId}, ${access.user.id}, ${data.emoji}, ${data.active})
        on conflict(message_id, profile_id, emoji) do update set active = excluded.active`
    } else if (data.action === "pin") {
      if (!access.canManage) throw forbidden()
      if (data.pinned && !message.pinned_at) {
        const count = await tx<{ n: number }[]>`select count(*)::int as n from public.ministry_chat_messages where ministry_id = ${access.ministryId} and pinned_at is not null`
        if (count[0].n >= 5) throw badRequest("Desafixe uma mensagem antes de fixar outra. O limite é cinco")
      }
      await tx`update public.ministry_chat_messages set pinned_at = ${data.pinned ? new Date() : null}, pinned_by = ${data.pinned ? access.user.id : null} where id = ${data.messageId}`
    }
  })
  if (data.action === "delete" || data.action === "pin") await writeAuditLog({ action: `ministry.chat.${data.action}`, companyId: access.companyId, entityTable: "ministry_chat_messages", entityId: data.messageId, metadata: { ministryId: access.ministryId } })
  return { ok: true }
}

export async function downloadChatFile(identifier: string, idInput: string, range: string | null) {
  const access = await requireChatAccess(identifier)
  const id = z.string().uuid().parse(idInput)
  const rows = await getSql()<{ storage_path: string; mime_type: string; name: string }[]>`
    select f.storage_path, f.mime_type, f.name from public.ministry_chat_attachments f
    join public.ministry_chat_messages m on m.id = f.message_id and m.deleted_at is null
    where f.id = ${id} and f.ministry_id = ${access.ministryId} and f.verified_at is not null
  `
  const row = rows[0]
  if (!row) throw notFound("Anexo não encontrado")
  const signed = await storage().createSignedUrl(row.storage_path, 30)
  if (signed.error) throw notFound("Arquivo não encontrado")
  const response = await fetch(signed.data.signedUrl, { headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {}, cache: "no-store" })
  if (!response.ok) throw notFound("Arquivo não encontrado")
  const headers = new Headers({ "Content-Type": row.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" })
  const disposition = row.mime_type.startsWith("image/") || row.mime_type.startsWith("audio/") ? "inline" : "attachment"
  headers.set("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`)
  for (const key of ["Content-Range", "Content-Length"]) { const value = response.headers.get(key); if (value) headers.set(key, value) }
  return new Response(response.body, { status: response.status, headers })
}
