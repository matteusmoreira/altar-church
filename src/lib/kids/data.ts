import "server-only"

import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { decryptHealthDetails, formatChildLabelName } from "./security"
import { ageMonthsAt } from "./suggest"
import { parseJsonbObject } from "@/lib/db/jsonb"
import type {
  KidAttendanceItem,
  KidClassroomItem,
  KidClassroomRuleItem,
  KidConsentType,
  KidEffectiveSettings,
  KidGuardianCallItem,
  KidGuardianItem,
  KidHealthDetails,
  KidHealthIndicators,
  KidIncidentItem,
  KidLabelPaper,
  KidListItem,
  KidRoomPanelData,
  KidSessionClassroomItem,
  KidSessionListItem,
  KidSessionStatus,
  KidSettingsItem,
  KidsCommunicationData,
  KidsDashboardData,
  KidsMetrics,
  KidsReceptionData,
  KidsReportsData,
  KidsSessionsData,
  KidStaffAssignmentItem,
  KidStatus,
} from "./types"

type DateValue = Date | string | null

function iso(value: DateValue): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function dateOnly(value: DateValue): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

async function companyId(input?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  return requireUserCompanyId(user, input)
}

function ageMonthsFromBirthDate(birthDate: string | null): number | null {
  return ageMonthsAt(birthDate, new Date())
}

const EMPTY_HEALTH: KidHealthIndicators = {
  hasAllergy: false,
  hasDietaryRestriction: false,
  hasMedication: false,
  hasSpecialNeeds: false,
}

interface KidRow {
  id: string
  person_id: string
  first_name: string
  last_name: string
  full_name: string
  birth_date: Date | string | null
  congregation_id: string | null
  congregation_name: string | null
  status: string
  is_visitor: boolean
  notes: string | null
  has_allergy: boolean | null
  has_dietary_restriction: boolean | null
  has_medication: boolean | null
  has_special_needs: boolean | null
  granted_consents: string[] | null
  guardians: unknown
  created_at: Date | string
}

function toGuardian(value: unknown): KidGuardianItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      personId: String(item.personId),
      profileId: item.profileId ? String(item.profileId) : null,
      name: String(item.name ?? ""),
      phone: String(item.phone ?? ""),
      email: item.email ? String(item.email) : null,
      relationship: (item.relationship as KidGuardianItem["relationship"]) ?? "guardian",
      isPrimary: Boolean(item.isPrimary),
      canCheckin: Boolean(item.canCheckin),
      canCheckout: Boolean(item.canCheckout),
      isEmergencyContact: Boolean(item.isEmergencyContact),
      whatsappEnabled: Boolean(item.whatsappEnabled),
      emailEnabled: Boolean(item.emailEnabled),
    }
  })
}

function toKid(row: KidRow): KidListItem {
  const birthDate = dateOnly(row.birth_date)
  return {
    id: row.id,
    personId: row.person_id,
    firstName: row.first_name,
    lastName: row.last_name ?? "",
    fullName: row.full_name,
    birthDate,
    ageMonths: ageMonthsFromBirthDate(birthDate),
    congregationId: row.congregation_id,
    congregationName: row.congregation_name,
    status: row.status as KidStatus,
    isVisitor: row.is_visitor,
    notes: row.notes ?? "",
    health: {
      hasAllergy: Boolean(row.has_allergy),
      hasDietaryRestriction: Boolean(row.has_dietary_restriction),
      hasMedication: Boolean(row.has_medication),
      hasSpecialNeeds: Boolean(row.has_special_needs),
    },
    grantedConsents: (row.granted_consents ?? []) as KidConsentType[],
    guardians: toGuardian(row.guardians),
    createdAt: iso(row.created_at) ?? "",
  }
}

interface ClassroomRow {
  id: string
  congregation_id: string | null
  congregation_name: string | null
  name: string
  min_age_months: number
  max_age_months: number
  capacity: number
  location: string | null
  is_active: boolean
  rules: unknown
}

function toClassroomRule(value: unknown): KidClassroomRuleItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      classroomId: String(item.classroomId),
      congregationId: item.congregationId ? String(item.congregationId) : null,
      congregationName: item.congregationName ? String(item.congregationName) : null,
      weekday: item.weekday == null ? null : Number(item.weekday),
      startTime: item.startTime ? String(item.startTime).slice(0, 5) : null,
      endTime: item.endTime ? String(item.endTime).slice(0, 5) : null,
      minAgeMonths: Number(item.minAgeMonths ?? 0),
      maxAgeMonths: Number(item.maxAgeMonths ?? 216),
      priority: Number(item.priority ?? 100),
      isActive: Boolean(item.isActive),
    }
  })
}

function toClassroom(row: ClassroomRow): KidClassroomItem {
  return {
    id: row.id,
    congregationId: row.congregation_id,
    congregationName: row.congregation_name,
    name: row.name,
    minAgeMonths: row.min_age_months,
    maxAgeMonths: row.max_age_months,
    capacity: row.capacity,
    location: row.location ?? "",
    isActive: row.is_active,
    rules: toClassroomRule(row.rules),
  }
}

interface SettingsRow {
  id: string
  congregation_id: string | null
  require_checkout_pin: boolean
  pin_rotation_minutes: number
  allow_capacity_override: boolean
  label_paper: string
  label_show_qr: boolean
  auto_print: boolean
  visitor_form_enabled: boolean
  required_consent_types: string[] | null
}

