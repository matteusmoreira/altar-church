import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { getSql } from "@/lib/db/client";
import { createSignedUrlsByStoragePath } from "@/lib/files/server";
import type {
  VolunteerAvailability,
  VolunteerChatMessage,
  VolunteerDashboardData,
  VolunteerEventPlan,
  VolunteerNotificationPreferences,
  VolunteerPortalData,
  VolunteerReportData,
  VolunteerSwapRequest,
} from "./types";

type DateValue = Date | string | null;
const iso = (value: DateValue) =>
  value ? (value instanceof Date ? value.toISOString() : String(value)) : null;

function eventPlans(
  eventRows: Record<string, unknown>[],
  itemRows: Record<string, unknown>[],
  timelineRows: Record<string, unknown>[],
): VolunteerEventPlan[] {
  return eventRows.map((event) => ({
    eventId: String(event.event_id),
    eventTitle: String(event.event_title),
    startsAt: iso(event.starts_at as DateValue) ?? "",
    setlistId: event.setlist_id ? String(event.setlist_id) : null,
    setlistTitle: String(event.setlist_title ?? "Repertório"),
    setlistNotes: String(event.setlist_notes ?? ""),
    setlistItems: itemRows
      .filter((item) => item.event_id === event.event_id)
      .map((item) => ({
        id: String(item.id),
        songId: item.song_id ? String(item.song_id) : null,
        title: String(item.title),
        tone: String(item.tone ?? ""),
        responsibleProfileId: item.responsible_profile_id
          ? String(item.responsible_profile_id)
          : null,
        notes: String(item.notes ?? ""),
        spotifyUrl: String(item.spotify_url ?? ""),
        deezerUrl: String(item.deezer_url ?? ""),
        cifraClubUrl: String(item.cifra_club_url ?? ""),
        sortOrder: Number(item.sort_order),
      })),
    timeline: timelineRows
      .filter((item) => item.event_id === event.event_id)
      .map((item) => ({
        id: String(item.id),
        title: String(item.title),
        plannedAt: iso(item.planned_at as DateValue) ?? "",
        actualStartedAt: iso(item.actual_started_at as DateValue),
        durationMinutes: Number(item.duration_minutes),
        responsibleProfileId: item.responsible_profile_id
          ? String(item.responsible_profile_id)
          : null,
        instructions: String(item.instructions ?? ""),
        sortOrder: Number(item.sort_order),
      })),
  }));
}

function swaps(rows: Record<string, unknown>[]): VolunteerSwapRequest[] {
  return rows.map((row) => ({
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    requestedByVolunteerId: String(row.requested_by_volunteer_id),
    replacementVolunteerId: row.replacement_volunteer_id
      ? String(row.replacement_volunteer_id)
      : null,
    replacementName: row.replacement_name ? String(row.replacement_name) : null,
    status: row.status as VolunteerSwapRequest["status"],
    reason: String(row.reason ?? ""),
    createdAt: iso(row.created_at as DateValue) ?? "",
  }));
}

export async function getVolunteerV2DashboardExtras(
  companyId: string,
  departmentScope: string[] = [],
  allDepartments = true,
): Promise<
  Pick<
    VolunteerDashboardData,
    "eventPlans" | "swaps" | "reports" | "v2Enabled" | "settings" | "songs"
  >
