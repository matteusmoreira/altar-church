import type { FormDirectMessage, FormUazapiInstanceOption } from "@/lib/forms/types"

export type CellVisitRequestStatus = "pending" | "contacted" | "accepted" | "archived"

export interface CellVisitRequestItem {
  id: string
  companyId: string
  groupId: string
  cellName: string
  cellCategory?: string | null
  leaderName?: string | null
  leaderPhone?: string | null
  personId: string | null
  fullName: string
  phone: string
  neighborhood: string
  notes: string
  status: CellVisitRequestStatus
  crmCardId: string | null
  followUpTaskId: string | null
  createdAt: string
  updatedAt: string
  contactedAt: string | null
  acceptedAt: string | null
  archivedAt: string | null
}

export interface CellRequestsFilterState {
  search?: string
  cellId?: string
  status?: string
  period?: "all" | "today" | "7d" | "30d"
  page?: number
  pageSize?: number
}

export interface CellRequestsMetrics {
  total: number
  pending: number
  contacted: number
  accepted: number
}

export interface CellWhatsAppSettings {
  isEnabled: boolean
  whatsappInstanceId: string | null
  sendToLeader: boolean
  sendToVisitor: boolean
  leaderMessage: FormDirectMessage
  visitorMessage: FormDirectMessage
}

export interface CellRequestsTabInitialData {
  requests: CellVisitRequestItem[]
  totalCount: number
  metrics: CellRequestsMetrics
  settings: CellWhatsAppSettings
  instances: FormUazapiInstanceOption[]
  cellsList: Array<{ id: string; name: string }>
}
