import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

const A = "10000000-0000-4000-8000-000000000001"
const B = "10000000-0000-4000-8000-000000000002"
const migration = new URL("../supabase/migrations/20261006225400_friendly_entity_slugs.sql", import.meta.url)

test("canonical paths preserve repeated and encoded query parameters; public routing keeps authorization tokens", async () => {
  const { canonicalEntityPath, isProtectedDashboardPath } = await import("../src/lib/navigation/routes.ts")
  assert.equal(canonicalEntityPath("/formularios", "cadastro", { submissionsPage: "2", tag: ["a b", "ação"], empty: undefined }),
    "/formularios/cadastro?submissionsPage=2&tag=a+b&tag=a%C3%A7%C3%A3o")
  assert.equal(isProtectedDashboardPath("/eventos/publico/igreja/culto-de-domingo"), false)
  assert.equal(isProtectedDashboardPath(`/eventos/publico/${A}`), false)
  assert.equal(isProtectedDashboardPath(`/eventos/inscricao/${A}`), false)
  assert.equal(isProtectedDashboardPath(`/eventos/check-in/${A}`), false)
  assert.equal(isProtectedDashboardPath("/eventos/culto-de-domingo"), true)
  assert.equal(isProtectedDashboardPath(`/eventos/publico/${A}/edit`), true)
  assert.equal(isProtectedDashboardPath("/membro/ministerios/louvor"), true)
})

test("database slugs: backfill, aliases, tenant isolation, all writers and public link revocation", async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create table people(id uuid primary key default gen_random_uuid(), company_id uuid, full_name text, created_at timestamptz default now(), deleted_at timestamptz);
      create table ministries(id uuid primary key default gen_random_uuid(), company_id uuid, name text, slug text, created_at timestamptz default now(), deleted_at timestamptz);
      create table forms(id uuid primary key default gen_random_uuid(), company_id uuid, title text, slug text not null, created_at timestamptz default now(), deleted_at timestamptz);
      create table events(id uuid primary key default gen_random_uuid(), company_id uuid, title text, public_token uuid default gen_random_uuid(), created_at timestamptz default now(), deleted_at timestamptz);
      create table notifications(id uuid primary key default gen_random_uuid(), company_id uuid, title text, created_at timestamptz default now(), deleted_at timestamptz);
      create table kid_classrooms(id uuid primary key default gen_random_uuid(), company_id uuid, name text, created_at timestamptz default now(), deleted_at timestamptz);
      create table kid_sessions(id uuid primary key default gen_random_uuid(), company_id uuid, title text, deleted_at timestamptz);
      create table kid_session_classrooms(id uuid primary key default gen_random_uuid(), company_id uuid, session_id uuid, classroom_id uuid, created_at timestamptz default now());`)
    const existing = (await db.query("insert into ministries(company_id,name,slug) values($1,'Ministério de Louvor','louvor') returning id", [A])).rows[0]
    await db.exec(await readFile(migration, "utf8"))
    assert.equal((await db.query("select slug from ministries where id=$1", [existing.id])).rows[0].slug, "louvor")
    const insert = (name, company = A) => db.query("insert into people(company_id,full_name) values($1,$2) returning id,slug", [company, name])
    const one = (await insert("João Silva")).rows[0]
    assert.equal(one.slug, "joao-silva")
    assert.equal((await insert("João Silva")).rows[0].slug, "joao-silva-2")
    assert.equal((await insert("João Silva", B)).rows[0].slug, "joao-silva")
    const batch = await Promise.all(Array.from({ length: 12 }, () => insert("Cadastro simultâneo")))
    assert.equal(new Set(batch.map(result => result.rows[0].slug)).size, 12)
    assert.equal((await insert("🕊️")).rows[0].slug, "pessoa")
    assert.equal((await insert("Novo")).rows[0].slug, "pessoa-novo")
    assert.equal((await insert(A)).rows[0].slug, `pessoa-${A}`)
    const long = "a".repeat(100)
    assert.equal((await insert(long)).rows[0].slug.length, 80)
    assert.equal((await insert(long)).rows[0].slug, "a".repeat(78) + "-2")
    await db.query("update people set full_name='Outro nome' where id=$1", [one.id])
    assert.equal((await db.query("select slug from people where id=$1", [one.id])).rows[0].slug, "joao-silva")
    await db.query("update people set slug='novo-endereco' where id=$1", [one.id])
    const aliases = (await db.query("select slug from route_private.slug_reservations where entity_id=$1 order by slug", [one.id])).rows.map(row => row.slug)
    assert.deepEqual(aliases, ["joao-silva", "novo-endereco"])
    await db.query("update people set deleted_at=now() where id=$1", [one.id])
    assert.equal((await insert("João Silva")).rows[0].slug, "joao-silva-3")
    await db.query("delete from people where id=$1", [one.id])
    assert.equal((await insert("novo-endereco")).rows[0].slug, "novo-endereco-2")
    await assert.rejects(db.query("update people set company_id=$1 where slug='joao-silva-2'", [B]), /Cannot move/)
    const event = (await db.query("insert into events(company_id,title) values($1,'Culto de Domingo') returning id,slug,public_slug", [A])).rows[0]
    assert.equal(event.public_slug, "culto-de-domingo")
    await db.query("update events set public_token=gen_random_uuid() where id=$1", [event.id])
    assert.deepEqual((await db.query("select slug,public_slug from events where id=$1", [event.id])).rows[0], { slug: "culto-de-domingo", public_slug: "culto-de-domingo-2" })
    assert.equal((await db.query("select count(*)::int n from events where public_slug=$1", [event.public_slug])).rows[0].n, 0)
    const ministry = (await db.query("insert into ministries(company_id,name) values($1,'Ministério das Mulheres') returning slug", [A])).rows[0]
    assert.equal(ministry.slug, "mulheres")
    assert.equal((await db.query("insert into forms(company_id,title) values($1,'Cadastro de membros') returning slug", [A])).rows[0].slug, "cadastro-de-membros")
    const classroom = (await db.query("insert into kid_classrooms(company_id,name) values($1,'Berçário') returning id,slug", [A])).rows[0]
    const session = (await db.query("insert into kid_sessions(company_id,title) values($1,'Culto da manhã') returning id", [A])).rows[0]
    assert.equal((await db.query("insert into kid_session_classrooms(company_id,classroom_id,session_id) values($1,$2,$3) returning slug", [A, classroom.id, session.id])).rows[0].slug, "bercario-culto-da-manha")
    await db.exec(`grant select, insert, update on people to authenticated;
      alter table people enable row level security;
      create policy own_church on people to authenticated
        using (company_id=current_setting('test.company')::uuid)
        with check (company_id=current_setting('test.company')::uuid);`)
    await db.query("select set_config('test.company',$1,false)", [A])
    await db.exec("set role authenticated")
    assert.equal((await insert("Cliente autorizado")).rows[0].slug, "cliente-autorizado")
    await assert.rejects(insert("Cliente de outra igreja", B), /row-level security/)
    await assert.rejects(db.query("select * from route_private.slug_reservations"), /permission denied/)
    await assert.rejects(db.query("select route_private.reserve_slug($1,'people',gen_random_uuid(),'hack','pessoa')", [A]), /permission denied/)
  } finally { await db.close() }
})
