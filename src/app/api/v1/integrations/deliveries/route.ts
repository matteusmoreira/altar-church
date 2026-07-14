import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { listDeliveries } from "@/lib/integrations/webhooks"
import { getSql } from "@/lib/db/client"
import type { DeliveryRow } from "@/lib/integrations/types"

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50")
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    if (auth.authType === "api_key") {
      const sql = getSql()
      const safeLimit = Math.min(Math.max(limit || 50, 1), 200)
      const rows = await sql`
        select
          d.id, d.company_id, d.endpoint_id, d.event_type, d.event_key, d.payload,
          d.status, d.attempts, d.next_attempt_at, d.last_error, d.response_status,
          d.sent_at, d.created_at, e.name as endpoint_name
        from public.integration_delivery_outbox d
        left join public.integration_webhook_endpoints e on e.id = d.endpoint_id
        where d.company_id = ${auth.companyId}
        order by d.created_at desc
        limit ${safeLimit}
      `
      const data: DeliveryRow[] = rows.map((row) => ({
        id: row.id as string,
        companyId: row.company_id as string,
        endpointId: row.endpoint_id as string,
        endpointName: (row.endpoint_name as string | null) ?? null,
        eventType: row.event_type as string,
        eventKey: row.event_key as string,
        payload: (row.payload as Record<string, unknown>) ?? {},
        status: row.status as DeliveryRow["status"],
        attempts: Number(row.attempts),
        nextAttemptAt:
          row.next_attempt_at instanceof Date
            ? row.next_attempt_at.toISOString()
            : String(row.next_attempt_at),
        lastError: (row.last_error as string | null) ?? null,
        responseStatus: row.response_status == null ? null : Number(row.response_status),
        sentAt: row.sent_at
          ? row.sent_at instanceof Date
            ? row.sent_at.toISOString()
            : String(row.sent_at)
          : null,
        createdAt:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      }))
      return jsonOk(data)
    }

    const data = await listDeliveries({ companyId: auth.companyId, limit })
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
