import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import postgres from "postgres";
import { types } from "../node_modules/postgres/src/types.js";

test("saved and previously double-encoded drafts load with their original blocks", async () => {
  const require = createRequire(import.meta.url);
  const client = postgres(); // json() creates a parameter without connecting.
  let storedDraft;
  const sql = async (strings, ...values) => {
    const query = strings.join("?");
    if (/insert into public.automation_flows|update public.automation_flows/.test(query)) {
      const draftIndex = strings.findIndex((part, i) => i > 0 && part.startsWith("::jsonb")) - 1;
      const parameter = values[draftIndex];
      storedDraft = JSON.parse(types.json.serialize(parameter?.type ? parameter.value : parameter));
      return [{ id: "60000000-0000-4000-8000-000000000001", revision: 1 }];
    }
    if (query.includes("from public.automation_flows"))
      return [{ id: "60000000-0000-4000-8000-000000000001", draft: storedDraft }];
    return [];
  };
  sql.json = client.json;
  const mocks = {
    "next/cache": { revalidatePath() {} },
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/auth/server": {
      getCurrentUser: async () => ({ id: "20000000-0000-4000-8000-000000000001", role: "admin" }),
      requireUserCompanyId: () => "10000000-0000-4000-8000-000000000001",
    },
    "@/lib/auth/permissions": { requirePermission: async () => {}, writeAuditLog: async () => {} },
    "@/lib/admin/data": { getCompanyEnabledModuleIds: async () => ["automations"] },
    "@/lib/types": { hasPermission: () => true, hasAnyRole: (user, roles) => (user.roles ?? [user.role]).some(role => roles.includes(role)) },
    "@/lib/files/server": {},
    "./ai": {},
    "./openrouter-config": { getOpenRouterApiKey: async () => "" },
    "./runtime": {},
    "./delivery": {},
  };
  const cache = new Map();
  function load(path) {
    path = resolve(path);
    if (cache.has(path)) return cache.get(path).exports;
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const source = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function("require", "module", "exports", source)((name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith(".")) return load(resolve(dirname(path), `${name}.ts`));
      return require(name);
    }, loaded, loaded.exports);
    return loaded.exports;
  }
  try {
    const { saveAutomation } = load("src/lib/automations/actions.ts");
    const { getAutomationWorkspace } = load("src/lib/automations/data.ts");
    const { parseStoredFlowDefinition } = load("src/lib/automations/contract.ts");
    const definition = {
      schemaVersion: 1,
      nodes: [{ id: "start", kind: "trigger", label: "Início", position: { x: 0, y: 0 }, config: { mode: "manual" } }],
      edges: [],
    };
    for (const id of [undefined, "60000000-0000-4000-8000-000000000001"]) {
      await saveAutomation({ id, name: "Fluxo de teste", definition, revision: 1 });
      assert.equal(typeof storedDraft, "object");
      assert.deepEqual((await getAutomationWorkspace()).flows[0].draft, definition);
    }
    storedDraft = JSON.stringify(definition);
    const workspace = await getAutomationWorkspace();
    assert.equal(workspace.flows[0].draft.nodes.length, 1);
    assert.deepEqual(workspace.flows[0].draft, definition);
    assert.deepEqual(parseStoredFlowDefinition(storedDraft), definition);
    assert.throws(() => parseStoredFlowDefinition({ nodes: undefined }));
  } finally {
    await client.end();
  }
});
