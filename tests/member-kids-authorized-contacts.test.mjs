import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("member can edit and delete only authorized contacts they added", () => {
  const portal = read("src/lib/kids/portal.ts")
  const actions = read("src/lib/kids/portal-actions.ts")
  const client = read("src/app/(portal)/familia/kids/familia-kids-client.tsx")

  assert.match(portal, /'canManage', guardian\.created_by = \$\{user\.id\}/)
  assert.match(actions, /guardian\.created_by = \$\{user\.id\}[\s\S]*guardian\.is_primary = false/)
  assert.match(actions, /update public\.kid_guardians[\s\S]*created_by = \$\{user\.id\}[\s\S]*is_primary = false/)
  assert.match(actions, /set deleted_at = now\(\)[\s\S]*created_by = \$\{user\.id\}[\s\S]*is_primary = false/)
  assert.match(client, /guardian\.canManage/)
  assert.match(client, /startEditContact/)
  assert.match(client, /window\.confirm/)
})

test("authorized contact accepts private gallery photo with scoped ownership", () => {
  const photos = read("src/lib/kids/photo-actions.ts")
  const client = read("src/app/(portal)/familia/kids/familia-kids-client.tsx")

  assert.match(photos, /saveGuardianContactWithPhoto/)
  assert.match(photos, /guardian\.created_by = \$\{user\.id\}/)
  assert.match(photos, /person\.created_by = \$\{user\.id\}/)
  assert.match(photos, /owner\.profile_id = \$\{user\.id\}/)
  assert.match(photos, /source: "guardian-authorized-contact"/)
  assert.match(client, /label="da pessoa autorizada"/)
  assert.match(client, /saveGuardianContactWithPhoto/)
})
