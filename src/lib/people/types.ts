export type PersonStatus = "active" | "inactive" | "visitor"
export type PersonType = "visitor" | "attendee" | "member" | "leader" | "volunteer"
export type PersonGender = "male" | "female" | "other" | "not_informed"
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
  | "reader"

export interface PeopleListFilters {
  companyId?: string | null
  search?: string
  status?: PersonStatus | "all"
  personType?: PersonType | "all"
  congregationId?: string | "all"
  baptized?: boolean | null
  emailValidated?: boolean | null
  isActive?: boolean | null
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
  city: string
  state: string
  country: string
  accessProfile: string | null
  profileId: string | null
  accessRole: PersonAccessRole | null
  accessActive: boolean | null
  hasSystemAccess: boolean
  internalNotes?: string
  status: PersonStatus
  personType: PersonType
  journeyStatus: string
  baptized: boolean
  emailValidated: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PersonCustomFieldValue {
  id: string | null
  fieldId: string
  name: string
  fieldType: "text" | "date" | "single" | "multiple"
  value: string
  sortOrder: number
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
}

export interface InvitePersonAccessInput {
  personId: string
  companyId?: string | null
  role: PersonAccessRole
  temporaryPassword: string
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
