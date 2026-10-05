import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url);
const A = "10000000-0000-4000-8000-000000000001",
  U = "20000000-0000-4000-8000-000000000001",
  P = "30000000-0000-4000-8000-000000000001",
  G = "40000000-0000-4000-8000-000000000001",
  I = "50000000-0000-4000-8000-000000000001";
function loadModules(sql) {
  const cache = new Map(),
    mocks = {
      "./openrouter-config": { getOpenRouterApiKey: async () => process.env.OPENROUTER_API_KEY ?? "" },
      "@/lib/db/client": { getSql: () => sql },
      "@/lib/files/server": {
        createSignedUrlsByStoragePath: async (paths) =>
          new Map(paths.map((p) => [p, `https://media.test/${p}`])),
      },
      "@/lib/auth/server": {},
      "@/lib/auth/permissions": {},
      "@/lib/admin/data": {},
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
test("actual runtime: persistent waits, audience recheck, delivery ambiguity, replies, opt-out and human pause", async () => {
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
    array: sql.array,
    begin: (fn) => sql.begin(() => fn(tagged)),
  });
  const load = loadModules(tagged),
    runtime = load("src/lib/automations/runtime.ts"),
    webhook = load("src/lib/automations/webhook.ts"),
    { newNode } = load("src/lib/automations/templates.ts");
  const originalFetch = globalThis.fetch;
  let sends = 0,
    ambiguous = false,
    secret = "a".repeat(64);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/uazapi\.test\/send\//);
    sends++;
    return ambiguous
      ? new Response("{}", { status: 503 })
      : Response.json({ id: `msg-${sends}` });
  };
  try {
    await db.exec(
      `create role authenticated;create role anon;create role service_role;create schema auth;create schema vault;create schema net;create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function public.is_superadmin() returns boolean language sql as $$select false$$;create table vault.decrypted_secrets(name text,decrypted_secret text);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`,
    );
    await db.exec(
      readFileSync("tests/fixtures/automation-base-schema.sql", "utf8"),
    );
    await db.query(
      "insert into companies(id,name,status,active) values($1,'Teste','test',true)",
      [A],
    );
    await db.query(
      "insert into profiles(id,auth_user_id,company_id,name,role,active) values($1,$1,$2,'Admin','admin',true)",
      [U, A],
    );
    await db.query(
      "insert into people(id,company_id,full_name,phone,person_type,status,is_active) values($1,$2,'Ana','11999999999','member','active',true)",
      [P, A],
    );
    await db.query(
      "insert into groups(id,company_id,name,type,is_active) values($1,$2,'Célula','cell',true)",
      [G, A],
    );
    await db.query(
      "insert into group_members(company_id,group_id,person_id,status) values($1,$2,$3,'active')",
      [A, G, P],
    );
    await db.query(
      "insert into uazapi_instances(id,company_id,name,active,status) values($1,$2,'Teste',true,'connected')",
      [I, A],
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261005140000_automations.sql",
        "utf8",
      ),
    );
    await db.exec(
      `create function public.get_uazapi_instance_credential(uuid,uuid) returns table(base_url text,instance_token text) language sql as $$select 'https://uazapi.test','fixture-token'$$;`,
    );
    await db.query(
      "update automation_settings set quiet_start='00:00',quiet_end='23:59' where company_id=$1",
      [A],
    );
    const crypto = await import("node:crypto");
    await db.query(
      "insert into automation_webhook_secrets(instance_id,company_id,secret_hash) values($1,$2,$3)",
      [I, A, crypto.createHash("sha256").update(secret).digest("hex")],
    );
    async function flow(nodes, edges, eventKey = "manual:case") {
      const definition = {
        schemaVersion: 1,
        nodes,
        edges: edges.map(([source, port, target], n) => ({
          id: `e${n}`,
          source,
          port,
          target,
        })),
      };
      const f = (
        await db.query(
          "insert into automation_flows(company_id,name,draft,created_by) values($1,'Teste',$2,$3) returning id",
          [A, definition, U],
        )
      ).rows[0];
      const v = (
        await db.query(
          "insert into automation_versions(company_id,flow_id,number,definition,actor_id) values($1,$2,1,$3,$4) returning id",
          [A, f.id, definition, U],
        )
      ).rows[0];
      await db.query(
        "update automation_flows set status='active',published_version_id=$1,published_at=now() where id=$2",
        [v.id, f.id],
      );
      await runtime.enqueueAutomationRun(
        {
          id: f.id,
          company_id: A,
          published_version_id: v.id,
          definition,
          published_at: new Date(),
          actor_id: U,
        },
        P,
        eventKey,
        { nome: "Ana" },
      );
      return (
        await db.query("select * from automation_runs where flow_id=$1", [f.id])
      ).rows[0];
    }
    const node = (kind, id, config = {}) => ({ ...newNode(kind, id), config });
    const message = {
      instanceId: I,
      destination: "person",
      message: { type: "text", text: "Olá {{nome}}" },
    };
    const trigger = node("trigger", "start", {
        mode: "manual",
        filter: { cellId: G },
      }),
      end = node("end", "end");
    const run = await flow(
      [
        trigger,
        node("wait", "delay", { minutes: 60 }),
        node("whatsapp", "send", message),
        end,
      ],
      [
        ["start", "next", "delay"],
        ["delay", "next", "send"],
        ["send", "next", "end"],
        ["send", "error", "end"],
      ],
    );
    await runtime.processAutomations(8);
    assert.equal(sends, 0);
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          run.id,
        ])
      ).rows[0].status,
      "ready",
    );
    await db.query(
      "update group_members set status='inactive' where person_id=$1",
      [P],
    );
    await db.query("update automation_runs set due_at=now() where id=$1", [
      run.id,
    ]);
    await runtime.processAutomations(8);
    assert.equal(
      sends,
      0,
      "member leaving cell before wait expiry cannot receive",
    );
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          run.id,
        ])
      ).rows[0].status,
      "completed",
    );
    const plain = node("trigger", "start", { mode: "manual" });
    ambiguous = true;
    const uncertain = await flow(
      [plain, node("whatsapp", "send", message), end],
      [
        ["start", "next", "send"],
        ["send", "next", "end"],
        ["send", "error", "end"],
      ],
      "manual:ambiguous",
    );
    await runtime.processAutomations(8);
    assert.equal(sends, 1);
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          uncertain.id,
        ])
      ).rows[0].status,
      "review",
    );
    await db.query(
      "update automation_runs set status='ready',due_at=now() where id=$1",
      [uncertain.id],
    );
    await runtime.processAutomations(8);
    assert.equal(sends, 1, "ambiguous delivery is never resent");
    await db.query("update automation_runs set status='canceled' where id=$1", [
      uncertain.id,
    ]);
    ambiguous = false;
    const reply = await flow(
      [
        plain,
        node("whatsapp", "send", message),
        node("response", "reply", { minutes: 60 }),
        node("interest", "interest", { interest: "Participar" }),
        end,
      ],
      [
        ["start", "next", "send"],
        ["send", "next", "reply"],
        ["send", "error", "end"],
        ["reply", "response", "interest"],
        ["reply", "timeout", "end"],
        ["reply", "error", "end"],
        ["interest", "next", "end"],
        ["interest", "error", "end"],
      ],
      "manual:reply",
    );
    await runtime.processAutomations(8);
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          reply.id,
        ])
      ).rows[0].status,
      "waiting",
    );
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "messages_update",
      state: "Read",
      event: {
        MessageIDs: [`msg-${sends}`],
        chatid: "5511999999999@s.whatsapp.net",
        Type: "Read",
        IsFromMe: true,
      },
    });
    assert.equal(
      (
        await db.query(
          "select status from automation_deliveries where run_id=$1",
          [reply.id],
        )
      ).rows[0].status,
      "read",
    );
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "messages_update",
      state: "Delivered",
      event: {
        MessageIDs: [`msg-${sends}`],
        chatid: "5511999999999@s.whatsapp.net",
        Type: "Delivered",
        IsFromMe: true,
      },
    });
    assert.equal(
      (
        await db.query(
          "select status from automation_deliveries where run_id=$1",
          [reply.id],
        )
      ).rows[0].status,
      "read",
      "late delivery receipts cannot regress read status",
    );
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "connection",
      instance: { status: "disconnected" },
    });
    assert.equal(
      (await db.query("select status from uazapi_instances where id=$1", [I]))
        .rows[0].status,
      "disconnected",
    );
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "connection",
      instance: { status: "connected" },
    });
    const event = {
      EventType: "messages",
      message: {
        id: "response-1",
        chatid: "5511999999999@s.whatsapp.net",
        buttonOrListid: "sim",
        replyid: `msg-${sends}`,
        fromMe: false,
      },
    };
    await webhook.receiveAutomationWebhook(I, secret, event);
    await webhook.receiveAutomationWebhook(I, secret, event);
    await runtime.processAutomations(8);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from automation_interests where run_id=$1",
          [reply.id],
        )
      ).rows[0].n,
      1,
    );
    const human = await flow(
      [
        plain,
        node("whatsapp", "send", message),
        node("response", "reply", { minutes: 60 }),
        end,
      ],
      [
        ["start", "next", "send"],
        ["send", "next", "reply"],
        ["send", "error", "end"],
        ["reply", "response", "end"],
        ["reply", "timeout", "end"],
        ["reply", "error", "end"],
      ],
      "manual:human",
    );
    await runtime.processAutomations(8);
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "messages",
      message: {
        id: "human-1",
        chatid: "5511999999999@s.whatsapp.net",
        text: "Vou ajudar",
        fromMe: true,
      },
    });
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          human.id,
        ])
      ).rows[0].status,
      "human",
    );
    await webhook.receiveAutomationWebhook(I, secret, {
      EventType: "messages",
      message: {
        id: "opt-1",
        chatid: "5511999999999@s.whatsapp.net",
        text: "SAIR",
        fromMe: false,
      },
    });
    assert.equal(
      (
        await db.query("select status from automation_runs where id=$1", [
          human.id,
        ])
      ).rows[0].status,
      "canceled",
    );
    assert.equal(
      (await db.query("select opted_out from automation_contacts")).rows[0]
        .opted_out,
      true,
    );
    await assert.rejects(
      () => webhook.receiveAutomationWebhook(I, "invalid", event),
      /UNAUTHORIZED/,
    );
    const P2 = "30000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into people(id,company_id,full_name,person_type,status,is_active,baptized) values($1,$2,'Sem data','member','active',true,true)",
      [P2, A],
    );
    await db.query(
      "update people set birth_date='1990-10-12',baptism_date='2026-10-05' where id=$1",
      [P],
    );
    const scheduled = [];
    for (const config of [
      { mode: "birthday", time: "09:00" },
      {
        mode: "relative_date",
        dateField: "baptism_date",
        offsetDays: 7,
        time: "09:00",
      },
      { mode: "schedule", schedule: "weekly", weekday: 1, time: "09:00" },
    ]) {
      const r = await flow(
        [node("trigger", "start", config), end],
        [["start", "next", "end"]],
        `setup:${config.mode}`,
      );
      await db.query("delete from automation_runs where id=$1", [r.id]);
      scheduled.push(r.flow_id);
    }
    await runtime.collectAutomationStarts(new Date("2026-10-12T12:10:00Z"));
    await runtime.collectAutomationStarts(new Date("2026-10-12T12:10:00Z"));
    const counts = [];
    for (const f of scheduled)
      counts.push(
        (
          await db.query(
            "select count(*)::int n from automation_runs where flow_id=$1",
            [f],
          )
        ).rows[0].n,
      );
    assert.deepEqual(
      counts,
      [1, 1, 2],
      "birthdays, seven days after baptism and weekly starts deduplicate; no date means no baptism start",
    );
    await db.exec("delete from automation_contacts")
    await db.query("update profiles set login_phone='11988888888' where id=$1",[U])
    const {cellInvitationTemplate}=load('src/lib/automations/templates.ts')
    const invitation=cellInvitationTemplate([{id:G,name:'Esperança',responsible_id:U}])
    invitation.nodes.forEach(n=>{if(n.kind==='whatsapp'||n.kind==='notify')n.config.instanceId=I})
    const invited=await flow(invitation.nodes,invitation.edges.map(e=>[e.source,e.port,e.target]),'manual:invitation')
    await runtime.processAutomations(25)
    await webhook.receiveAutomationWebhook(I,secret,{EventType:'messages',message:{id:'invite-accept',chatid:'5511999999999@s.whatsapp.net',buttonOrListid:'sim',fromMe:false}})
    await runtime.processAutomations(25)
    assert.equal((await db.query('select status from automation_runs where id=$1',[invited.id])).rows[0].status,'waiting')
    await webhook.receiveAutomationWebhook(I,secret,{EventType:'messages',message:{id:'invite-cell',chatid:'5511999999999@s.whatsapp.net',buttonOrListid:G,fromMe:false}})
    await runtime.processAutomations(25)
    assert.equal((await db.query('select interest from automation_interests where run_id=$1',[invited.id])).rows[0].interest,'Quero conhecer a célula Esperança')
    assert.equal((await db.query('select responsible_id from automation_tasks where run_id=$1',[invited.id])).rows[0].responsible_id,U)
    const handoff = await flow([plain,node('handoff','handoff',{title:'Atendimento',instanceId:I,responsibleId:U}),end], [['start','next','handoff'],['handoff','next','end'],['handoff','error','end']], 'manual:handoff');
    await runtime.processAutomations(25);
    assert.equal((await db.query('select status from automation_runs where id=$1',[handoff.id])).rows[0].status,'human');
    assert.equal((await db.query('select human from automation_conversations where run_id=$1',[handoff.id])).rows[0].human,true);
    await db.query("update automation_runs set status='canceled' where id=$1",[handoff.id]);
    const { callAutomationAI } = load("src/lib/automations/ai.ts"),
      oldKey = process.env.OPENROUTER_API_KEY;
    let aiCalls = 0,
      providerMode = "valid";
    process.env.OPENROUTER_API_KEY = "fixture-only";
    globalThis.fetch = async (url, init) => {
      if (String(url) === "https://openrouter.ai/api/v1/models")
        return Response.json({
          data: [
            {
              id: "model/test",
              pricing: { prompt: "0.000001", completion: "0.000001" },
              supported_parameters: ["structured_outputs"],
            },
          ],
        });
      assert.equal(
        String(url),
        "https://openrouter.ai/api/v1/chat/completions",
      );
      aiCalls++;
      const request = JSON.parse(init.body);
      assert.equal(request.model, "model/test");
      assert.equal(request.provider.allow_fallbacks, false);
      assert.ok(
        !JSON.stringify(request.messages).includes("private-pastoral-note"),
      );
      if (providerMode === "credit") return new Response("{}", { status: 402 });
      return Response.json({
        choices: [
          {
            message: {
              content:
                providerMode === "invalid"
                  ? "wrong"
                  : JSON.stringify({
                      text: "Olá",
                      intent: "welcome",
                      values: { city: "São Paulo" },
                      done: true,
                    }),
            },
          },
        ],
        usage: { cost: 0.002, total_tokens: 20 },
      });
    };
    try {
      const args = {
        companyId: A,
        model: "model/test",
        prompt: "Acolha a pessoa",
        context: { nome: "Ana", internal_notes: "private-pastoral-note" },
        requestKey: "ai-disabled",
      };
      await assert.rejects(
        () => callAutomationAI(args),
        /não habilitada|Orçamento/,
      );
      assert.equal(aiCalls, 0);
      await db.query(
        "update automation_settings set allowed_models=array['model/test'],monthly_budget_usd=1 where company_id=$1",
        [A],
      );
      const result = await callAutomationAI({
        ...args,
        requestKey: "ai-valid",
      });
      assert.equal(result.result.text, "Olá");
      providerMode = "credit";
      await assert.rejects(
        () => callAutomationAI({ ...args, requestKey: "ai-credit" }),
        /sem crédito/,
      );
      providerMode = "invalid";
      await assert.rejects(
        () => callAutomationAI({ ...args, requestKey: "ai-invalid" }),
        /inválida/,
      );
      assert.equal(aiCalls, 3);
      await db.query(
        "update automation_settings set monthly_budget_usd=0 where company_id=$1",
        [A],
      );
      await assert.rejects(
        () => callAutomationAI({ ...args, requestKey: "ai-budget" }),
        /não habilitada|Orçamento/,
      );
      assert.equal(aiCalls, 3);
    } finally {
      if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = oldKey;
    }
  } finally {
    globalThis.fetch = originalFetch;
    await db.close();
  }
});
