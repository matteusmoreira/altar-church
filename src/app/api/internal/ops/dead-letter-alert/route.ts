import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"

const QUERIES = [
  { key: "integration", table: "integration_delivery_outbox" },
  { key: "volunteer", table: "volunteer_delivery_outbox" },
  { key: "kids", table: "kid_delivery_outbox" },
  { key: "notifications", table: "notification_deliveries" },
] as const

/**
 * Alerta de dead letters.
 * Conta status='dead' nas 4 filas e envia e-mail via Resend quando ha novidade.
 * Chamado por cron externo (ex. Supabase pg_cron via pg_net, ou UptimeRobot cron)
 * a cada 15 min. Header: x-ops-alert-secret: $OPS_ALERT_SECRET
 * Destino: OPS_ALERT_EMAIL (ex. time de operacao da igreja).
 */
export async function POST(request: Request) {
  const expected = process.env.OPS_ALERT_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Worker não configurado" } },
      { status: 500 },
    )
  }
  const provided = request.headers.get("x-ops-alert-secret")
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
      { status: 401 },
    )
  }

  const sql = getSql()
  const counts: Record<string, number> = {}
  for (const { key, table } of QUERIES) {
    const rows = await sql<{ count: number }[]>`
      select count(*)::int as count from public.${sql(table)} where status = 'dead'
    `.catch(() => [{ count: -1 }])
    counts[key] = Number(rows[0]?.count ?? -1)
  }
  const total = Object.values(counts).filter((n) => n > 0).reduce((a, b) => a + b, 0)

  if (total === 0) {
    return NextResponse.json({ ok: true, dead: counts, alertSent: false })
  }

  const apiKey = process.env.RESEND_API_KEY ?? ""
  const from = process.env.RESEND_FROM_EMAIL ?? ""
  const to = process.env.OPS_ALERT_EMAIL ?? ""
  if (!apiKey || !from || !to) {
    return NextResponse.json({ ok: true, dead: counts, alertSent: false, reason: "alerta por e-mail não configurado" })
  }

  const detail = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[Altar Church] ${total} dead letter(s) nas filas`,
      text: `Dead letters detectados em ${new Date().toISOString()}: ${detail}. Ver painel operacional /admin/operacoes.`,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  return NextResponse.json({ ok: true, dead: counts, alertSent: response.ok })
}
