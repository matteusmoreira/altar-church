import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.cwd(), "src")

test("CellDetailSheet renders cell cover photo when available", () => {
  const file = fs.readFileSync(path.join(root, "components/public/cells/cell-detail-sheet.tsx"), "utf8")
  assert.match(file, /cell\.cellPhotoUrl/, "CellDetailSheet must check cell.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{cell\.cellPhotoUrl\}/, "CellDetailSheet must render img tag with cellPhotoUrl")
  assert.match(file, /max-h-\[85vh\]\s+overflow-y-auto/, "CellDetailSheet must support scrolling on smaller screens")
})

test("CellVisitModal renders cell cover photo when available", () => {
  const file = fs.readFileSync(path.join(root, "components/public/cells/cell-visit-modal.tsx"), "utf8")
  assert.match(file, /cell\.cellPhotoUrl/, "CellVisitModal must check cell.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{cell\.cellPhotoUrl\}/, "CellVisitModal must render img tag with cellPhotoUrl")
})

test("CellsListDrawer renders cell cover photo with error handling", () => {
  const file = fs.readFileSync(path.join(root, "components/public/cells/cells-list-drawer.tsx"), "utf8")
  assert.match(file, /cell\.cellPhotoUrl/, "CellsListDrawer must check cell.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{cell\.cellPhotoUrl\}/, "CellsListDrawer must render img tag with cellPhotoUrl")
  assert.match(file, /onError=/, "CellsListDrawer must handle image loading errors")
})

test("Member portal renders cell cover photo", () => {
  const file = fs.readFileSync(path.join(root, "app/(dashboard)/celulas/cell-features-client.tsx"), "utf8")
  assert.match(file, /cell\.cellPhotoUrl/, "cell-features-client must check cell.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{cell\.cellPhotoUrl\}/, "cell-features-client must render img tag with cellPhotoUrl")
})

test("Cell leader workspace renders cell cover photo", () => {
  const file = fs.readFileSync(path.join(root, "components/member/cell-leader-workspace.tsx"), "utf8")
  assert.match(file, /cell\.cellPhotoUrl/, "cell-leader-workspace must check cell.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{cell\.cellPhotoUrl\}/, "cell-leader-workspace must render img tag with cellPhotoUrl")
})

test("Groups management renders cell cover photo in grid and table views", () => {
  const file = fs.readFileSync(path.join(root, "app/(dashboard)/gceus/groups-client.tsx"), "utf8")
  assert.match(file, /group\.cellPhotoUrl/, "groups-client must check group.cellPhotoUrl")
  assert.match(file, /<img\s+src=\{group\.cellPhotoUrl\}/, "groups-client must render img tag with groupPhotoUrl")
})