function toSettings(row: SettingsRow): KidSettingsItem {
  return {
    id: row.id,
    congregationId: row.congregation_id,
    requireCheckoutPin: row.require_checkout_pin,
    pinRotationMinutes: row.pin_rotation_minutes,
    allowCapacityOverride: row.allow_capacity_override,
    labelPaper: row.label_paper as KidLabelPaper,
    labelShowQr: row.label_show_qr,
    autoPrint: row.auto_print,
    visitorFormEnabled: row.visitor_form_enabled,
    requiredConsentTypes: (row.required_consent_types ?? []) as KidConsentType[],
  }
}

export async function getKidsDashboardData(companyIdInput?: string | null): Promise<KidsDashboardData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.view", resolvedCompanyId)
  const sql = getSql()

  const [kidRows, classroomRows, settingsRows, congregationRows, metricRows] = await Promise.all([
    sql<KidRow[]>`
      select
        kp.id,
        kp.person_id,
        kp.status,
        kp.is_visitor,
        kp.notes,
        kp.created_at,
        p.first_name,
        p.last_name,
        p.full_name,
        p.birth_date,
        p.congregation_id,
        congregation.name as congregation_name,
        hp.has_allergy,
        hp.has_dietary_restriction,
        hp.has_medication,
        hp.has_special_needs,
        coalesce((
          select array_agg(consent.consent_type)
          from public.kid_consents consent
          where consent.kid_id = kp.id and consent.status = 'granted'
        ), '{}'::text[]) as granted_consents,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', guardian.id,
            'personId', guardian.person_id,
            'profileId', guardian.profile_id,
            'name', guardian_person.full_name,
            'phone', guardian_person.phone,
            'email', guardian_person.email,
            'relationship', guardian.relationship,
            'isPrimary', guardian.is_primary,
            'canCheckin', guardian.can_checkin,
            'canCheckout', guardian.can_checkout,
            'isEmergencyContact', guardian.is_emergency_contact,
            'whatsappEnabled', guardian.whatsapp_enabled,
            'emailEnabled', guardian.email_enabled
          ) order by guardian.is_primary desc, guardian_person.full_name)
          from public.kid_guardians guardian
          join public.people guardian_person
            on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
          where guardian.kid_id = kp.id and guardian.deleted_at is null
        ), '[]'::jsonb) as guardians
      from public.kid_profiles kp
      join public.people p on p.id = kp.person_id and p.deleted_at is null
      left join public.congregations congregation on congregation.id = p.congregation_id
      left join public.kid_health_profiles hp on hp.kid_id = kp.id and hp.deleted_at is null
      where kp.company_id = ${resolvedCompanyId}
        and kp.deleted_at is null
      order by p.first_name, p.full_name
    `,
    sql<ClassroomRow[]>`
      select
        classroom.id,
        classroom.congregation_id,
        congregation.name as congregation_name,
        classroom.name,
        classroom.min_age_months,
        classroom.max_age_months,
        classroom.capacity,
        classroom.location,
        classroom.is_active,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', rule.id,
            'classroomId', rule.classroom_id,
            'congregationId', rule.congregation_id,
            'congregationName', rule_congregation.name,
            'weekday', rule.weekday,
            'startTime', rule.start_time,
            'endTime', rule.end_time,
            'minAgeMonths', rule.min_age_months,
            'maxAgeMonths', rule.max_age_months,
            'priority', rule.priority,
            'isActive', rule.is_active
          ) order by rule.priority, rule.created_at)
          from public.kid_classroom_rules rule
          left join public.congregations rule_congregation on rule_congregation.id = rule.congregation_id
          where rule.classroom_id = classroom.id and rule.deleted_at is null
        ), '[]'::jsonb) as rules
      from public.kid_classrooms classroom
      left join public.congregations congregation on congregation.id = classroom.congregation_id
      where classroom.company_id = ${resolvedCompanyId}
        and classroom.deleted_at is null
      order by classroom.name
    `,
    sql<SettingsRow[]>`
      select
        id, congregation_id, require_checkout_pin, pin_rotation_minutes,
        allow_capacity_override, label_paper, label_show_qr, auto_print,
        visitor_form_enabled, required_consent_types
      from public.kid_settings
      where company_id = ${resolvedCompanyId}
      order by congregation_id nulls first
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.congregations
      where company_id = ${resolvedCompanyId}
        and deleted_at is null
        and is_active = true
      order by name
    `,
    sql<{
      total_children: number
      visitors: number
      total_guardians: number
      active_classrooms: number
      children_with_health_alerts: number
    }[]>`
      select
        (select count(*) from public.kid_profiles kp where kp.company_id = ${resolvedCompanyId} and kp.deleted_at is null)::int as total_children,
        (select count(*) from public.kid_profiles kp where kp.company_id = ${resolvedCompanyId} and kp.deleted_at is null and kp.is_visitor)::int as visitors,
        (select count(distinct kg.person_id) from public.kid_guardians kg where kg.company_id = ${resolvedCompanyId} and kg.deleted_at is null)::int as total_guardians,
        (select count(*) from public.kid_classrooms kc where kc.company_id = ${resolvedCompanyId} and kc.deleted_at is null and kc.is_active)::int as active_classrooms,
        (select count(*) from public.kid_health_profiles hp
          where hp.company_id = ${resolvedCompanyId} and hp.deleted_at is null
            and (hp.has_allergy or hp.has_dietary_restriction or hp.has_medication or hp.has_special_needs))::int as children_with_health_alerts
    `,
  ])

  const metricRow = metricRows[0]
  const metrics: KidsMetrics = {
    totalChildren: Number(metricRow?.total_children ?? 0),
    visitors: Number(metricRow?.visitors ?? 0),
    totalGuardians: Number(metricRow?.total_guardians ?? 0),
    activeClassrooms: Number(metricRow?.active_classrooms ?? 0),
    childrenWithHealthAlerts: Number(metricRow?.children_with_health_alerts ?? 0),
  }

  return {
    metrics,
    children: kidRows.map(toKid),
    classrooms: classroomRows.map(toClassroom),
    settings: settingsRows.map(toSettings),
    congregations: congregationRows.map((row) => ({ id: row.id, name: row.name })),
  }
}

