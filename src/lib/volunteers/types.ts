export type VolunteerRegistrationStatus = "pending" | "active" | "inactive" | "suspended"
export type VolunteerScheduleStatus = "draft" | "published" | "archived"
export type VolunteerAssignmentStatus = "proposed" | "notified" | "confirmed" | "declined" | "cancelled" | "checked_in" | "checked_out" | "no_show"
export type CheckinSource = "button" | "qr" | "manual"
export type FeedStatus = "draft" | "published" | "archived"
export type DepartmentAccessRole = "coordinator" | "leader" | "scheduler"
export type VolunteerSwapStatus = "open" | "offered" | "accepted" | "approved" | "rejected" | "cancelled"

export interface VolunteerDepartment {
  id: string
  name: string
  description: string
  managerProfileId: string | null
  active: boolean
  roles?: VolunteerDepartmentRole[]
  access?: VolunteerDepartmentAccess[]
}

export interface VolunteerDepartmentRole {
  id: string
  departmentId: string
  name: string
  description: string
  instructions: string
  active: boolean
}

export interface VolunteerDepartmentAccess {
  id: string
  departmentId: string
  profileId: string
  profileName: string
  role: DepartmentAccessRole
}

export interface VolunteerMembership {
  id: string
  departmentId: string
  departmentName: string
  roleName: string
  roleId?: string | null
  preferred?: boolean
  active: boolean
}

export interface VolunteerPersonSuggestion {
  id: string
  fullName: string
  email: string | null
  phone: string
  personType: string
  volunteerId: string | null
}

export interface VolunteerListItem {
  id: string
  personId: string
  profileId: string | null
  name: string
  email: string | null
  phone: string
  status: VolunteerRegistrationStatus
  active: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  departmentNames: string[]
  assignments: number
  checkins: number
  lastParticipationAt: string | null
  desiredServicesPerMonth: number
  maxServicesPerMonth: number
  minimumRestHours: number
  validatedAt: string | null
  memberships?: VolunteerMembership[]
}

export interface VolunteerAvailabilityRule {
  id: string
  weekday: number
  available: boolean
  startsAt: string | null
  endsAt: string | null
  validFrom: string | null
  validUntil: string | null
}

export interface VolunteerAvailabilityException {
  id: string
  startsAt: string
  endsAt: string
  available: boolean
  reason: string
}

export interface VolunteerRolePreference {
  id: string
  departmentId: string
  roleId: string | null
  roleName: string
  preference: -2 | -1 | 0 | 1 | 2
}

export interface VolunteerAvailability {
  rules: VolunteerAvailabilityRule[]
  exceptions: VolunteerAvailabilityException[]
  preferences: VolunteerRolePreference[]
  desiredServicesPerMonth: number
  maxServicesPerMonth: number
  minimumRestHours: number
}

export interface TemplateSlot {
  id: string
  departmentId: string
  departmentName: string
  roleId: string
  roleName: string
  requiredVolunteers: number
  instructions: string
}

export interface VolunteerTemplate {
  id: string
  name: string
  description: string
  active: boolean
  slots: TemplateSlot[]
}

export interface VolunteerAssignment {
  id: string
  volunteerId: string
  volunteerName: string
  status: VolunteerAssignmentStatus
  checkedInAt: string | null
  checkedOutAt: string | null
  score: number | null
  scoreReasons: SchedulingReason[]
  locked: boolean
  declineReason: string | null
}

export interface SchedulingReason {
  code: "available" | "preferred_role" | "balanced_load" | "rest_ok" | "weekend_balance" | "recent_role" | "manual" | "locked"
  label: string
  points: number
}

export interface SchedulingCandidate {
  volunteerId: string
  volunteerName: string
  eligible: boolean
  score: number
  reasons: SchedulingReason[]
  blockers: string[]
}

export interface VolunteerShift {
  id: string
  eventId: string | null
  eventTitle: string
  departmentId: string
  departmentName: string
  roleName: string
  requiredVolunteers: number
  startsAt: string
  endsAt: string | null
  checkinOpensAt: string
  checkinClosesAt: string
  assignments: VolunteerAssignment[]
  instructions: string
  candidates?: SchedulingCandidate[]
}

