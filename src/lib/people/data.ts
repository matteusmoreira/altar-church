import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { listPersonFollowUpTasks, listPersonTimeline } from "./follow-up"
import type {
  BirthdayPerson,
  DuplicateCandidateItem,
  DuplicateCandidateStatus,
  MemberJourneyStep,
  MemberJourneyWithSteps,
  PeopleDashboardData,
  PeopleListFilters,
  PeopleListResult,
  PersonActivityWithCount,
  PersonDetail,
  PersonEnrolledJourney,
  PersonFormOptions,
  PersonAccessRole,
  PersonGender,
  PersonListItem,
  PersonStatus,
  PersonType,
  VisitorMetrics,
} from "./types"

interface PersonRow {
  id: string
  company_id: string
  congregation_id: string | null
  congregation_name: string | null
  first_name: string
  last_name: string
  full_name: string
  email: string | null
  phone: string
  document: string | null
  birth_date: Date | string | null
  gender: PersonGender | null
  address: string
  postal_code: string
  address_number: string
  address_complement: string
  neighborhood: string
  city: string
  state: string
  country: string
  access_profile: string | null
  profile_id: string | null
  access_role: PersonAccessRole | null
  access_active: boolean | null
  cell_ids: string[] | null
  internal_notes?: string
  status: PersonStatus
  person_type: PersonType
  journey_status: string
  baptized: boolean
  email_validated: boolean
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
  kids_roles: string[] | null
}

interface PeopleCountRow {
  total: string | number
}

interface PersonDetailRow extends PersonRow {
  internal_notes: string
}

interface PersonCustomFieldRow {
  id: string | null
  field_id: string
  name: string
  field_type: "text" | "textarea" | "number" | "date" | "single" | "multiple" | "boolean"
  sort_order: number
  value_text: string | null
  value_date: Date | string | null
  value_json: unknown
  source_module: "people" | "kids"
  kids_targets: string[] | null
}

interface PersonActivityRow {
  id: string
  activity_id: string
  description: string
  category: string
  assigned_at: Date | string
  is_active: boolean
}

interface PersonJourneyStepRow {
  id: string | null
  journey_id: string
  journey_name: string
  step_id: string
  step_name: string
  description: string
  sort_order: number
  estimated_days?: number
  completed_at: Date | string | null
  notes: string
}

interface DashboardRow {
  total: string | number
  active: string | number
  visitors: string | number
  baptized: string | number
  email_validated: string | number
  members: string | number
  leaders: string | number
  volunteers: string | number
  attendees: string | number
  male: string | number
  female: string | number
  other_gender: string | number
  age_child: string | number
  age_teen: string | number
  age_young: string | number
  age_adult: string | number
  age_senior: string | number
  age_uninformed: string | number
  missing_phone: string | number
  missing_email: string | number
  missing_birth_date: string | number
  missing_address: string | number
}

interface MonthlyRegistrationRow {
  month_key: string
  count: string | number
}

interface BirthdayRow {
  id: string
  full_name: string
  birth_date: Date | string
  phone: string
  person_type: PersonType
  congregation_name: string | null
  day: number
  month: number
}

interface DuplicatePersonRow {
  id: string
  full_name: string
  email: string | null
  phone: string
  congregation_name: string | null
  birth_date: Date | string | null
}

interface DuplicateCandidateRow {
  id: string
  company_id: string
  primary_person_id: string
  primary_full_name: string
  primary_email: string | null
  primary_phone: string
  primary_congregation_name: string | null
  primary_birth_date: Date | string | null
  duplicate_person_id: string
  duplicate_full_name: string
  duplicate_email: string | null
  duplicate_phone: string
  duplicate_congregation_name: string | null
  duplicate_birth_date: Date | string | null
  reason: string
  similarity_score: string | number
  status: DuplicateCandidateStatus
  detected_at: Date | string
}

function toIsoDate(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString()
  return value
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function clampPage(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value ?? fallback), min), max)
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

function jsonValueToText(value: unknown) {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(", ")
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.value === "string") return record.value
    return Object.values(record).filter(Boolean).map(String).join(", ")
  }
  return ""
}

