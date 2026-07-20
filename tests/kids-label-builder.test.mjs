import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  createDefaultLabelDesign,
  kidLabelDesignSchema,
  labelContainsSensitiveFields,
  resolveLabelField,
  validatePublishableLabel,
  SAMPLE_LABEL_CONTEXT,
} from "../src/lib/kids/label-design.ts"

test("default child and guardian templates are publishable", () => {
  const child = createDefaultLabelDesign("child")
  const guardian = createDefaultLabelDesign("guardian")
  assert.equal(validatePublishableLabel("child", child), null)
  assert.equal(validatePublishableLabel("guardian", guardian), null)
  assert.ok(child.elements.some((element) => element.field === "childName"))
  assert.ok(guardian.elements.some((element) => element.type === "qr"))
  assert.deepEqual(kidLabelDesignSchema.parse(child), child)
})

test("publish validation blocks operationally invalid labels", () => {
  const empty = { ...createDefaultLabelDesign("child"), elements: [] }
  assert.match(validatePublishableLabel("child", empty), /identificar/)
  assert.match(validatePublishableLabel("guardian", empty), /QR ou PIN/)
})

test("sensitive fields and custom fields are detected", () => {
  const design = createDefaultLabelDesign("child")
  assert.equal(labelContainsSensitiveFields(design), false)
  design.elements.push({ ...design.elements[0], id: "health", field: "allergies" })
  assert.equal(labelContainsSensitiveFields(design), true)
  design.elements.at(-1).field = "custom.child.123"
  assert.equal(labelContainsSensitiveFields(design), true)
})

test("dynamic resolver supports standard and custom values", () => {
  const context = { ...SAMPLE_LABEL_CONTEXT, customFields: { "child.field-1": "Azul" } }
  assert.equal(resolveLabelField(context, "childName"), "Noah L.")
  assert.equal(resolveLabelField(context, "custom.child.field-1"), "Azul")
  assert.equal(resolveLabelField(context, "internal_hash"), "")
})

test("migration defines tenant revisions, RLS and immutable attendance binding", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260718170000_kids_label_builder.sql", import.meta.url), "utf8")
  assert.match(sql, /create table if not exists public\.kid_label_templates/)
  assert.match(sql, /create table if not exists public\.kid_label_template_revisions/)
  assert.match(sql, /child_label_revision_id/)
  assert.match(sql, /guardian_label_revision_id/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /Existing Kids tenants receive an immediately usable visual equivalent/)
})

test("reception keeps QZ direct printing and browser fallback contracts", async () => {
  const printer = await readFile(new URL("../src/lib/kids/printer-client.ts", import.meta.url), "utf8")
  const reception = await readFile(new URL("../src/app/(dashboard)/kids/recepcao/recepcao-client.tsx", import.meta.url), "utf8")
  assert.match(printer, /localStorage/)
  assert.match(printer, /qz\.print/)
  assert.match(reception, /window\.print/)
  assert.match(reception, /printKidLabelsDirect/)
})

test("editor uses top-left coordinates and non-blocking canvas guides", async () => {
  const renderer = await readFile(new URL("../src/lib/kids/label-renderer.ts", import.meta.url), "utf8")
  const builder = await readFile(new URL("../src/app/(dashboard)/kids/kids-label-builder.tsx", import.meta.url), "utf8")
  assert.match(renderer, /originX: "left" as const, originY: "top" as const/)
  assert.match(builder, /pointer-events-none absolute z-20 border border-dashed/)
  assert.doesNotMatch(builder, /\[design, selectedIds, widthMm, heightMm\]/)
})
