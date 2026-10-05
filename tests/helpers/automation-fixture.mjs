import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url);
function loadModules(sql, extraMocks) {
  const cache = new Map(),
    mocks = {
      "./openrouter-config": { getOpenRouterApiKey: async () => "" },
      "@/lib/db/client": { getSql: () => sql },
      "@/lib/files/server": {
        createSignedUrlsByStoragePath: async (paths) =>
          new Map(paths.map((p) => [p, `https://media.test/${p}`])),
      },
      "@/lib/auth/server": {},
      "@/lib/auth/permissions": {},
      "@/lib/admin/data": {},
      ...extraMocks,
    };
  function load(path) {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path).exports;
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    new Function("require", "module", "exports", source)(
      (name) => {
        if (name in mocks) return mocks[name];
        if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
        if (name.startsWith("."))
          return load(
            resolve(dirname(path), name.endsWith(".ts") ? name : `${name}.ts`),
          );
        return require(name);
      },
      loaded,
      loaded.exports,
    );
    return loaded.exports;
  }
  return load;
}

export const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  U = "20000000-0000-4000-8000-000000000001",
  P = "30000000-0000-4000-8000-000000000001",
  I = "50000000-0000-4000-8000-000000000001",
  F = "60000000-0000-4000-8000-000000000001",
  S = "70000000-0000-4000-8000-000000000001";
export async function automationFixture() {
  const db = new PGlite();
  let transaction = null;
  const sql = (strings, ...values) => {
    let query = "";
    const params = [];
    strings.forEach((s, i) => {
      query += s;
      if (i < values.length) {
        const v = values[i];
        if (v && v.assignment) {
          query += Object.entries(v.assignment)
            .map(([k, val]) => {
              params.push(val);
              return `"${k}"=$${params.length}`;
            })
            .join(",");
        } else {
          params.push(Array.isArray(v) ? `{${v.join(",")}}` : v);
          query += `$${params.length}`;
        }
      }
    });
    return (transaction ?? db).query(query, params).then((r) => r.rows);
  };
  sql.array = (a) => a;
  sql.begin = (fn) =>
    db.transaction(async (tx) => {
      transaction = tx;
      try {
        return await fn(sql);
      } finally {
        transaction = null;
      }
    });
  const tag = sql;
  const tagged = (strings, ...v) =>
    Array.isArray(strings) && strings.raw
      ? tag(strings, ...v)
      : { assignment: strings };
  Object.assign(tagged, {
    json: (value) => JSON.stringify(value),
    array: sql.array,
    begin: (fn) => sql.begin(() => fn(tagged)),
  });

  const permissions = { denied: new Set() };
  const load = loadModules(tagged, {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/server": {
      getCurrentUser: async () => ({ id: U, company_id: A, role: "admin" }),
      requireUserCompanyId: () => A,
    },
    "@/lib/auth/permissions": {
      requirePermission: async (permission) => {
        if (permissions.denied.has(permission))
          throw new Error("Acesso negado");
      },
      writeAuditLog: async () => {},
    },
    "@/lib/admin/data": {
      getCompanyEnabledModuleIds: async () => ["automations"],
    },
  });
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema vault;create schema net;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    create function public.is_superadmin() returns boolean language sql stable as $$select false$$;
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
    grant usage on schema public,auth to authenticated;`);
  await db.exec(
    readFileSync("tests/fixtures/automation-base-schema.sql", "utf8"),
  );
  await db.exec(`create table public.crm_stages(id uuid primary key default gen_random_uuid(),company_id uuid,name text,sort_order integer default 0,created_at timestamptz default now(),deleted_at timestamptz);
    create table public.forms(id uuid primary key default gen_random_uuid(),company_id uuid,title text,create_person boolean default true,create_account_after_submit boolean default false,deleted_at timestamptz);`);
  await db.query(
    "insert into companies(id,name,status,active) values($1,'Igreja real','active',true),($2,'Outra igreja','active',true)",
    [A, B],
  );
  await db.query(
    "insert into profiles(id,auth_user_id,company_id,role,active,name) values($1,$1,$2,'admin',true,'Admin')",
    [U, A],
  );
  await db.query(
    "insert into people(id,company_id,full_name,phone,person_type,status,is_active) values($1,$2,'Ana','11999999999','visitor','active',true)",
    [P, A],
  );
  await db.query(
    "insert into uazapi_instances(id,company_id,name,active,status) values($1,$2,'Teste',true,'connected')",
    [I, A],
  );
  await db.query(
    "insert into forms(id,company_id,title) values($1,$2,'Visitantes')",
    [F, A],
  );
  await db.query(
    "insert into crm_stages(id,company_id,name) values($1,$2,'Contato')",
    [S, A],
  );
  await db.exec(
    readFileSync("supabase/migrations/20261005140000_automations.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261005184126_automation_form_kanban_testing.sql",
      "utf8",
    ),
  );
  await db.exec(
    `create function public.get_uazapi_instance_credential(uuid,uuid) returns table(base_url text,instance_token text) language sql as $$select 'https://uazapi.test','fixture-token'$$;`,
  );
  const { newNode } = load("src/lib/automations/templates.ts");
  const runtime = load("src/lib/automations/runtime.ts");
  async function flow(definition, companyId = A) {
    const f = (
      await db.query(
        "insert into automation_flows(company_id,name,draft,created_by) values($1,'Teste',$2,$3) returning id",
        [companyId, definition, U],
      )
    ).rows[0];
    const v = (
      await db.query(
        "insert into automation_versions(company_id,flow_id,number,definition,actor_id) values($1,$2,1,$3,$4) returning id",
        [companyId, f.id, definition, U],
      )
    ).rows[0];
    await db.query(
      "update automation_flows set status='active',published_version_id=$1,published_at=now()-interval '1 hour' where id=$2",
      [v.id, f.id],
    );
    return {
      id: f.id,
      company_id: companyId,
      published_version_id: v.id,
      definition,
      actor_id: U,
      published_at: new Date(Date.now() - 3600000),
    };
  }
  return { db, load, sql: tagged, runtime, newNode, flow, permissions };
}
