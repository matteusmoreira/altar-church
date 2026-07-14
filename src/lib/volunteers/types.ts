export type VolunteerRegistrationStatus = "pending" | "active" | "inactive" | "suspended"
export type VolunteerScheduleStatus = "draft" | "published" | "archived"
export type VolunteerAssignmentStatus = "assigned" | "confirmed" | "declined" | "cancelled" | "checked_in"
export type CheckinSource = "button" | "qr"
export type FeedStatus = "draft" | "published" | "archived"

export interface VolunteerDepartment {
  id: string
  name: string
  description: string
  managerProfileId: string | null
  active: boolean
}

export interface VolunteerMembership {
  id: string
  departmentId: string
  departmentName: string
  roleName: string
  active: boolean
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
}

export interface TemplateSlot {
  id: string
  departmentId: string
  departmentName: string
  roleName: string
  requiredVolunteers: number
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

export interface VolunteerDashboardData {
  volunteers: VolunteerListItem[]
  departments: VolunteerDepartment[]
  templates: VolunteerTemplate[]
  schedules: VolunteerSchedule[]
  feedPosts: VolunteerFeedPost[]
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
}

export interface VolunteerActionResult {
  ok: boolean
  id?: string
  error?: string
  qrToken?: string
}
