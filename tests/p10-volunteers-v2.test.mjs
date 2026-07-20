import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Voluntariado V2 adiciona dados, RLS departamental e lembretes", () => {
  const sql = read(
    "supabase/migrations/20260718230000_volunteer_v2_voluts_parity.sql",
  );
  for (const contract of [
    "volunteer_department_access",
    "volunteer_availability_rules",
    "volunteer_swap_requests",
    "volunteer_shift_messages",
    "volunteer_feedbacks",
    "volunteer_recognitions",
    "volunteer_push_subscriptions",
    "volunteer_event_setlists",
    "prepare_volunteer_delivery",
    "can_manage_volunteer_department",
    "can_access_volunteer_shift",
  ])
    assert.match(sql, new RegExp(contract));
  assert.match(sql, /revoke insert, update, delete on public\.%I from authenticated/);
});

test("workspace consolida três áreas e mantém fluxos inteligentes", () => {
  const ui = read(
    "src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx",
  );
  for (const tab of ["programmings", "volunteers", "teams"])
    assert.match(ui, new RegExp(`value=["']${tab}["']`));
  assert.match(ui, /<summary className="cursor-pointer font-medium">Mais opções<\/summary>/);
  assert.match(ui, /VolunteerProgrammingWorkspace/);
  for (const flow of [
    "generateSmartVolunteerSchedule",
    "respondVolunteerAssignment",
    "requestVolunteerSwap",
    "sendVolunteerShiftMessage",
    "checkOutVolunteerAssignment",
    "saveVolunteerFeedback",
  ])
    assert.match(ui, new RegExp(flow));
});

test("PWA não armazena mutações e isola cache por usuário", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /VOLUNTEER_CACHE_PREFIX/);
  assert.match(sw, /SET_USER/);
  assert.match(sw, /CLEAR_USER_DATA/);
  assert.match(sw, /showNotification/);
});

test("API V1 expõe os fluxos críticos", () => {
  const required = [
    "src/app/api/v1/volunteers/availability/route.ts",
    "src/app/api/v1/volunteers/swaps/route.ts",
    "src/app/api/v1/volunteers/recognitions/route.ts",
    "src/app/api/v1/volunteers/reports/route.ts",
    "src/app/api/v1/volunteers/push-subscriptions/route.ts",
    "src/app/api/v1/volunteers/calendar/route.ts",
  ];
  for (const file of required)
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
});

test("worker prepara lembretes e entrega push idempotente", () => {
  const worker = read("supabase/functions/volunteer-delivery-worker/index.ts");
  assert.match(worker, /prepare_volunteer_delivery/);
  assert.match(worker, /setVapidDetails/);
  assert.match(worker, /sendNotification/);
  assert.match(worker, /volunteer_push_subscriptions/);
});
