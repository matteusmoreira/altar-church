export interface PastoralListFilters {
  companyId?: string | null
  search?: string
  isActive?: boolean | null
  page?: number
  pageSize?: number
}

export interface PastoralListResult<TItem> {
  items: TItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface MinistryListItem {
  id: string
  companyId: string
  name: string
  description: string
  contact: string
  leaderName: string
  leaderPersonId: string | null
  memberCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProgrammingListItem {
  id: string
  companyId: string
  title: string
  description: string
  date: string
  durationMinutes: number
  isRecurring: boolean
  isLive: boolean
  allowPublicChat: boolean
  sendPushNotification: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface SongListItem {
  id: string
  companyId: string
  title: string
  subtitle: string
  code: string
  author: string
  theme: string
  group: string
  tone: string
  rhythm: string
  content: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type MinistriesListResult = PastoralListResult<MinistryListItem>
export type ProgrammingsListResult = PastoralListResult<ProgrammingListItem>
export type SongsListResult = PastoralListResult<SongListItem>

export interface SaveMinistryInput {
  id?: string | null
  companyId?: string | null
  name: string
  description?: string
  contact?: string
  leaderPersonId?: string | null
  isActive?: boolean
}

export interface SaveProgrammingInput {
  id?: string | null
  companyId?: string | null
  title: string
  description?: string
  date?: string
  durationMinutes?: number
  isRecurring?: boolean
  isLive?: boolean
  allowPublicChat?: boolean
  sendPushNotification?: boolean
  isActive?: boolean
}

export interface SaveSongInput {
  id?: string | null
  companyId?: string | null
  title: string
  subtitle?: string
  code?: string
  author?: string
  theme?: string
  group?: string
  tone?: string
  rhythm?: string
  content?: string
  isActive?: boolean
}

export interface PastoralActionResult {
  ok: boolean
  id?: string
  error?: string
}
