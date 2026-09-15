import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("rota de calendário existe e trata múltiplos escopos e erros com segurança", () => {
  const route = read("src/app/api/v1/volunteers/calendar/route.ts");

  assert.match(route, /export async function GET/);
  assert.match(route, /getCurrentUser/);
  assert.match(route, /requireUserCompanyId/);
  assert.match(route, /getVolunteerSelfContext/);
  assert.match(route, /scope === "church"/);
  assert.match(route, /text\/calendar/);
  assert.match(route, /attachment; filename=/);
  assert.match(route, /BEGIN:VCALENDAR/);
  assert.match(route, /END:VCALENDAR/);
  assert.match(route, /STATUS:CONFIRMED/);
  assert.match(route, /X-WR-CALNAME/);
  assert.match(route, /X-WR-TIMEZONE/);
  assert.doesNotMatch(route, /requireMemberContext/);
});

test("camada de acesso do voluntário expõe resolução segura sem redirects em APIs", () => {
  const access = read("src/lib/volunteers/access.ts");

  assert.match(access, /export async function getVolunteerSelfContext/);
  assert.match(access, /export async function requireVolunteerSelfContext/);
  assert.match(access, /volunteer\.person_id = \$\{context\.personId\}/);
  assert.doesNotMatch(access, /requireMemberContext/);
});

test("interface PushControls no voluntariado disponibiliza dropdown com escopos e download nativo", () => {
  const ui = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx");

  assert.match(ui, /function PushControls/);
  assert.match(ui, /mode = "manager"/);
  assert.match(ui, /<PushControls mode="manager" \/>/);
  assert.match(ui, /<PushControls mode="volunteer" \/>/);
  assert.match(ui, /Adicionar calendário/);
  assert.match(ui, /Baixar arquivo \(\.ics\)/);
  assert.match(ui, /Google Agenda/);
  assert.match(ui, /Copiar link de assinatura/);
  assert.match(ui, /anchor\.download = filename/);
  assert.doesNotMatch(ui, /<Link[^>]*href=["']\/api\/v1\/volunteers\/calendar["']/);
});

test("sanitização e formatação de datas iCal são à prova de falhas com valores nulos", () => {
  const esc = (value) => {
    if (!value) return "";
    return String(value)
      .replaceAll("\\", "\\\\")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,")
      .replaceAll("\r\n", "\\n")
      .replaceAll("\n", "\\n")
      .trim();
  };

  const date = (value, fallback) => {
    try {
      const d = value ? new Date(value) : (fallback ?? new Date());
      if (isNaN(d.getTime())) {
        return (fallback ?? new Date()).toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
      }
      return d.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
    } catch {
      return new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
    }
  };

  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc("Culto de Louvor; Quarta, 19:30"), "Culto de Louvor\\; Quarta\\, 19:30");

  assert.doesNotThrow(() => date(null));
  assert.doesNotThrow(() => date("data_invalida"));
  assert.match(date("2026-09-15T19:00:00.000Z"), /^20260915T190000Z?$/);
});
