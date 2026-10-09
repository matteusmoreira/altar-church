import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

function client(fetch) {
  const loadedModule = { exports: {} }
  const source = ts.transpileModule(readFileSync("src/components/ministries/chat-client.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function("require", "module", "exports", "fetch", source)(name => {
    if (name === "react") return { createContext: () => null }
    if (name === "@/lib/supabase/client") return {}
    throw new Error(`Unexpected import: ${name}`)
  }, loadedModule, loadedModule.exports, fetch)
  return loadedModule.exports
}

test("notification requests report HTML 404 and login redirects without exposing parser errors", async () => {
  for (const status of [200, 404, 502]) {
    const { chatRequest, ChatRequestError } = client(async () => new Response("<!DOCTYPE html><html>Erro</html>", {
      status, headers: { "Content-Type": "text/html" },
    }))
    await assert.rejects(chatRequest("/api/v1/notifications/inbox"), error => {
      assert.ok(error instanceof ChatRequestError)
      assert.equal(error.status, status)
      assert.match(error.message, /indisponível.*Tente novamente/)
      assert.doesNotMatch(error.message, /Unexpected|DOCTYPE|JSON/)
      return true
    })
  }
})

test("notification requests keep valid inbox data, POST payloads and API errors", async () => {
  const data = { items: [], unread: 0, through: null, nextCursor: null }
  const { chatRequest } = client(async (url, options) => {
    assert.equal(url, "/api/v1/notifications/inbox")
    assert.equal(options.cache, "no-store")
    if (options.method === "POST") {
      assert.equal(options.headers["Content-Type"], "application/json")
      assert.deepEqual(JSON.parse(options.body), { action: "read", id: "notice" })
    }
    return Response.json({ data })
  })
  assert.deepEqual(await chatRequest("/api/v1/notifications/inbox"), data)
  assert.deepEqual(await chatRequest("/api/v1/notifications/inbox", "POST", { action: "read", id: "notice" }), data)
  const api = client(async () => Response.json({ error: { message: "Faça login novamente" } }, { status: 401 }))
  await assert.rejects(api.chatRequest("/api/v1/notifications/inbox"), error => error.status === 401 && error.message === "Faça login novamente")
})

test("notification requests handle malformed JSON and preserve cancelled requests", async () => {
  const malformed = client(async () => new Response("{broken", { headers: { "Content-Type": "application/json" } }))
  await assert.rejects(malformed.chatRequest("/api/v1/notifications/inbox"), /indisponível.*Tente novamente/)
  const abort = new DOMException("Cancelled", "AbortError")
  const cancelled = client(async () => { throw abort })
  await assert.rejects(cancelled.chatRequest("/api/v1/notifications/inbox"), error => error === abort)
})
