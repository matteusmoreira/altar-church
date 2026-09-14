import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cells actions exports uploadCellPhoto and removeCellPhoto", () => {
  const actions = read("src/lib/cells/actions.ts")
  assert.match(actions, /export async function uploadCellPhoto\(/)
  assert.match(actions, /export async function removeCellPhoto\(/)
  assert.match(actions, /uploadManagedFile\(/)
  assert.match(actions, /entityTable:\s*"groups"/)
  assert.match(actions, /purpose:\s*"cover"/)
  assert.match(actions, /visibility:\s*"public"/)
  assert.match(actions, /cell_photo_url\s*=\s*\$\{fileUrl\}/)
})

test("permanent file delivery route exists and redirects with signed url and cache", () => {
  const route = read("src/app/api/v1/files/[id]/route.ts")
  assert.match(route, /export async function GET\(/)
  assert.match(route, /from public\.app_files/)
  assert.match(route, /createSignedUrl\(/)
  assert.match(route, /NextResponse\.redirect\(data\.signedUrl/)
  assert.match(route, /Cache-Control/)
})

test("cell form fields component supports direct photo upload, preview and manual URL fallback", () => {
  const component = read("src/components/cells/cell-form-fields.tsx")
  assert.match(component, /uploadCellPhoto/)
  assert.match(component, /removeCellPhoto/)
  assert.match(component, /Foto da Célula \/ Grupo/)
  assert.match(component, /type="file"/)
  assert.match(component, /accept="image\/jpeg,image\/png,image\/webp/)
  assert.match(component, /handlePhotoFile/)
  assert.match(component, /handleRemovePhoto/)
  assert.match(component, /Trocar Foto/)
  assert.match(component, /Remover/)
  assert.match(component, /showManualUrl/)
})

test("cell form values interface includes id, companyId and cellPhotoUrl", () => {
  const component = read("src/components/cells/cell-form-fields.tsx")
  assert.match(component, /id\?:\s*string \| null/)
  assert.match(component, /companyId\?:\s*string \| null/)
  assert.match(component, /cellPhotoUrl\?:\s*string \| null/)
})