function toCustomField(row: PersonCustomFieldRow) {
  return {
    id: row.id,
    fieldId: row.field_id,
    name: row.name,
    fieldType: row.field_type,
    value: row.value_text ?? toIsoDate(row.value_date) ?? jsonValueToText(row.value_json),
    sortOrder: row.sort_order,
    sourceModule: row.source_module,
    kidsTargets: (row.kids_targets ?? []).filter((target): target is "child" | "guardian" => target === "child" || target === "guardian"),
  }
}

function toActivity(row: PersonActivityRow) {
  return {
    id: row.id,
    activityId: row.activity_id,
    description: row.description,
    category: row.category,
    assignedAt: toIso(row.assigned_at),
    isActive: row.is_active,
  }
}

function toJourneyStep(row: PersonJourneyStepRow) {
  return {
    id: row.id,
    journeyId: row.journey_id,
    journeyName: row.journey_name,
    stepId: row.step_id,
    stepName: row.step_name,
    description: row.description,
    sortOrder: row.sort_order,
    estimatedDays: typeof row.estimated_days === "number" ? row.estimated_days : 7,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    notes: row.notes,
  }
}

function toPerson(row: PersonRow): PersonListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    congregationId: row.congregation_id,
    congregationName: row.congregation_name,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    document: row.document,
    birthDate: toIsoDate(row.birth_date),
    gender: row.gender,
    address: row.address,
    postalCode: row.postal_code ?? "",
    addressNumber: row.address_number ?? "",
    addressComplement: row.address_complement ?? "",
    neighborhood: row.neighborhood ?? "",
    city: row.city,
    state: row.state,
    country: row.country,
    accessProfile: row.access_profile,
    profileId: row.profile_id,
    accessRole: row.access_role,
    accessActive: row.access_active,
    hasSystemAccess: Boolean(row.profile_id),
    cellIds: row.cell_ids ?? [],
    internalNotes: row.internal_notes ?? undefined,
    status: row.status,
    personType: row.person_type,
    journeyStatus: row.journey_status,
    baptized: row.baptized,
    emailValidated: row.email_validated,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    kidsRoles: (row.kids_roles ?? []).filter((role): role is "child" | "guardian" => role === "child" || role === "guardian"),
  }
}

function toDuplicatePerson(row: DuplicatePersonRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    congregationName: row.congregation_name,
    birthDate: toIsoDate(row.birth_date),
  }
}

function toDuplicateCandidate(row: DuplicateCandidateRow): DuplicateCandidateItem {
  return {
    id: row.id,
    companyId: row.company_id,
    primaryPerson: toDuplicatePerson({
      id: row.primary_person_id,
      full_name: row.primary_full_name,
      email: row.primary_email,
      phone: row.primary_phone,
      congregation_name: row.primary_congregation_name,
      birth_date: row.primary_birth_date,
    }),
    duplicatePerson: toDuplicatePerson({
      id: row.duplicate_person_id,
      full_name: row.duplicate_full_name,
      email: row.duplicate_email,
      phone: row.duplicate_phone,
      congregation_name: row.duplicate_congregation_name,
      birth_date: row.duplicate_birth_date,
    }),
    reason: row.reason,
    similarityScore: toNumber(row.similarity_score),
    status: row.status,
    detectedAt: toIso(row.detected_at),
  }
}

