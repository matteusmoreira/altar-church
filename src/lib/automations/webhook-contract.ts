import { z } from "zod";
const object = z.record(z.string(), z.unknown());
const str = (value: unknown) => (typeof value === "string" ? value : "");
const first=(...values:unknown[])=>values.map(str).find(Boolean)??"";
export function normalizeUazapiEvent(input: unknown) {
  const body = object.parse(input),
    message = object.catch({}).parse(body.message ?? body.data),
    key = object.catch({}).parse(message.key),
    content = object.catch({}).parse(message.content),
    receipt = object.catch({}).parse(body.event),
    instance = object.catch({}).parse(body.instance);
  const type = first(body.EventType,body.event,body.type).toLowerCase();
  const ids = Array.isArray(receipt.MessageIDs)
    ? receipt.MessageIDs.filter(
        (id): id is string => typeof id === "string",
      ).slice(0, 100)
    : [];
  const id = first(ids[0],message.messageid,message.id,key.id,body.id);
  const chat = first(message.chatid,message.chatId,key.remoteJid,body.chatid,receipt.chatid,receipt.Chat);
  const sender = str(message.sender ?? message.senderid ?? key.participant);
  const text = first(message.buttonOrListid,message.text,content.selectedButtonId,object.catch({}).parse(content.singleSelectReply).selectedRowId,content.text,content.Text,message.content);
  const fromMe =
    message.fromMe === true || message.from_me === true || key.fromMe === true;
  const api =
    message.wasSentByApi === true ||
    message.was_sent_by_api === true ||
    str(message.track_source).includes("automation") ||
    str(message.track_id).startsWith("automation:");
  const quoted = first(message.replyid,message.quotedMessageId,content.stanzaId);
  const status = str(
    message.status ?? body.status ?? body.state ?? receipt.Type,
  ).toLowerCase();
  const receipts = Array.isArray(receipt.Receipts)
    ? receipt.Receipts.slice(0, 1000)
        .map((item) => object.catch({}).parse(item))
        .map((item) => ({
          participant: str(item.participant_pn ?? item.participant),
          state: str(item.state).toLowerCase(),
          timestamp: typeof item.timestamp === "number" ? item.timestamp : 0,
        }))
    : [];
  return {
    type,
    id,
    ids: ids.length ? ids : [id],
    chat,
    sender,
    text: text.slice(0, 4096),
    fromMe,
    api,
    quoted,
    status,
    receipts,
    connection: str(
      instance.status ?? body.state ?? body.status ?? message.state,
    ),
    history: type.includes("history") || message.isHistory === true,
  };
}
export function deliveryStatus(
  status: string,
): "sent" | "delivered" | "read" | null {
  if (["read", "played", "4", "5"].includes(status)) return "read";
  if (["delivered", "delivery_ack", "3"].includes(status)) return "delivered";
  if (["sent", "server_ack", "2"].includes(status)) return "sent";
  return null;
}
export function isOptOut(text: string) {
  return ["sair", "parar"].includes(text.trim().toLocaleLowerCase("pt-BR"));
}
