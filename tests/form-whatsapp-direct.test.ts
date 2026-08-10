import assert from "node:assert/strict"
import { test } from "node:test"
import {
  buildUazapiPayload,
  parseDirectMessageConfig,
  renderDirectMessage,
  validateTemplateVariables,
} from "../src/lib/forms/direct-message.ts"

const mediaId = "11111111-1111-4111-8111-111111111111"

test("direct form message renders variables and builds text payload", () => {
  const message = parseDirectMessageConfig({ type: "text", text: "OlÃ¡ {{nome}}: {{telefone}}" })
  assert.ok(message)
  const rendered = renderDirectMessage(message, { nome: "Ana", telefone: "5511999999999" })
  assert.deepEqual(rendered, { type: "text", text: "OlÃ¡ Ana: 5511999999999" })
  assert.deepEqual(buildUazapiPayload(rendered, { number: "5511999999999", trackId: "delivery-1" }), {
    endpoint: "/send/text",
    body: {
      number: "5511999999999",
      text: "OlÃ¡ Ana: 5511999999999",
      linkPreview: false,
      async: true,
      track_source: "altar_church_form",
      track_id: "delivery-1",
    },
  })
})

test("direct form buttons and lists use the UAZAPI menu shape", () => {
  const button = parseDirectMessageConfig({
    type: "button",
    text: "Escolha",
    footer: "Altar",
    buttons: [
      { label: "Responder", action: "reply", value: "responder" },
      { label: "Site", action: "url", value: "https://altarchurch.com.br" },
      { label: "Ligar", action: "call", value: "+5511999999999" },
    ],
  })
  assert.ok(button)
  const buttonPayload = buildUazapiPayload(button, { number: "5511999999999", trackId: "button-1" })
  assert.equal(buttonPayload.endpoint, "/send/menu")
  assert.deepEqual((buttonPayload.body as { choices: string[] }).choices, [
    "Responder|responder",
    "Site|url:https://altarchurch.com.br",
    "Ligar|call:+5511999999999",
  ])

  const list = parseDirectMessageConfig({
    type: "list",
    text: "ServiÃ§os",
    footer: "Escolha",
    listButton: "Abrir",
    sections: [{ title: "Geral", items: [{ label: "Culto", id: "culto", description: "Domingo" }] }],
  })
  assert.ok(list)
  const listPayload = buildUazapiPayload(list, { number: "5511999999999", trackId: "list-1" })
  assert.deepEqual((listPayload.body as { choices: string[] }).choices, ["[Geral]", "Culto|culto|Domingo"])
})

test("direct form carousel resolves uploaded media and buttons", () => {
  const carousel = parseDirectMessageConfig({
    type: "carousel",
    text: "OpÃ§Ãµes para {{nome}}",
    cards: [{
      text: "CartÃ£o {{nome}}",
      mediaFileId: mediaId,
      mediaType: "image",
      filename: "",
      buttons: [{ label: "Ver", action: "url", value: "https://altarchurch.com.br/{{source}}" }],
    }],
  })
  assert.ok(carousel)
  const rendered = renderDirectMessage(carousel, { nome: "Ana", source: "site" })
  const payload = buildUazapiPayload(rendered, {
    number: "5511999999999",
    trackId: "carousel-1",
    mediaUrls: new Map([[mediaId, "https://storage.example/media.jpg"]]),
  })
  assert.equal(payload.endpoint, "/send/carousel")
  const carouselBody = payload.body as { carousel: Array<{ image?: string; buttons: unknown[] }> }
  assert.equal(carouselBody.carousel[0].image, "https://storage.example/media.jpg")
  assert.deepEqual(carouselBody.carousel[0].buttons[0], {
    id: "https://altarchurch.com.br/site",
    text: "Ver",
    type: "URL",
  })
})

test("direct form carousel maps video and PDF media fields", () => {
  const message = parseDirectMessageConfig({
    type: "carousel",
    text: "Arquivos",
    cards: [
      {
        text: "Vídeo",
        mediaFileId: mediaId,
        mediaType: "video",
        filename: "",
        buttons: [{ label: "Assistir", action: "reply", value: "assistir" }],
      },
      {
        text: "PDF",
        mediaFileId: "22222222-2222-4222-8222-222222222222",
        mediaType: "document",
        filename: "guia.pdf",
        buttons: [{ label: "Abrir", action: "reply", value: "abrir" }],
      },
    ],
  })
  assert.ok(message)
  const payload = buildUazapiPayload(message, {
    number: "5511999999999",
    trackId: "carousel-media-1",
    mediaUrls: new Map([
      [mediaId, "https://storage.example/media.mp4"],
      ["22222222-2222-4222-8222-222222222222", "https://storage.example/guia.pdf"],
    ]),
  })
  const cards = payload.body as { carousel: Array<{ video?: string; document?: string; filename?: string }> }
  assert.equal(cards.carousel[0].video, "https://storage.example/media.mp4")
  assert.equal(cards.carousel[1].document, "https://storage.example/guia.pdf")
  assert.equal(cards.carousel[1].filename, "guia.pdf")
})

test("direct form rejects unknown variables", () => {
  assert.throws(
    () => validateTemplateVariables({ type: "text", text: "{{nao_permitida}}" }, new Set(["nome"])),
    /VariÃ¡vel.*nao_permitida/,
  )
})
