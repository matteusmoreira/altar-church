import type { VolunteerDashboardData, VolunteerShift } from "./types";

export function summarizeShifts(shifts: VolunteerShift[]) {
  const assignments = shifts.flatMap((shift) => shift.assignments);
  const active = assignments.filter(
    (item) => !["declined", "cancelled"].includes(item.status),
  );
  return {
    required: shifts.reduce((sum, shift) => sum + shift.requiredVolunteers, 0),
    assigned: active.length,
    missing: shifts.reduce(
      (sum, shift) =>
        sum +
        Math.max(
          0,
          shift.requiredVolunteers -
            shift.assignments.filter(
              (item) => !["declined", "cancelled"].includes(item.status),
            ).length,
        ),
      0,
    ),
    confirmed: active.filter((item) =>
      ["confirmed", "checked_in", "checked_out"].includes(item.status),
    ).length,
    awaiting: active.filter((item) => item.status === "notified").length,
    declined: assignments.filter((item) => item.status === "declined").length,
  };
}

export function buildWorkspaceEvents(data: VolunteerDashboardData) {
  const events = new Map<
    string,
    {
      id: string;
      title: string;
      startsAt: string;
      published: boolean;
      shifts: VolunteerShift[];
    }
  >();
  for (const plan of data.eventPlans)
    events.set(plan.eventId, {
      id: plan.eventId,
      title: plan.eventTitle,
      startsAt: plan.startsAt,
      published: Boolean(plan.schedulePublishedAt),
      shifts: [],
    });
  for (const programming of data.programmings)
    for (const occurrence of programming.occurrences) {
      events.set(occurrence.eventId, {
        id: occurrence.eventId,
        title: programming.title,
        startsAt: occurrence.startsAt,
        published: occurrence.status === "published",
        shifts: [],
      });
    }
  for (const schedule of data.schedules)
    for (const shift of schedule.shifts) {
      const id = shift.eventId ?? `shift:${shift.id}`;
      const event = events.get(id) ?? {
        id,
        title: shift.eventTitle,
        startsAt: shift.startsAt,
        published: Boolean(shift.schedulePublishedAt ?? schedule.publishedAt),
        shifts: [],
      };
      event.shifts.push(shift);
      events.set(id, event);
    }
  return [...events.values()]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((event) => {
      const ids = new Set(
        event.shifts.flatMap((shift) =>
          shift.assignments.map((item) => item.id),
        ),
      );
      return {
        ...event,
        ...summarizeShifts(event.shifts),
        swaps: data.swaps.filter(
          (swap) =>
            ids.has(swap.assignmentId) &&
            ["open", "offered", "accepted"].includes(swap.status),
        ).length,
      };
    });
}

export function workspaceMonth(value: string | null, fallback = new Date()) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
}
