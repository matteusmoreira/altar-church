import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (entry === "route.ts") files.push(full)
  }
  return files
}

test("API foundation modules export expected helpers", () => {
  const errors = read("src/lib/api/errors.ts")
  assert.match(errors, /export class ApiError/)
  assert.match(errors, /Acesso negado/)
  assert.match(errors, /VALIDATION_ERROR/)

  const http = read("src/lib/api/http.ts")
  assert.match(http, /export function jsonOk/)
  assert.match(http, /export function jsonError/)

  const auth = read("src/lib/api/auth.ts")
  assert.match(auth, /export async function requireApiUser/)
  assert.match(auth, /export async function requireApiPermission/)
  assert.match(auth, /export async function requireApiSuperadmin/)
  assert.match(auth, /export async function requireApiAuth/)

  const parse = read("src/lib/api/parse.ts")
  assert.match(parse, /export async function parseJsonBody/)

  const formData = read("src/lib/api/form-data.ts")
  assert.match(formData, /export function objectToFormData/)

  const action = read("src/lib/api/action.ts")
  assert.match(action, /export function fromActionResult/)
})

test("v1 API routes cover core modules", () => {
  const apiRoot = fileURLToPath(new URL("../src/app/api/v1", import.meta.url))
  const routes = walk(apiRoot)
  const routePaths = routes.map((r) => r.replace(/\\/g, "/"))

  const expected = [
    "/auth/me/route.ts",
    "/people/route.ts",
    "/people/[id]/route.ts",
    "/groups/route.ts",
    "/events/route.ts",
    "/finance/route.ts",
    "/donations/route.ts",
    "/volunteers/dashboard/route.ts",
    "/admin/companies/route.ts",
    "/public/churches/[slug]/route.ts",
    "/files/upload/route.ts",
    "/openapi/route.ts",
    "/forms/route.ts",
    "/integrations/webhooks/route.ts",
  ]

  for (const suffix of expected) {
    const found = routePaths.some((p) => p.endsWith(`/api/v1${suffix}`) || p.endsWith(`api/v1${suffix}`))
    assert.ok(found, `missing route: ${suffix}`)
  }

  assert.ok(routePaths.length >= 40, `expected many v1 routes, got ${routePaths.length}`)
})

test("OpenAPI doc exists and lists major paths", () => {
  const openapi = read("docs/api/openapi.yaml")
  assert.match(openapi, /title: Altar Church API/)
  assert.match(openapi, /\/people/)
  assert.match(openapi, /\/groups/)
  assert.match(openapi, /\/events/)
  assert.match(openapi, /\/finance/)
  assert.match(openapi, /\/volunteers/)
  assert.match(openapi, /\/admin\/companies/)
  assert.match(openapi, /cookieAuth/)
  assert.match(openapi, /bearerAuth/)
  assert.match(openapi, /\/forms/)
  assert.match(openapi, /\/integrations\/webhooks/)
})

test("response envelope convention documented in helpers", () => {
  const http = read("src/lib/api/http.ts")
  assert.match(http, /data/)
  assert.match(http, /error/)
  const errors = read("src/lib/api/errors.ts")
  assert.match(errors, /code/)
})