export interface VolunteerSchedule {
  id: string
  month: string
  status: VolunteerScheduleStatus
  publishedAt: string | null
  shifts: VolunteerShift[]
}

export interface VolunteerFeedPost {
  id: string
  title: string
  content: string
  status: FeedStatus
  audience: "all" | "departments"
  departmentIds: string[]
  publishedAt: string | null
  createdAt: string
  unread?: boolean
}

export interface VolunteerSwapRequest {
  id: string
  assignmentId: string
  requestedByVolunteerId: string
  replacementVolunteerId: string | null
  replacementName: string | null
  status: VolunteerSwapStatus
  reason: string
  createdAt: string
}

export interface VolunteerChatMessage {
  id: string
  conversationId: string
  senderProfileId: string
  senderName: string
  body: string
  createdAt: string
  files: { id: string; name: string; url?: string }[]
}

export interface VolunteerFeedback {
  id: string
  assignmentId: string
  rating: number
  loadRating: number
  comment: string
  requestContact: boolean
  createdAt: string
}

export interface VolunteerRecognition {
  id: string
  volunteerId: string
  kind: "milestone" | "thanks" | "achievement"
  title: string
  message: string
  milestone: number | null
  grantedAt: string
}

export interface VolunteerNotificationPreferences {
  scheduleEnabled: boolean
  reminderEnabled: boolean
  swapEnabled: boolean
  chatEnabled: boolean
  feedEnabled: boolean
  recognitionEnabled: boolean
  pushEnabled: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
}

export interface VolunteerModuleSettings {
  v2Enabled: boolean
  timezone: string
  requireSwapApproval: boolean
  reminderHours: number[]
}

export interface VolunteerSetlistItem {
  id: string
  songId: string | null
  title: string
  tone: string
  responsibleProfileId: string | null
  notes: string
  spotifyUrl: string
  deezerUrl: string
  cifraClubUrl: string
  sortOrder: number
}

export interface VolunteerTimelineItem {
  id: string
  title: string
  plannedAt: string
  actualStartedAt: string | null
  durationMinutes: number
  responsibleProfileId: string | null
  instructions: string
  sortOrder: number
}

export interface VolunteerEventPlan {
  eventId: string
  eventTitle: string
  startsAt: string
  schedulePublishedAt: string | null
  setlistId: string | null
  setlistTitle: string
  setlistNotes: string
  setlistItems: VolunteerSetlistItem[]
  timeline: VolunteerTimelineItem[]
  positions: {
    id: string
    departmentId: string
    departmentName: string
    roleId: string
    roleName: string
    requiredVolunteers: number
    instructions: string
  }[]
}

export interface VolunteerReportData {
  confirmationRate: number
  attendanceRate: number
  declineRate: number
  noShowRate: number
  overloadedVolunteers: number
  inactiveVolunteers: number
  openSwaps: number
  deliveryFailures: number
  departmentCoverage: { departmentId: string; departmentName: string; required: number; filled: number }[]
}

export interface VolunteerDashboardData {
  volunteers: VolunteerListItem[]
  departments: VolunteerDepartment[]
  templates: VolunteerTemplate[]
  schedules: VolunteerSchedule[]
  feedPosts: VolunteerFeedPost[]
  eventPlans: VolunteerEventPlan[]
  swaps: VolunteerSwapRequest[]
  reports: VolunteerReportData
  v2Enabled: boolean
  settings: VolunteerModuleSettings
  songs: { id: string; title: string; tone: string; content: string }[]
  metrics: {
    activeVolunteers: number
    assignedThisMonth: number
    openVacancies: number
    checkinsThisMonth: number
    monthlyGrowth: number
  }
}

export interface VolunteerPortalData {
  volunteer: VolunteerListItem
  upcomingAssignments: VolunteerShift[]
  feedPosts: VolunteerFeedPost[]
  availability: VolunteerAvailability
  swaps: VolunteerSwapRequest[]
  recognitions: VolunteerRecognition[]
  notificationPreferences: VolunteerNotificationPreferences
  eventPlans: VolunteerEventPlan[]
}

export interface VolunteerActionResult {
  ok: boolean
  id?: string
  error?: string
  qrToken?: string
  data?: unknown
}
