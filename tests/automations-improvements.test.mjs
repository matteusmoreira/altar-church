import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  automationFixture,
  A,
  B,
  U,
  P,
  I,
  F,
  S,
} from "./helpers/automation-fixture.mjs";

const node = (kind, id, config = {}) => ({
  id,
  kind,
  label: kind,
  position: { x: 0, y: 0 },
  config,
});
const flowDefinition = (nodes, links) => ({
  schemaVersion: 1,
  nodes,
  edges: links.map(([source, port, target], i) => ({
    id: `e${i}`,
    source,
    port,
    target,
  })),
});

test("form events: insert only, specific form, identified person, tenant isolation and deduplication", async () => {
  const { db, runtime, flow, load } = await automationFixture();
  try {
    const def = (formId) =>
      flowDefinition(
        [
          node("trigger", "start", {
            mode: "event",
            event: "form.submitted",
            deliveryOwner: "automation",
            formId,
          }),
          node("end", "end"),
        ],
        [["start", "next", "end"]],
      );
    const otherForm = randomUUID();
    const target = await flow(def(F));
    const other = await flow(def(otherForm));
    const legacy = await flow(def(undefined));
    const crossTenant = await flow(def(F), B);
    const card = (
      await db.query(
        "insert into crm_cards(company_id,person_id,person_name,stage_id) values($1,$2,'Ana',$3) returning id",
        [A, P, S],
      )
    ).rows[0].id;
    const insert = async (formId, personId = P) =>
      (
        await db.query(
          "insert into form_submissions(company_id,form_id,crm_card_id,person_id,payload) values($1,$2,$3,$4,'{}') returning id",
          [A, formId, card, personId],
        )
      ).rows[0].id;
    const submission = await insert(F);
    await insert(otherForm);
    await insert(F, null);
    await db.query(
      "update form_submissions set payload='{" +
        '"edit":true' +
        "}' where id=$1",
      [submission],
    );
    const events = (
      await db.query(
        "select * from automation_events where type='form.submitted' order by created_at",
      )
    ).rows;
    assert.equal(events.length, 2);
    assert.equal(events[0].context.form_id, F);
    assert.equal(events[0].context.submission_id, submission);
    assert.equal(events[0].context.crm_card_id, card);
    await runtime.collectAutomationStarts();
    await runtime.collectAutomationStarts();
    const counts = (
      await db.query(
        "select flow_id,count(*)::int n from automation_runs group by flow_id",
      )
    ).rows;
    assert.equal(counts.find((r) => r.flow_id === target.id)?.n, 1);
    assert.equal(counts.find((r) => r.flow_id === other.id)?.n, 1);
    assert.equal(counts.find((r) => r.flow_id === legacy.id)?.n, 2);
    assert.equal(
      counts.find((r) => r.flow_id === crossTenant.id),
      undefined,
    );
    const { validateFlow, parseStoredFlowDefinition } = load(
      "src/lib/automations/contract.ts",
    );
    assert.ok(
      validateFlow(def(undefined)).some((i) => /formulário/.test(i.message)),
    );
    assert.doesNotThrow(() => parseStoredFlowDefinition(def(undefined)));
    // Ownership of one form does not disable the direct sender of another form.
    await db.query(
      "insert into automation_source_owners(company_id,purpose,flow_id) values($1,$2,$3)",
      [A, `form.submitted:${F}`, target.id],
    );
    const { automationOwnsDelivery } = load("src/lib/automations/ownership.ts");
    assert.equal(await automationOwnsDelivery(A, "form.submitted", F), true);
    assert.equal(
      await automationOwnsDelivery(A, "form.submitted", otherForm),
      false,
    );
  } finally {
    await db.close();
  }
});