export async function getPersonDetail(personId: string, companyIdInput?: string | null): Promise<PersonDetail | null> {
  if (!isUuid(personId)) return null

  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const [
    peopleRows,
    customFieldRows,
    activityRows,
    journeyStepRows,
    enrollmentRows,
    availableJourneysRows,
    availableActivitiesRows,
    timeline,
    followUpTasks,
  ] = await Promise.all([
    sql<PersonDetailRow[]>`
      select
        p.id,
        p.company_id,
        p.congregation_id,
        c.name as congregation_name,
        p.first_name,
        p.last_name,
        p.full_name,
        p.email,
        p.phone,
        p.document,
        p.birth_date,
        p.gender,
        p.address,
        p.postal_code,
        p.address_number,
        p.address_complement,
        p.neighborhood,
        p.city,
        p.state,
        p.country,
        p.access_profile,
        p.profile_id,
        pr.role as access_role,
        pr.active as access_active,
        coalesce((select array_agg(cell.id) from public.groups cell where cell.company_id = p.company_id and cell.type = 'cell' and cell.leader_person_id = p.id and cell.is_active = true and cell.deleted_at is null), '{}')::uuid[] as cell_ids,
        p.internal_notes,
        p.status,
        p.person_type,
        p.journey_status,
        p.baptized,
        p.email_validated,
        p.internal_notes,
        p.is_active,
        p.created_at,
        p.updated_at
        , array_remove(array[
            case when exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null) then 'child' end,
            case when exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null) then 'guardian' end
          ], null)::text[] as kids_roles
      from public.people p
      left join public.congregations c on c.id = p.congregation_id
      left join public.profiles pr on pr.id = p.profile_id
      where p.id = ${personId}
        and p.company_id = ${companyId}
        and p.deleted_at is null
      limit 1
    `,
    sql<PersonCustomFieldRow[]>`
      select
        v.id,
        f.id as field_id,
        f.name,
        f.field_type,
        f.sort_order,
        f.source_module,
        f.kids_targets,
        v.value_text,
        v.value_date,
        v.value_json
      from public.person_custom_fields f
      left join public.person_custom_field_values v
        on v.field_id = f.id
       and v.person_id = ${personId}
       and v.company_id = ${companyId}
      where f.company_id = ${companyId}
        and f.deleted_at is null
        and f.is_active = true
      order by f.sort_order, f.name
    `,
    sql<PersonActivityRow[]>`
      select
        paa.id,
        pa.id as activity_id,
        pa.description,
        pa.category,
        paa.assigned_at,
        paa.is_active
      from public.person_activity_assignments paa
      inner join public.person_activities pa on pa.id = paa.activity_id
      where paa.company_id = ${companyId}
        and paa.person_id = ${personId}
        and pa.deleted_at is null
      order by paa.is_active desc, paa.assigned_at desc
    `,
    sql<PersonJourneyStepRow[]>`
      select
        pjp.id,
        mj.id as journey_id,
        mj.name as journey_name,
        mjs.id as step_id,
        mjs.name as step_name,
        mjs.description,
        mjs.sort_order,
        coalesce(mjs.estimated_days, 7) as estimated_days,
        pjp.completed_at,
        coalesce(pjp.notes, '') as notes
      from public.member_journey_steps mjs
      inner join public.member_journeys mj on mj.id = mjs.journey_id
      left join public.person_journey_progress pjp
        on pjp.step_id = mjs.id
       and pjp.person_id = ${personId}
       and pjp.company_id = ${companyId}
      where mjs.company_id = ${companyId}
        and mjs.deleted_at is null
        and mjs.is_active = true
        and mj.deleted_at is null
        and mj.is_active = true
      order by mj.sort_order, mj.name, mjs.sort_order
    `,
    sql<{
      enrollment_id: string
      journey_id: string
      journey_name: string
      description: string
      status: "in_progress" | "completed" | "dropped"
      started_at: Date | string
      completed_at: Date | string | null
    }[]>`
      select
        pje.id as enrollment_id,
        mj.id as journey_id,
        mj.name as journey_name,
        coalesce(mj.description, '') as description,
        pje.status,
        pje.started_at,
        pje.completed_at
      from public.person_journey_enrollments pje
      inner join public.member_journeys mj on mj.id = pje.journey_id
      where pje.person_id = ${personId}
        and pje.company_id = ${companyId}
        and mj.deleted_at is null
      order by pje.started_at desc
    `,
    sql<{ id: string; name: string; description: string }[]>`
      select id, name, coalesce(description, '') as description
      from public.member_journeys
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by sort_order, name
    `,
    sql<{ id: string; description: string; category: string }[]>`
      select id, description, category
      from public.person_activities
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by category, description
    `,
    listPersonTimeline(personId, companyId),
    listPersonFollowUpTasks(personId, companyId),
  ])

  const personRow = peopleRows[0]
  if (!personRow) return null

  const stepsList = journeyStepRows.map(toJourneyStep)

  // Map enrolled journeys
  let enrolledJourneys: PersonEnrolledJourney[] = enrollmentRows.map((e) => {
    const steps = stepsList.filter((s) => s.journeyId === e.journey_id)
    const completedSteps = steps.filter((s) => s.completedAt).length
    const totalSteps = steps.length
    const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
    return {
      enrollmentId: e.enrollment_id,
      journeyId: e.journey_id,
      journeyName: e.journey_name,
      description: e.description,
      status: e.status,
      startedAt: toIso(e.started_at) ?? "",
      completedAt: e.completed_at ? toIso(e.completed_at) : null,
      progressPercent,
      steps,
    }
  })

  // If no explicit enrollments exist yet, group active journey steps as legacy fallback
  if (enrolledJourneys.length === 0 && stepsList.length > 0) {
    const grouped = new Map<string, typeof stepsList>()
    for (const st of stepsList) {
      const list = grouped.get(st.journeyId) ?? []
      list.push(st)
      grouped.set(st.journeyId, list)
    }
    enrolledJourneys = Array.from(grouped.entries()).map(([jid, steps]) => {
      const completedSteps = steps.filter((s) => s.completedAt).length
      const totalSteps = steps.length
      const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      return {
        enrollmentId: `legacy-${jid}`,
        journeyId: jid,
        journeyName: steps[0]?.journeyName ?? "Jornada",
        description: "",
        status: (progressPercent === 100 ? "completed" : "in_progress") as "completed" | "in_progress",
        startedAt: personRow.created_at ? toIso(personRow.created_at) ?? "" : "",
        completedAt: null,
        progressPercent,
        steps,
      }
    })
  }

  return {
    ...toPerson(personRow),
    internalNotes: personRow.internal_notes,
    customFields: customFieldRows.map(toCustomField),
    activities: activityRows.map(toActivity),
    journeySteps: stepsList,
    enrolledJourneys,
    availableJourneys: availableJourneysRows.map((j) => ({
      id: j.id,
      name: j.name,
      description: j.description,
    })),
    availableActivities: availableActivitiesRows.map((a) => ({
      id: a.id,
      description: a.description,
      category: a.category,
    })),
    timeline,
    followUpTasks,
  }
}

