import { getSql } from "@/lib/db/client";
import { authenticateAutomationWebhook, processAutomationWebhook } from "./webhook";
import { normalizeUazapiEvent } from "./webhook-contract";
import { createHash, randomUUID } from "node:crypto";

export class DeferredAutomationDelivery extends Error {
  constructor(public readonly retryAt: Date) { super("Envio aguardando sua vez na fila"); }
}

// Authenticate first, then persist only the normalized event, never the secret.
export async function enqueueAutomationWebhook(instanceId: string, secret: string, body: unknown) {
  const companyId = await authenticateAutomationWebhook(instanceId, secret);
  const event = normalizeUazapiEvent(body);
  if ((!event.id && event.type !== "connection") || event.history) return { ignored: true };
  const eventKey = event.type === "connection" ? randomUUID() : createHash("sha256").update(JSON.stringify(event)).digest("hex");
  await getSql()`insert into public.automation_inbox(company_id,instance_id,event_key,chat_id,event)
    values(${companyId},${instanceId},${eventKey},${event.chat},${JSON.stringify(event)}::jsonb)
    on conflict(instance_id,event_key) do nothing`;
  return { ok: true, queued: true };
}

export async function processAutomationInbox(batchSize = 100, concurrency = 1, deadline = Date.now() + 45000) {
  const sql = getSql();
  let claimed = 0, processed = 0, failed = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (claimed < batchSize && Date.now() < deadline) {
      claimed++;
      const [row] = await sql`select * from public.claim_automation_inbox()`;
      if (!row) break;
      try {
        await processAutomationWebhook(String(row.company_id), String(row.instance_id), row.event);
        await sql`update public.automation_inbox set status='processed',processed_at=now(),event=null,last_error=null,lease_token=null,lease_until=null
          where id=${row.id} and lease_token=${row.lease_token}`;
        processed++;
      } catch {
        // A failed event blocks later messages in the same chat until it is retried or reviewed.
        await sql`update public.automation_inbox set status=${row.attempts >= 8 ? "failed" : "pending"},
          due_at=now()+${Math.min(300, 2 ** Number(row.attempts))}*interval '1 second',
          last_error='Falha ao processar mensagem recebida',lease_token=null,lease_until=null
          where id=${row.id} and lease_token=${row.lease_token}`;
        failed++;
      }
    }
  }));
  return { processed, failed };
}

// Atomic across workers and serverless instances; other chats continue while this number waits.
export async function reserveAutomationSend(instanceId: string) {
  const sql = getSql();
  const value = Number(process.env.AUTOMATION_SEND_INTERVAL_MS ?? 250);
  const interval = Number.isFinite(value) ? Math.max(100, Math.min(value, 60000)) : 250;
  const [slot] = await sql`insert into public.automation_send_slots(instance_id,next_at)
    values(${instanceId},clock_timestamp()+${interval}*interval '1 millisecond')
    on conflict(instance_id) do update set next_at=clock_timestamp()+${interval}*interval '1 millisecond'
    where automation_send_slots.next_at<=clock_timestamp() returning next_at`;
  if (slot) return;
  const [waiting] = await sql`select next_at from public.automation_send_slots where instance_id=${instanceId}`;
  throw new DeferredAutomationDelivery(new Date(waiting.next_at));
}
