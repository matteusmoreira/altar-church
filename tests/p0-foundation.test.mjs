import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P0 migration creates audit and file foundations with RLS", () => {
  const sql = read("supabase/migrations/20260602120000_p0_audit_files_foundation.sql")

  assert.match(sql, /create table if not exists public\.audit_logs/i)
  assert.match(sql, /create table if not exists public\.app_files/i)
  assert.match(sql, /insert into storage\.buckets/i)
  assert.match(sql, /church-assets/i)
  assert.match(sql, /storage\.objects/i)
  assert.match(sql, /app_files_storage_path_company_prefix/i)
  assert.match(sql, /alter table public\.audit_logs enable row level security/i)
  assert.match(sql, /alter table public\.app_files enable row level security/i)
  assert.match(sql, /audit_logs_company_id_created_at_idx/i)
  assert.match(sql, /app_files_company_id_created_at_idx/i)
  assert.match(sql, /public\.is_company_member\(company_id\)/i)
  assert.match(sql, /public\.is_superadmin\(\)/i)
})

test("server permission helper blocks unauthorized users and exposes audit logging", () => {
  const source = read("src/lib/auth/permissions.ts")

  assert.match(source, /export async function requirePermission/)
  assert.match(source, /export async function requireCompanyAccess/)
  assert.match(source, /export async function writeAuditLog/)
  assert.match(source, /hasPermission\(user\.role, permission\)/)
  assert.match(source, /Acesso negado/)
  assert.match(source, /insert into public\.audit_logs/)
})

test("superadmin mutations write audit logs", () => {
  const source = read("src/lib/admin/actions.ts")

  assert.match(source, /writeAuditLog/)
  assert.match(source, /action: "company\.save"/)
  assert.match(source, /action: "plan\.save"/)
  assert.match(source, /action: "profile\.save"/)
  assert.match(source, /action: "module\.set_active"/)
})
