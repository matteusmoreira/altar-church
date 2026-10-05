import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processAutomations } from "@/lib/automations/runtime";
import { getSql } from "@/lib/db/client";
export const runtime = "nodejs";
export const maxDuration = 60;
function authorized(request: Request) {
  const expected = process.env.AUTOMATION_WORKER_SECRET,
    provided = request.headers.get("x-automation-worker-secret") ?? "";
  const expectedBytes = Buffer.from(expected ?? ""), providedBytes = Buffer.from(provided);
  return Boolean(expected && expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes));
}
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const sql = getSql();
    const [schema] = await sql`select to_regclass('public.automation_inbox') is not null and to_regclass('public.automation_send_slots') is not null and to_regclass('public.automation_registrations') is not null as ready`;
    if (!schema.ready) return NextResponse.json({ error: "Migrações de automação pendentes" }, { status: 503 });
    const inbox = await sql`select status,count(*)::int as total,extract(epoch from now()-min(created_at))::int as oldest_seconds from public.automation_inbox where status<>'processed' group by status`;
    const runs = await sql`select status,count(*)::int as total,extract(epoch from now()-min(due_at))::int as oldest_seconds from public.automation_runs where status in ('ready','working','review','failed') group by status`;
    return NextResponse.json({ dryRun: true, schemaReady: true, inbox, runs, batchSize: 500, concurrency: 4, sendIntervalMs: Number(process.env.AUTOMATION_SEND_INTERVAL_MS ?? 250) });
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar a fila" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await processAutomations(500, { concurrency: 4 }));
  } catch {
    return NextResponse.json(
      { error: "Falha ao processar automações" },
      { status: 500 },
    );
  }
}