/** Detalhes clínicos decifrados — somente para quem tem kids.health.view. Nunca logar. */
export async function getKidHealthDetails(kidId: string, companyIdInput?: string | null): Promise<KidHealthDetails & KidHealthIndicators> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.health.view", resolvedCompanyId)
  const sql = getSql()
  const rows = await sql<{
    has_allergy: boolean
    has_dietary_restriction: boolean
    has_medication: boolean
    has_special_needs: boolean
    details_encrypted: string
  }[]>`
    select has_allergy, has_dietary_restriction, has_medication, has_special_needs, details_encrypted
    from public.kid_health_profiles
    where kid_id = ${kidId}
      and company_id = ${resolvedCompanyId}
      and deleted_at is null
    limit 1
  `
  const row = rows[0]
  const empty: KidHealthDetails = {
    allergies: "",
    dietaryRestrictions: "",
    medication: "",
    specialNeeds: "",
    instructions: "",
  }
  if (!row) return { ...EMPTY_HEALTH, ...empty }
  const details = row.details_encrypted ? (JSON.parse(decryptHealthDetails(row.details_encrypted)) as Partial<KidHealthDetails>) : {}
  return {
    hasAllergy: row.has_allergy,
    hasDietaryRestriction: row.has_dietary_restriction,
    hasMedication: row.has_medication,
    hasSpecialNeeds: row.has_special_needs,
    allergies: details.allergies ?? "",
    dietaryRestrictions: details.dietaryRestrictions ?? "",
    medication: details.medication ?? "",
    specialNeeds: details.specialNeeds ?? "",
    instructions: details.instructions ?? "",
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — operação presencial
// ---------------------------------------------------------------------------

const DEFAULT_EFFECTIVE_SETTINGS: KidEffectiveSettings = {
  requireCheckoutPin: true,
  pinRotationMinutes: 30,
  allowCapacityOverride: true,
  labelPaper: "thermal_62x40",
  labelShowQr: true,
  autoPrint: true,
  visitorFormEnabled: true,
  requiredConsentTypes: ["data_processing", "emergency_care"],
}

interface EffectiveSettingsRow {
  congregation_id: string | null
  require_checkout_pin: boolean
  pin_rotation_minutes: number
  allow_capacity_override: boolean
  label_paper: string
  label_show_qr: boolean
  auto_print: boolean
  visitor_form_enabled: boolean
  required_consent_types: string[] | null
}

function toEffectiveSettings(row: EffectiveSettingsRow | null): KidEffectiveSettings {
  if (!row) return DEFAULT_EFFECTIVE_SETTINGS
  return {
    requireCheckoutPin: row.require_checkout_pin,
    pinRotationMinutes: row.pin_rotation_minutes,
    allowCapacityOverride: row.allow_capacity_override,
    labelPaper: row.label_paper as KidLabelPaper,
    labelShowQr: row.label_show_qr,
    autoPrint: row.auto_print,
    visitorFormEnabled: row.visitor_form_enabled,
    requiredConsentTypes: (row.required_consent_types ?? DEFAULT_EFFECTIVE_SETTINGS.requiredConsentTypes) as KidConsentType[],
  }
}

/** Resolve configuração efetiva: override da congregação vence o padrão da empresa. Uso interno (server-only). */
export async function resolveKidEffectiveSettings(companyId: string, congregationId: string | null): Promise<KidEffectiveSettings> {
  const sql = getSql()
  const rows = await sql<EffectiveSettingsRow[]>`
    select congregation_id, require_checkout_pin, pin_rotation_minutes, allow_capacity_override,
           label_paper, label_show_qr, auto_print, visitor_form_enabled, required_consent_types
    from public.kid_settings
    where company_id = ${companyId}
  `
  const companyDefault = rows.find((row) => row.congregation_id === null) ?? null
  const override = congregationId ? (rows.find((row) => row.congregation_id === congregationId) ?? null) : null
  return toEffectiveSettings(override ?? companyDefault)
}

interface SessionRow {
  id: string
  title: string
  status: string
  congregation_id: string | null
  congregation_name: string | null
  event_id: string | null
  event_title: string | null
  starts_at: Date | string
  ends_at: Date | string | null
  checked_out_count: number
  classrooms: unknown
  staff: unknown
}

function toSessionClassrooms(value: unknown): KidSessionClassroomItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      classroomId: String(item.classroomId),
      name: String(item.name ?? ""),
      congregationId: item.congregationId ? String(item.congregationId) : null,
      congregationName: item.congregationName ? String(item.congregationName) : null,
      minAgeMonths: Number(item.minAgeMonths ?? 0),
      maxAgeMonths: Number(item.maxAgeMonths ?? 216),
      capacity: Number(item.capacity ?? 0),
      effectiveCapacity: Number(item.effectiveCapacity ?? item.capacity ?? 0),
      occupied: Number(item.occupied ?? 0),
      capacityOverride: item.capacityOverride == null ? null : Number(item.capacityOverride),
      isOpen: Boolean(item.isOpen),
      sortOrder: Number(item.sortOrder ?? 0),
    }
  })
}

