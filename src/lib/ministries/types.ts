import type { UserRole } from "@/lib/types"

export type MinistryType = "worship" | "kids" | "youth" | "care" | "discipleship" | "outreach" | "administration" | "other"
export type MinistryMembershipRole = "member" | "leader" | "coordinator"
export type MinistryMembershipStatus = "pending" | "active" | "rejected" | "inactive"
export type MinistryOrigin = "ministry_absence" | "ministry_onboarding" | "ministry_manual"
export type MinistryScaleStatus = "draft" | "incomplete" | "ready" | "published"

export interface MinistryProfile {
  id: string
  companyId: string
  name: string
  slug: string
  ministryType: MinistryType
  mission: string
  description: string
  targetAudience: string
  contact: string
  leaderPersonId: string | null
  leaderName: string | null
  meetingDay: number | null
  meetingTime: string | null
  meetingLocation: string
  imageFileId: string | null
  publicJoinEnabled: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MinistryMember {
  id: string
  personId: string
  personName: string
  email: string
  phone: string
  role: MinistryMembershipRole
  status: MinistryMembershipStatus
  joinedAt: string | null
  leftAt: string | null
  teamNames: string[]
  hasPortal: boolean
}

export interface MinistryTeam {
  id: string
  name: string
  description: string
  leaderPersonId: string | null
  leaderName: string | null
  coLeaderPersonId: string | null
  coLeaderName: string | null
  coordinatorPersonId: string | null
  coordinatorName: string | null
  meetingDay: string
  meetingTime: string | null
  meetingLocation: string
  maxCapacity: number
  memberCount: number
  openSlots: number
  isActive: boolean
}

export interface MinistryTeamMember {
  id: string
  groupId: string
  personId: string
  personName: string
  role: "member" | "leader" | "co_leader" | "host"
}

export interface MinistryAvailablePerson {
  id: string
  fullName: string
  email: string
  phone: string
  membershipStatus: MinistryMembershipStatus | null
  membershipRole: MinistryMembershipRole | null
}

export interface MinistryActivity {
  id: string
  programmingId: string | null
  title: string
  description: string
  programmingStartsAt: string
  durationMinutes: number
  recurrenceFrequency: "none" | "weekly" | "monthly"
  recurrenceWeekdays: number[]
  startsAt: string
  endsAt: string | null
  location: string
  status: string
  recurring: boolean
  attendanceCount: number
  volunteerPositions: number
  assignedVolunteers: number
  scaleComplete: boolean
}

export interface MinistryScaleAssignment {
  id: string
  personId: string
  personName: string
  volunteerId: string
  status: string
}

export interface MinistryScalePosition {
  id: string
  shiftId: string | null
  roleName: string
  requiredVolunteers: number
  assignedVolunteers: number
  missingVolunteers: number
  instructions: string
  assignments: MinistryScaleAssignment[]
}

export interface MinistryScale {
  eventId: string
  eventTitle: string
  startsAt: string
  scheduleId: string | null
  scheduleStatus: "draft" | "published" | "archived" | null
  publishedAt: string | null
  status: MinistryScaleStatus
  positions: MinistryScalePosition[]
}

export interface MinistryScaleCandidate {
  personId: string
  personName: string
  volunteerId: string | null
  selectableManually: boolean
  eligible: boolean
  score: number
  warnings: string[]
  blockers: string[]
}

export interface MinistryAttendanceSummary {
  day: string
  present: number
  absent: number
  justified: number
}

export interface MinistryAttendanceRecord {
  id: string
  eventId: string
  eventTitle: string
  personId: string | null
  personName: string
  occurredOn: string
  status: string
}

export interface MinistryAlert {
  kind: "leader_missing" | "team_without_leader" | "activity_without_scale" | "follow_up_overdue"
  label: string
  count: number
  href: string
}

export interface MinistryWorkspace {
  profile: MinistryProfile
  actorRole: UserRole
  canManage: boolean
  indicators: {
    activeMembers: number
    pendingMembers: number
    inactiveMembers: number
    activeTeams: number
    openTeamSlots: number
    upcomingActivities: number
    attendancePresent30d: number
    attendanceAbsent30d: number
    incompleteScales: number
    openFollowUps: number
    overdueFollowUps: number
  }
  activities: MinistryActivity[]
  attendance: MinistryAttendanceSummary[]
  alerts: MinistryAlert[]
  lastCommunication: { id: string; title: string; status: string; createdAt: string } | null
}

export interface MinistryReport {
  membersByStatus: { status: string; total: number }[]
  membersByMonth: { month: string; total: number }[]
  attendance: { status: string; total: number }[]
  teamParticipation: { teamId: string; teamName: string; total: number }[]
  volunteerHours: number
  filledScales: number
  openFollowUps: number
  completedFollowUps: number
  communication: { status: string; total: number }[]
  retention: { activeAt30d: number; currentActive: number; rate: number }
}

export interface MinistryOnboardingItem {
  membershipId: string
  personId: string
  personName: string
  templateId: string | null
  templateName: string | null
  completed: number
  total: number
  percent: number
}

export interface MinistryOnboardingStep {
  id: string
  title: string
  description: string
  sortOrder: number
  isRequired: boolean
}

export interface MinistryOnboardingTemplate {
  id: string
  name: string
  description: string
  isActive: boolean
  steps: MinistryOnboardingStep[]
}

export interface MinistryResource {
  id: string
  title: string
  description: string
  category: string
  fileId: string | null
  fileName: string | null
  fileUrl: string | null
  externalUrl: string | null
  visibility: "leaders" | "members" | "public"
  sortOrder: number
}

export interface MinistryCommunication {
  id: string
  title: string
  status: string
  method: string
  audienceKind: string
  snapshotCount: number
  createdAt: string
}

export interface MinistryWorkspaceData {
  workspace: MinistryWorkspace
  members: MinistryMember[]
  teams: MinistryTeam[]
  teamMembers: MinistryTeamMember[]
  agenda: MinistryActivity[]
  attendanceRecords: MinistryAttendanceRecord[]
  scales: MinistryScale[]
  followUps: MinistryFollowUp[]
  onboarding: MinistryOnboardingItem[]
  onboardingTemplates: MinistryOnboardingTemplate[]
  resources: MinistryResource[]
  communications: MinistryCommunication[]
  report: MinistryReport
  people: MinistryAvailablePerson[]
  leaderCandidates: { id: string; fullName: string }[]
  responsibleCandidates: { id: string; fullName: string }[]
}

export interface MinistryFollowUp {
  id: string
  personId: string
  personName: string
  title: string
  notes: string
  dueAt: string | null
  priority: string
  status: string
  origin: string
  responsibleProfileId: string | null
  responsibleName: string | null
}
