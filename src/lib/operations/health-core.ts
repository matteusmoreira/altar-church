export type HealthStatus = "healthy" | "degraded" | "unavailable" | "not_configured" | "unknown"

export interface HealthCheck {
  key: string
  label: string
  status: HealthStatus
  detail: string
  latencyMs?: number
}

const STATUS_WEIGHT: Record<HealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  not_configured: 2,
  degraded: 3,
  unavailable: 4,
}

export function overallHealthStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.length === 0) return "unknown"
  const worst = checks.reduce((current, check) => {
    return STATUS_WEIGHT[check.status] > STATUS_WEIGHT[current] ? check.status : current
  }, "healthy" as HealthStatus)
  return worst
}

export function formatAge(value: Date | string | null, now = Date.now()) {
  if (!value) return "Não informado"
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp)) return "Data inválida"

  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000))
  if (minutes < 60) return `${minutes} min atrás`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h atrás`
  return `${Math.round(hours / 24)} d atrás`
}

export function healthLabel(status: HealthStatus) {
  return {
    healthy: "Saudável",
    degraded: "Atenção",
    unavailable: "Indisponível",
    not_configured: "Não configurado",
    unknown: "Não verificado",
  }[status]
}
