import { NextResponse } from "next/server"
import { z } from "zod"
import { getSql } from "@/lib/db/client"

const bodySchema = z.object({
  provider: z.string().trim().min(1).max(80).default("supabase-pitr"),
  snapshotId: z.string().trim().max(200).optional(),
  status: z.enum(["ok", "failed"]).default("ok"),
  detail: z.string().trim().max(1000).optional(),
})

/**
 * Heartbeat de backup verificado.
 * Chamado apos confirmacao de snapshot/PITR no provedor; grava em public.backup_runs,
 * que alimenta o check de backup do /api/ready.
 * Header: x-backup-heartbeat-secret: $BACKUP_HEARTBEAT_SECRET
 */
export async function POST(request: Request) {
  const expected = process.env.BACKUP_HEARTBEAT_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Worker não configurado" } },
      { status: 500 },
    )
  }
  const provided = request.headers.get("x-backup-heartbeat-secret")
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
      { status: 401 },
    )
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Corpo inválido" } },
      { status: 400 },
    )
  }
  const { provider, snapshotId, status, detail } = parsed.data
  const rows = await getSql()<{ id: string; created_at: string }[]>`
    insert into public.backup_runs (provider, snapshot_id, status, detail)
    values (${provider}, ${snapshotId ?? null}, ${status}, ${detail ?? null})
    returning id, created_at
  `
  return NextResponse.json({ ok: true, id: rows[0]?.id, createdAt: rows[0]?.created_at })
}