export async function listDuplicateCandidates(companyIdInput?: string | null): Promise<DuplicateCandidateItem[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const rows = await sql<DuplicateCandidateRow[]>`
    select
      dc.id,
      dc.company_id,
      primary_person.id as primary_person_id,
      primary_person.full_name as primary_full_name,
      primary_person.email as primary_email,
      primary_person.phone as primary_phone,
      primary_congregation.name as primary_congregation_name,
      primary_person.birth_date as primary_birth_date,
      duplicate_person.id as duplicate_person_id,
      duplicate_person.full_name as duplicate_full_name,
      duplicate_person.email as duplicate_email,
      duplicate_person.phone as duplicate_phone,
      duplicate_congregation.name as duplicate_congregation_name,
      duplicate_person.birth_date as duplicate_birth_date,
      dc.reason,
      dc.similarity_score,
      dc.status,
      dc.detected_at
    from public.duplicate_candidates dc
    inner join public.people primary_person on primary_person.id = dc.primary_person_id
    inner join public.people duplicate_person on duplicate_person.id = dc.duplicate_person_id
    left join public.congregations primary_congregation on primary_congregation.id = primary_person.congregation_id
    left join public.congregations duplicate_congregation on duplicate_congregation.id = duplicate_person.congregation_id
    where dc.company_id = ${companyId}
      and dc.status = 'open'
      and primary_person.deleted_at is null
      and duplicate_person.deleted_at is null
    order by dc.detected_at desc
    limit 50
  `

  return rows.map(toDuplicateCandidate)
}

