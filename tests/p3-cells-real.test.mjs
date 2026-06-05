import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cells route uses real group data and group actions", () => {
  const page = read("src/app/(dashboard)/cells/page.tsx")
  const client = read("src/app/(dashboard)/cells/cells-client.tsx")
  const actions = read("src/lib/groups/actions.ts")

  assert.doesNotMatch(page, /"use client"/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.match(page, /listGroups/)
  assert.match(page, /type: "cell"/)
  assert.match(page, /getGroupFormOptions/)

  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
  assert.match(client, /saveGroup/)
  assert.match(client, /deleteGroup/)
  assert.match(client, /router\.refresh\(\)/)

  assert.match(actions, /revalidatePath\("\/cells"\)/)
})
