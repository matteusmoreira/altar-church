import type { SchedulingCandidate, SchedulingReason } from "./types";

export interface SchedulerInterval {
  startsAt: string;
  endsAt: string;
  status?: string;
  roleName?: string;
}

export interface SchedulerCandidateInput {
  id: string;
  name: string;
  active: boolean;
  departmentIds: string[];
  roleNames: string[];
  preference: number;
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

const MANUAL_WARNING_BLOCKERS = new Set([
  "Não pertence à equipe",
  "Função incompatível",
]);

type ScoredCandidate = Omit<
  SchedulingCandidate,
  "photoUrl" | "eligibleForSuggestion" | "selectableManually" | "warnings"
>;

export function withManualSelectionRules(
  candidate: ScoredCandidate,
): SchedulingCandidate {
  const warnings = candidate.blockers.filter((blocker) =>
    MANUAL_WARNING_BLOCKERS.has(blocker),
  );
  const blockers = candidate.blockers.filter(
    (blocker) => !MANUAL_WARNING_BLOCKERS.has(blocker),
  );
  return {
    ...candidate,
    photoUrl: null,
    eligibleForSuggestion: candidate.eligible,
    selectableManually: blockers.length === 0,
    warnings,
    blockers,
  };
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

export function scoreVolunteerForShift(
  candidate: SchedulerCandidateInput,
  shift: SchedulerShiftInput,
): ScoredCandidate {
  const blockers: string[] = [];
  const timezone = shift.timezone ?? "America/Sao_Paulo";
  const monthAssignments = candidate.assignments.filter(
    (item) =>
      monthKey(item.startsAt, timezone) ===
        monthKey(shift.startsAt, timezone) &&
      !["declined", "cancelled"].includes(item.status ?? ""),
  );

  if (!candidate.active) blockers.push("Cadastro inativo");
  if (!candidate.departmentIds.includes(shift.departmentId))
    blockers.push("Não pertence à equipe");
  if (
    !candidate.roleNames.some(
      (role) =>
        role.toLocaleLowerCase("pt-BR") ===
        shift.roleName.toLocaleLowerCase("pt-BR"),
    )
  )
    blockers.push("Função incompatível");
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
    { code: "available", label: "Cadastro ativo", points: 100 },
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

/** Fill only vacant places; retain manual removals and never repeat a refused invitation. */
export function suggestVacantPlaces(
  candidates: SchedulerCandidateInput[],
  shift: SchedulerShiftInput,
  assignments: { volunteerId: string; status: string; locked: boolean }[],
) {
  const occupied = assignments.filter((item) => !["declined", "cancelled"].includes(item.status)).length;
  const vacant = Math.max(0, shift.requiredVolunteers - occupied);
  const excluded = new Set(assignments.filter((item) => item.status !== "cancelled" || item.locked).map((item) => item.volunteerId));
  const selected = vacant === 0 ? [] : selectVolunteersForShift(candidates, { ...shift, requiredVolunteers: vacant }, excluded);
  return { selected, shortages: vacant - selected.length };
}