export async function listPeople(filters: PeopleListFilters = {}): Promise<PeopleListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const page = clampPage(filters.page, 1, 1, 100000)
  const pageSize = clampPage(filters.pageSize, 20, 1, 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const status = filters.status && filters.status !== "all" ? filters.status : null
  const personType = filters.personType && filters.personType !== "all" ? filters.personType : null
  const congregationId = filters.congregationId && filters.congregationId !== "all" ? filters.congregationId : null
  const journeyStatus = filters.journeyStatus && filters.journeyStatus !== "all" ? filters.journeyStatus : null
  const accessProfile = filters.accessProfile && filters.accessProfile !== "all" ? filters.accessProfile : null
  const cellId = filters.cellId && filters.cellId !== "all" ? filters.cellId : null
  const baptized = filters.baptized ?? null
  const emailValidated = filters.emailValidated ?? null
  const isActive = filters.isActive ?? null
  const kidsRole = filters.kidsRole && filters.kidsRole !== "all" ? filters.kidsRole : null

  const [peopleRows, countRows] = await Promise.all([
    sql<PersonRow[]>`
      select
        p.id,
        p.company_id,
        p.congregation_id,
        c.name as congregation_name,
        p.first_name,
        p.last_name,
        p.full_name,
        p.email,
        p.phone,
        p.document,
        p.birth_date,
        p.gender,
        p.address,
        p.postal_code,
        p.address_number,
        p.address_complement,
        p.neighborhood,
        p.city,
        p.state,
        p.country,
        p.access_profile,
        p.profile_id,
        pr.role as access_role,
        pr.active as access_active,
        coalesce((
          select array_agg(distinct cell.id)
          from public.groups cell
          where cell.company_id = p.company_id
            and cell.type = 'cell'
            and cell.is_active = true
            and cell.deleted_at is null
            and (
              cell.leader_person_id = p.id
              or exists (
                select 1 from public.group_members gm
                where gm.group_id = cell.id
                  and gm.person_id = p.id
                  and gm.status = 'active'
              )
            )
        ), '{}')::uuid[] as cell_ids,
        p.status,
        p.person_type,
        p.journey_status,
        p.baptized,
        p.email_validated,
        p.is_active,
        p.created_at,
        p.updated_at,
        array_remove(array[
          case when exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null) then 'child' end,
          case when exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null) then 'guardian' end
        ], null)::text[] as kids_roles
      from public.people p
      left join public.congregations c on c.id = p.congregation_id
      left join public.profiles pr on pr.id = p.profile_id
      where p.company_id = ${companyId}
        and p.deleted_at is null
        and (${search} = '' or p.full_name ilike ${searchPattern} or coalesce(p.email, '') ilike ${searchPattern} or p.phone ilike ${searchPattern})
        and (${status}::text is null or p.status = ${status})
        and (${personType}::text is null or p.person_type = ${personType})
        and (${congregationId}::uuid is null or p.congregation_id = ${congregationId})
        and (${journeyStatus}::text is null or p.journey_status = ${journeyStatus})
        and (${accessProfile}::text is null or p.access_profile = ${accessProfile})
        and (
          ${cellId}::text is null
          or (${cellId} = 'none' and not exists (
            select 1 from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where gm.person_id = p.id and gm.status = 'active' and g.type = 'cell' and g.deleted_at is null
          ))
          or (${cellId} <> 'none' and exists (
            select 1 from public.group_members gm
            where gm.person_id = p.id and gm.status = 'active' and gm.group_id = ${cellId}::uuid
          ))
        )
        and (${baptized}::boolean is null or p.baptized = ${baptized})
        and (${emailValidated}::boolean is null or p.email_validated = ${emailValidated})
        and (${isActive}::boolean is null or p.is_active = ${isActive})
        and (
          ${kidsRole}::text is null
          or (${kidsRole} = 'any' and (
            exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null)
            or exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null)
          ))
          or (${kidsRole} = 'child' and exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null))
          or (${kidsRole} = 'guardian' and exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null))
        )
      order by p.created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<PeopleCountRow[]>`
      select count(*) as total
      from public.people p
      where p.company_id = ${companyId}
        and p.deleted_at is null
        and (${search} = '' or p.full_name ilike ${searchPattern} or coalesce(p.email, '') ilike ${searchPattern} or p.phone ilike ${searchPattern})
        and (${status}::text is null or p.status = ${status})
        and (${personType}::text is null or p.person_type = ${personType})
        and (${congregationId}::uuid is null or p.congregation_id = ${congregationId})
        and (${journeyStatus}::text is null or p.journey_status = ${journeyStatus})
        and (${accessProfile}::text is null or p.access_profile = ${accessProfile})
        and (
          ${cellId}::text is null
          or (${cellId} = 'none' and not exists (
            select 1 from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where gm.person_id = p.id and gm.status = 'active' and g.type = 'cell' and g.deleted_at is null
          ))
          or (${cellId} <> 'none' and exists (
            select 1 from public.group_members gm
            where gm.person_id = p.id and gm.status = 'active' and gm.group_id = ${cellId}::uuid
          ))
        )
        and (${baptized}::boolean is null or p.baptized = ${baptized})
        and (${emailValidated}::boolean is null or p.email_validated = ${emailValidated})
        and (${isActive}::boolean is null or p.is_active = ${isActive})
        and (
          ${kidsRole}::text is null
          or (${kidsRole} = 'any' and (
            exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null)
            or exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null)
          ))
          or (${kidsRole} = 'child' and exists (select 1 from public.kid_profiles kid where kid.person_id = p.id and kid.deleted_at is null))
          or (${kidsRole} = 'guardian' and exists (select 1 from public.kid_guardians guardian where guardian.person_id = p.id and guardian.deleted_at is null))
        )
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    people: peopleRows.map(toPerson),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getVisitorMetrics(companyIdInput?: string | null): Promise<VisitorMetrics> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const rows = await sql<{
    total: number | string
    new_count: number | string
    following_count: number | string
    converted_count: number | string
  }[]>`
    select
      count(*) filter (where person_type = 'visitor') as total,
      count(*) filter (where person_type = 'visitor' and (journey_status = 'new' or journey_status is null or journey_status = '')) as new_count,
      count(*) filter (where person_type = 'visitor' and journey_status in ('contacted', 'following')) as following_count,
      count(*) filter (where journey_status = 'converted' or (person_type = 'member' and access_profile is not null)) as converted_count
    from public.people
    where company_id = ${companyId}
      and deleted_at is null
  `

  const r = rows[0]
  return {
    total: Number(r?.total ?? 0),
    newCount: Number(r?.new_count ?? 0),
    followingCount: Number(r?.following_count ?? 0),
    convertedCount: Number(r?.converted_count ?? 0),
  }
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Fev",
  "03": "Mar",
  "04": "Abr",
  "05": "Mai",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Set",
  "10": "Out",
  "11": "Nov",
  "12": "Dez",
}