> {
  const sql = getSql();
  const [
    settingsRows,
    swapRows,
    eventRows,
    setlistRows,
    timelineRows,
    reportRows,
    coverageRows,
    songRows,
  ] = await Promise.all([
    sql<
      Record<string, unknown>[]
    >`select v2_enabled, timezone, require_swap_approval, reminder_hours from public.volunteer_module_settings where company_id = ${companyId}`,
    sql<Record<string, unknown>[]>`
      select swap.*, replacement_person.full_name as replacement_name
      from public.volunteer_swap_requests swap
      join public.volunteer_assignments assignment on assignment.id = swap.assignment_id
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      left join public.volunteer_profiles replacement on replacement.id = swap.replacement_volunteer_id
      left join public.people replacement_person on replacement_person.id = replacement.person_id
      where swap.company_id = ${companyId} and (${allDepartments} or shift.department_id = any(${departmentScope}::uuid[]))
      order by swap.created_at desc limit 100
    `,
    sql<Record<string, unknown>[]>`
      select event.id as event_id, event.title as event_title, event.starts_at, setlist.id as setlist_id,
        setlist.title as setlist_title, setlist.notes as setlist_notes
      from public.events event left join public.volunteer_event_setlists setlist on setlist.event_id = event.id
      where event.company_id = ${companyId} and event.deleted_at is null and event.starts_at >= now() - interval '1 day'
        and (${allDepartments} or exists(select 1 from public.volunteer_shifts shift
          where shift.event_id = event.id and shift.department_id = any(${departmentScope}::uuid[])))
      order by event.starts_at limit 50
    `,
    sql<Record<string, unknown>[]>`
      select item.*, setlist.event_id from public.volunteer_event_setlist_items item
      join public.volunteer_event_setlists setlist on setlist.id = item.setlist_id
      join public.events event on event.id = setlist.event_id
      where item.company_id = ${companyId} and event.starts_at >= now() - interval '1 day' order by item.sort_order
    `,
    sql<Record<string, unknown>[]>`
      select * from public.volunteer_event_timeline_items
      where company_id = ${companyId} and planned_at >= now() - interval '1 day' order by event_id, sort_order
    `,
    sql<Record<string, unknown>[]>`
      select
        count(*) filter (where assignment.status in ('confirmed','checked_in','checked_out'))::int as positive,
        count(*) filter (where assignment.status = 'declined')::int as declined,
        count(*) filter (where assignment.status = 'no_show')::int as no_show,
        count(*) filter (where assignment.status in ('checked_in','checked_out'))::int as attended,
        count(*)::int as total,
        (select count(*)::int from public.volunteer_swap_requests where company_id = ${companyId} and status in ('open','offered','accepted')) as open_swaps,
        (select count(*)::int from public.volunteer_delivery_outbox where company_id = ${companyId} and status = 'failed') as delivery_failures,
        (select count(*)::int from public.volunteer_profiles volunteer where volunteer.company_id = ${companyId} and volunteer.deleted_at is null
          and volunteer.registration_status = 'active' and (select count(*) from public.volunteer_assignments current_assignment
            join public.volunteer_shifts current_shift on current_shift.id = current_assignment.shift_id
            where current_assignment.volunteer_id = volunteer.id and current_shift.starts_at >= date_trunc('month', now())
              and current_assignment.status not in ('declined','cancelled')) >= volunteer.max_services_per_month) as overloaded,
        (select count(*)::int from public.volunteer_profiles volunteer where volunteer.company_id = ${companyId} and volunteer.deleted_at is null
          and volunteer.registration_status = 'active' and not exists(select 1 from public.volunteer_assignments current_assignment
            join public.volunteer_shifts current_shift on current_shift.id = current_assignment.shift_id
            where current_assignment.volunteer_id = volunteer.id and current_shift.starts_at >= now() - interval '90 days'
              and current_assignment.status in ('checked_in','checked_out'))) as inactive
      from public.volunteer_assignments assignment join public.volunteer_shifts shift on shift.id = assignment.shift_id
      where assignment.company_id = ${companyId} and shift.starts_at >= now() - interval '90 days'
        and (${allDepartments} or shift.department_id = any(${departmentScope}::uuid[]))
    `,
    sql<Record<string, unknown>[]>`
      select department.id as department_id, department.name as department_name,
        coalesce(sum(shift.required_volunteers), 0)::int as required,
        count(assignment.id) filter (where assignment.status not in ('declined','cancelled'))::int as filled
      from public.volunteer_departments department
      left join public.volunteer_shifts shift on shift.department_id = department.id and shift.starts_at >= date_trunc('month', now())
      left join public.volunteer_assignments assignment on assignment.shift_id = shift.id
      where department.company_id = ${companyId} and department.deleted_at is null
        and (${allDepartments} or department.id = any(${departmentScope}::uuid[]))
      group by department.id order by department.name
    `,
    sql<
      Record<string, unknown>[]
    >`select id, title, tone, content from public.songs where company_id = ${companyId} and is_active and deleted_at is null order by title limit 500`,
  ]);
  const row = reportRows[0] ?? {};
  const total = Number(row.total ?? 0);
  const reports: VolunteerReportData = {
    confirmationRate: total
      ? Math.round((Number(row.positive ?? 0) * 100) / total)
      : 0,
    attendanceRate: total
      ? Math.round((Number(row.attended ?? 0) * 100) / total)
      : 0,
    declineRate: total
      ? Math.round((Number(row.declined ?? 0) * 100) / total)
      : 0,
    noShowRate: total
      ? Math.round((Number(row.no_show ?? 0) * 100) / total)
      : 0,
    overloadedVolunteers: Number(row.overloaded ?? 0),
    inactiveVolunteers: Number(row.inactive ?? 0),
    openSwaps: Number(row.open_swaps ?? 0),
    deliveryFailures: Number(row.delivery_failures ?? 0),
    departmentCoverage: coverageRows.map((coverage) => ({
      departmentId: String(coverage.department_id),
      departmentName: String(coverage.department_name),
      required: Number(coverage.required),
      filled: Number(coverage.filled),
    })),
  };
  const settings = settingsRows[0] ?? {};
  return {
    v2Enabled: Boolean(settings.v2_enabled),
    settings: {
      v2Enabled: Boolean(settings.v2_enabled),
      timezone: String(settings.timezone ?? "America/Sao_Paulo"),
      requireSwapApproval:
        settings.require_swap_approval === undefined
          ? true
          : Boolean(settings.require_swap_approval),
      reminderHours: Array.isArray(settings.reminder_hours)
        ? settings.reminder_hours.map(Number)
        : [72, 24, 2],
    },
    songs: songRows.map((song) => ({
      id: String(song.id),
      title: String(song.title),
      tone: String(song.tone ?? ""),
      content: String(song.content ?? ""),
    })),
    swaps: swaps(swapRows),
    reports,
    eventPlans: eventPlans(eventRows, setlistRows, timelineRows),
  };
}

