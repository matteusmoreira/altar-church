import type { SchedulingCandidate, SchedulingReason } from "./types";

export interface SchedulerInterval {
  startsAt: string;
  endsAt: string;
  status?: string;
  roleName?: string;
}

export interface SchedulerAvailabilityRule {
  weekday: number;
  available: boolean;
  startsAt: string | null;
  endsAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface SchedulerCandidateInput {
  id: string;
  name: string;
  active: boolean;
  departmentIds: string[];
  roleNames: string[];
  desiredServicesPerMonth: number;
  maxServicesPerMonth: number;
  minimumRestHours: number;
  preference: number;
  availabilityRules: SchedulerAvailabilityRule[];
  availabilityExceptions: (SchedulerInterval & { available: boolean })[];
  assignments: SchedulerInterval[];
}

export interface SchedulerShiftInput {
  id: string;
  departmentId: string;
  roleName: string;
  startsAt: string;
  endsAt: string;
  requiredVolunteers: number;
  timezone?: string;
}

function overlaps(a: SchedulerInterval, b: SchedulerInterval) {
  return (
    new Date(a.startsAt).getTime() < new Date(b.endsAt).getTime() &&
    new Date(b.startsAt).getTime() < new Date(a.endsAt).getTime()
  );
}

function zonedParts(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: weekdays[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function monthKey(value: string, timezone: string) {
  return zonedParts(value, timezone).date.slice(0, 7);
}

function minutes(value: string) {
  const [hours = 0, mins = 0] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function recurringAvailability(
  candidate: SchedulerCandidateInput,
  shift: SchedulerShiftInput,
) {
  const timezone = shift.timezone ?? "America/Sao_Paulo";
  const start = zonedParts(shift.startsAt, timezone);
  const day = start.weekday;
  const date = start.date;
  const rules = candidate.availabilityRules.filter(
    (rule) =>
      rule.weekday === day &&
      (!rule.validFrom || rule.validFrom <= date) &&
      (!rule.validUntil || rule.validUntil >= date),
  );
  if (rules.length === 0) return true;
  if (rules.some((rule) => !rule.available)) return false;
  return rules.some((rule) => {
    if (!rule.startsAt || !rule.endsAt) return rule.available;
    const shiftStart = start.minutes;
    const shiftEnd = zonedParts(shift.endsAt, timezone).minutes;
    return (
      rule.available &&
      shiftStart >= minutes(rule.startsAt) &&
      shiftEnd <= minutes(rule.endsAt)
    );
  });
}

function restSatisfied(
  candidate: SchedulerCandidateInput,
  shift: SchedulerShiftInput,
) {
  const minimum = candidate.minimumRestHours * 60 * 60 * 1000;
  const start = new Date(shift.startsAt).getTime();
  const end = new Date(shift.endsAt).getTime();
  return candidate.assignments.every((assignment) => {
    if (["declined", "cancelled"].includes(assignment.status ?? ""))
      return true;
    const otherStart = new Date(assignment.startsAt).getTime();
    const otherEnd = new Date(assignment.endsAt).getTime();
    if (otherEnd <= start) return start - otherEnd >= minimum;
    if (otherStart >= end) return otherStart - end >= minimum;
    return false;
  });
}

export function scoreVolunteerForShift(
  candidate: SchedulerCandidateInput,
  shift: SchedulerShiftInput,
): SchedulingCandidate {
  const blockers: string[] = [];
  const interval = { startsAt: shift.startsAt, endsAt: shift.endsAt };
  const timezone = shift.timezone ?? "America/Sao_Paulo";
  const monthAssignments = candidate.assignments.filter(
    (item) =>
      monthKey(item.startsAt, timezone) ===
        monthKey(shift.startsAt, timezone) &&
      !["declined", "cancelled"].includes(item.status ?? ""),
  );

  if (!candidate.active) blockers.push("Cadastro inativo");
  if (!candidate.departmentIds.includes(shift.departmentId))
    blockers.push("Não pertence ao departamento");
  if (
    !candidate.roleNames.some(
      (role) =>
        role.toLocaleLowerCase("pt-BR") ===
        shift.roleName.toLocaleLowerCase("pt-BR"),
    )
  )
    blockers.push("Função incompatível");
  if (
    candidate.availabilityExceptions.some(
      (item) => !item.available && overlaps(item, interval),
    )
  )
    blockers.push("Indisponibilidade informada");
  if (!recurringAvailability(candidate, shift))
    blockers.push("Fora da disponibilidade recorrente");
  if (
    candidate.assignments.some(
      (item) =>
        !["declined", "cancelled"].includes(item.status ?? "") &&
        overlaps(item, interval),
    )
  )
    blockers.push("Conflito de horário");
  if (monthAssignments.length >= candidate.maxServicesPerMonth)
    blockers.push("Limite mensal atingido");
  if (!restSatisfied(candidate, shift))
    blockers.push("Descanso mínimo não atendido");

  if (blockers.length > 0) {
    return {
      volunteerId: candidate.id,
      volunteerName: candidate.name,
      eligible: false,
      score: -1,
      reasons: [],
      blockers,
    };
  }

  const reasons: SchedulingReason[] = [
    { code: "available", label: "Disponível", points: 100 },
  ];
  if (candidate.preference !== 0)
    reasons.push({
      code: "preferred_role",
      label:
        candidate.preference > 0
          ? "Prefere esta função"
          : "Prefere outra função",
      points: candidate.preference * 20,
    });
  const balancePoints = Math.max(0, 40 - monthAssignments.length * 10);
  reasons.push({
    code: "balanced_load",
    label: "Carga mensal equilibrada",
    points: balancePoints,
  });
  if (monthAssignments.length < candidate.desiredServicesPerMonth)
    reasons.push({
      code: "balanced_load",
      label: "Abaixo da frequência desejada",
      points: 15,
    });
  reasons.push({
    code: "rest_ok",
    label: "Descanso mínimo respeitado",
    points: 10,
  });
  const weekendAssignments = monthAssignments.filter((item) =>
    [0, 6].includes(zonedParts(item.startsAt, timezone).weekday),
  ).length;
  if (
    [0, 6].includes(zonedParts(shift.startsAt, timezone).weekday) &&
    weekendAssignments === 0
  )
    reasons.push({
      code: "weekend_balance",
      label: "Equilíbrio de fins de semana",
      points: 10,
    });
  if (
    candidate.assignments.some(
      (item) =>
        item.roleName?.toLocaleLowerCase("pt-BR") ===
        shift.roleName.toLocaleLowerCase("pt-BR"),
    )
  )
    reasons.push({
      code: "recent_role",
      label: "Experiência recente na função",
      points: 5,
    });

  return {
    volunteerId: candidate.id,
    volunteerName: candidate.name,
    eligible: true,
    score: reasons.reduce((total, reason) => total + reason.points, 0),
    reasons,
    blockers: [],
  };
}

export function rankVolunteersForShift(
  candidates: SchedulerCandidateInput[],
  shift: SchedulerShiftInput,
) {
  return candidates
    .map((candidate) => scoreVolunteerForShift(candidate, shift))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      const name = a.volunteerName.localeCompare(b.volunteerName, "pt-BR");
      return name !== 0 ? name : a.volunteerId.localeCompare(b.volunteerId);
    });
}

export function selectVolunteersForShift(
  candidates: SchedulerCandidateInput[],
  shift: SchedulerShiftInput,
  excludedIds: Set<string> = new Set(),
) {
  return rankVolunteersForShift(candidates, shift)
    .filter(
      (candidate) =>
        candidate.eligible && !excludedIds.has(candidate.volunteerId),
    )
    .slice(0, shift.requiredVolunteers);
}