function toStaffAssignments(value: unknown): KidStaffAssignmentItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      sessionClassroomId: item.sessionClassroomId ? String(item.sessionClassroomId) : null,
      classroomName: item.classroomName ? String(item.classroomName) : null,
      profileId: String(item.profileId),
      profileName: String(item.profileName ?? ""),
      assignmentRole: (item.assignmentRole as KidStaffAssignmentItem["assignmentRole"]) ?? "teacher",
    }
  })
}

function toSession(row: SessionRow): KidSessionListItem {
  const classrooms = toSessionClassrooms(row.classrooms)
  return {
    id: row.id,
    title: row.title,
    status: row.status as KidSessionStatus,
    congregationId: row.congregation_id,
    congregationName: row.congregation_name,
    eventId: row.event_id,
    eventTitle: row.event_title,
    startsAt: iso(row.starts_at) ?? "",
    endsAt: iso(row.ends_at),
    presentCount: classrooms.reduce((total, classroom) => total + classroom.occupied, 0),
    checkedOutCount: Number(row.checked_out_count ?? 0),
    totalCapacity: classrooms.reduce((total, classroom) => total + classroom.effectiveCapacity, 0),
    classrooms,
    staff: toStaffAssignments(row.staff),
  }
}

const SESSION_SELECT = `
  select
    s.id, s.title, s.status, s.congregation_id, s.event_id, s.starts_at, s.ends_at,
    congregation.name as congregation_name,
    event.title as event_title,
    (select count(*)::int from public.kid_attendances a
      where a.session_id = s.id and a.status = 'checked_out') as checked_out_count,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sc.id,
        'classroomId', sc.classroom_id,
        'name', classroom.name,
        'congregationId', classroom.congregation_id,
        'congregationName', classroom_congregation.name,
        'minAgeMonths', classroom.min_age_months,
        'maxAgeMonths', classroom.max_age_months,
        'capacity', classroom.capacity,
        'effectiveCapacity', coalesce(sc.capacity_override, classroom.capacity),
        'occupied', (select count(*)::int from public.kid_attendances attendance
                      where attendance.session_classroom_id = sc.id
                        and attendance.status in ('checked_in', 'checkout_requested')),
        'capacityOverride', sc.capacity_override,
        'isOpen', sc.is_open,
        'sortOrder', sc.sort_order
      ) order by sc.sort_order, classroom.name)
      from public.kid_session_classrooms sc
      join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
      left join public.congregations classroom_congregation on classroom_congregation.id = classroom.congregation_id
      where sc.session_id = s.id
    ), '[]'::jsonb) as classrooms,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'sessionClassroomId', assignment.session_classroom_id,
        'classroomName', assignment_classroom.name,
        'profileId', assignment.profile_id,
        'profileName', profile.name,
        'assignmentRole', assignment.assignment_role
      ) order by profile.name)
      from public.kid_staff_assignments assignment
      join public.profiles profile on profile.id = assignment.profile_id and profile.active = true
      left join public.kid_session_classrooms assignment_sc on assignment_sc.id = assignment.session_classroom_id
      left join public.kid_classrooms assignment_classroom on assignment_classroom.id = assignment_sc.classroom_id
      where assignment.session_id = s.id
    ), '[]'::jsonb) as staff
  from public.kid_sessions s
  left join public.congregations congregation on congregation.id = s.congregation_id
  left join public.events event on event.id = s.event_id and event.deleted_at is null
`

async function querySessions(companyId: string, sessionId?: string): Promise<KidSessionListItem[]> {
  const sql = getSql()
  const rows = sessionId
    ? await sql.unsafe<SessionRow[]>(`${SESSION_SELECT} where s.company_id = $1 and s.id = $2 and s.deleted_at is null`, [companyId, sessionId])
    : await sql.unsafe<SessionRow[]>(`${SESSION_SELECT} where s.company_id = $1 and s.deleted_at is null order by s.starts_at desc limit 30`, [companyId])
  return rows.map(toSession)
}

