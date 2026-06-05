export type GroupType = "cell" | "ministry" | "department" | "class"
export type GroupMemberRole = "member" | "leader" | "co_leader" | "host" | "visitor"
export type GroupMemberStatus = "active" | "inactive" | "pending"
export type GroupStudyType = "dynamic" | "lesson" | "preaching"

export interface GroupCategory {
  id: string
  companyId: string
  name: string
  description: string
  sortOrder: number
  isActive: boolean
}

export interface GroupListFilters {
  companyId?: string | null
  search?: string
  categoryId?: string | "all"
  type?: GroupType | "all"
  isActive?: boolean | null
  meetingDay?: string | "all"
  page?: number
  pageSize?: number
}

export interface GroupListItem {
  id: string
  companyId: string
  categoryId: string | null
  categoryName: string | null
  congregationId: string | null
  congregationName: string | null
  name: string
  description: string
  type: GroupType
  leaderPersonId: string | null
  leaderName: string | null
  coLeaderPersonId: string | null
  coLeaderName: string | null
  coordinatorPersonId: string | null
  coordinatorName: string | null
  meetingDay: string
  meetingTime: string | null
  meetingLocation: string
  neighborhood: string
  city: string
  maxCapacity: number
  minAge: number | null
  maxAge: number | null
  acceptsRequests: boolean
  isActive: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface GroupListResult {
  groups: GroupListItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface GroupDashboardData {
  total: number
  active: number
  inactive: number
  members: number
  capacity: number
  openCapacity: number
}

export interface GroupStudy {
  id: string
  companyId: string
  title: string
  contentType: GroupStudyType
  content: string
  scriptureRef: string
  isActive: boolean
}

export interface GroupMeeting {
  id: string
  groupId: string
  groupName: string
  studyId: string | null
  studyTitle: string | null
  title: string
  startsAt: string
  endsAt: string | null
  location: string
  notes: string
  reportStatus: "scheduled" | "reported" | "cancelled"
  presentCount: number
  visitorCount: number
}

export interface GroupMember {
  id: string
  groupId: string
  groupName: string
  personId: string
  personName: string
  role: GroupMemberRole
  status: GroupMemberStatus
  joinedAt: string
  leftAt: string | null
}

export interface GroupFormOptions {
  categories: GroupCategory[]
  congregations: { id: string; name: string }[]
  people: { id: string; fullName: string }[]
  studies: GroupStudy[]
}

export interface SaveGroupInput {
  id?: string | null
  companyId?: string | null
  categoryId?: string | null
  congregationId?: string | null
  name: string
  description?: string
  type?: GroupType
  leaderPersonId?: string | null
  coLeaderPersonId?: string | null
  coordinatorPersonId?: string | null
  meetingDay?: string
  meetingTime?: string | null
  meetingLocation?: string
  neighborhood?: string
  city?: string
  maxCapacity?: number
  minAge?: number | null
  maxAge?: number | null
  acceptsRequests?: boolean
  isActive?: boolean
}

export interface SaveGroupMemberInput {
  id?: string | null
  companyId?: string | null
  groupId: string
  personId: string
  role?: GroupMemberRole
  status?: GroupMemberStatus
  joinedAt?: string
}

export interface SaveGroupMeetingInput {
  id?: string | null
  companyId?: string | null
  groupId: string
  studyId?: string | null
  title?: string
  startsAt: string
  endsAt?: string | null
  location?: string
  notes?: string
  reportStatus?: "scheduled" | "reported" | "cancelled"
  presentCount?: number
  visitorCount?: number
}

export interface GroupsActionResult {
  ok: boolean
  id?: string
  error?: string
}
