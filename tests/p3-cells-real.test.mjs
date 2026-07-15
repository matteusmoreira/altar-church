import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cells route unifies management and portal with real data", () => {
  const page = read("src/app/(dashboard)/celulas/page.tsx")
  const client = read("src/app/(dashboard)/celulas/cell-features-client.tsx")
  const actions = read("src/lib/groups/actions.ts")

  assert.doesNotMatch(page, /"use client"/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.match(page, /listGroups/)
  assert.match(page, /type: "cell"/)
  assert.match(page, /getGroupFormOptions/)

  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
  assert.match(page, /GroupsClient/)
  assert.match(page, /getCellFeaturesData/)
  assert.match(client, /saveCellStudy/)
  assert.match(client, /openCellCheckin/)
  assert.match(client, /uploadCellPhotos/)
  assert.match(client, /saveCellPrayer/)
  assert.match(client, /saveCellNotice/)
  assert.match(client, /router\.refresh\(\)/)

  assert.match(actions, /revalidatePath\("\/celulas"\)/)
})