test("Kanban: exact submission card, newest fallback, create once, invalid references and no recursive event", async () => {
  const { db, flow, runtime, load } = await automationFixture();
  try {
    const definition = flowDefinition(
      [
        node("trigger", "start", { mode: "manual" }),
        node("kanban_move", "move", { stageId: S }),
        node("end", "end"),
      ],
      [
        ["start", "next", "move"],
        ["move", "next", "end"],
        ["move", "error", "end"],
      ],
    );
    const active = await flow(definition);
    const makeRun = async (context) => {
      await runtime.enqueueAutomationRun(active, P, randomUUID(), context);
      const run = (
        await db.query(
          "select * from automation_runs where flow_id=$1 order by created_at desc limit 1",
          [active.id],
        )
      ).rows[0];
      const lease = randomUUID();
      await db.query(
        "update automation_runs set status='working',node_id='move',lease_token=$1 where id=$2",
        [lease, run.id],
      );
      return {
        companyId: A,
        runId: run.id,
        nodeId: "move",
        leaseToken: lease,
        personId: P,
        stageId: S,
        actorId: U,
      };
    };
    const { moveAutomationKanban } = load("src/lib/automations/kanban.ts");
    const input = await makeRun({});
    const created = await moveAutomationKanban(input);
    assert.equal(await moveAutomationKanban(input), created);
    assert.equal(
      (await db.query("select count(*)::int n from crm_cards")).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from automation_events where type like 'crm.%'",
        )
      ).rows[0].n,
      0,
    );
    const alternate = (
      await db.query(
        "insert into crm_stages(company_id,name) values($1,'Outra coluna') returning id",
        [A],
      )
    ).rows[0].id;
    await db.query(
      "update crm_cards set notes='Preservar',stage_id=$1 where id=$2",
      [alternate, created],
    );
    const recent = (
      await db.query(
        "insert into crm_cards(company_id,person_id,person_name,stage_id) values($1,$2,'Ana',$3) returning id",
        [A, P, alternate],
      )
    ).rows[0].id;
    assert.equal(
      await moveAutomationKanban({ ...(await makeRun({})), cardId: created }),
      created,
    );
    assert.equal(
      (await db.query("select notes from crm_cards where id=$1", [created]))
        .rows[0].notes,
      "Preservar",
    );
    assert.equal(
      (await db.query("select stage_id from crm_cards where id=$1", [recent]))
        .rows[0].stage_id,
      alternate,
    );
    assert.equal(await moveAutomationKanban(await makeRun({})), recent);
    const wrong = (
      await db.query(
        "insert into crm_stages(company_id,name) values($1,'Outra igreja') returning id",
        [B],
      )
    ).rows[0].id;
    await assert.rejects(
      () => moveAutomationKanban({ ...input, runId: randomUUID() }),
      /cancelada/,
    );
    const invalid = await makeRun({});
    await assert.rejects(
      () => moveAutomationKanban({ ...invalid, stageId: wrong }),
      /Coluna/,
    );
    await assert.rejects(
      () => moveAutomationKanban({ ...invalid, cardId: randomUUID() }),
      /Card/,
    );
    await db.query("update crm_stages set deleted_at=now() where id=$1", [S]);
    await assert.rejects(() => moveAutomationKanban(invalid), /Coluna/);
    // Exercise the actual worker's error port, not only the helper.
    await db.query(
      "update automation_runs set status='ready',lease_token=null where id=$1",
      [invalid.runId],
    );
    await runtime.processAutomations(1);
    const step = (
      await db.query(
        "select detail,status from automation_steps where run_id=$1 and node_id='move'",
        [invalid.runId],
      )
    ).rows[0];
    assert.equal(step.detail.port, "error");
  } finally {
    await db.close();
  }
});

