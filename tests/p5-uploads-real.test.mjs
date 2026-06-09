import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("managed upload layer validates files, isolates storage paths and records app_files", () => {
  const server = read("src/lib/files/server.ts")
  const actions = read("src/lib/files/actions.ts")

  assert.match(server, /FILE_BUCKET = "church-assets"/)
  assert.match(server, /MAX_UPLOAD_SIZE_BYTES = 10 \* 1024 \* 1024/)
  assert.match(server, /image\/jpeg/)
  assert.match(server, /image\/png/)
  assert.match(server, /image\/webp/)
  assert.match(server, /application\/pdf/)
  assert.match(server, /storagePath = `\$\{input\.companyId\}\//)
  assert.match(server, /storage\.from\(FILE_BUCKET\)\.upload/)
  assert.match(server, /insert into public\.app_files/i)
  assert.match(server, /owner_profile_id/)
  assert.match(server, /entity_table/)
  assert.match(server, /entity_id/)
  assert.match(server, /createSignedUrl/)
  assert.match(server, /remove\(\[storagePath\]\)/)

  assert.match(actions, /uploadEntityAsset/)
  assert.match(actions, /church-logo/)
  assert.match(actions, /church-cover/)
  assert.match(actions, /content-cover/)
  assert.match(actions, /banner-image/)
  assert.match(actions, /requirePermission/)
  assert.match(actions, /logo_file_id/)
  assert.match(actions, /cover_file_id/)
  assert.match(actions, /app_file\.upload/)
})

test("church and content screens expose real file uploads backed by file ids", () => {
  const churchClient = read("src/app/(dashboard)/informacoes/church-info-client.tsx")
  const churchData = read("src/lib/church-info/data.ts")
  const churchTypes = read("src/lib/church-info/types.ts")
  const contentClient = read("src/app/(dashboard)/conteudo/content-client.tsx")
  const contentActions = read("src/lib/content/actions.ts")
  const contentData = read("src/lib/content/data.ts")
  const contentTypes = read("src/lib/content/types.ts")

  assert.match(churchClient, /uploadChurchProfileAsset/)
  assert.match(churchClient, /type="file"/)
  assert.match(churchClient, /church-logo/)
  assert.match(churchClient, /church-cover/)
  assert.match(churchClient, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.match(churchData, /logo_file_id/)
  assert.match(churchData, /cover_file_id/)
  assert.match(churchTypes, /logoFileId/)
  assert.match(churchTypes, /coverFileId/)

  assert.match(contentClient, /uploadContentAsset/)
  assert.match(contentClient, /content-cover/)
  assert.match(contentClient, /banner-image/)
  assert.match(contentClient, /coverFileId/)
  assert.match(contentClient, /imageFileId/)
  assert.match(contentActions, /cover_file_id = \$\{parsed\.coverFileId\}/)
  assert.match(contentActions, /image_file_id = \$\{parsed\.imageFileId\}/)
  assert.match(contentActions, /attachFileToEntity/)
  assert.match(contentData, /createSignedUrlsByStoragePath/)
  assert.match(contentData, /cover\.storage_path as cover_storage_path/)
  assert.match(contentData, /image_file\.storage_path as image_storage_path/)
  assert.match(contentTypes, /coverFileId/)
  assert.match(contentTypes, /imageFileId/)
})

test("financial receipts use app_files for revenues, expenses and donations", () => {
  const migration = read("supabase/migrations/20260605130000_p4_financial_receipt_files.sql")
  const operationalActions = read("src/lib/operational/actions.ts")
  const financePage = read("src/app/(dashboard)/financeiro/page.tsx")
  const donationsPage = read("src/app/(dashboard)/doacao/page.tsx")

  for (const table of ["revenues", "expenses", "donations"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table}`, "i"))
    assert.match(migration, new RegExp(`${table}_receipt_file_id_idx`, "i"))
  }

  assert.match(migration, /receipt_file_id uuid references public\.app_files\(id\)/i)
  assert.match(operationalActions, /attachReceiptFile/)
  assert.match(operationalActions, /uploadManagedFile/)
  assert.match(operationalActions, /receipt_file_id = \$\{uploaded\.id\}/)
  assert.match(operationalActions, /financial_receipt\.upload/)
  assert.match(financePage, /name="receiptFile"/)
  assert.match(donationsPage, /name="receiptFile"/)
})

test("operational media uses app_files for reading plans and premium content", () => {
  const migration = read("supabase/migrations/20260605140000_p5_operational_media_files.sql")
  const operationalActions = read("src/lib/operational/actions.ts")
  const operationalData = read("src/lib/operational/data.ts")
  const readingPlansPage = read("src/app/(dashboard)/discipulado/page.tsx")
  const inpeacePage = read("src/app/(dashboard)/inpeace-play/page.tsx")

  assert.match(migration, /alter table public\.reading_plans/i)
  assert.match(migration, /cover_file_id uuid references public\.app_files\(id\)/i)
  assert.match(migration, /alter table public\.subscription_contents/i)
  assert.match(migration, /highlight_file_id uuid references public\.app_files\(id\)/i)
  assert.match(migration, /alter table public\.subscription_collections/i)

  assert.match(operationalActions, /attachOperationalMediaFile/)
  assert.match(operationalActions, /operational_media\.upload/)
  assert.match(operationalActions, /entityTable: "reading_plans"/)
  assert.match(operationalActions, /entityTable: "subscription_contents"/)
  assert.match(operationalActions, /entityTable: "subscription_collections"/)
  assert.match(operationalActions, /fileColumn: "cover_file_id"/)
  assert.match(operationalActions, /fileColumn: "highlight_file_id"/)

  assert.match(operationalData, /createSignedUrlsByStoragePath/)
  assert.match(operationalData, /cover_file\.storage_path as cover_storage_path/)
  assert.match(operationalData, /highlight_file\.storage_path as highlight_storage_path/)

  assert.match(readingPlansPage, /name="coverFile"/)
  assert.match(inpeacePage, /name="highlightFile"/)
  assert.match(inpeacePage, /name="coverFile"/)
})
