import "server-only"
import webpush from "web-push"
import { getSql } from "@/lib/db/client"
import { assertResolvableSafeWebhookUrl } from "@/lib/integrations/crypto"

export async function processInboxPush(batchSize = 25) {
  const sql = getSql()
  await sql`select private.detect_operational_notification_publications()`
  const due = await sql<{ detected: number }[]>`select private.detect_operational_notification_due() as detected`
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return { configured: false, detected: due[0]?.detected ?? 0, processed: 0, sent: 0, failed: 0 }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  // A worker crash leaves a lease, not a permanently stuck delivery.
  await sql`update private.notification_inbox_push set status=case when attempts>=8 then 'dead' else 'failed' end,locked_at=null,next_attempt_at=now(),last_error='Execução interrompida'
    where status='processing' and locked_at<now()-interval '5 minutes'`
  const claimed = await sql<{ id: string; inbox_id: string; subscription_id: string; attempts: number }[]>`
    with due as (select id from private.notification_inbox_push where status in ('pending','failed') and attempts<8 and next_attempt_at<=now()
      order by next_attempt_at,id for update skip locked limit ${Math.max(1,Math.min(100,batchSize))})
    update private.notification_inbox_push p set status='processing',attempts=p.attempts+1,locked_at=now() from due where p.id=due.id returning p.id,p.inbox_id,p.subscription_id,p.attempts`
  let sent = 0; let failed = 0
  async function deliver(item: typeof claimed[number]) {
    try {
      const rows = await sql<{ title: string; summary: string; module: string; href: string; scope_kind: string; scope_id: string | null; endpoint: string; p256dh: string; auth_key: string }[]>`
        select n.title,n.summary,n.module,n.href,n.scope_kind,n.scope_id,s.endpoint,s.p256dh,s.auth_key
        from public.notification_inbox n join public.notification_push_subscriptions s on s.id=${item.subscription_id} and s.company_id=n.company_id and s.profile_id=n.profile_id and s.is_active
        where n.id=${item.inbox_id} and n.read_at is null and private.notification_source_access(n)
          and not exists(select 1 from public.notification_channel_preferences pref where pref.company_id=n.company_id and pref.person_id=s.person_id and pref.channel='push' and pref.opted_out)
          and (n.kind <> 'chat.message' or n.scope_kind <> 'ministry' or not exists(select 1 from public.ministry_chat_reads r where r.ministry_id=n.scope_id and r.profile_id=n.profile_id and
            (r.muted or r.push_opted_out or exists(select 1 from public.ministry_chat_messages m where m.id=n.source_id and (m.created_at,m.id)<=(r.last_read_at,r.last_read_id)))))
          and (n.module <> 'volunteers' or not exists(select 1 from public.volunteer_notification_preferences pref join public.volunteer_profiles v on v.id=pref.volunteer_id join public.people person on person.id=v.person_id
            where pref.company_id=n.company_id and person.profile_id=n.profile_id and (not pref.push_enabled or (n.kind='chat.message' and not pref.chat_enabled) or (n.kind like 'scale.%' and not pref.schedule_enabled))))`
      const target = rows[0]
      if (!target) { await sql`update private.notification_inbox_push set status='canceled',locked_at=null where id=${item.id}`; return }
      await assertResolvableSafeWebhookUrl(target.endpoint)
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_key } }, JSON.stringify({ title: target.title, body: ["kids","prayer","finance"].includes(target.module) ? "Há um aviso para você. Abra o sistema para ver os detalhes." : target.summary, url: target.href, tag: `inbox-${item.inbox_id}` }), { TTL: 86400, urgency: "normal", timeout: 10_000 })
      await sql`update private.notification_inbox_push set status='sent',sent_at=now(),locked_at=null,last_error=null where id=${item.id}`
      sent++
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      const expired = statusCode === 404 || statusCode === 410
      if (expired) await sql`update public.notification_push_subscriptions set is_active=false,updated_at=now() where id=${item.subscription_id}`
      await sql`update private.notification_inbox_push set status=${expired ? "canceled" : item.attempts>=8 ? "dead" : "failed"},locked_at=null,
        last_error=${expired ? "Dispositivo expirado" : "Falha no provedor push"},next_attempt_at=${new Date(Date.now()+Math.min(360,2**item.attempts)*60_000)} where id=${item.id}`
      failed++
    }
  }
  // Bounded concurrency keeps a batch of unavailable devices inside the worker deadline.
  for (let offset = 0; offset < claimed.length; offset += 5) {
    await Promise.all(claimed.slice(offset, offset + 5).map(deliver))
  }
  return { configured: true, detected: Number(due[0]?.detected ?? 0), processed: claimed.length, sent, failed }
}
