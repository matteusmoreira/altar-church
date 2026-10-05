import { getSql } from "@/lib/db/client";
import { createSignedUrlsByStoragePath } from "@/lib/files/server";
import { buildUazapiPayload } from "@/lib/forms/direct-message";
import type { FormDirectMessage } from "@/lib/forms/types";
import { renderText, type AutomationMessage } from "./contract";

export class UncertainDelivery extends Error {}
export async function sendAutomationMessage(input: {
  companyId: string;
  runId: string;
  nodeId: string;
  instanceId: string;
  chatId: string;
  message: AutomationMessage;
  context: Record<string, unknown>;
  fallbackText?: string;
}) {
  const sql = getSql();
  const [authorized] =
    await sql`select r.id from public.automation_runs r join public.automation_flows f on f.id=r.flow_id where r.id=${input.runId} and r.company_id=${input.companyId} and r.status='working' and f.status='active' and not exists(select 1 from public.automation_conversations c where c.run_id=r.id and c.human)`;
  if (!authorized)
    throw new Error(
      "Envio suspenso por pausa, cancelamento ou atendimento humano",
    );
  const [existing] =
    await sql`select * from public.automation_deliveries where run_id=${input.runId} and node_id=${input.nodeId}`;
  if (
    existing &&
    ["accepted", "sent", "delivered", "read"].includes(existing.status)
  )
    return String(existing.provider_id ?? "");
  if (existing && ["sending", "uncertain"].includes(existing.status))
    throw new UncertainDelivery(
      "Entrega anterior não confirmada; revisar antes de reenviar",
    );
  const [credential] = await sql<
    { base_url: string; instance_token: string }[]
  >`select * from public.get_uazapi_instance_credential(${input.companyId},${input.instanceId})`;
  if (!credential) throw new Error("Instância não conectada ou removida");
  const render = (value: unknown): unknown =>
    typeof value === "string"
      ? renderText(value, input.context)
      : Array.isArray(value)
        ? value.map(render)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, render(v)]),
            )
          : value;
  const message = render(input.message) as AutomationMessage;
  const ids =
    message.type === "carousel"
      ? message.cards.map((c) => c.mediaFileId)
      : "mediaFileId" in message
        ? [message.mediaFileId]
        : [];
  const mediaUrls = new Map<string, string>();
  if (ids.length) {
    const files = await sql<
      { id: string; storage_path: string; mime_type: string }[]
    >`select id,storage_path,mime_type from public.app_files where company_id=${input.companyId} and id=any(${sql.array(ids)}::uuid[]) and is_active and deleted_at is null`;
    if (files.length !== new Set(ids).size)
      throw new Error("Arquivo não disponível nesta igreja");
    if (
      message.type === "carousel" &&
      files.some((f) => !f.mime_type.startsWith("image/"))
    )
      throw new Error("Carrossel exige imagens");
    if ("mediaFileId" in message) {
      const mime = files[0].mime_type,
        kind = message.type;
      if (kind !== "document" && !mime.startsWith(`${kind}/`))
        throw new Error("Formato de mídia incompatível");
    }
    const signed = await createSignedUrlsByStoragePath(
      files.map((f) => f.storage_path),
      3600,
    );
    files.forEach((f) => {
      const url = signed.get(f.storage_path);
      if (url) mediaUrls.set(f.id, url);
    });
    if (mediaUrls.size !== files.length)
      throw new Error("Não foi possível acessar a mídia");
  }
  const payload =
    "mediaFileId" in message
      ? {
          endpoint: "/send/media",
          body: {
            number: input.chatId,
            type: message.type === "audio" ? "audio" : message.type,
            file: mediaUrls.get(message.mediaFileId),
            text: message.text,
            docName: message.filename,
            track_id: `automation:${input.runId}:${input.nodeId}`,
          },
        }
      : buildUazapiPayload(message as FormDirectMessage, {
          number: input.chatId,
          trackId: `automation:${input.runId}:${input.nodeId}`,
          mediaUrls,
        });
  const [delivery] =
    await sql`insert into public.automation_deliveries(company_id,run_id,node_id,instance_id,chat_id,message,status,attempts) values(${input.companyId},${input.runId},${input.nodeId},${input.instanceId},${input.chatId},${JSON.stringify(message)}::jsonb,'sending',1) on conflict(run_id,node_id) do update set status='sending',attempts=automation_deliveries.attempts+1 returning id`;
  async function request(endpoint: string, body: unknown) {
    return fetch(`${credential.base_url.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: credential.instance_token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }
  try {
    let response = await request(payload.endpoint, payload.body);
    if (
      response.status === 400 &&
      input.fallbackText &&
      ["button", "list", "carousel"].includes(message.type)
    )
      response = await request("/send/text", {
        number: input.chatId,
        text: renderText(input.fallbackText, input.context),
        track_id: `automation:${input.runId}:${input.nodeId}:fallback`,
      });
    if (!response.ok) {
      const uncertain = response.status >= 500;
      await sql`update public.automation_deliveries set status=${uncertain ? "uncertain" : "failed"},last_error=${`Uazapi ${response.status}`},updated_at=now() where id=${delivery.id}`;
      if (uncertain)
        throw new UncertainDelivery(
          "Uazapi não confirmou a entrega; revisão necessária",
        );
      throw new Error(`Uazapi recusou a mensagem (${response.status})`);
    }
    const body = (await response.json()) as {
      id?: string;
      messageid?: string;
      messageId?: string;
      key?: { id?: string };
      message?: { id?: string };
    };
    const providerId =
      body.messageid ??
      body.id ??
      body.messageId ??
      body.key?.id ??
      body.message?.id;
    if (!providerId)
      throw new UncertainDelivery(
        "Mensagem aceita sem identificador; revisar entrega",
      );
    await sql`update public.automation_deliveries set status='accepted',provider_id=${providerId},last_error=null,updated_at=now() where id=${delivery.id}`;
    return providerId;
  } catch (error) {
    if (
      error instanceof UncertainDelivery ||
      error instanceof TypeError ||
      error instanceof DOMException ||
      error instanceof SyntaxError
    ) {
      await sql`update public.automation_deliveries set status='uncertain',last_error='Entrega não confirmada',updated_at=now() where id=${delivery.id}`;
      throw new UncertainDelivery(
        "Entrega não confirmada; não houve reenvio automático",
      );
    }
    throw error;
  }
}
export function whatsappChatId(phone: string) {
  if (
    phone.endsWith("@g.us") ||
    phone.endsWith("@lid") ||
    phone.endsWith("@s.whatsapp.net")
  )
    return phone;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15)
    throw new Error("Telefone inválido");
  return `${digits}@s.whatsapp.net`;
}
