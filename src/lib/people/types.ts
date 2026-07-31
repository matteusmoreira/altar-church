export type PersonStatus = "active" | "inactive" | "visitor"
export type PersonType = "visitor" | "attendee" | "member" | "leader" | "volunteer"
export type PersonGender = "male" | "female" | "other" | "not_informed"
export type PersonKidsRole = "child" | "guardian"
export type DuplicateCandidateStatus = "open" | "ignored" | "merged"
export type DuplicateCandidateResolution = Exclude<DuplicateCandidateStatus, "open">
export type PersonAccessRole =
  | "admin"
  | "pastor"
  | "ministry_leader"
  | "cell_supervisor"
  | "cell_leader"
  | "communication"
  | "finance"
  | "volunteer"
  | "member"

export interface PeopleListFilters {
  companyId?: string | null
  search?: string
  status?: PersonStatus | "all"
  personType?: PersonType | "all"
  congregationId?: string | "all"
  baptized?: boolean | null
  emailValidated?: boolean | null
  isActive?: boolean | null
  kidsRole?: PersonKidsRole | "any" | "all"
  page?: number
  pageSize?: number
}

export interface PersonListItem {
  id: string
  companyId: string
  congregationId: string | null
  congregationName: string | null
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string
  document: string | null
  birthDate: string | null
  gender: PersonGender | null
  address: string
  postalCode: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  country: string
  accessProfile: string | null
  profileId: string | null
  accessRole: PersonAccessRole | null
  accessActive: boolean | null
  hasSystemAccess: boolean
  cellIds: string[]
  internalNotes?: string
  status: PersonStatus
  personType: PersonType
  journeyStatus: string
  baptized: boolean
  emailValidated: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  kidsRoles: PersonKidsRole[]
}

export interface PersonCustomFieldValue {
  id: string | null
  fieldId: string
  name: string
  fieldType: "text" | "textarea" | "number" | "date" | "single" | "multiple" | "boolean"
  value: string
  sortOrder: number
  sourceModule: "people" | "kids"
  kidsTargets: PersonKidsRole[]
}

export interface PersonActivityDetail {
  id: string
  activityId: string
  description: string
  category: string
  assignedAt: string
  isActive: boolean
}

export interface PersonJourneyStepDetail {
  id: string | null
  journeyId: string
  journeyName: string
  stepId: string
  stepName: string
  description: string
  sortOrder: number
  completedAt: string | null
  notes: string
}

export interface PersonDetail extends PersonListItem {
  internalNotes: string
  customFields: PersonCustomFieldValue[]
  activities: PersonActivityDetail[]
  journeySteps: PersonJourneyStepDetail[]
  timeline: PersonTimelineItem[]
  followUpTasks: PersonFollowUpTask[]
}

export type PersonTimelineKind =
  | "person"
  | "attendance"
  | "cell"
  | "ministry"
  | "kids"
  | "volunteer"
  | "crm"
  | "prayer"
  | "communication"
  | "audit"

export interface PersonTimelineItem {
  id: string
  kind: PersonTimelineKind
  title: string
  description: string
  occurredAt: string
  source: string
}

export type PersonFollowUpPriority = "low" | "normal" | "high" | "urgent"
export type PersonFollowUpStatus = "open" | "in_progress" | "completed" | "canceled"

export interface PersonFollowUpTask {
  id: string
  personId: string
  personName: string
  title: string
  notes: string
  dueAt: string | null
  priority: PersonFollowUpPriority
  status: PersonFollowUpStatus
  origin: "manual" | "public_form" | "new_visitor" | "visitor_without_contact" | "recurring_absence" | "new_prayer_request" | "without_cell" | "without_portal_access" | string
  responsibleProfileId: string | null
  responsibleName: string | null
  crmCardId: string | null
  createdAt: string
  completedAt: string | null
}

export interface PersonFollowUpTrigger {
  id: string
  triggerKind: string
  name: string
  isActive: boolean
  config: Record<string, unknown>
}

export interface DuplicatePersonSummary {
  id: string
  fullName: string
  email: string | null
  phone: string
  congregationName: string | null
  birthDate: string | null
}

export interface DuplicateCandidateItem {
  id: string
  companyId: string
  primaryPerson: DuplicatePersonSummary
  duplicatePerson: DuplicatePersonSummary
  reason: string
  similarityScore: number
  status: DuplicateCandidateStatus
  detectedAt: string
}

export interface PeopleListResult {
  people: PersonListItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface PeopleDashboardData {
  total: number
  active: number
  visitors: number
  baptized: number
  emailValidated: number
  possibleDuplicates: number
}

export interface PersonFormOptions {
  congregations: { id: string; name: string }[]
  cells: { id: string; name: string }[]
  activities: { id: string; description: string; category: string }[]
  journeys: { id: string; name: string }[]
}

export interface SavePersonInput {
  id?: string | null
  companyId?: string | null
  congregationId?: string | null
  firstName: string
  lastName?: string
  fullName?: string
  email?: string | null
  phone?: string
  document?: string | null
  birthDate?: string | null
  gender?: PersonGender | null
  address?: string
  postalCode?: string
  addressNumber?: string
  addressComplement?: string
  neighborhood?: string
  city?: string
  state?: string
  country?: string
  accessProfile?: string | null
  status?: PersonStatus
  personType?: PersonType
  journeyStatus?: string
  baptized?: boolean
  emailValidated?: boolean
  internalNotes?: string
  isActive?: boolean
  inviteAccess?: boolean
  accessRole?: PersonAccessRole
  temporaryPassword?: string
  cellIds?: string[]
}

export interface InvitePersonAccessInput {
  personId: string
  companyId?: string | null
  role: PersonAccessRole
  temporaryPassword: string
  cellIds?: string[]
}

export interface DuplicateCandidateActionInput {
  id: string
  companyId?: string | null
  status: DuplicateCandidateResolution
}

export interface PeopleActionResult {
  ok: boolean
  id?: string
  error?: string
}
