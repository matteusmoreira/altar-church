import test from "node:test"
import assert from "node:assert/strict"
import { chatCommandSchema, chatSendSchema, chatUploadSchema, validChatSignature } from "../src/lib/ministries/chat-contract.ts"
const id = "10000000-0000-4000-8000-000000000001"
test("chat validates content, duplicate attachments, text and attachment limits", () => {
  assert.equal(chatSendSchema.safeParse({ clientId: id, body: "   " }).success, false)
  assert.equal(chatSendSchema.safeParse({ clientId: id, body: "x".repeat(5001) }).success, false)
  assert.equal(chatSendSchema.safeParse({ clientId: id, attachmentIds: [id] }).success, true)
  assert.equal(chatSendSchema.safeParse({ clientId: id, attachmentIds: [id, id] }).success, false)
  assert.equal(chatSendSchema.safeParse({ clientId: id, attachmentIds: Array(6).fill(id) }).success, false)
  assert.equal(chatSendSchema.parse({ clientId: id, body: " Olá " }).body, "Olá")
})
test("uploads enforce both MIME/extension, size and actual content signature", () => {
  assert.equal(chatUploadSchema.safeParse({ name: "imagem.png", mimeType: "image/png", sizeBytes: 10 * 1024 * 1024 }).success, true)
  assert.equal(chatUploadSchema.safeParse({ name: "imagem.html", mimeType: "image/png", sizeBytes: 10 }).success, false)
  assert.equal(chatUploadSchema.safeParse({ name: "imagem.png", mimeType: "image/png", sizeBytes: 10 * 1024 * 1024 + 1 }).success, false)
  assert.equal(chatUploadSchema.safeParse({ name: "a\n.png", mimeType: "image/png", sizeBytes: 10 }).success, false)
  assert.equal(validChatSignature(new TextEncoder().encode("<html>injection"), "image/png"), false)
  assert.equal(validChatSignature(Uint8Array.from([137,80,78,71,13,10,26,10]), "image/png"), true)
  assert.equal(validChatSignature(new TextEncoder().encode("%PDF-1.7"), "application/pdf"), true)
  assert.equal(validChatSignature(new TextEncoder().encode("OggS"), "audio/ogg"), true)
})
test("reactions and mutations only accept known commands", () => {
  assert.equal(chatCommandSchema.safeParse({ action: "clear" }).success, true)
  assert.equal(chatCommandSchema.safeParse({ action: "react", messageId: id, emoji: "💣", active: true }).success, false)
  assert.equal(chatCommandSchema.safeParse({ action: "react", messageId: id, emoji: "🙏", active: true }).success, true)
  assert.equal(chatCommandSchema.safeParse({ action: "read", messageId: "wrong" }).success, false)
})
