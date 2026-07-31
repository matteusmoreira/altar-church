import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"

export type NotificationDelivery = {
  id: string
  channel: "push" | "email" | "whatsapp"
  recipient: string
  recipientName: string
  status: "pending" | "processing" | "sent" | "failed" | "canceled" | "dead"
  attempts: number
  lastError: string | null
  providerId: string | null
  createdAt: string
  sentAt: string | null
}

export type NotificationDetails = {
  id: string
  title: string
  content: string
  method: string
  audienceKind: string
  status: string
  snapshotCount: number
  deliveries: NotificationDelivery[]
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null
}

export async function getNotificationDetails(notificationId: string, companyIdInput?: string | null): Promise<NotificationDetails> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  await requirePermission("notification.view", companyId)
  const sql = getSql()
  const [campaigns, deliveries] = await Promise.all([
    sql<{ id: string; title: string; content: string; method: string; audience_kind: string; status: string; snapshot_count: number }[]>`
      select id, title, content, method, audience_kind, status, snapshot_count
      from public.notifications
      where id = ${notificationId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `,
    sql<{ id: string; channel: NotificationDelivery["channel"]; recipient: string; recipient_name: string; status: NotificationDelivery["status"]; attempts: number; last_error: string | null; provider_id: string | null; created_at: Date | string; sent_at: Date | string | null }[]>`
      select id, channel, recipient, recipient_name, status, attempts, last_error, provider_id, created_at, sent_at
      from public.notification_deliveries
      where notification_id = ${notificationId} and company_id = ${companyId}
      order by created_at, id
      limit 2000
    `,
  ])
  const campaign = campaigns[0]
  if (!campaign) throw new Error("Campanha não encontrada")
  return {
    id: campaign.id,
    title: campaign.title,
    content: campaign.content,
    method: campaign.method,
    audienceKind: campaign.audience_kind,
    status: campaign.status,
    snapshotCount: Number(campaign.snapshot_count ?? 0),
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      channel: delivery.channel,
      recipient: delivery.recipient,
      recipientName: delivery.recipient_name,
      status: delivery.status,
      attempts: Number(delivery.attempts ?? 0),
      lastError: delivery.last_error,
      providerId: delivery.provider_id,
      createdAt: iso(delivery.created_at) ?? "",
      sentAt: iso(delivery.sent_at),
    })),
  }
}
