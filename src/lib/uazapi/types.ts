export type UazapiInstanceStatus = "disconnected" | "connecting" | "connected" | "error"

export interface UazapiInstanceItem {
  id: string
  providerInstanceId: string
  name: string
  status: UazapiInstanceStatus
  profileName: string | null
  phone: string | null
  isDefault: boolean
  lastCheckedAt: string | null
}

export interface UazapiInstancesData {
  limit: number
  used: number
  instances: UazapiInstanceItem[]
}

export interface UazapiActionResult {
  ok: boolean
  error?: string
  data?: {
    qrCode?: string
    pairCode?: string
    status?: UazapiInstanceStatus
  }
}