export async function getKidsSessionsData(companyIdInput?: string | null): Promise<KidsSessionsData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.view", resolvedCompanyId)
  const sql = getSql()

  const [sessions, classroomRows, congregationRows, staffRows, eventRows] = await Promise.all([
    querySessions(resolvedCompanyId),
    sql<ClassroomRow[]>`
      select
        classroom.id, classroom.congregation_id, congregation.name as congregation_name,
        classroom.name, classroom.min_age_months, classroom.max_age_months,
        classroom.capacity, classroom.location, classroom.is_active,
        '[]'::jsonb as rules
      from public.kid_classrooms classroom
      left join public.congregations congregation on congregation.id = classroom.congregation_id
      where classroom.company_id = ${resolvedCompanyId}
        and classroom.deleted_at is null
        and classroom.is_active = true
      order by classroom.name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from public.congregations
      where company_id = ${resolvedCompanyId} and deleted_at is null and is_active = true
      order by name
    `,
    sql<{ id: string; name: string; role: string }[]>`
      select id, name, role from public.profiles
      where company_id = ${resolvedCompanyId}
        and active = true
        and role in ('admin', 'pastor', 'ministry_leader', 'volunteer')
      order by name
    `,
    sql<{ id: string; title: string; starts_at: Date | string }[]>`
      select id, title, starts_at from public.events
      where company_id = ${resolvedCompanyId}
        and deleted_at is null
        and status = 'published'
        and starts_at > now() - interval '1 day'
      order by starts_at
      limit 20
    `,
  ])

  return {
    sessions,
    classrooms: classroomRows.map(toClassroom),
    congregations: congregationRows.map((row) => ({ id: row.id, name: row.name })),
    staffOptions: staffRows.map((row) => ({ id: row.id, name: row.name, role: row.role })),
    eventOptions: eventRows.map((row) => ({ id: row.id, title: row.title, startsAt: iso(row.starts_at) ?? "" })),
  }
}

interface AttendanceRow {
  id: string
  kid_id: string
  status: string
  session_classroom_id: string | null
  classroom_name: string | null
  checked_in_at: Date | string
  checkout_requested_at: Date | string | null
  checked_out_at: Date | string | null
  room_override_reason: string | null
  full_name: string
  birth_date: Date | string | null
  has_allergy: boolean | null
  has_dietary_restriction: boolean | null
  has_medication: boolean | null
  has_special_needs: boolean | null
  primary_guardian_name: string | null
  primary_guardian_phone: string | null
}

function toAttendance(row: AttendanceRow): KidAttendanceItem {
  const birthDate = dateOnly(row.birth_date)
  return {
    id: row.id,
    kidId: row.kid_id,
    childName: formatChildLabelName(row.full_name),
    childFullName: row.full_name,
    ageMonths: ageMonthsFromBirthDate(birthDate),
    status: row.status as KidAttendanceItem["status"],
    sessionClassroomId: row.session_classroom_id,
    classroomName: row.classroom_name ?? "",
    health: {
      hasAllergy: Boolean(row.has_allergy),
      hasDietaryRestriction: Boolean(row.has_dietary_restriction),
      hasMedication: Boolean(row.has_medication),
      hasSpecialNeeds: Boolean(row.has_special_needs),
    },
    primaryGuardianName: row.primary_guardian_name,
    primaryGuardianPhone: row.primary_guardian_phone,
    checkedInAt: iso(row.checked_in_at) ?? "",
    checkoutRequestedAt: iso(row.checkout_requested_at),
    checkedOutAt: iso(row.checked_out_at),
    roomOverrideReason: row.room_override_reason,
  }
}

const ATTENDANCE_SELECT = `
  select
    a.id, a.kid_id, a.status, a.session_classroom_id, a.classroom_name,
    a.checked_in_at, a.checkout_requested_at, a.checked_out_at, a.room_override_reason,
    p.full_name, p.birth_date,
    hp.has_allergy, hp.has_dietary_restriction, hp.has_medication, hp.has_special_needs,
    (select guardian_person.full_name
      from public.kid_guardians guardian
      join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
      where guardian.kid_id = a.kid_id and guardian.deleted_at is null and guardian.is_primary = true
      limit 1) as primary_guardian_name,
    (select guardian_person.phone
      from public.kid_guardians guardian
      join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
      where guardian.kid_id = a.kid_id and guardian.deleted_at is null and guardian.is_primary = true
      limit 1) as primary_guardian_phone
  from public.kid_attendances a
  join public.kid_profiles kid on kid.id = a.kid_id
  join public.people p on p.id = kid.person_id and p.deleted_at is null
  left join public.kid_health_profiles hp on hp.kid_id = a.kid_id and hp.deleted_at is null
`

interface GuardianCallRow {
  id: string
  attendance_id: string | null
  kid_id: string | null
  created_at: Date | string
  metadata: unknown
  child_full_name: string | null
  classroom_name: string | null
  called_by_name: string | null
}

function toGuardianCall(row: GuardianCallRow): KidGuardianCallItem {
  const metadata = parseJsonbObject(row.metadata)
  return {
    id: row.id,
    attendanceId: row.attendance_id,
    kidId: row.kid_id,
    childName: formatChildLabelName(row.child_full_name ?? ""),
    classroomName: row.classroom_name ?? "",
    reason: typeof metadata.reason === "string" ? metadata.reason : "",
    calledAt: iso(row.created_at) ?? "",
    calledByName: row.called_by_name,
  }
}