export async function getVolunteerV2PortalExtras(
  companyId: string,
  volunteerId: string,
): Promise<
  Pick<
    VolunteerPortalData,
    | "availability"
    | "swaps"
    | "recognitions"
    | "notificationPreferences"
    | "eventPlans"
  >
> {
  const sql = getSql();
  const [
    profileRows,
    ruleRows,
    exceptionRows,
    preferenceRows,
    swapRows,
    recognitionRows,
    notificationRows,
    eventRows,
    setlistRows,
    timelineRows,
  ] = await Promise.all([
    sql<
      Record<string, unknown>[]
    >`select desired_services_per_month, max_services_per_month, minimum_rest_hours from public.volunteer_profiles where id = ${volunteerId} and company_id = ${companyId}`,
    sql<
      Record<string, unknown>[]
    >`select * from public.volunteer_availability_rules where volunteer_id = ${volunteerId} order by weekday, starts_at`,
    sql<
      Record<string, unknown>[]
    >`select * from public.volunteer_availability_exceptions where volunteer_id = ${volunteerId} and ends_at >= now() - interval '1 day' order by starts_at`,
    sql<
      Record<string, unknown>[]
    >`select * from public.volunteer_role_preferences where volunteer_id = ${volunteerId} order by role_name`,
    sql<Record<string, unknown>[]>`
      select swap.*, replacement_person.full_name as replacement_name from public.volunteer_swap_requests swap
      left join public.volunteer_profiles replacement on replacement.id = swap.replacement_volunteer_id
      left join public.people replacement_person on replacement_person.id = replacement.person_id
      where swap.requested_by_volunteer_id = ${volunteerId} or swap.replacement_volunteer_id = ${volunteerId}
      order by swap.created_at desc limit 50
    `,
    sql<
      Record<string, unknown>[]
    >`select * from public.volunteer_recognitions where volunteer_id = ${volunteerId} order by granted_at desc limit 50`,
    sql<
      Record<string, unknown>[]
    >`select * from public.volunteer_notification_preferences where volunteer_id = ${volunteerId}`,
    sql<Record<string, unknown>[]>`
      select distinct event.id as event_id, event.title as event_title, event.starts_at, setlist.id as setlist_id,
        setlist.title as setlist_title, setlist.notes as setlist_notes
      from public.volunteer_assignments assignment join public.volunteer_shifts shift on shift.id = assignment.shift_id
      join public.events event on event.id = shift.event_id left join public.volunteer_event_setlists setlist on setlist.event_id = event.id
      where assignment.volunteer_id = ${volunteerId} and assignment.status not in ('declined','cancelled') and event.starts_at >= now() - interval '1 day'
      order by event.starts_at limit 50
    `,
    sql<Record<string, unknown>[]>`
      select item.*, setlist.event_id from public.volunteer_event_setlist_items item
      join public.volunteer_event_setlists setlist on setlist.id = item.setlist_id
      where exists(select 1 from public.volunteer_shifts shift join public.volunteer_assignments assignment on assignment.shift_id = shift.id
        where shift.event_id = setlist.event_id and assignment.volunteer_id = ${volunteerId} and assignment.status not in ('declined','cancelled'))
      order by item.sort_order
    `,
    sql<Record<string, unknown>[]>`
      select timeline.* from public.volunteer_event_timeline_items timeline
      where exists(select 1 from public.volunteer_shifts shift join public.volunteer_assignments assignment on assignment.shift_id = shift.id
        where shift.event_id = timeline.event_id and assignment.volunteer_id = ${volunteerId} and assignment.status not in ('declined','cancelled'))
      order by timeline.event_id, timeline.sort_order
    `,
  ]);
  const profile = profileRows[0] ?? {};
  const availability: VolunteerAvailability = {
    desiredServicesPerMonth: Number(profile.desired_services_per_month ?? 2),
    maxServicesPerMonth: Number(profile.max_services_per_month ?? 4),
    minimumRestHours: Number(profile.minimum_rest_hours ?? 12),
    rules: ruleRows.map((row) => ({
      id: String(row.id),
      weekday: Number(row.weekday),
      available: Boolean(row.available),
      startsAt: row.starts_at ? String(row.starts_at).slice(0, 5) : null,
      endsAt: row.ends_at ? String(row.ends_at).slice(0, 5) : null,
      validFrom: row.valid_from
        ? (iso(row.valid_from as DateValue)?.slice(0, 10) ?? null)
        : null,
      validUntil: row.valid_until
        ? (iso(row.valid_until as DateValue)?.slice(0, 10) ?? null)
        : null,
    })),
    exceptions: exceptionRows.map((row) => ({
      id: String(row.id),
      startsAt: iso(row.starts_at as DateValue) ?? "",
      endsAt: iso(row.ends_at as DateValue) ?? "",
      available: Boolean(row.available),
      reason: String(row.reason ?? ""),
    })),
    preferences: preferenceRows.map((row) => ({
      id: String(row.id),
      departmentId: String(row.department_id),
      roleId: row.role_id ? String(row.role_id) : null,
      roleName: String(row.role_name),
      preference: Number(row.preference) as -2 | -1 | 0 | 1 | 2,
    })),
  };
  const prefs = notificationRows[0] ?? {};
  const notificationPreferences: VolunteerNotificationPreferences = {
    scheduleEnabled:
      prefs.schedule_enabled === undefined
        ? true
        : Boolean(prefs.schedule_enabled),
    reminderEnabled:
      prefs.reminder_enabled === undefined
        ? true
        : Boolean(prefs.reminder_enabled),
    swapEnabled:
      prefs.swap_enabled === undefined ? true : Boolean(prefs.swap_enabled),
    chatEnabled:
      prefs.chat_enabled === undefined ? true : Boolean(prefs.chat_enabled),
    feedEnabled:
      prefs.feed_enabled === undefined ? true : Boolean(prefs.feed_enabled),
    recognitionEnabled:
      prefs.recognition_enabled === undefined
        ? true
        : Boolean(prefs.recognition_enabled),
    pushEnabled: Boolean(prefs.push_enabled),
    whatsappEnabled: Boolean(prefs.whatsapp_enabled),
    emailEnabled: Boolean(prefs.email_enabled),
  };
  return {
    availability,
    swaps: swaps(swapRows),
    notificationPreferences,
    recognitions: recognitionRows.map((row) => ({
      id: String(row.id),
      volunteerId,
      kind: row.kind as "milestone" | "thanks" | "achievement",
      title: String(row.title),
      message: String(row.message ?? ""),
      milestone: row.milestone === null ? null : Number(row.milestone),
      grantedAt: iso(row.granted_at as DateValue) ?? "",
    })),
    eventPlans: eventPlans(eventRows, setlistRows, timelineRows),
  };
}

