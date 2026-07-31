import { expect, test } from "@playwright/test"

test("health e readiness endpoints report infrastructure without exposing secrets", async ({ request }) => {
  const health = await request.get("/api/health")
  expect(health.status()).toBe(200)
  const healthBody = await health.json()
  expect(healthBody.status).toMatch(/healthy|degraded|unavailable/)
  expect(healthBody.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: "database" }),
    expect.objectContaining({ key: "storage" }),
    expect.objectContaining({ key: "auth" }),
  ]))
  expect(JSON.stringify(healthBody)).not.toMatch(/(service_role|admintoken|Bearer\s+ey|eyJ|sbp_v0_)/i)

  const ready = await request.get("/api/ready")
  expect(ready.status()).toBe(200)
  const readyBody = await ready.json()
  expect(readyBody.status).toBe("ready")

  const protectedHealth = await request.get("/api/v1/operations/health")
  expect(protectedHealth.status()).toBe(401)
  expect((await protectedHealth.json()).error.code).toBe("UNAUTHORIZED")
})
