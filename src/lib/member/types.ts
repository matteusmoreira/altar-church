export type MinistryMembershipStatus = "pending" | "active" | "rejected" | "inactive"

export interface MemberPortalSummary {
  memberName: string
  churchName: string
  cellCount: number
  cellCheckinCount: number
  ministryCount: number
  childrenCount: number
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
  name: string
  description: string
  contact: string
  leaderName: string | null
  memberCount: number
  membershipId: string | null
  membershipRole: "member" | "leader" | null
  membershipStatus: MinistryMembershipStatus | null
  isActive: boolean
  canManage: boolean
}

export interface MemberPortalCapabilities {
  hasVolunteerPortal: boolean
}

export interface MemberAgendaEvent {
  id: string
  title: string
  description: string
  type: string
  startsAt: string
  endsAt: string | null
  location: string
  externalLink: string | null
  maxCapacity: number | null
  goingCount: number
  waitlistedCount: number
  myStatus: "going" | "waitlisted" | "canceled" | null
  canRsvp: boolean
}

export interface MemberProfile {
  id: string
  fullName: string
  email: string | null
  phone: string
  birthDate: string | null
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
  role: "member" | "leader"
  status: MinistryMembershipStatus
  requestedAt: string
  reviewedAt: string | null
}
