import assert from "node:assert/strict"
import test from "node:test"
import { parseDirectMessageConfig, renderDirectMessage, buildUazapiPayload } from "../src/lib/forms/direct-message.ts"

test("cell WhatsApp variable interpolation resolves variables correctly", () => {
  const message = parseDirectMessageConfig({
    type: "button",
    text: "Olá {{lider_nome}}, o visitante {{visitante_nome}} tem interesse na {{celula_nome}}!",
    footer: "Altar Church",
    buttons: [
      { label: "Falar com {{visitante_nome}}", action: "url", value: "https://wa.me/55{{visitante_telefone}}" },
    ],
  })
  assert.ok(message)

  const variables = {
    lider_nome: "Pastor Carlos",
    visitante_nome: "Maria Silva",
    celula_nome: "Célula Betel",
    visitante_telefone: "11988887777",
  }

  const rendered = renderDirectMessage(message, variables)
  assert.equal(rendered.text, "Olá Pastor Carlos, o visitante Maria Silva tem interesse na Célula Betel!")
  if (rendered.type === "button") {
    assert.equal(rendered.buttons[0]?.label, "Falar com Maria Silva")
    assert.equal(rendered.buttons[0]?.value, "https://wa.me/5511988887777")
  } else {
    assert.fail("Mensagem deveria ser do tipo button")
  }
})

test("buildUazapiPayload creates correct structure for text and button messages", () => {
  const message = parseDirectMessageConfig({
    type: "button",
    text: "Novo lead recebido",
    footer: "Notificação",
    buttons: [
      { label: "Abrir", action: "url", value: "https://exemplo.com" },
    ],
  })
  assert.ok(message)

  const payload = buildUazapiPayload(message, {
    number: "5511988887777",
    trackId: "req-123",
    mediaUrls: new Map(),
  })

  assert.equal(payload.endpoint, "/send/menu")
  assert.equal(payload.body.number, "5511988887777")
  const body = payload.body as { text?: string; footerText?: string; choices?: unknown[] }
  assert.equal(body.text, "Novo lead recebido")
  assert.equal(body.footerText, "Notificação")
  assert.equal(body.choices?.length, 1)
})