export async function getPeopleDashboardData(companyIdInput?: string | null): Promise<PeopleDashboardData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const [dashboardRows, duplicateRows, monthlyRows] = await Promise.all([
    sql<DashboardRow[]>`
      select
        count(*) as total,
        count(*) filter (where is_active = true and status = 'active') as active,
        count(*) filter (where status = 'visitor') as visitors,
        count(*) filter (where baptized = true) as baptized,
        count(*) filter (where email_validated = true) as email_validated,
        count(*) filter (where person_type = 'member') as members,
        count(*) filter (where person_type = 'leader') as leaders,
        count(*) filter (where person_type = 'volunteer') as volunteers,
        count(*) filter (where person_type = 'attendee') as attendees,
        count(*) filter (where gender = 'male') as male,
        count(*) filter (where gender = 'female') as female,
        count(*) filter (where gender not in ('male', 'female') or gender is null) as other_gender,
        count(*) filter (where birth_date is not null and extract(year from age(birth_date)) < 12) as age_child,
        count(*) filter (where birth_date is not null and extract(year from age(birth_date)) >= 12 and extract(year from age(birth_date)) <= 17) as age_teen,
        count(*) filter (where birth_date is not null and extract(year from age(birth_date)) >= 18 and extract(year from age(birth_date)) <= 29) as age_young,
        count(*) filter (where birth_date is not null and extract(year from age(birth_date)) >= 30 and extract(year from age(birth_date)) <= 59) as age_adult,
        count(*) filter (where birth_date is not null and extract(year from age(birth_date)) >= 60) as age_senior,
        count(*) filter (where birth_date is null) as age_uninformed,
        count(*) filter (where phone is null or trim(phone) = '') as missing_phone,
        count(*) filter (where email is null or trim(email) = '') as missing_email,
        count(*) filter (where birth_date is null) as missing_birth_date,
        count(*) filter (where address is null or trim(address) = '') as missing_address
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
    `,
    sql<PeopleCountRow[]>`
      select count(*) as total
      from public.duplicate_candidates
      where company_id = ${companyId}
        and status = 'open'
    `,
    sql<MonthlyRegistrationRow[]>`
      select
        to_char(date_trunc('month', created_at), 'YYYY-MM') as month_key,
        count(*) as count
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and created_at >= (date_trunc('month', now()) - interval '5 months')
      group by 1
      order by 1 asc
    `,
  ])

  const dashboard = dashboardRows[0]
  const total = toNumber(dashboard?.total)
  const active = toNumber(dashboard?.active)
  const visitors = toNumber(dashboard?.visitors)
  const baptized = toNumber(dashboard?.baptized)
  const emailValidated = toNumber(dashboard?.email_validated)
  const possibleDuplicates = toNumber(duplicateRows[0]?.total)
  const members = toNumber(dashboard?.members)
  const leaders = toNumber(dashboard?.leaders)
  const volunteers = toNumber(dashboard?.volunteers)
  const attendees = toNumber(dashboard?.attendees)

  // Last 6 months with fallback
  const now = new Date()
  const monthlyMap = new Map<string, number>()
  for (const row of monthlyRows) {
    monthlyMap.set(row.month_key, toNumber(row.count))
  }
  const monthlyRegistrations = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const key = `${y}-${m}`
    const label = `${MONTH_LABELS[m] ?? m}/${String(y).slice(2)}`
    monthlyRegistrations.push({
      month: key,
      label,
      count: monthlyMap.get(key) ?? 0,
    })
  }

  const typeDistribution = [
    { type: "member" as const, label: "Membros", count: members },
    { type: "visitor" as const, label: "Visitantes", count: visitors },
    { type: "attendee" as const, label: "Frequentadores", count: attendees },
    { type: "leader" as const, label: "Líderes", count: leaders },
    { type: "volunteer" as const, label: "Voluntários", count: volunteers },
  ]

  const genderDistribution = [
    { gender: "female", label: "Feminino", count: toNumber(dashboard?.female) },
    { gender: "male", label: "Masculino", count: toNumber(dashboard?.male) },
    { gender: "other", label: "Não informado", count: toNumber(dashboard?.other_gender) },
  ]

  const ageDistribution = [
    { group: "Crianças (0-11)", count: toNumber(dashboard?.age_child) },
    { group: "Adolescentes (12-17)", count: toNumber(dashboard?.age_teen) },
    { group: "Jovens (18-29)", count: toNumber(dashboard?.age_young) },
    { group: "Adultos (30-59)", count: toNumber(dashboard?.age_adult) },
    { group: "Idosos (60+)", count: toNumber(dashboard?.age_senior) },
    { group: "Não informada", count: toNumber(dashboard?.age_uninformed) },
  ]

  const missingPhone = toNumber(dashboard?.missing_phone)
  const missingEmail = toNumber(dashboard?.missing_email)
  const missingBirthDate = toNumber(dashboard?.missing_birth_date)
  const missingAddress = toNumber(dashboard?.missing_address)
  const completeProfiles = Math.max(0, total - Math.max(missingPhone, missingEmail, missingBirthDate))

  return {
    total,
    active,
    visitors,
    baptized,
    emailValidated,
    possibleDuplicates,
    members,
    leaders,
    volunteers,
    attendees,
    typeDistribution,
    genderDistribution,
    ageDistribution,
    monthlyRegistrations,
    dataQuality: {
      missingPhone,
      missingEmail,
      missingBirthDate,
      missingAddress,
      completeProfiles,
    },
  }
}

