import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"

const source = readFileSync("src/lib/kids/portal-actions.ts", "utf8")
const actionSource = source.slice(source.indexOf("export async function updateGuardianConsents"), source.indexOf("/** Pessoas autorizadas"))
const compiled = ts.transpileModule(actionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

test("portal consent confirmations preserve acceptance and its original timestamp", async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table kid_profiles (id text primary key, company_id text);
      create table kid_consents (
        id serial primary key, company_id text, kid_id text, consent_type text,
        version text, status text, source text, actor_profile_id text,
        granted_at timestamptz not null default now()
      );
      create unique index on kid_consents(kid_id, consent_type) where status = 'granted';
      insert into kid_profiles values ('child', 'church');
    `)
    const exports = {}
    const sql = { begin: (callback) => db.transaction(async (tx) => callback(async (strings, ...values) => {
      const query = strings.reduce((result, part, index) => result + part + (index < values.length ? `$${index + 1}` : ""), "")
      return (await tx.query(query, values)).rows
    })) }
    vm.runInNewContext(compiled, {
      exports, getSql: () => sql,
      kidConsentUpdateSchema: { parse: (input) => input },
      guardianContext: async () => ({ user: { id: "guardian" }, companyId: "church", kidIds: ["child"] }),
      assertOwnsKid: (ids, id) => { if (!ids.includes(id)) throw new Error("Forbidden") },
      CONSENT_TYPES: ["data_processing", "image_use", "emergency_care", "communication"],
      KIDS_CONSENT_VERSION: "1.0", refresh: () => {}, failure: (error) => ({ ok: false, error: error.message }),
    })
    const save = exports.updateGuardianConsents
    assert.equal((await save({ kidId: "child", consents: ["data_processing"] })).ok, true)
    const first = (await db.query("select * from kid_consents")).rows[0]
    assert.ok(first.granted_at)
    assert.equal(first.actor_profile_id, "guardian")
    assert.equal(first.source, "portal")

    // A forged uncheck request cannot revoke an already accepted consent.
    assert.equal((await save({ kidId: "child", consents: [] })).ok, true)
    assert.equal((await db.query("select * from kid_consents")).rows[0].status, "granted")

    // A stale form can add another consent without replacing the first acceptance.
    await save({ kidId: "child", consents: ["image_use"] })
    await save({ kidId: "child", consents: ["data_processing", "image_use"] })
    const rows = (await db.query("select * from kid_consents order by id")).rows
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, first.id)
    assert.equal(rows[0].granted_at.toISOString(), first.granted_at.toISOString())
    const portalSource = readFileSync("src/lib/kids/portal.ts", "utf8")
    const timestampProjection = portalSource.match(/\(select jsonb_object_agg\(consent\.consent_type, consent\.granted_at\)[\s\S]*?as consent_granted_at/)[0]
    const projected = (await db.query(`select ${timestampProjection} from kid_profiles kid where id = 'child'`)).rows[0]
    assert.equal(new Date(projected.consent_granted_at.data_processing).toISOString(), first.granted_at.toISOString())
    assert.equal((await save({ kidId: "other-child", consents: ["communication"] })).ok, false)
    assert.equal((await db.query("select count(*)::int as count from kid_consents")).rows[0].count, 2)
  } finally {
    await db.close()
  }
})
