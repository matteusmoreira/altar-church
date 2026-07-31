import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("cell leader is portal-only and has limited permissions", () => {
  const types = read("src/lib/types.ts")
  const access = read("src/lib/member/access.ts")
  const dashboardLayout = read("src/app/(dashboard)/layout.tsx")

  const roleBlock = types.match(/cell_leader:\s*\[([\s\S]*?)\n\s*\],\n\s*communication:/)?.[1] ?? ""
  assert.match(access, /"cell_leader"/)
  assert.match(roleBlock, /cells\.leader\.manage/)
  assert.doesNotMatch(roleBlock, /members\.view|cells\.view|cells\.edit|cells\.delete|groups\.edit/)
  assert.match(dashboardLayout, /isPortalRole\(user\.role\)/)
  assert.match(dashboardLayout, /redirect\("\/membro"\)/)
})

test("leader workspace and actions stay scoped to owned cells", () => {
  const access = read("src/lib/cells/access.ts")
  const data = read("src/lib/cells/data.ts")
  const actions = read("src/lib/cells/leader-actions.ts")
  const workspace = read("src/components/member/cell-leader-workspace.tsx")

  assert.match(access, /requireCellLeaderContext/)
  assert.match(access, /leader_person_id = \${context\.personId}/)
  assert.match(data, /cell\.leader_person_id = \${personId}/)
  assert.match(actions, /requireOwnedLeaderCell\(context, parsed\.id\)/)
  assert.match(actions, /leader_person_id,/)
  assert.doesNotMatch(actions, /delete from public\.groups/)
  assert.match(actions, /leader_person_id = \$\{context\.personId\}/)
  assert.doesNotMatch(actions, /set\s+leader_person_id\s*=/)
  assert.match(workspace, /Minhas células/)
  assert.match(workspace, /createCellLeaderPerson/)
  assert.match(workspace, /linkCellLeaderPerson/)
})

test("cell leader assignment requires valid active cells and syncs membership", () => {
  const migration = read("supabase/migrations/20260730220000_cell_leader_assignments.sql")
  const peopleActions = read("src/lib/people/actions.ts")
  const adminActions = read("src/lib/admin/actions.ts")
  const adminUi = read("src/components/admin/superadmin-console.tsx")

  assert.match(migration, /groups_sync_cell_leader_member/)
  assert.match(migration, /role = 'leader'/)
  assert.match(migration, /role = 'member'/)
  assert.match(migration, /group_row\.is_active = true/)
  assert.match(migration, /sync_cell_leader_assignments/)
  assert.match(migration, /insert into public\.group_members/)
  assert.match(peopleActions, /validateCellLeaderCells/)
  assert.match(peopleActions, /syncCellLeaderAssignments\(companyId, result\.personId, \[\]\)/)
  assert.match(adminActions, /cellIds: z\.array/)
  assert.match(adminActions, /Selecione ao menos uma célula para o líder/)
  assert.match(adminActions, /sync_cell_leader_assignments/)
  assert.match(adminUi, /Células do líder \*/)
  assert.match(adminUi, /data\.cells\.filter/)
})

test("people forms carry leader cell assignments", () => {
  const types = read("src/lib/people/types.ts")
  const data = read("src/lib/people/data.ts")
  const list = read("src/app/(dashboard)/pessoas/members-client.tsx")
  const detail = read("src/app/(dashboard)/pessoas/[id]/member-detail-client.tsx")

  assert.match(types, /cellIds\?: string\[\]/)
  assert.match(data, /cell_ids/)
  assert.match(list, /formData\.cellIds\.length === 0/)
  assert.match(list, /formOptions\.cells\.map/)
  assert.match(detail, /setCellIds\(person\.cellIds\)/)
  assert.match(detail, /cellIds: accessRole === "cell_leader" \? cellIds : \[\]/)
})