export async function getKidsReceptionData(sessionId: string, companyIdInput?: string | null): Promise<KidsReceptionData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.checkin.create", resolvedCompanyId)
  const sql = getSql()

  const sessions = await querySessions(resolvedCompanyId, sessionId)
  const session = sessions[0]
  if (!session) throw new Error("Sessão não encontrada")

  const [attendanceRows, callRows, settings] = await Promise.all([
    sql.unsafe<AttendanceRow[]>(`${ATTENDANCE_SELECT} where a.company_id = $1 and a.session_id = $2 order by a.checked_in_at desc limit 200`, [resolvedCompanyId, sessionId]),
    sql<GuardianCallRow[]>`
      select e.id, e.attendance_id, e.kid_id, e.created_at, e.metadata,
             p.full_name as child_full_name,
             a.classroom_name,
             profile.name as called_by_name
      from public.kid_access_events e
      left join public.kid_profiles kid on kid.id = e.kid_id
      left join public.people p on p.id = kid.person_id
      left join public.kid_attendances a on a.id = e.attendance_id
      left join public.profiles profile on profile.id = e.actor_profile_id
      where e.company_id = ${resolvedCompanyId}
        and e.session_id = ${sessionId}
        and e.event_type = 'guardian_called'
      order by e.created_at desc
      limit 50
    `,
    resolveKidEffectiveSettings(resolvedCompanyId, session.congregationId),
  ])

  return {
    session,
    attendances: attendanceRows.map(toAttendance),
    calls: callRows.map(toGuardianCall),
    settings,
  }
}

/** Painel da sala: equipe vê tudo; voluntário somente a sala atribuída na sessão. */
export async function getKidRoomPanelData(sessionClassroomId: string, companyIdInput?: string | null): Promise<KidRoomPanelData> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const resolvedCompanyId = requireUserCompanyId(user, companyIdInput)
  await requirePermission("kids.room.view", resolvedCompanyId)
  const sql = getSql()

  const scRows = await sql<{
    id: string
    session_id: string
    capacity_override: number | null
    classroom_name: string
    capacity: number
    session_title: string
    session_status: string
    company_id: string
  }[]>`
    select sc.id, sc.session_id, sc.capacity_override,
           classroom.name as classroom_name, classroom.capacity,
           session.title as session_title, session.status as session_status, session.company_id
    from public.kid_session_classrooms sc
    join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
    join public.kid_sessions session on session.id = sc.session_id and session.deleted_at is null
    where sc.id = ${sessionClassroomId}
    limit 1
  `
  const sc = scRows[0]
  if (!sc || sc.company_id !== resolvedCompanyId) throw new Error("Sala não encontrada")

  const isStaff = ["superadmin", "admin", "pastor", "ministry_leader"].includes(user.role)
  if (!isStaff) {
    const assignment = await sql<{ id: string }[]>`
      select id from public.kid_staff_assignments
      where session_id = ${sc.session_id}
        and profile_id = ${user.id}
        and session_classroom_id = ${sessionClassroomId}
      limit 1
    `
    if (!assignment[0]?.id) throw new Error("Acesso negado")
  }

  const [attendanceRows, incidentRows, reportRows] = await Promise.all([
    sql.unsafe<AttendanceRow[]>(`${ATTENDANCE_SELECT} where a.company_id = $1 and a.session_classroom_id = $2 and a.status in ('checked_in', 'checkout_requested') order by a.checked_in_at`, [resolvedCompanyId, sessionClassroomId]),
    sql<{
      id: string
      session_id: string | null
      session_classroom_id: string | null
      kid_id: string | null
      severity: string
      title: string
      description: string
      resolved_at: Date | string | null
      created_at: Date | string
      child_full_name: string | null
      reported_by_name: string | null
    }[]>`
      select i.id, i.session_id, i.session_classroom_id, i.kid_id, i.severity, i.title, i.description,
             i.resolved_at, i.created_at,
             p.full_name as child_full_name,
             profile.name as reported_by_name
      from public.kid_incidents i
      left join public.kid_profiles kid on kid.id = i.kid_id
      left join public.people p on p.id = kid.person_id
      left join public.profiles profile on profile.id = i.reported_by
      where i.company_id = ${resolvedCompanyId}
        and i.session_id = ${sc.session_id}
        and i.deleted_at is null
      order by i.created_at desc
      limit 50
    `,
    sql<{
      id: string
      session_id: string
      session_classroom_id: string | null
      kid_id: string | null
      title: string
      content: string
      shared_with_guardians: boolean
      created_at: Date | string
      child_full_name: string | null
      author_name: string | null
    }[]>`
      select r.id, r.session_id, r.session_classroom_id, r.kid_id, r.title, r.content,
             r.shared_with_guardians, r.created_at,
             p.full_name as child_full_name,
             profile.name as author_name
      from public.kid_lesson_reports r
      left join public.kid_profiles kid on kid.id = r.kid_id
      left join public.people p on p.id = kid.person_id
      left join public.profiles profile on profile.id = r.author_profile_id
      where r.company_id = ${resolvedCompanyId}
        and r.session_id = ${sc.session_id}
        and r.deleted_at is null
      order by r.created_at desc
      limit 20
    `,
  ])

  const attendances = attendanceRows.map(toAttendance)
  return {
    sessionClassroomId,
    sessionId: sc.session_id,
    sessionTitle: sc.session_title,
    sessionStatus: sc.session_status as KidSessionStatus,
    classroomName: sc.classroom_name,
    capacity: sc.capacity_override ?? sc.capacity,
    occupied: attendances.length,
    attendances,
    incidents: incidentRows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      sessionClassroomId: row.session_classroom_id,
      kidId: row.kid_id,
      childName: row.child_full_name ? formatChildLabelName(row.child_full_name) : null,
      severity: row.severity as KidIncidentItem["severity"],
      title: row.title,
      description: row.description,
      reportedByName: row.reported_by_name,
      resolvedAt: iso(row.resolved_at),
      createdAt: iso(row.created_at) ?? "",
    })),
    reports: reportRows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      sessionClassroomId: row.session_classroom_id,
      kidId: row.kid_id,
      childName: row.child_full_name ? formatChildLabelName(row.child_full_name) : null,
      title: row.title,
      content: row.content ?? "",
      sharedWithGuardians: row.shared_with_guardians,
      authorName: row.author_name,
      createdAt: iso(row.created_at) ?? "",
    })),
    canManage: isStaff,
  }
}

