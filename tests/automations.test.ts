import test from "node:test";
import assert from "node:assert/strict";
import {
  flowSchema,
  validateFlow,
  conditionMatches,
  localClock,
  zonedDate,
  isBirthday,
  scheduleKey,
  renderText,
  type FlowDefinition,
} from "../src/lib/automations/contract.ts";
import {
  normalizeUazapiEvent,
  deliveryStatus,
  isOptOut,
} from "../src/lib/automations/webhook-contract.ts";
const basic: FlowDefinition = {
  schemaVersion: 1,
  nodes: [
    {
      id: "start",
      kind: "trigger",
      label: "Início",
      position: { x: 0, y: 0 },
      config: { mode: "manual" },
    },
    {
      id: "end",
      kind: "end",
      label: "Fim",
      position: { x: 0, y: 200 },
      config: {},
    },
  ],
  edges: [{ id: "edge", source: "start", target: "end", port: "next" }],
};
test("published graph validates topology and rejects cycles and duplicate output routes", () => {
  assert.deepEqual(validateFlow(basic), []);
  const cycle = structuredClone(basic);
  cycle.edges.push({
    id: "loop",
    source: "end",
    target: "start",
    port: "next",
  });
  assert.ok(validateFlow(cycle).some((i) => i.message.includes("Ciclos")));
  const duplicate = structuredClone(basic);
  duplicate.edges.push({
    id: "second",
    source: "start",
    target: "end",
    port: "next",
  });
  assert.ok(
    validateFlow(duplicate).some((i) => i.message.includes("apenas uma")),
  );
});
test("disconnected blocks, missing failure routes and unknown variables cannot publish", () => {
  const flow = structuredClone(basic);
  flow.nodes.push({
    id: "message",
    kind: "whatsapp",
    label: "Mensagem",
    position: { x: 20, y: 20 },
    config: { message: { type: "text", text: "{{private_notes}}" } },
  });
  const issues = validateFlow(flow);
  assert.ok(issues.some((i) => i.message.includes("desconectado")));
  assert.ok(issues.some((i) => i.message.includes("error")));
  assert.ok(issues.some((i) => i.message.includes("private_notes")));
});
test("financial, permissions and Kids authorization fields cannot be written", () => {
  const flow = structuredClone(basic);
  flow.nodes[1] = {
    ...flow.nodes[1],
    kind: "update",
    config: { field: "role", value: "admin" },
  };
  assert.ok(
    validateFlow(flow).some((i) => i.message.includes("não permitido")),
  );
  assert.equal(
    flowSchema.safeParse({ ...basic, schemaVersion: 2 }).success,
    false,
  );
});
test("incomplete messages remain editable drafts but cannot be published", () => {
  const flow = structuredClone(basic);
  flow.nodes[1] = {...flow.nodes[1],kind:"whatsapp",config:{message:{type:"text",text:""}}};
  assert.equal(flowSchema.safeParse(flow).success,true);
  assert.ok(validateFlow(flow).some(issue=>issue.nodeId === "end"));
});
test("timezone, weekly scheduling, birthdays and leap-day policy", () => {
  assert.equal(
    zonedDate("2026-10-05T09:00").toISOString(),
    "2026-10-05T12:00:00.000Z",
  );
  assert.equal(
    zonedDate("2026-10-05T09:00Z").toISOString(),
    "2026-10-05T09:00:00.000Z",
  );
  assert.equal(
    scheduleKey(
      {
        ...basic.nodes[0],
        config: { mode: "schedule", schedule: "once", at: "2026-10-05T09:00" },
      },
      new Date("2026-10-05T11:59:00Z"),
      "America/Sao_Paulo",
    ),
    null,
  );
  const monday = localClock(new Date("2026-10-05T12:00:00Z"));
  assert.equal(monday.time, "09:00");
  assert.equal(monday.weekday, 1);
  assert.equal(
    scheduleKey(
      {
        ...basic.nodes[0],
        config: {
          mode: "schedule",
          schedule: "weekly",
          weekday: 1,
          time: "09:00",
        },
      },
      new Date("2026-10-05T12:00:00Z"),
      "America/Sao_Paulo",
    ),
    "weekly:2026-10-05",
  );
  assert.equal(
    scheduleKey(
      {
        ...basic.nodes[0],
        config: {
          mode: "schedule",
          schedule: "weekly",
          weekday: 2,
          time: "09:00",
        },
      },
      new Date("2026-10-05T12:00:00Z"),
      "America/Sao_Paulo",
    ),
    null,
  );
  assert.equal(
    isBirthday("2000-02-29", localClock(new Date("2027-02-28T12:00:00Z"))),
    true,
  );
  assert.equal(
    isBirthday("2000-02-29", localClock(new Date("2028-02-28T12:00:00Z"))),
    false,
  );
});
test("conditions and message rendering preserve literal data", () => {
  assert.equal(conditionMatches("SIM, quero", "contains", "sim"), true);
  assert.equal(conditionMatches(10, "greater", "5"), true);
  assert.equal(
    renderText("Olá {{nome}}, {{resposta}}", {
      nome: "Ana",
      resposta: "{{role}}",
    }),
    "Olá Ana, {{role}}",
  );
});
test("Uazapi reply and receipt normalization ignores API/history and recognizes opt-out", () => {
  assert.equal(normalizeUazapiEvent({message:{buttonOrListid:"",text:"Olá"}}).text,"Olá");
  const e = normalizeUazapiEvent({
    EventType: "messages",
    message: {
      id: "m1",
      chatid: "5511999999999@s.whatsapp.net",
      buttonOrListid: "cell_1",
      fromMe: false,
      wasSentByApi: false,
    },
  });
  assert.equal(e.text, "cell_1");
  assert.equal(e.id, "m1");
  assert.equal(e.fromMe, false);
  assert.equal(normalizeUazapiEvent({ EventType: "history" }).history, true);
  assert.equal(
    normalizeUazapiEvent({ message: { wasSentByApi: true } }).api,
    true,
  );
  assert.equal(deliveryStatus("delivery_ack"), "delivered");
  assert.equal(deliveryStatus("read"), "read");
  assert.equal(isOptOut(" PARAR "), true);
  assert.equal(isOptOut("quero participar"), false);
});
