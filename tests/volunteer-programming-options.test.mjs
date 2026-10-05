import assert from "node:assert/strict";
import test from "node:test";
import { changeProgrammingOptions, DEFAULT_PROGRAMMING_KINDS, programmingOptionLabel } from "../src/lib/volunteers/programming-options.ts";

test("custom types and locations are trimmed and keep existing choices", () => {
  assert.deepEqual(changeProgrammingOptions(DEFAULT_PROGRAMMING_KINDS, "kind", "add", "  Limpeza do Templo  "), [...DEFAULT_PROGRAMMING_KINDS, "Limpeza do Templo"]);
  assert.deepEqual(changeProgrammingOptions(["Templo principal"], "location", "add", " Salão "), ["Templo principal", "Salão"]);
});

test("duplicate labels are rejected including built-in type translations", () => {
  assert.throws(() => changeProgrammingOptions(DEFAULT_PROGRAMMING_KINDS, "kind", "add", " culto "), /já está cadastrada/);
  assert.throws(() => changeProgrammingOptions(["Salão"], "location", "add", "SALÃO"), /já está cadastrada/);
});

test("removal permits an empty catalog without changing stored schedule values", () => {
  const schedule = { kind: "Limpeza do Templo", location: "Salão" };
  assert.deepEqual(changeProgrammingOptions([schedule.kind], "kind", "delete", schedule.kind), []);
  assert.deepEqual(changeProgrammingOptions([schedule.location], "location", "delete", schedule.location), []);
  assert.equal(programmingOptionLabel(schedule.kind, "kind"), "Limpeza do Templo");
  assert.equal(programmingOptionLabel("service", "kind"), "Culto");
});

test("invalid names and catalog limits are rejected", () => {
  assert.throws(() => changeProgrammingOptions([], "kind", "add", " "), /válida/);
  assert.throws(() => changeProgrammingOptions([], "kind", "add", "a".repeat(101)), /válida/);
  assert.throws(() => changeProgrammingOptions([], "location", "add", "a".repeat(241)), /válida/);
  assert.throws(() => changeProgrammingOptions(Array.from({ length: 200 }, (_, i) => `Local ${i}`), "location", "add", "Mais um"), /Limite/);
});