test("draft message tests: real tenant, explicit private phone, server permissions, media isolation and uncertain delivery", async () => {
  const { db, load, permissions } = await automationFixture();
  const original = globalThis.fetch;
  let calls = 0,
    mode = "accepted";
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /^https:\/\/uazapi\.test\/send\//);
    const payload = JSON.parse(options.body);
    assert.equal(payload.number, "5511988887777@s.whatsapp.net");
    calls++;
    return mode === "accepted"
      ? Response.json({ id: `msg-${calls}` })
      : mode === "no-id"
        ? Response.json({})
        : new Response("{}", { status: 503 });
  };
  try {
    const { sendAutomationDraftTest } = load("src/lib/automations/actions.ts");
    const definition = flowDefinition(
      [
        node("trigger", "start", { mode: "manual" }),
        node("whatsapp", "message", {
          destination: "group",
          cellId: randomUUID(),
          instanceId: I,
          message: {
            type: "button",
            text: "Olá {{nome}}",
            footer: "Teste",
            buttons: [{ label: "Sim", action: "reply", value: "sim" }],
          },
        }),
        node("end", "end"),
      ],
      [
        ["start", "next", "message"],
        ["message", "next", "end"],
        ["message", "error", "end"],
      ],
    );
    const input = {
      definition,
      nodeId: "message",
      requestId: randomUUID(),
      instanceId: I,
      phone: "+55 (11) 98888-7777",
      personId: P,
      context: { nome: "Ana" },
    };
    permissions.denied.add("communication.send");
    await assert.rejects(() => sendAutomationDraftTest(input), /Acesso/);
    assert.equal(calls, 0);
    permissions.denied.clear();
    assert.equal((await sendAutomationDraftTest(input)).status, "accepted");
    assert.equal((await sendAutomationDraftTest(input)).status, "accepted");
    assert.equal(calls, 1);
    assert.equal(
      (await db.query("select count(*)::int n from automation_runs")).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int n from automation_flows")).rows[0]
        .n,
      0,
    );
    await assert.rejects(
      () =>
        sendAutomationDraftTest({
          ...input,
          requestId: randomUUID(),
          phone: "1234567890@g.us",
        }),
      /número/,
    );
    await assert.rejects(
      () =>
        sendAutomationDraftTest({
          ...input,
          requestId: randomUUID(),
          instanceId: randomUUID(),
        }),
      /instância/,
    );
    const media = structuredClone(input);
    media.requestId = randomUUID();
    media.definition.nodes[1].config.message = {
      type: "image",
      text: "Imagem",
      mediaFileId: randomUUID(),
      filename: "image.png",
    };
    await assert.rejects(() => sendAutomationDraftTest(media), /Arquivo/);
    for (const providerMode of ["server-error", "no-id"]) {
      mode = providerMode;
      const ambiguous = { ...input, requestId: randomUUID() };
      assert.equal(
        (await sendAutomationDraftTest(ambiguous)).status,
        "uncertain",
      );
      const before = calls;
      await assert.rejects(
        () => sendAutomationDraftTest(ambiguous),
        /já foi solicitado/,
      );
      assert.equal(calls, before);
    }
    mode = "accepted";
    const mediaId = randomUUID();
    await db.query("insert into app_files(id,company_id,storage_path,mime_type,is_active) values($1,$2,'image.png','image/png',true)",[mediaId,A]);
    for(const message of [
      {type:"list",text:"Lista",footer:"",listButton:"Escolher",sections:[{title:"Opções",items:[{label:"Sim",id:"sim",description:""}]}]},
      {type:"carousel",text:"Cartões",cards:[{text:"Cartão",mediaFileId:mediaId,mediaType:"image",filename:"image.png",buttons:[{label:"Sim",action:"reply",value:"sim"}]}]},
      {type:"image",text:"Imagem",mediaFileId:mediaId,filename:"image.png"}
    ]) {
      const selected=structuredClone(input); selected.requestId=randomUUID(); selected.definition.nodes[1].config.message=message;
      assert.equal((await sendAutomationDraftTest(selected)).status,"accepted");
    }
    const concurrent={...input,requestId:randomUUID()};
    const before=calls;
    const outcomes=await Promise.allSettled([sendAutomationDraftTest(concurrent),sendAutomationDraftTest(concurrent)]);
    assert.equal(outcomes.filter(result=>result.status === "fulfilled" && result.value.status === "accepted").length >= 1,true);
    assert.equal(calls,before+1);
    // Client roles may read only their church's logs and cannot submit direct writes.
    await db.query(
      "insert into automation_test_deliveries(id,company_id,actor_id,instance_id,node_id,chat_id,message,status) values($1,$2,$3,$4,'message','other','{}','accepted')",
      [randomUUID(), B, U, I],
    );
    await db.exec(`set test.user_id='${U}';set role authenticated;`);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from automation_test_deliveries where company_id=$1",
          [B],
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      () => db.query("delete from automation_test_deliveries"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    globalThis.fetch = original;
    await db.close();
  }
});

test("simulation traverses decisions, replies, waits, tasks and AI without database effects", async () => {
  const { db, load } = await automationFixture();
  try {
    const { advanceSimulation } = load("src/lib/automations/simulation.ts");
    const definition = flowDefinition(
      [
        node("trigger", "start", { mode: "manual" }),
        node("response", "reply"),
        node("condition", "decision", {
          field: "resposta",
          operator: "equals",
          value: "sim",
        }),
        node("wait", "wait", { minutes: 1000 }),
        node("task_wait", "task"),
        node("ai", "ai"),
        node("kanban_move", "move", { stageId: S }),
        node("end", "end"),
      ],
      [
        ["start", "next", "reply"],
        ["reply", "response", "decision"],
        ["decision", "yes", "wait"],
        ["decision", "no", "end"],
        ["wait", "next", "task"],
        ["task", "response", "ai"],
        ["task", "timeout", "end"],
        ["ai", "next", "move"],
        ["move", "next", "end"],
      ],
    );
    let state = { nodeId: "start", context: { nome: "Ana" }, entries: [] };
    for (const input of [
      {},
      { response: "sim" },
      {},
      {},
      { port: "response" },
      { aiText: "Olá Ana" },
      {},
      {},
    ])
      state = advanceSimulation(definition, state, input);
    assert.equal(state.nodeId, null);
    assert.equal(state.error, undefined);
    assert.equal(state.context.resposta, "sim");
    assert.equal(state.context.ai_text, "Olá Ana");
    assert.deepEqual(
      state.entries.map((e) => e.nodeId),
      ["start", "reply", "decision", "wait", "task", "ai", "move", "end"],
    );
    const stopped = advanceSimulation(
      definition,
      { nodeId: "start", context: {}, entries: [] },
      { audienceMatches: false },
    );
    assert.match(stopped.error, /filtros/);
    const expired = advanceSimulation(
      definition,
      { nodeId: "task", context: {}, entries: [] },
      { port: "timeout" },
    );
    assert.equal(expired.nodeId, "end");
    for (const table of [
      "automation_runs",
      "automation_tasks",
      "crm_cards",
      "automation_deliveries",
      "automation_ai_usage",
    ])
      assert.equal(
        (await db.query(`select count(*)::int n from ${table}`)).rows[0].n,
        0,
      );
  } finally {
    await db.close();
  }
});