export async function listBirthdayPeople(
  monthInput?: number | null,
  companyIdInput?: string | null,
): Promise<BirthdayPerson[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const currentMonth = new Date().getMonth() + 1
  const targetMonth = monthInput && monthInput >= 1 && monthInput <= 12 ? Math.trunc(monthInput) : currentMonth

  const sql = getSql()
  const rows = await sql<BirthdayRow[]>`
    select
      p.id,
      p.full_name,
      p.birth_date,
      p.phone,
      p.person_type,
      c.name as congregation_name,
      extract(day from p.birth_date)::int as day,
      extract(month from p.birth_date)::int as month
    from public.people p
    left join public.congregations c on c.id = p.congregation_id
    where p.company_id = ${companyId}
      and p.deleted_at is null
      and p.birth_date is not null
      and extract(month from p.birth_date) = ${targetMonth}
    order by extract(day from p.birth_date) asc, p.full_name asc
  `

  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    birthDate: toIsoDate(r.birth_date) ?? "",
    day: r.day,
    month: r.month,
    phone: r.phone || "",
    congregationName: r.congregation_name,
    personType: r.person_type,
  }))
}

export async function getPersonFormOptions(companyIdInput?: string | null): Promise<PersonFormOptions> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const [congregations, cells, activities, journeys] = await Promise.all([
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.congregations
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.groups
      where company_id = ${companyId}
        and type = 'cell'
        and deleted_at is null
        and is_active = true
      order by name
    `,
    sql<{ id: string; description: string; category: string }[]>`
      select id, description, category
      from public.person_activities
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by category, description
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.member_journeys
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by sort_order, name
    `,
  ])

  return { congregations, cells, activities, journeys }
}

export async function listActivitiesWithCounts(
  companyIdInput?: string | null,
): Promise<PersonActivityWithCount[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const rows = await sql<{
    id: string
    company_id: string
    description: string
    category: "pastoral" | "worship" | "ministry" | "small_group" | "volunteer"
    is_active: boolean
    assigned_count: string | number
  }[]>`
    select
      pa.id,
      pa.company_id,
      pa.description,
      pa.category,
      pa.is_active,
      count(paa.id) filter (where paa.is_active = true)::int as assigned_count
    from public.person_activities pa
    left join public.person_activity_assignments paa
      on paa.activity_id = pa.id
     and paa.company_id = pa.company_id
    where pa.company_id = ${companyId}
      and pa.deleted_at is null
    group by pa.id
    order by pa.category asc, pa.description asc
  `

  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    description: r.description,
    category: r.category,
    isActive: r.is_active,
    assignedCount: Number(r.assigned_count) || 0,
  }))
}

export async function listActivityMembers(
  activityId: string,
  companyIdInput?: string | null,
) {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const rows = await sql<{
    assignment_id: string
    person_id: string
    full_name: string
    email: string | null
    phone: string
    assigned_at: Date | string
    is_active: boolean
  }[]>`
    select
      paa.id as assignment_id,
      p.id as person_id,
      p.full_name,
      p.email,
      p.phone,
      paa.assigned_at,
      paa.is_active
    from public.person_activity_assignments paa
    inner join public.people p on p.id = paa.person_id and p.deleted_at is null
    where paa.activity_id = ${activityId}
      and paa.company_id = ${companyId}
    order by paa.is_active desc, p.full_name asc
  `

  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    personId: r.person_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    assignedAt: toIso(r.assigned_at) ?? "",
    isActive: r.is_active,
  }))
}

export async function listJourneysWithSteps(
  companyIdInput?: string | null,
): Promise<MemberJourneyWithSteps[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const [journeyRows, stepRows, countRows] = await Promise.all([
    sql<{
      id: string
      company_id: string
      name: string
      description: string
      sort_order: number
      is_active: boolean
      is_auto_enroll: boolean
      auto_enroll_type: "all" | "visitor" | "member" | null
    }[]>`
      select
        id, company_id, name, coalesce(description, '') as description,
        sort_order, is_active, coalesce(is_auto_enroll, false) as is_auto_enroll,
        auto_enroll_type
      from public.member_journeys
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order asc, name asc
    `,
    sql<{
      id: string
      journey_id: string
      name: string
      description: string
      sort_order: number
      estimated_days: number
      is_active: boolean
    }[]>`
      select
        id, journey_id, name, coalesce(description, '') as description,
        sort_order, coalesce(estimated_days, 7) as estimated_days, is_active
      from public.member_journey_steps
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order asc, name asc
    `,
    sql<{ journey_id: string; count: string | number }[]>`
      select journey_id, count(*)::int as count
      from public.person_journey_enrollments
      where company_id = ${companyId}
        and status = 'in_progress'
      group by journey_id
    `,
  ])

  const countsMap = new Map(countRows.map((c) => [c.journey_id, Number(c.count) || 0]))
  const stepsByJourney = new Map<string, MemberJourneyStep[]>()
  for (const s of stepRows) {
    const list = stepsByJourney.get(s.journey_id) ?? []
    list.push({
      id: s.id,
      journeyId: s.journey_id,
      name: s.name,
      description: s.description,
      sortOrder: s.sort_order,
      estimatedDays: s.estimated_days,
      isActive: s.is_active,
    })
    stepsByJourney.set(s.journey_id, list)
  }

  return journeyRows.map((j) => ({
    id: j.id,
    companyId: j.company_id,
    name: j.name,
    description: j.description,
    sortOrder: j.sort_order,
    isActive: j.is_active,
    isAutoEnroll: j.is_auto_enroll,
    autoEnrollType: j.auto_enroll_type,
    steps: stepsByJourney.get(j.id) ?? [],
    enrolledCount: countsMap.get(j.id) ?? 0,
  }))
}
