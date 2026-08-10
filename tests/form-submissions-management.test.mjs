import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const data = readFileSync("src/lib/forms/data.ts", "utf8")
const actions = readFileSync("src/lib/forms/actions.ts", "utf8")
const builder = readFileSync(
  "src/app/(dashboard)/formularios/[id]/form-builder-client.tsx",
  "utf8",
)
const page = readFileSync("src/app/(dashboard)/formularios/[id]/page.tsx", "utf8")

test("form submissions use bounded server-side pagination", () => {
  assert(data.includes("queryFormSubmissionsPage"))
  assert(data.includes("order by created_at desc, id desc"))
  assert(data.includes("limit ${pageSize}"))
  assert(builder.includes("submissionsPagination.pageCount"))
  assert(builder.includes("goToSubmissionPage"))
  assert(page.includes("submissionsPage"))
})

test("form submission cleanup is tenant-scoped, audited and queue-safe", () => {
  assert(actions.includes("export async function clearFormSubmissions"))
  assert(actions.includes('requirePermission("forms.edit", companyId)'))
  assert(actions.includes("delete from public.form_submissions"))
  assert(actions.includes("and company_id = ${companyId}"))
  assert(actions.includes("status in ('pending', 'processing')"))
  assert(actions.includes('action: "form.submissions.clear"'))
  assert(builder.includes("Limpar todos os envios?"))
})
