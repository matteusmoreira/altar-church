export const INTEGRATION_API_VERSION = "2026-07-15"

export const INTEGRATION_EVENTS = [
  "form.submitted",
  "crm.card.created",
  "crm.card.updated",
  "person.created",
  "person.updated",
  "integration.test",
  "kids.child.registered",
  "kids.checkin.created",
  "kids.checkout.requested",
  "kids.checkout.completed",
  "kids.guardian.called",
  "kids.incident.created",
] as const

export type IntegrationEventType = (typeof INTEGRATION_EVENTS)[number]

export const API_KEY_SCOPES = [
  "forms:read",
  "forms:write",
  "crm:read",
  "crm:write",
  "people:read",
  "people:write",
  "webhooks:manage",
  "*",
] as const

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export type DeliveryStatus = "pending" | "processing" | "sent" | "failed" | "dead"

export interface WebhookEndpoint {
  id: string
  companyId: string
  formId: string | null
  name: string
  url: string
  /** Never returned after create except when rotated. */
  secret?: string
  events: IntegrationEventType[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface DeliveryRow {
  id: string
  companyId: string
  endpointId: string
  endpointName?: string | null
  eventType: string
  eventKey: string
  payload: Record<string, unknown>
  status: DeliveryStatus
  attempts: number
  nextAttemptAt: string
  lastError: string | null
  responseStatus: number | null
  sentAt: string | null
  createdAt: string
}

export interface ApiKeyRow {
  id: string
  companyId: string
  name: string
  keyPrefix: string
  scopes: ApiKeyScope[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  /** Only present on create. */
  secret?: string
}

export interface IntegrationEventEnvelope<T = Record<string, unknown>> {
  id: string
  type: IntegrationEventType
  apiVersion: string
  createdAt: string
  company: { id: string; slug?: string; name?: string }
  data: T
}

export interface IntegrationsActionResult {
  ok: boolean
  id?: string
  error?: string
  secret?: string
  data?: unknown
}
