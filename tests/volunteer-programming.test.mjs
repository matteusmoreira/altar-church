import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildProgrammingOccurrenceDates } from "../src/lib/volunteers/recurrence.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("weekly programming creates Mondays and Sundays inside horizon", () => {
  assert.deepEqual(
    buildProgrammingOccurrenceDates({
      startDate: "2026-07-20",
      frequency: "weekly",
      weekdays: [0, 1],
      horizonDays: 13,
    }),
    ["2026-07-20", "2026-07-26", "2026-07-27", "2026-08-02"],
  );
});

test("monthly programming keeps same day and respects end date", () => {
  assert.deepEqual(
    buildProgrammingOccurrenceDates({
      startDate: "2026-07-18",
      frequency: "monthly",
      until: "2026-09-18",
      horizonDays: 120,
    }),
    ["2026-07-18", "2026-08-18", "2026-09-18"],
  );
});

test("programming migration is additive, idempotent and preserves published schedules", () => {
  const migration = read("supabase/migrations/20260720230000_volunteer_programming_flow.sql");
  assert.match(migration, /add column if not exists programming_id/);
  assert.match(migration, /events_programming_occurrence_unique/);
  assert.match(migration, /materialize_volunteer_programmings/);
  assert.match(migration, /volunteer_schedule_published_at is null/);
  assert.match(migration, /recurrence_needs_review = true/);
  assert.doesNotMatch(migration, /drop table public\.programmings/);
});

test("wizard requires teams and keeps publishing explicit", () => {
  const actions = read("src/lib/volunteers/programming-actions.ts");
  const workspace = read("src/app/(dashboard)/voluntariado/volunteer-programming-workspace.tsx");
  assert.match(actions, /positions: z\.array\(positionSchema\)\.min\(1/);
  assert.match(actions, /prepareVolunteerProgrammingMonth/);
  assert.match(actions, /publishVolunteerProgrammingEvents/);
  assert.match(workspace, /Etapa \{step\} de 4/);
  assert.match(workspace, /Depois escolherá as pessoas em cada data/);
  assert.match(workspace, /Nenhum aviso será enviado antes da publicação/);
  assert.match(actions, /Cada função deve aparecer apenas uma vez/);
  assert.match(workspace, /Programações/);
});

test("manual schedule UI hides technical score and publication matches partial outbox index", () => {
  const actions = read("src/lib/volunteers/v2-actions.ts");
  const workspace = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx");
  const publishBlock = actions.slice(
    actions.indexOf("export async function publishVolunteerEventSchedule("),
    actions.indexOf("const eventPlanSchema"),
  );
  assert.equal((publishBlock.match(/where assignment_id is not null/g) ?? []).length, 3);
  assert.match(publishBlock, /Preencha todas as vagas antes de publicar/);
  assert.match(workspace, /Escolher pessoas/);
  assert.match(workspace, /Sugerir para vagas vazias/);
  assert.match(workspace, /Rascunho — ainda não avisado/);
  assert.doesNotMatch(workspace, /Candidatos explicados/);
  assert.doesNotMatch(workspace, /\$\{assignment\.score\} pts/);
});

test("only admins delete programming, team and volunteer while preserving history and People", () => {
  const programmingActions = read("src/lib/volunteers/programming-actions.ts");
  const volunteerActions = read("src/lib/volunteers/v2-actions.ts");
  const workspace = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx");
  const programmingWorkspace = read("src/app/(dashboard)/voluntariado/volunteer-programming-workspace.tsx");
  assert.match(programmingActions, /export async function deleteVolunteerProgramming/);
  assert.match(programmingActions, /Somente administrador pode excluir programação/);
  assert.match(programmingActions, /volunteer_schedule_published_at is null/);
  assert.match(volunteerActions, /export async function softDeleteVolunteerDepartment/);
  assert.match(volunteerActions, /Somente administrador pode excluir equipe/);
  assert.match(volunteerActions, /Somente administrador pode excluir voluntário/);
  const deleteVolunteerBlock = volunteerActions.slice(
    volunteerActions.indexOf("export async function softDeleteVolunteer("),
    volunteerActions.indexOf("export async function softDeleteVolunteerDepartment("),
  );
  assert.doesNotMatch(deleteVolunteerBlock, /update public\.people/);
  assert.match(workspace, /Cadastro em Pessoas e histórico serão preservados/);
  assert.match(programmingWorkspace, /Todas as programações/);
  assert.match(programmingWorkspace, /data\.canAdminDelete/);
});
