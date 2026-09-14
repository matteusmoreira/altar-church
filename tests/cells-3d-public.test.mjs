import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cells 3d migration adds coordinates, address privacy and photo url", () => {
  const migration = read("supabase/migrations/20260914100000_cells_geocoding.sql")
  assert.match(migration, /add column if not exists latitude double precision/)
  assert.match(migration, /add column if not exists longitude double precision/)
  assert.match(migration, /add column if not exists is_address_public boolean/)
  assert.match(migration, /add column if not exists cell_photo_url text/)
  assert.match(migration, /create index if not exists groups_company_coordinates_idx/)
  assert.match(migration, /create policy "Active cells readable publicly"/)
})

test("public cells page and components are correctly wired", () => {
  const page = read("src/app/(public)/church/[slug]/celulas/page.tsx")
  const publicService = read("src/lib/cells/public-cells.ts")
  const experience = read("src/components/public/cells/cells-map-experience.tsx")
  const map3d = read("src/components/public/cells/cells-3d-map.tsx")
  const sheet = read("src/components/public/cells/cell-detail-sheet.tsx")
  const visitModal = read("src/components/public/cells/cell-visit-modal.tsx")

  assert.match(page, /getPublicCellsData\(slug\)/)
  assert.match(page, /<CellsMapExperience/)
  assert.match(publicService, /export async function getPublicCellsData/)
  assert.match(experience, /<Cells3dMap/)
  assert.match(experience, /<CellDetailSheet/)
  assert.match(experience, /<CellVisitModal/)
  assert.match(map3d, /3d-buildings/)
  assert.match(map3d, /cell-3d-marker/)
  assert.match(sheet, /onTraceRoute/)
  assert.match(visitModal, /api\/v1\/public\/cells\/visit-lead/)
})

test("geocoding and visitor lead endpoints exist and handle requests", () => {
  const geocodeRoute = read("src/app/api/geocode/route.ts")
  const leadRoute = read("src/app/api/v1/public/cells/visit-lead/route.ts")

  assert.match(geocodeRoute, /export async function GET/)
  assert.match(geocodeRoute, /nominatim\.openstreetmap\.org/)
  assert.match(leadRoute, /export async function POST/)
  assert.match(leadRoute, /insert into public\.people/)
  assert.match(leadRoute, /insert into public\.crm_cards/)
  assert.match(leadRoute, /insert into public\.person_follow_up_tasks/)
})
