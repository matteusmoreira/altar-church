import { expect, test } from "@playwright/test"

test("health e readiness endpoints report infrastructure without exposing secrets", async ({ playwright }) => {
  // O fixture `request` herda o storageState do projeto (sessão logada); o
  // teste precisa de um cliente anônimo para o endpoint protegido e leitura pública.
  const request = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } })

  try {
    // /api/health é liveness barato por design: sem toques no banco, checks vazio.
    const health = await request.get("/api/health")
    expect(health.status()).toBe(200)
    const healthBody = await health.json()
    expect(healthBody.status).toMatch(/healthy|degraded|unavailable/)
    expect(JSON.stringify(healthBody)).not.toMatch(/(service_role|admintoken|Bearer\s+ey|eyJ|sbp_v0_)/i)

    // Os checks de infraestrutura (database/storage/auth) vivem no readiness profundo.
    const ready = await request.get("/api/ready")
    expect(ready.status()).toBe(200)
    const readyBody = await ready.json()
    expect(readyBody.status).toBe("ready")
    expect(readyBody.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "database" }),
      expect.objectContaining({ key: "storage" }),
      expect.objectContaining({ key: "auth" }),
    ]))
    expect(JSON.stringify(readyBody)).not.toMatch(/(service_role|admintoken|Bearer\s+ey|eyJ|sbp_v0_)/i)

    const protectedHealth = await request.get("/api/v1/operations/health")
    expect(protectedHealth.status()).toBe(401)
    expect((await protectedHealth.json()).error.code).toBe("UNAUTHORIZED")
  } finally {
    await request.dispose()
  }
})
