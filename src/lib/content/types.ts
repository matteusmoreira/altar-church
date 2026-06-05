export type ContentType = "news" | "devotional" | "ebd" | "publication"
export type ContentStatus = "draft" | "published" | "archived"

export interface ContentCategory {
  id: string
  companyId: string
  name: string
  slug: string
  description: string
  contentType: ContentType | null
  sortOrder: number
  isActive: boolean
}

export interface ContentPost {
  id: string
  companyId: string
  categoryId: string | null
  categoryName: string | null
  type: ContentType
  title: string
  slug: string
  summary: string
  content: string
  authorName: string
  embedUrl: string
  coverFileId: string | null
  coverFileName: string
  coverImageUrl: string
  status: ContentStatus
  scheduledPublishAt: string | null
  publishedAt: string | null
  sendPushNotification: boolean
  createdAt: string
  updatedAt: string
}

export interface ContentBanner {
  id: string
  companyId: string
  title: string
  imageFileId: string | null
  imageFileName: string
  imageUrl: string
  linkUrl: string
  sortOrder: number
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  showInApps: boolean
  showInWeb: boolean
  createdAt: string
  updatedAt: string
}

export interface ContentDashboardData {
  categories: ContentCategory[]
  posts: ContentPost[]
  banners: ContentBanner[]
}

export interface SaveContentPostInput {
  id?: string | null
  companyId?: string | null
  categoryId?: string | null
  type: ContentType
  title: string
  slug?: string
  summary?: string
  content: string
  authorName?: string
  embedUrl?: string
  coverFileId?: string | null
  coverImageUrl?: string
  status: ContentStatus
  scheduledPublishAt?: string | null
  publishedAt?: string | null
  sendPushNotification?: boolean
}

export interface SaveContentBannerInput {
  id?: string | null
  companyId?: string | null
  title: string
  imageFileId?: string | null
  imageUrl?: string
  linkUrl?: string
  sortOrder?: number
  startsAt?: string | null
  endsAt?: string | null
  isActive?: boolean
  showInApps?: boolean
  showInWeb?: boolean
}

export interface ContentActionResult {
  ok: boolean
  id?: string
  error?: string
}

export interface PublicChurchData {
  church: {
    id: string
    slug: string
    name: string
    publicName: string
    email: string
    phone: string
    website: string
    address: string
    city: string
    state: string
    history: string
  }
  banners: ContentBanner[]
  posts: ContentPost[]
  ministries: {
    id: string
    name: string
    description: string
    leaderName: string | null
  }[]
  programmings: {
    id: string
    title: string
    description: string
    startsAt: string | null
    isLive: boolean
  }[]
  congregations: {
    id: string
    name: string
    responsible: string
    address: string
  }[]
}
