import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"

const require = createRequire(import.meta.url)
const A = "10000000-0000-4000-8000-000000000001"
const B = "10000000-0000-4000-8000-000000000002"

test("OpenRouter admin authorization, key replacement, redaction and church isolation", async () => {
  const db = new PGlite()
  let connection = db
  let allowed = true
  const audit = []
  const sql = async (parts, ...values) => {
    const query = parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), "")
    return (await connection.query(query, values.map((value) => Array.isArray(value) ? `{${value.join(",")}}` : value))).rows
  }
  sql.array = (values) => values
  sql.begin = (fn) => db.transaction(async (tx) => {
    connection = tx
    try { return await fn(sql) } finally { connection = db }
  })
  const config = {}
  const mocks = {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/auth/server": { assertSuperadmin: async () => { if (!allowed) throw new Error("Acesso negado") } },
    "@/lib/auth/permissions": { writeAuditLog: async (entry) => audit.push(entry) },
    "@/lib/automations/ai": { openRouterModels: async () => [{ id: "fixture/model" }] },
    "@/lib/automations/openrouter-config": config,
  }
  function load(path) {
    const output = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const loaded = { exports: {} }
    new Function("require", "module", "exports", output)((name) => name in mocks ? mocks[name] : require(name), loaded, loaded.exports)
    return loaded.exports
  }
  try {
    // Simulated Vault functions verify SQL and application behavior, not Vault cryptography.
    await db.exec(`
      create schema vault;
      create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret text);
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(value text,label text,description text) returns uuid language sql as
        'insert into vault.secrets(name,secret) values(label,value) returning id';
      create function vault.update_secret(secret_id uuid,value text) returns void language sql as
        'update vault.secrets set secret=value where id=secret_id';
      create table public.companies(id uuid primary key);
      insert into public.companies values('${A}'),('${B}');
      create table public.automation_settings(company_id uuid primary key references companies(id),allowed_models text[] default '{}',monthly_budget_usd numeric default 0,knowledge text default '',updated_at timestamptz default now());
      insert into public.automation_settings(company_id,knowledge) values('${A}','Preservar conhecimento');
    `)
    Object.assign(config, load("src/lib/automations/openrouter-config.ts"))
    const actions = load("src/lib/admin/openrouter-actions.ts")
    const key = "sk-or-fixture-only-aaaaaaaaaaaaaaaa"
    allowed = false
    for (const fn of [() => actions.getAdminOpenRouterSettings(A), () => actions.saveAdminOpenRouterKey(key), () => actions.getAdminOpenRouterModels(), () => actions.saveAdminOpenRouterSettings({ companyId: A, models: [], budget: 0 })]) {
      await assert.rejects(fn, /Acesso negado/)
    }
    allowed = true
    assert.equal((await actions.saveAdminOpenRouterKey("invalid")).ok, false)
    assert.equal((await actions.saveAdminOpenRouterKey(key)).ok, true)
    assert.equal(await config.getOpenRouterApiKey(), key)
    const replacement = "sk-or-fixture-only-bbbbbbbbbbbbbbbb"
    assert.equal((await actions.saveAdminOpenRouterKey(replacement)).ok, true)
    assert.equal(await config.getOpenRouterApiKey(), replacement)
    assert.equal((await db.query("select count(*)::int as count from vault.secrets")).rows[0].count, 1)
    const settings = await actions.getAdminOpenRouterSettings(A)
    assert.equal(settings.keySource, "panel")
    assert.ok(!JSON.stringify(settings).includes(replacement))
    assert.ok(!JSON.stringify(audit).includes(replacement))
    assert.equal((await actions.saveAdminOpenRouterSettings({ companyId: A, models: ["fixture/model", "fixture/model"], budget: 8 })).ok, true)
    assert.deepEqual((await actions.getAdminOpenRouterSettings(A)).models, ["fixture/model"])
    assert.equal((await actions.getAdminOpenRouterSettings(A)).budget, 8)
    assert.equal((await actions.getAdminOpenRouterSettings(B)).budget, 0)
    assert.equal((await db.query("select knowledge from automation_settings where company_id=$1", [A])).rows[0].knowledge, "Preservar conhecimento")
    assert.equal((await actions.saveAdminOpenRouterSettings({ companyId: B, models: ["unknown/model"], budget: 8 })).ok, false)
    assert.equal((await actions.saveAdminOpenRouterSettings({ companyId: B, models: [], budget: -1 })).ok, false)
    assert.equal((await actions.saveAdminOpenRouterSettings({ companyId: B, models: ["fixture/model"], budget: 2 })).ok, true)
    await db.exec("drop function vault.update_secret(uuid,text)")
    const failed = await actions.saveAdminOpenRouterKey(key)
    assert.equal(failed.ok, false)
    assert.ok(!JSON.stringify(failed).includes(key))
  } finally { await db.close() }
})
