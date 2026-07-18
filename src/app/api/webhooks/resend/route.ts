import { NextResponse } from "next/server"
import { Resend } from "resend"
import { getSql } from "@/lib/db/client"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  const eventId = request.headers.get("svix-id")
  const timestamp = request.headers.get("svix-timestamp")
  const signature = request.headers.get("svix-signature")
  if (!apiKey || !webhookSecret || !eventId || !timestamp || !signature) return new NextResponse("Não autorizado", { status: 401 })

  try {
    const payload = await request.text()
    const resend = new Resend(apiKey)
    const event = resend.webhooks.verify({
      payload,
      headers: { id: eventId, timestamp, signature },
      webhookSecret,
    })
    const sql = getSql()
    const inserted = await sql<{ provider_event_id: string }[]>`
      insert into public.volunteer_delivery_webhook_events (provider, provider_event_id, payload)
      values ('resend', ${eventId}, ${payload}::jsonb)
      on conflict (provider, provider_event_id) do nothing
      returning provider_event_id
    `
    if (!inserted[0]?.provider_event_id) return NextResponse.json({ ok: true, duplicate: true })

    if ("data" in event && "email_id" in event.data) {
      // Reconciliação por origem: cada provider_id existe em apenas uma das outboxes.
      if (event.type === "email.delivered") {
        await sql`
          update public.volunteer_delivery_outbox
          set status = 'delivered', delivered_at = now(), updated_at = now()
          where channel = 'email' and provider_id = ${event.data.email_id}
        `
        await sql`
          update public.kid_delivery_outbox
          set status = 'delivered', delivered_at = now(), updated_at = now()
          where channel = 'email' and provider_id = ${event.data.email_id}
        `
      }
      if (["email.bounced", "email.complained", "email.failed", "email.suppressed"].includes(event.type)) {
        await sql`
          update public.volunteer_delivery_outbox
          set status = 'failed', last_error = ${event.type}, updated_at = now()
          where channel = 'email' and provider_id = ${event.data.email_id}
        `
        await sql`
          update public.kid_delivery_outbox
          set status = 'failed', last_error = ${event.type}, updated_at = now()
          where channel = 'email' and provider_id = ${event.data.email_id}
        `
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return new NextResponse("Webhook inválido", { status: 400 })
  }
}
