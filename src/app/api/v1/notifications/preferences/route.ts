import { NextResponse } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { getMyNotificationPreferences, saveMyNotificationPreference, saveMyNotificationPushSubscription } from "@/lib/notifications/preferences"

export const dynamic = "force-dynamic"

async function requireSession(request: Request) {
  await requireApiAuth(request, { sessionOnly: true })
}

export async function GET(request: Request) {
  try {
    await requireSession(request)
    return NextResponse.json({ data: await getMyNotificationPreferences() })
  } catch (error) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: error instanceof Error ? error.message : "Acesso negado" } }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    await requireSession(request)
    const body = await request.json() as { channel?: string; optedOut?: boolean; subscription?: unknown }
    if (body.subscription) {
      return NextResponse.json({ data: await saveMyNotificationPushSubscription(body.subscription) })
    }
    if (!body.channel || typeof body.optedOut !== "boolean") {
      return NextResponse.json({ error: { code: "VALIDATION", message: "channel e optedOut são obrigatórios" } }, { status: 400 })
    }
    return NextResponse.json({ data: await saveMyNotificationPreference(body.channel, body.optedOut) })
  } catch (error) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível salvar" } }, { status: 400 })
  }
}