// ---------------------------------------------------------------------------
// Fase 4 — comunicação e relatórios
// ---------------------------------------------------------------------------

interface MessageRow {
  id: string
  channel: string
  audience: string
  subject: string
  body: string
  status: string
  created_at: Date | string
  created_by_name: string | null
  pending_count: number
  queued_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
}

export async function getKidsCommunicationData(companyIdInput?: string | null): Promise<KidsCommunicationData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.communicate", resolvedCompanyId)
  const sql = getSql()

  const [messageRows, classroomRows, congregationRows, childrenRows] = await Promise.all([
    sql<MessageRow[]>`
      select
        m.id, m.channel, m.audience, m.subject, m.body, m.status, m.created_at,
        profile.name as created_by_name,
        (select count(*)::int from public.kid_delivery_outbox o where o.message_id = m.id and o.status = 'pending') as pending_count,
        (select count(*)::int from public.kid_delivery_outbox o where o.message_id = m.id and o.status = 'queued') as queued_count,
        (select count(*)::int from public.kid_delivery_outbox o where o.message_id = m.id and o.status = 'sent') as sent_count,
        (select count(*)::int from public.kid_delivery_outbox o where o.message_id = m.id and o.status = 'delivered') as delivered_count,
        (select count(*)::int from public.kid_delivery_outbox o where o.message_id = m.id and o.status = 'failed') as failed_count
      from public.kid_messages m
      left join public.profiles profile on profile.id = m.created_by
      where m.company_id = ${resolvedCompanyId}
        and m.deleted_at is null
      order by m.created_at desc
      limit 50
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from public.kid_classrooms
      where company_id = ${resolvedCompanyId} and deleted_at is null and is_active = true
      order by name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name from public.congregations
      where company_id = ${resolvedCompanyId} and deleted_at is null and is_active = true
      order by name
    `,
    sql<{ id: string; full_name: string }[]>`
      select kid.id, p.full_name
      from public.kid_profiles kid
      join public.people p on p.id = kid.person_id and p.deleted_at is null
      where kid.company_id = ${resolvedCompanyId} and kid.deleted_at is null
      order by p.full_name
      limit 500
    `,
  ])

  return {
    messages: messageRows.map((row) => ({
      id: row.id,
      channel: row.channel as KidsCommunicationData["messages"][number]["channel"],
      audience: row.audience as KidsCommunicationData["messages"][number]["audience"],
      subject: row.subject,
      body: row.body,
      status: row.status as KidsCommunicationData["messages"][number]["status"],
      createdAt: iso(row.created_at) ?? "",
      createdByName: row.created_by_name,
      pendingCount: Number(row.pending_count ?? 0),
      queuedCount: Number(row.queued_count ?? 0),
      sentCount: Number(row.sent_count ?? 0),
      deliveredCount: Number(row.delivered_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
    })),
    classrooms: classroomRows.map((row) => ({ id: row.id, name: row.name })),
    congregations: congregationRows.map((row) => ({ id: row.id, name: row.name })),
    children: childrenRows.map((row) => ({ id: row.id, fullName: row.full_name })),
  }
}

