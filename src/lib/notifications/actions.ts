"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { retryNotificationDelivery } from "./delivery"

const uuidSchema = z.string().uuid()

export async function retryNotificationDeliveryAction(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "Acesso negado" }
  const companyId = requireUserCompanyId(user, typeof formData.get("companyId") === "string" ? String(formData.get("companyId")) : null)
  await requirePermission("notification.send", companyId)
  const deliveryId = uuidSchema.parse(String(formData.get("deliveryId") ?? ""))
  const retry = await retryNotificationDelivery(deliveryId, companyId)
  if (!retry) return { ok: false, error: "Entrega não encontrada ou já processada" }
  const id = retry.id
  const notificationId = retry.notification_id
  if (notificationId) {
    await getSql()`
      update public.notifications
      set status = 'queued', completed_at = null, updated_at = now()
      where id = ${notificationId} and company_id = ${companyId} and status <> 'canceled'
    `
    await writeAuditLog({
      action: "notification.delivery.retry",
      entityTable: "notification_deliveries",
      entityId: id,
      companyId,
      metadata: { notificationId, profileId: user.id },
    })
    revalidatePath(`/notificacao/${notificationId}`)
  }
  revalidatePath("/notificacao")
  return { ok: true, id }
}
