import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()
const samples = 5

function p95(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

test("mutacoes comuns ficam abaixo da meta em producao", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await loginAs(page, e2e.accounts.admin)

  const departmentsResponse = await page.request.get("/api/v1/volunteers/departments")
  expect(departmentsResponse.ok()).toBeTruthy()
  const departmentsPayload = await departmentsResponse.json()
  const department = departmentsPayload.data.find((item: { active: boolean; roles?: { active: boolean }[] }) => item.active && item.roles?.some((role) => role.active))
  const role = department?.roles.find((item: { active: boolean }) => item.active)
  expect(department?.id).toBeTruthy()
  expect(role?.id).toBeTruthy()

  const timings = { people: [] as number[], ministries: [] as number[], volunteers: [] as number[] }

  for (let index = 0; index < samples + 1; index += 1) {
    const stamp = `${Date.now()}-${index}`
    let personId = ""
    let ministryId = ""
    let volunteerId = ""

    try {
      let startedAt = Date.now()
      const personResponse = await page.request.post("/api/v1/people", {
        data: { firstName: "Performance", lastName: `E2E ${stamp}`, status: "active", personType: "member", isActive: true },
      })
      const personPayload = await personResponse.json()
      expect(personResponse.ok(), JSON.stringify(personPayload)).toBeTruthy()
      personId = personPayload.data.id
      const personMs = Date.now() - startedAt

      startedAt = Date.now()
      const ministryResponse = await page.request.post("/api/v1/ministries", {
        data: { name: `Performance E2E ${stamp}`, description: "Medição automatizada", contact: "", leaderPersonId: null, isActive: true },
      })
      const ministryPayload = await ministryResponse.json()
      expect(ministryResponse.ok(), JSON.stringify(ministryPayload)).toBeTruthy()
      ministryId = ministryPayload.data.id
      const ministryMs = Date.now() - startedAt

      startedAt = Date.now()
      const volunteerResponse = await page.request.post("/api/v1/volunteers", {
        data: {
          personId,
          registrationStatus: "active",
          whatsappEnabled: false,
          emailEnabled: false,
          memberships: [{ departmentId: department.id, roleId: role.id, preferred: true }],
          invite: false,
        },
      })
      const volunteerPayload = await volunteerResponse.json()
      expect(volunteerResponse.ok(), JSON.stringify(volunteerPayload)).toBeTruthy()
      volunteerId = volunteerPayload.data.id
      const volunteerMs = Date.now() - startedAt

      if (index > 0) {
        timings.people.push(personMs)
        timings.ministries.push(ministryMs)
        timings.volunteers.push(volunteerMs)
      }
    } finally {
      if (volunteerId) await page.request.delete(`/api/v1/volunteers/${volunteerId}`)
      if (ministryId) await page.request.delete(`/api/v1/ministries/${ministryId}`)
      if (personId) await page.request.delete(`/api/v1/people/${personId}`)
    }
  }

  const result = {
    samples,
    rawMs: timings,
    p95Ms: {
      people: p95(timings.people),
      ministries: p95(timings.ministries),
      volunteers: p95(timings.volunteers),
    },
  }
  await testInfo.attach("action-performance.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" })

  expect(result.p95Ms.people).toBeLessThanOrEqual(1_500)
  expect(result.p95Ms.ministries).toBeLessThanOrEqual(1_500)
  expect(result.p95Ms.volunteers).toBeLessThanOrEqual(1_500)
})
