export type MinistryMembershipStatus = "pending" | "active" | "rejected" | "inactive"

export interface MemberPortalSummary {
  memberName: string
  churchName: string
  cellCount: number
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
