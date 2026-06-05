import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("visitors page uses real people data instead of mock visitors", () => {
  const page = read("src/app/(dashboard)/visitors/page.tsx")
  const client = read("src/app/(dashboard)/visitors/visitors-client.tsx")
  const actions = read("src/lib/people/actions.ts")

  assert.doesNotMatch(page, /"use client"/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.match(page, /listPeople/)
  assert.match(page, /personType: "visitor"/)

  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
  assert.match(client, /savePerson/)
  assert.match(client, /deletePerson/)
  assert.match(client, /journeyStatus/)
  assert.match(client, /router\.refresh\(\)/)

  assert.match(actions, /revalidatePath\("\/visitors"\)/)
})
