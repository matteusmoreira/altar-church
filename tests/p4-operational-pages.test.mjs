import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const operationalPages = [
  "eventos",
  "presenca",
  "intercessao",
  "discipulado",
  "comunicacao",
  "notificacao",
  "crm",
  "doacao",
  "financeiro",
  "inpeace-play",
]

test("operational dashboard pages do not import mock data", () => {
  for (const page of operationalPages) {
    const source = readFileSync(`src/app/(dashboard)/${page}/page.tsx`, "utf8")
    assert(!source.includes("@/lib/mock/data"), `${page} still imports mock data`)
    assert(source.includes("@/lib/operational/data"), `${page} does not read persisted data`)
  }
})
