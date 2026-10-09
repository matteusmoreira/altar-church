"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { retryNotificationDelivery, processNotificationOutbox, prepareImmediatePush } from "./delivery"
import { afterResponse } from "@/lib/performance/after-response"

const uuidSchema = z.string().uuid()

export async function dispatchNotificationPushAction(formData: FormData) {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: "Acesso negado" }
    const companyId = requireUserCompanyId(user)
    await requirePermission("notification.send", companyId)
    const notificationId = uuidSchema.parse(String(formData.get("notificationId") ?? ""))
    if (!process.env.VAPID_SUBJECT || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { ok: false, error: "Push não configurado no servidor. Confira as chaves VAPID." }
    }
    const prepared = await prepareImmediatePush(notificationId, companyId)
    if (!prepared) return { ok: false, error: "Nenhuma entrega disponível para disparo. Aguarde os envios em processamento." }
    await writeAuditLog({ action: "notification.push.dispatch", entityTable: "notifications", entityId: notificationId,
      companyId, metadata: { deliveries: prepared, profileId: user.id } })
    // Await provider results so the click reports an actual attempt, even without cron.
    const result = await processNotificationOutbox(25, notificationId, companyId)
    const remaining = Math.max(0, prepared - result.processed)
    revalidatePath("/notificacao/[id]", "page")
    revalidatePath("/notificacao")
    return { ok: result.failed + result.dead === 0, message: `${result.sent} push aceito(s) pelo provedor. ${result.failed + result.dead} falha(s).${remaining ? ` ${remaining} envio(s) seguem na fila; clique novamente para continuar.` : ""}`,
      error: result.failed + result.dead ? "Falha no disparo. Confira o erro de cada destinatário abaixo." : undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível disparar o push." }
  }
}

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
    revalidatePath("/notificacao/[id]", "page")
    revalidatePath(`/notificacao/${notificationId}`)
    afterResponse("notification retry", () => processNotificationOutbox(25, notificationId, companyId))
  }
  revalidatePath("/notificacao")
  return { ok: true, id }
}
