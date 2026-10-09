export type MinistryMembershipStatus = "pending" | "active" | "rejected" | "inactive"

export interface MemberPortalSummary {
  memberName: string
  churchName: string
  cellCount: number
  cellCheckinCount: number
  ministryCount: number
  childrenCount: number
  scaleNotices: {
    id: string
    eventTitle: string
    departmentName: string
    roleName: string
    startsAt: string
    instructions: string
  }[]
  nextMeeting: {
    title: string
    cellName: string
    startsAt: string
  } | null
  notices: {
    id: string
    title: string
    content: string
    publishedAt: string
  }[]
  recentCellCheckins: {
    id: string
    cellName: string
    meetingTitle: string
    checkedInAt: string
    source: "qr" | "manual"
  }[]
}

export interface MemberMinistryItem {
  id: string
  slug?: string
  name: string
  description: string
  contact: string
  leaderName: string | null
  memberCount: number
  membershipId: string | null
  membershipRole: "member" | "leader" | "coordinator" | null
  membershipStatus: MinistryMembershipStatus | null
  isActive: boolean
  canManage: boolean
  onboardingCompleted: number
  onboardingTotal: number
  onboardingPercent: number
}

export interface MemberPortalCapabilities {
  hasVolunteerPortal: boolean
}

export interface MemberAgendaEvent {
  registrationMode?: "internal" | "external"
  externalPlatform?: string
  externalTicketUrl?: string
  valueCents?: number
  id: string
  title: string
  description: string
  type: string
  ministryName: string | null
  ministryId: string | null
  ministrySlug?: string | null
  canManageMinistry: boolean
  scale: MemberScaleItem[]
  startsAt: string
  endsAt: string | null
  location: string
  externalLink: string | null
  maxCapacity: number | null
  goingCount: number
  waitlistedCount: number
  confirmedPeople: string[]
  myStatus: "going" | "waitlisted" | "canceled" | null
  canRsvp: boolean
}

export interface MemberScaleItem {
  id: string
  assignmentId?: string | null
  role: string
  instructions: string
  startsAt: string
  endsAt: string | null
  personName: string | null
  status: string | null
  isMine: boolean
  declineReason?: string | null
  canDecline?: boolean
}
export interface MemberMinistryActivity {
  id: string; title: string; description: string; startsAt: string; endsAt: string | null; location: string; recurring: boolean; scale: MemberScaleItem[]
}
export interface MemberMinistryDetails {
  id: string; name: string; description: string; leaderName: string | null; contact: string; meetingDay: number | null; meetingTime: string | null; meetingLocation: string
  resources: { id: string; title: string; description: string; category: string; fileName: string | null; mimeType: string | null; fileUrl: string | null; externalUrl: string | null }[]
  activities: MemberMinistryActivity[]; nextCursor: string | null
}

export interface MemberProfile {
  id: string
  fullName: string
  email: string | null
  phone: string
  birthDate: string | null
  congregationId: string | null
  address: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  postalCode: string
}

export interface MinistryMembershipAdminItem {
  id: string
  ministryId: string
  ministryName: string
  personId: string
  personName: string
  role: "member" | "leader" | "coordinator"
  status: MinistryMembershipStatus
  requestedAt: string
  reviewedAt: string | null
}