test("draft persistence and publication validate form and Kanban references without changing prior versions", async () => {
  const { db, load } = await automationFixture();
  try {
    const { saveAutomation, publishAutomation } = load(
      "src/lib/automations/actions.ts",
    );
    const messages = [
      {
        type: "button",
        text: "Botões",
        footer: "Rodapé",
        buttons: [
          { label: "Abrir", action: "url", value: "https://example.test" },
        ],
      },
      {
        type: "list",
        text: "Lista",
        footer: "Rodapé",
        listButton: "Opções",
        sections: [
          {
            title: "Seção",
            items: [
              { label: "Primeiro", id: "first", description: "Descrição" },
            ],
          },
        ],
      },
      {
        type: "carousel",
        text: "Carrossel",
        cards: [
          {
            text: "Cartão",
            mediaFileId: "",
            mediaType: "image",
            filename: "",
            buttons: [{ label: "Sim", action: "reply", value: "sim" }],
          },
        ],
      },
    ];
    for (const message of messages) {
      const definition = flowDefinition(
        [
          node("trigger", "start", { mode: "manual" }),
          node("whatsapp", "message", {
            instanceId: I,
            destination: "person",
            message,
          }),
          node("end", "end"),
        ],
        [
          ["start", "next", "message"],
          ["message", "next", "end"],
          ["message", "error", "end"],
        ],
      );
      const saved = await saveAutomation({
        name: "Persistir mensagem",
        definition,
      });
      const reloaded = (
        await db.query("select draft from automation_flows where id=$1", [
          saved.id,
        ])
      ).rows[0].draft;
      assert.deepEqual(reloaded.nodes[1].config.message, message);
      await saveAutomation({
        id: saved.id,
        revision: saved.revision,
        name: "Persistir mensagem",
        definition: reloaded,
      });
      assert.deepEqual(
        (
          await db.query("select draft from automation_flows where id=$1", [
            saved.id,
          ])
        ).rows[0].draft,
        reloaded,
      );
    }
    const definition = flowDefinition(
      [
        node("trigger", "start", {
          mode: "event",
          event: "form.submitted",
          formId: F,
          deliveryOwner: "automation",
        }),
        node("kanban_move", "move", { stageId: S }),
        node("end", "end"),
      ],
      [
        ["start", "next", "move"],
        ["move", "next", "end"],
        ["move", "error", "end"],
      ],
    );
    const saved = await saveAutomation({ name: "Após formulário", definition });
    await publishAutomation(saved.id, saved.revision);
    const first = (
      await db.query(
        "select definition from automation_versions where flow_id=$1",
        [saved.id],
      )
    ).rows[0].definition;
    assert.deepEqual(first, definition);
    await db.query("update forms set create_person=false where id=$1", [F]);
    await assert.rejects(
      () => publishAutomation(saved.id, saved.revision),
      /crie ou vincule/,
    );
    await db.query("update forms set create_person=true where id=$1", [F]);
    const invalid = structuredClone(definition);
    invalid.nodes[1].config.stageId = randomUUID();
    const next = await saveAutomation({
      id: saved.id,
      revision: saved.revision,
      name: "Após formulário",
      definition: invalid,
    });
    await assert.rejects(
      () => publishAutomation(saved.id, next.revision),
      /Coluna/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from automation_versions where flow_id=$1",
          [saved.id],
        )
      ).rows[0].n,
      1,
    );
    assert.deepEqual(
      (
        await db.query(
          "select definition from automation_versions where flow_id=$1",
          [saved.id],
        )
      ).rows[0].definition,
      first,
    );
  } finally {
    await db.close();
  }
});
