export interface SocialLinkItem {
  id: string | null
  platform: string
  url: string
  sortOrder: number
  isActive: boolean
}

export interface ChurchProfileData {
  id: string | null
  companyId: string
  companyName: string
  publicName: string
  responsibleName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  country: string
  timezone: string
  history: string
  logoFileId: string | null
  logoFileName: string
  coverFileId: string | null
  coverFileName: string
}

export interface ChurchInfoMinistry {
  id: string
  name: string
  leaderName: string
  memberCount: number
  isActive: boolean
}

export interface ChurchInfoProgramming {
  id: string
  title: string
  startsAt: string | null
  isLive: boolean
  isActive: boolean
}

export interface ChurchInfoSong {
  id: string
  title: string
  author: string
  theme: string
  tone: string
  isActive: boolean
}

export interface ChurchInfoCongregation {
  id: string
  name: string
  responsible: string
  address: string
  isActive: boolean
}

export interface ChurchInfoData {
  profile: ChurchProfileData
  socialLinks: SocialLinkItem[]
  ministries: ChurchInfoMinistry[]
  programmings: ChurchInfoProgramming[]
  songs: ChurchInfoSong[]
  congregations: ChurchInfoCongregation[]
}

export interface SaveChurchInfoInput {
  companyId?: string | null
  publicName: string
  responsibleName?: string
  email: string
  phone?: string
  website?: string
  address?: string
  city?: string
  state?: string
  country?: string
  timezone?: string
  history?: string
  socialLinks: Omit<SocialLinkItem, "id">[]
}

export interface ChurchInfoActionResult {
  ok: boolean
  id?: string
  error?: string
}
