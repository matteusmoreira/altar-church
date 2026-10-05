import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processAutomations } from "@/lib/automations/runtime";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.AUTOMATION_WORKER_SECRET,
    provided = request.headers.get("x-automation-worker-secret") ?? "";
  if (
    !expected ||
    expected.length !== provided.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  )
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await processAutomations(25));
  } catch {
    return NextResponse.json(
      { error: "Falha ao processar automações" },
      { status: 500 },
    );
  }
}
