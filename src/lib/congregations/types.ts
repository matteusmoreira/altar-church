export interface CongregationListFilters {
  companyId?: string | null
  search?: string
  isActive?: boolean | null
  page?: number
  pageSize?: number
}

export interface CongregationListItem {
  id: string
  companyId: string
  name: string
  responsible: string
  address: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CongregationsListResult {
  congregations: CongregationListItem[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface SaveCongregationInput {
  id?: string | null
  companyId?: string | null
  name: string
  responsible?: string
  address?: string
  isActive?: boolean
}

export interface CongregationActionResult {
  ok: boolean
  id?: string
  error?: string
}