export async function getKidsReportsData(companyIdInput?: string | null): Promise<KidsReportsData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("kids.reports.view", resolvedCompanyId)
  const sql = getSql()

  const [metricRows, sessionRows, weeklyRows, healthRows, incidentRows] = await Promise.all([
    sql<{
      attendances_last_30d: number
      new_visitors_last_30d: number
      returning_visitors: number
      active_children: number
      children_with_attendance_30d: number
      incidents_last_30d: number
      critical_incidents_last_30d: number
    }[]>`
      select
        (select count(*) from public.kid_attendances a where a.company_id = ${resolvedCompanyId}
          and a.checked_in_at > now() - interval '30 days')::int as attendances_last_30d,
        (select count(*) from public.kid_profiles kid where kid.company_id = ${resolvedCompanyId}
          and kid.deleted_at is null and kid.is_visitor
          and kid.created_at > now() - interval '30 days')::int as new_visitors_last_30d,
        (select count(*) from (
          select a.kid_id from public.kid_attendances a
          join public.kid_profiles kid on kid.id = a.kid_id and kid.deleted_at is null and kid.is_visitor
          where a.company_id = ${resolvedCompanyId}
          group by a.kid_id having count(*) >= 2
        ) returning_kids)::int as returning_visitors,
        (select count(*) from public.kid_profiles kid where kid.company_id = ${resolvedCompanyId}
          and kid.deleted_at is null and kid.status = 'active')::int as active_children,
        (select count(distinct a.kid_id) from public.kid_attendances a
          where a.company_id = ${resolvedCompanyId}
          and a.checked_in_at > now() - interval '30 days')::int as children_with_attendance_30d,
        (select count(*) from public.kid_incidents i where i.company_id = ${resolvedCompanyId}
          and i.deleted_at is null and i.created_at > now() - interval '30 days')::int as incidents_last_30d,
        (select count(*) from public.kid_incidents i where i.company_id = ${resolvedCompanyId}
          and i.deleted_at is null and i.severity = 'critical'
          and i.created_at > now() - interval '30 days')::int as critical_incidents_last_30d
    `,
    sql<{
      id: string
      title: string
      starts_at: Date | string
      status: string
      present: number
      checked_out: number
      visitors: number
    }[]>`
      select
        s.id, s.title, s.starts_at, s.status,
        count(a.id) filter (where a.status in ('checked_in', 'checkout_requested'))::int as present,
        count(a.id) filter (where a.status = 'checked_out')::int as checked_out,
        count(a.id) filter (where kid.is_visitor)::int as visitors
      from public.kid_sessions s
      left join public.kid_attendances a on a.session_id = s.id
      left join public.kid_profiles kid on kid.id = a.kid_id
      where s.company_id = ${resolvedCompanyId}
        and s.deleted_at is null
      group by s.id, s.title, s.starts_at, s.status
      order by s.starts_at desc
      limit 10
    `,
    sql<{ week: Date | string; attendances: number }[]>`
      select date_trunc('week', a.checked_in_at) as week, count(*)::int as attendances
      from public.kid_attendances a
      where a.company_id = ${resolvedCompanyId}
        and a.checked_in_at > now() - interval '8 weeks'
      group by 1
      order by 1
    `,
    sql<{
      classroom_name: string
      allergy: number
      dietary: number
      medication: number
      special_needs: number
    }[]>`
      select
        classroom.name as classroom_name,
        count(distinct a.kid_id) filter (where hp.has_allergy)::int as allergy,
        count(distinct a.kid_id) filter (where hp.has_dietary_restriction)::int as dietary,
        count(distinct a.kid_id) filter (where hp.has_medication)::int as medication,
        count(distinct a.kid_id) filter (where hp.has_special_needs)::int as special_needs
      from public.kid_attendances a
      join public.kid_session_classrooms sc on sc.id = a.session_classroom_id
      join public.kid_classrooms classroom on classroom.id = sc.classroom_id
      join public.kid_health_profiles hp on hp.kid_id = a.kid_id and hp.deleted_at is null
      where a.company_id = ${resolvedCompanyId}
        and a.checked_in_at > now() - interval '90 days'
      group by classroom.name
      order by classroom.name
    `,
    sql<{
      id: string
      session_id: string | null
      session_classroom_id: string | null
      kid_id: string | null
      severity: string
      title: string
      description: string
      resolved_at: Date | string | null
      created_at: Date | string
      child_full_name: string | null
      reported_by_name: string | null
    }[]>`
      select i.id, i.session_id, i.session_classroom_id, i.kid_id, i.severity, i.title, i.description,
             i.resolved_at, i.created_at,
             p.full_name as child_full_name,
             profile.name as reported_by_name
      from public.kid_incidents i
      left join public.kid_profiles kid on kid.id = i.kid_id
      left join public.people p on p.id = kid.person_id
      left join public.profiles profile on profile.id = i.reported_by
      where i.company_id = ${resolvedCompanyId}
        and i.deleted_at is null
      order by i.created_at desc
      limit 10
    `,
  ])

  const metricsRow = metricRows[0]
  return {
    metrics: {
      attendancesLast30d: Number(metricsRow?.attendances_last_30d ?? 0),
      newVisitorsLast30d: Number(metricsRow?.new_visitors_last_30d ?? 0),
      returningVisitors: Number(metricsRow?.returning_visitors ?? 0),
      activeChildren: Number(metricsRow?.active_children ?? 0),
      childrenWithAttendance30d: Number(metricsRow?.children_with_attendance_30d ?? 0),
      incidentsLast30d: Number(metricsRow?.incidents_last_30d ?? 0),
      criticalIncidentsLast30d: Number(metricsRow?.critical_incidents_last_30d ?? 0),
    },
    sessions: sessionRows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: iso(row.starts_at) ?? "",
      status: row.status as KidsReportsData["sessions"][number]["status"],
      present: Number(row.present ?? 0),
      checkedOut: Number(row.checked_out ?? 0),
      visitors: Number(row.visitors ?? 0),
    })),
    weekly: weeklyRows.map((row) => ({
      week: iso(row.week)?.slice(0, 10) ?? "",
      attendances: Number(row.attendances ?? 0),
    })),
    healthByClassroom: healthRows.map((row) => ({
      classroomName: row.classroom_name,
      allergy: Number(row.allergy ?? 0),
      dietary: Number(row.dietary ?? 0),
      medication: Number(row.medication ?? 0),
      specialNeeds: Number(row.special_needs ?? 0),
    })),
    recentIncidents: incidentRows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      sessionClassroomId: row.session_classroom_id,
      kidId: row.kid_id,
      childName: row.child_full_name ? formatChildLabelName(row.child_full_name) : null,
      severity: row.severity as KidsReportsData["recentIncidents"][number]["severity"],
      title: row.title,
      description: row.description,
      reportedByName: row.reported_by_name,
      resolvedAt: iso(row.resolved_at),
      createdAt: iso(row.created_at) ?? "",
    })),
  }
}
