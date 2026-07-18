import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("Kids photos use private managed files and constrained image uploads", () => {
  const server = read("src/lib/files/server.ts")
  const actions = read("src/lib/kids/photo-actions.ts")

  assert.match(server, /entityTable: "people"/)
  assert.match(server, /new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/)
  assert.match(server, /maxSizeBytes: 5 \* 1024 \* 1024/)
  assert.match(server, /set photo_file_id = \$\{uploaded\.id\}/)
  assert.match(server, /removePersonPhoto/)
  assert.match(actions, /kids\.photo\.save/)
  assert.match(actions, /kids\.photo\.delete/)
})

test("public registration never overwrites photos of deduplicated people", () => {
  const actions = read("src/lib/kids/photo-actions.ts")
  assert.match(actions, /result\.createdPerson && result\.personId/)
  assert.match(actions, /result\.createdGuardian && guardianPersonId/)
  assert.match(actions, /foto da criança já cadastrada/)
  assert.match(actions, /foto do responsável já cadastrado/)
})

test("mobile capture, gallery fallback and private signed URLs are wired", () => {
  const capture = read("src/components/kids/photo-capture.tsx")
  const data = read("src/lib/kids/data.ts")
  const portal = read("src/lib/kids/portal.ts")
  const config = read("next.config.ts")

  assert.match(capture, /capture="environment"/)
  assert.match(capture, /Galeria/)
  assert.match(capture, /createImageBitmap/)
  assert.match(data, /createSignedUrlsByStoragePath/)
  assert.match(portal, /createSignedUrlsByStoragePath/)
  assert.match(config, /camera=\(self\)/)
  assert.match(config, /bodySizeLimit: "12mb"/)
})

test("dashboard child and guardian photos open an accessible enlarged preview", () => {
  const dashboard = read("src/app/(dashboard)/kids/kids-client.tsx")

  assert.match(dashboard, /setPhotoPreview\(\{ url: child\.photoUrl!?, name: child\.fullName \}\)/)
  assert.match(dashboard, /setPhotoPreview\(\{ url: guardian\.photoUrl!?, name: guardian\.name \}\)/)
  assert.match(dashboard, /<DialogTitle>Foto de \{photoPreview\.name\}<\/DialogTitle>/)
  assert.match(dashboard, /max-h-\[calc\(100dvh-4rem\)\].*object-contain/)
})
