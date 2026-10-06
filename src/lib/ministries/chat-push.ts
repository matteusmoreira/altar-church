import "server-only"
import webpush from "web-push"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CHAT_BUCKET } from "./chat-contract"

interface Delivery { id: string; attempts: number; subscription_id: string; target_profile_id: string; company_id: string; ministry_id: string; message_id: string }
export async function processMinistryChatPush(limit = 25, messageId?: string) {
  const sql = getSql()
  if (!messageId) {
    const abandoned = await sql<{ id: string; storage_path: string }[]>`select id,storage_path from public.ministry_chat_attachments
      where message_id is null and created_at < now() - interval '24 hours' order by created_at limit 50`
    if (abandoned.length) {
      const client = createSupabaseAdminClient()
      const removed = await client?.storage.from(CHAT_BUCKET).remove(abandoned.map(item => item.storage_path))
      if (removed && !removed.error) await sql`delete from public.ministry_chat_attachments where id=any(${sql.array(abandoned.map(item => item.id))}::uuid[]) and message_id is null`
    }
  }
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return { processed: 0, sent: 0, failed: 0, configured: false }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  // A crashed process must not strand a delivery forever.
  await sql`update public.ministry_chat_push_outbox set status = 'failed', locked_at = null, next_attempt_at = now()
    where status = 'processing' and locked_at < now() - interval '10 minutes'`
  const claimed = await sql<Delivery[]>`
    with candidates as (
      select id from public.ministry_chat_push_outbox where status in ('pending','failed') and attempts < 8 and next_attempt_at <= now()
        and (${messageId ?? null}::uuid is null or message_id = ${messageId ?? null}::uuid)
      order by next_attempt_at, created_at for update skip locked limit ${Math.max(1, Math.min(limit, 100))}
    ) update public.ministry_chat_push_outbox o set status = 'processing', locked_at = now(), attempts = o.attempts + 1
      from candidates c where o.id = c.id returning o.*
  `
  let sent = 0, failed = 0
  async function deliver(item: Delivery) {
    try {
      // Check again immediately before delivery: membership, preferences and reading may have changed.
      const rows = await sql<{ endpoint: string; p256dh: string; auth_key: string; name: string; role: string }[]>`
        select s.endpoint, s.p256dh, s.auth_key, ministry.name, p.role
        from public.notification_push_subscriptions s
        join public.ministry_chat_messages m on m.id = ${item.message_id} and m.deleted_at is null
        join public.ministries ministry on ministry.id = m.ministry_id
        join public.profiles p on p.id = ${item.target_profile_id} and p.id = s.profile_id
        left join public.ministry_chat_reads r on r.ministry_id = m.ministry_id and r.profile_id = p.id
        where s.id = ${item.subscription_id} and s.company_id = ${item.company_id} and s.is_active
          and m.sender_profile_id <> p.id and private.ministry_chat_profile_access(p.id, m.ministry_id)
          and not coalesce(r.muted, false) and coalesce(r.push_enabled, p.role not in ('superadmin','admin','pastor'))
          and (r.last_read_at is null or (m.created_at, m.id) > (r.last_read_at, r.last_read_id))
          and not exists(select 1 from public.notification_channel_preferences pref where pref.company_id = s.company_id and pref.person_id = s.person_id and pref.channel = 'push' and pref.opted_out)
      `
      if (!rows[0]) {
        await sql`update public.ministry_chat_push_outbox set status = 'canceled', locked_at = null where id = ${item.id}`
        return
      }
      const target = rows[0]
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_key } }, JSON.stringify({
        title: target.name, body: "Nova mensagem", url: ["superadmin","admin","pastor"].includes(target.role) ? `/ministerios/${item.ministry_id}/chat` : `/membro/chats?ministry=${item.ministry_id}`, tag: `ministry-${item.ministry_id}`,
      }), { TTL: 3600, urgency: "normal", timeout: 10_000 })
      await sql`update public.ministry_chat_push_outbox set status = 'sent', sent_at = now(), locked_at = null, last_error = null where id = ${item.id}`
      sent++
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) await sql`update public.notification_push_subscriptions set is_active = false, updated_at = now() where id = ${item.subscription_id}`
      const terminal = statusCode === 404 || statusCode === 410
      await sql`update public.ministry_chat_push_outbox set status = ${terminal ? "canceled" : "failed"}, locked_at = null,
        next_attempt_at = ${new Date(Date.now() + Math.min(360, 2 ** item.attempts) * 60_000)}, last_error = ${terminal ? "Dispositivo expirado" : "Falha no provedor push"}
        where id = ${item.id}`
      failed++
    }
  }
  for (let index = 0; index < claimed.length; index += 5) await Promise.all(claimed.slice(index, index + 5).map(deliver))
  return { processed: claimed.length, sent, failed, configured: true }
}
