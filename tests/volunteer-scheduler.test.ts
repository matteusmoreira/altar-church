import assert from "node:assert/strict";
import test from "node:test";
import {
  rankVolunteersForShift,
  scoreVolunteerForShift,
  selectVolunteersForShift,
  suggestVacantPlaces,
  withManualSelectionRules,
  type SchedulerCandidateInput,
  type SchedulerShiftInput,
} from "../src/lib/volunteers/scheduler.ts";

const shift: SchedulerShiftInput = {
  id: "shift-1",
  departmentId: "reception",
  roleName: "Recepção",
  startsAt: "2026-07-19T12:00:00.000Z",
  endsAt: "2026-07-19T14:00:00.000Z",
  requiredVolunteers: 1,
  timezone: "America/Sao_Paulo",
};

function candidate(
  overrides: Partial<SchedulerCandidateInput> = {},
): SchedulerCandidateInput {
  return {
    id: "volunteer-1",
    name: "Ana",
    active: true,
    departmentIds: ["reception"],
    roleNames: ["Recepção"],
    preference: 0,
    assignments: [],
    ...overrides,
  };
}

test("permite horários coincidentes, intervalos curtos e várias escalas no mês", () => {
  for (const assignment of [
    { startsAt: shift.startsAt, endsAt: shift.endsAt },
    { startsAt: "2026-07-19T09:00:00.000Z", endsAt: "2026-07-19T11:00:00.000Z" },
  ]) {
    const person = candidate({ assignments: Array.from({ length: 10 }, () => assignment) });
    const scored = scoreVolunteerForShift(person, shift);
    assert.equal(scored.eligible, true);
    const manual = withManualSelectionRules(scored);
    assert.equal(manual.selectableManually, true);
    assert.deepEqual(manual.blockers, []);
    assert.ok(!manual.reasons.some((reason) => /descanso|disponibilidade/i.test(reason.label)));
    assert.deepEqual(selectVolunteersForShift([person], shift).map((item) => item.volunteerId), [person.id]);
  }
});

test("preserva cadastro ativo e compatibilidade para sugestões", () => {
  const inactive = withManualSelectionRules(scoreVolunteerForShift(candidate({ active: false }), shift));
  assert.equal(inactive.selectableManually, false);
  assert.ok(inactive.blockers.includes("Cadastro inativo"));
  const mismatch = withManualSelectionRules(scoreVolunteerForShift(
    candidate({ departmentIds: ["media"], roleNames: ["Câmera"] }), shift,
  ));
  assert.equal(mismatch.eligibleForSuggestion, false);
  assert.equal(mismatch.selectableManually, true);
  assert.deepEqual(mismatch.warnings, ["Não pertence à equipe", "Função incompatível"]);
});

test("preferência e menor carga vencem com explicação", () => {
  const preferred = candidate({ id: "preferred", name: "Bia", preference: 2 });
  const loaded = candidate({
    id: "loaded",
    name: "Ana",
    assignments: [
      {
        startsAt: "2026-07-05T12:00:00.000Z",
        endsAt: "2026-07-05T14:00:00.000Z",
        roleName: "Recepção",
      },
    ],
  });
  const ranked = rankVolunteersForShift([loaded, preferred], shift);
  assert.equal(ranked[0]?.volunteerId, "preferred");
  assert.ok(
    ranked[0]?.reasons.some((reason) => reason.code === "preferred_role"),
  );
});

test("posição travada fica excluída do recálculo", () => {
  const selected = selectVolunteersForShift(
    [
      candidate({ id: "locked", name: "Ana" }),
      candidate({ id: "free", name: "Bia" }),
    ],
    shift,
    new Set(["locked"]),
  );
  assert.deepEqual(
    selected.map((item) => item.volunteerId),
    ["free"],
  );
});

test("resultado é determinístico mesmo com empate", () => {
  const input = [
    candidate({ id: "2", name: "Ana" }),
    candidate({ id: "1", name: "Ana" }),
  ];
  const first = rankVolunteersForShift(input, shift).map(
    (item) => item.volunteerId,
  );
  const second = rankVolunteersForShift([...input].reverse(), shift).map(
    (item) => item.volunteerId,
  );
  assert.deepEqual(first, ["1", "2"]);
  assert.deepEqual(second, first);
});

test("sugestões preservam escolhas, recusas e remoções manuais", () => {
  const people = ["chosen", "refused", "removed", "available"].map((id) => candidate({ id, name: id }));
  const assignments = [
    { volunteerId: "chosen", status: "proposed", locked: false },
    { volunteerId: "refused", status: "declined", locked: false },
    { volunteerId: "removed", status: "cancelled", locked: true },
  ];
  const before = structuredClone(assignments);
  const result = suggestVacantPlaces(people, { ...shift, requiredVolunteers: 3 }, assignments);
  assert.deepEqual(result.selected.map((item) => item.volunteerId), ["available"]);
  assert.equal(result.shortages, 1);
  assert.deepEqual(assignments, before);
});

test("escala preenchida não recebe novas sugestões", () => {
  const result = suggestVacantPlaces([candidate()], shift, [{ volunteerId: "someone-else", status: "confirmed", locked: true }]);
  assert.equal(result.selected.length, 0);
  assert.equal(result.shortages, 0);
});
