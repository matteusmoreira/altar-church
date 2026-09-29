import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const client = await readFile(
  new URL("../src/app/(portal)/familia/kids/familia-kids-client.tsx", import.meta.url),
  "utf8"
)
const notifications = await readFile(
  new URL("../src/lib/kids/notifications.ts", import.meta.url),
  "utf8"
)
const listener = await readFile(
  new URL("../src/components/kids/kids-alert-listener.tsx", import.meta.url),
  "utf8"
)
const memberShell = await readFile(
  new URL("../src/components/member/member-shell.tsx", import.meta.url),
  "utf8"
)
const actions = await readFile(
  new URL("../src/lib/kids/actions.ts", import.meta.url),
  "utf8"
)

test("Endereço do membro fica colapsado/retraído se já preenchido, com seta para expandir e editar", () => {
  assert.match(client, /hasGuardianAddress/)
  assert.match(client, /isAddressExpanded/)
  assert.match(client, /setIsAddressExpanded/)
  assert.match(client, /ChevronDown/)
  assert.match(client, /ChevronUp/)
  assert.match(client, /Preenchido/)
})

test("Botão exibe 'Cadastrar criança' se nenhuma cadastrada e 'Cadastrar outra criança' se já houver", () => {
  assert.match(client, /data\.children\.length === 0 \? \(/)
  assert.match(client, /Cadastrar criança/)
  assert.match(client, /Cadastrar outra criança/)
})

test("Chat com Kids fica posicionado ao final e possui suporte a alerta sonoro, vibração e realtime", () => {
  const childFormIndex = client.indexOf('id="familia-kid-name"')
  const chatIndex = client.indexOf('id="chat-kids-section"')
  assert.ok(childFormIndex > 0, "child form exists")
  assert.ok(chatIndex > 0, "chat section exists")
  assert.ok(chatIndex > childFormIndex, "Chat section must be rendered AFTER the child form")

  assert.match(notifications, /AudioContext/)
  assert.match(notifications, /navigator\.vibrate/)
  assert.match(notifications, /triggerKidsAlert/)
  assert.match(client, /triggerKidsAlert/)
  assert.match(listener, /triggerKidsAlert/)
  assert.match(memberShell, /KidsAlertListener/)
})

test("Responsável (guardian) pode iniciar conversa no chat mesmo sem conversa prévia", () => {
  assert.match(actions, /senderKind === "guardian"/)
  assert.match(actions, /public\.kid_guardians/)
})