export async function listVolunteerShiftMessages(
  shiftId: string,
): Promise<VolunteerChatMessage[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acesso negado");
  const companyId = requireUserCompanyId(user);
  const rows = await getSql()<Record<string, unknown>[]>`
    select message.id, message.conversation_id, message.sender_profile_id, profile.name as sender_name, message.body, message.created_at,
      coalesce(jsonb_agg(jsonb_build_object('id', file.id, 'name', file.original_name, 'path', file.storage_path)) filter (where file.id is not null), '[]'::jsonb) as files
    from public.volunteer_shift_conversations conversation
    join public.volunteer_shift_messages message on message.conversation_id = conversation.id and message.deleted_at is null
    join public.profiles profile on profile.id = message.sender_profile_id
    left join public.volunteer_message_files link on link.message_id = message.id
    left join public.app_files file on file.id = link.file_id and file.deleted_at is null
    where conversation.shift_id = ${shiftId} and conversation.company_id = ${companyId}
      and (exists(select 1 from public.volunteer_assignments assignment join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
        join public.profiles current_profile on current_profile.person_id = volunteer.person_id
        where assignment.shift_id = conversation.shift_id and current_profile.id = ${user.id}
          and assignment.status not in ('declined','cancelled'))
        or exists(select 1 from public.volunteer_department_access access join public.volunteer_shifts shift on shift.department_id = access.department_id
          where shift.id = conversation.shift_id and access.profile_id = ${user.id})
        or ${user.role === "superadmin" || user.role === "admin" || user.role === "pastor"})
    group by message.id, profile.name order by message.created_at
  `;
  const rawFiles = rows.flatMap(
    (row) => row.files as { id: string; name: string; path: string }[],
  );
  const signedUrls = await createSignedUrlsByStoragePath(
    rawFiles.map((file) => file.path),
    3600,
  );
  return rows.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderProfileId: String(row.sender_profile_id),
    senderName: String(row.sender_name),
    body: String(row.body),
    createdAt: iso(row.created_at as DateValue) ?? "",
    files: (row.files as { id: string; name: string; path: string }[]).map(
      (file) => ({
        id: file.id,
        name: file.name,
        url: signedUrls.get(file.path),
      }),
    ),
  }));
}
