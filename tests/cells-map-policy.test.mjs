import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
process.env.NODE_ENV = "production"
const config = await require("next/dist/server/config").default("phase-production-build", process.cwd())
const rules = await config.headers()
const headers = rules.find((rule) => rule.source === "/(.*)").headers
const csp = headers.find((header) => header.key === "Content-Security-Policy").value
const directives = Object.fromEntries(csp.split(";").map((entry) => {
  const [name, ...sources] = entry.trim().split(/\s+/)
  return [name, sources]
}))

test("production policy permits Mapbox styles, tiles, telemetry and workers", () => {
  for (const source of ["https://api.mapbox.com", "https://*.tiles.mapbox.com", "https://events.mapbox.com"]) {
    assert.ok(directives["connect-src"].includes(source), source)
  }
  assert.ok(directives["worker-src"].includes("blob:"))
  assert.ok(directives["img-src"].includes("blob:"))
  assert.ok(directives["img-src"].includes("data:"))
})

test("Cloudflare analytics is allowed without disabling production CSP", () => {
  assert.ok(directives["script-src"].includes("https://static.cloudflareinsights.com"))
  assert.ok(directives["connect-src"].includes("https://cloudflareinsights.com"))
  assert.ok(!directives["script-src"].includes("'unsafe-eval'"))
  assert.ok(!directives["connect-src"].includes("*"))
  assert.deepEqual(directives["object-src"], ["'none'"])
  assert.deepEqual(directives["frame-ancestors"], ["'none'"])
})

test("public church pages allow geolocation with browser permission", () => {
  const publicHeaders = rules.find((rule) => rule.source === "/church/:path*").headers
  assert.match(publicHeaders.find((header) => header.key === "Permissions-Policy").value, /geolocation=\(self\)/)
})
