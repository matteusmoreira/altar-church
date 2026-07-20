import type { VolunteerRecurrenceFrequency } from "./types";

export interface ProgrammingRecurrenceInput {
  startDate: string;
  frequency: VolunteerRecurrenceFrequency;
  weekdays?: number[];
  until?: string | null;
  horizonDays?: number;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildProgrammingOccurrenceDates(input: ProgrammingRecurrenceInput) {
  const start = new Date(`${input.startDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];
  const horizon = Math.min(366, Math.max(1, input.horizonDays ?? 90));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + horizon);
  if (input.until) {
    const until = new Date(`${input.until}T12:00:00Z`);
    if (!Number.isNaN(until.getTime()) && until < end) end.setTime(until.getTime());
  }
  if (input.frequency === "none") return [dateKey(start)];
  const weekdays = new Set(input.weekdays ?? []);
  const dayOfMonth = start.getUTCDate();
  const result: string[] = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    if (input.frequency === "weekly" && weekdays.has(current.getUTCDay())) result.push(dateKey(current));
    if (input.frequency === "monthly" && current.getUTCDate() === dayOfMonth) result.push(dateKey(current));
  }
  return result;
}
