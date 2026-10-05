import { NextResponse } from "next/server";
import { z } from "zod";
import { receiveAutomationWebhook } from "@/lib/automations/webhook";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ instanceId: string; secret: string }> },
) {
  try {
    const { instanceId, secret } = await params;
    z.string().uuid().parse(instanceId);
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(secret);
    if (Number(request.headers.get("content-length") ?? 0) > 262144)
      return NextResponse.json({ error: "Payload excedido" }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 262144)
      return NextResponse.json({ error: "Payload excedido" }, { status: 413 });
    return NextResponse.json(
      await receiveAutomationWebhook(instanceId, secret, JSON.parse(raw)),
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook não processado" },
      {
        status:
          error instanceof Error && error.message === "UNAUTHORIZED"
            ? 401
            : 400,
      },
    );
  }
}
