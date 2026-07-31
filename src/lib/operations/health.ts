import fs from "node:fs"
import path from "node:path"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { healthLabel, overallHealthStatus, type HealthCheck, type HealthStatus } from "./health-core"

export type QueueSummary = {
  key: string
  label: string
  pending: number
  processing: number
  failed: number
  dead: number
  total: number
  oldestPendingAt: string | null
}

export type CronSummary = {
  jobName: string
  schedule: string
  active: boolean
  lastRunAt: string | null
  lastStatus: string | null
}

export type TenantUsage = {
  companyId: string
  companyName: string
  people: number
  activePeople: number
  groups: number
  deliveries: number
}

export type OperationalHealthData = {
  checkedAt: string
  environment: string
  projectRef: string
  overall: HealthStatus
  checks: HealthCheck[]
  migrations: {
    localCount: number
    remoteCount: number
    localLatest: string | null
    remoteLatest: string | null
    status: HealthStatus
    detail: string
  }
  queues: QueueSummary[]
  cronJobs: CronSummary[]
  tenants: TenantUsage[]
  backup: HealthCheck
}

type Queryable = ReturnType<typeof getSql>

const CHECK_TIMEOUT_MS = 5_000

function env(name: string) {
  return process.env[name]?.trim() ?? ""
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function projectRef() {
  const explicit = env("SUPABASE_PROJECT_REF")
  if (explicit) return explicit
  const url = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL")
  return url.match(/^https?:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? "desconhecido"
}

function environmentName() {
  return env("APP_ENV") || env("VERCEL_ENV") || env("NODE_ENV") || "local"
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = CHECK_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function fetchCheck(input: {
  key: string
  label: string
  url: string
  init?: RequestInit
  healthyStatuses: number[]
  detailOnSuccess: string
}) {
  if (!input.url) {
    return {
      key: input.key,
      label: input.label,
      status: "not_configured" as const,
      detail: "URL não configurada",
    }
  }

  const startedAt = Date.now()
  try {
    const response = await withTimeout(fetch(input.url, input.init))
    const status = input.healthyStatuses.includes(response.status) ? "healthy" : response.status >= 500 ? "unavailable" : "degraded"
    return {
      key: input.key,
      label: input.label,
      status,
      detail: status === "healthy" ? input.detailOnSuccess : `HTTP ${response.status}`,
      latencyMs: Date.now() - startedAt,
    } satisfies HealthCheck
  } catch (error) {
    return {
      key: input.key,
      label: input.label,
      status: "unavailable" as const,
      detail: error instanceof Error && error.message === "timeout" ? "Timeout" : "Falha de conexão",
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function databaseCheck(sql: Queryable): Promise<HealthCheck> {
  const startedAt = Date.now()
  try {
    const rows = await withTimeout(sql<{ version: string }[]>`select version()`)
    return {
      key: "database",
      label: "Banco de dados",
      status: rows[0]?.version ? "healthy" : "degraded",
      detail: rows[0]?.version ? "Conexão SQL e consulta básica OK" : "Banco respondeu sem versão",
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      key: "database",
      label: "Banco de dados",
      status: "unavailable",
      detail: error instanceof Error && error.message === "timeout" ? "Timeout" : "Falha na conexão SQL",
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function workerCheck(key: string, label: string, url: string, secretHeader: string) {
  return fetchCheck({
    key,
    label,
    url,
    init: { method: "POST", headers: { [secretHeader]: "health-probe-without-secret" } },
    // 401 prova que endpoint está publicado e rejeita chamada sem segredo. Não processa fila.
    healthyStatuses: [401],
    detailOnSuccess: "Endpoint publicado e proteção do worker ativa",
  })
}

async function getInfrastructureChecks(sql: Queryable): Promise<HealthCheck[]> {
  const baseUrl = (env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/$/, "")
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY") || env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY")
  const authHeaders = anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : undefined
  const storageHeaders = serviceRole
    ? { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` }
    : authHeaders

  const checks = await Promise.all([
    databaseCheck(sql),
    fetchCheck({
      key: "storage",
      label: "Storage",
      url: baseUrl ? `${baseUrl}/storage/v1/bucket` : "",
      init: { headers: storageHeaders },
      healthyStatuses: [200],
      detailOnSuccess: "API de Storage respondeu",
    }),
    fetchCheck({
      key: "auth",
      label: "Auth",
      url: baseUrl ? `${baseUrl}/auth/v1/health` : "",
      init: { headers: authHeaders },
      healthyStatuses: [200],
      detailOnSuccess: "Auth respondeu",
    }),
    workerCheck(
      "integration_worker",
      "Worker de integrações",
      baseUrl ? `${baseUrl}/functions/v1/integration-delivery-worker` : "",
      "x-integration-worker-secret",
    ),
    workerCheck(
      "volunteer_worker",
      "Worker de voluntariado",
      baseUrl ? `${baseUrl}/functions/v1/volunteer-delivery-worker` : "",
      "x-volunteer-worker-secret",
    ),
  ])

  return checks
}

async function providerChecks(sql: Queryable) {
  const baseUrl = env("UAZAPI_BASE_URL").replace(/\/$/, "")
  const [uazapi, resend, pushSubscriptions] = await Promise.all([
    fetchCheck({
      key: "uazapi",
      label: "Uazapi",
      url: baseUrl && env("UAZAPI_ADMIN_TOKEN") ? `${baseUrl}/instance/all` : "",
      init: { headers: { admintoken: env("UAZAPI_ADMIN_TOKEN") } },
      healthyStatuses: [200],
      detailOnSuccess: "API administrativa respondeu",
    }),
    fetchCheck({
      key: "resend",
      label: "Resend",
      url: env("RESEND_API_KEY") ? "https://api.resend.com/domains?limit=1" : "",
      init: { headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}` } },
      healthyStatuses: [200],
      detailOnSuccess: "API de domínios respondeu",
    }),
    (async (): Promise<HealthCheck> => {
      const hasKeys = Boolean(env("VAPID_SUBJECT") && env("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY"))
      if (!hasKeys) {
        return { key: "web_push", label: "Web Push", status: "not_configured", detail: "Chaves VAPID não configuradas" }
      }
      try {
        const rows = await sql<{ count: number }[]>`
          select count(*)::int as count
          from public.volunteer_push_subscriptions
          where is_active = true
        `
        return {
          key: "web_push",
          label: "Web Push",
          status: "healthy",
          detail: `${Number(rows[0]?.count ?? 0)} dispositivos ativos`,
        }
      } catch {
        return { key: "web_push", label: "Web Push", status: "degraded", detail: "Chaves OK; subscriptions não verificadas" }
      }
    })(),
  ])
  return [uazapi, resend, pushSubscriptions]
}

function migrationFiles() {
  const directory = path.join(process.cwd(), "supabase", "migrations")
  return fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).map((file) => file.replace(/\.sql$/, "")).sort()
    : []
}

async function migrationStatus(sql: Queryable) {
  const local = migrationFiles()
  const remoteRows = await safeQuery(sql, [] as { version: string }[], (db) => db<{ version: string }[]>`
    select version::text from supabase_migrations.schema_migrations order by version
  `)
  const remote = remoteRows.map((row) => String(row.version))
  const localVersions = new Set(local.map((version) => version.slice(0, 14)))
  const remoteVersions = new Set(remote.map((version) => version.slice(0, 14)))
  const pending = local.filter((version) => !remoteVersions.has(version.slice(0, 14)))
  const unexpected = remote.filter((version) => !localVersions.has(version.slice(0, 14)))
  const status: HealthStatus = pending.length === 0 && unexpected.length === 0 ? "healthy" : "degraded"

  return {
    localCount: local.length,
    remoteCount: remote.length,
    localLatest: local.at(-1) ?? null,
    remoteLatest: remote.at(-1) ?? null,
    status,
    detail: status === "healthy"
      ? "Repo e banco estão alinhados"
      : `${pending.length} pendente(s), ${unexpected.length} versão(ões) remota(s) fora do repo`,
  }
}

async function safeQuery<T>(sql: Queryable, fallback: T, query: (db: Queryable) => PromiseLike<T> | T) {
  try {
    return await query(sql)
  } catch {
    return fallback
  }
}

async function queueSummaries(sql: Queryable, companyId: string | null): Promise<QueueSummary[]> {
  type QueueRow = {
    queue_key: string
    queue_label: string
    status: string
    count: number
    oldest_pending_at: Date | string | null
  }
  const rows = await safeQuery(sql, [] as QueueRow[], (db) => {
    const companyFilter = companyId ? db`where company_id = ${companyId}` : db``
    return db<QueueRow[]>`
      select 'integration' as queue_key, 'Integrações' as queue_label, status,
             count(*)::int as count,
             min(created_at) filter (where status in ('pending', 'processing', 'failed')) as oldest_pending_at
      from public.integration_delivery_outbox
      ${companyFilter}
      group by status
      union all
      select 'volunteer', 'Voluntariado', status,
             count(*)::int,
             min(created_at) filter (where status in ('pending', 'processing', 'failed', 'queued'))
      from public.volunteer_delivery_outbox
      ${companyFilter}
      group by status
      union all
      select 'kids', 'Kids', status,
             count(*)::int,
             min(created_at) filter (where status in ('pending', 'processing', 'failed'))
      from public.kid_delivery_outbox
      ${companyFilter}
      group by status
      union all
      select 'notifications', 'Notificações', status,
             count(*)::int,
             min(created_at) filter (where status in ('pending', 'processing', 'failed'))
      from public.notification_deliveries
      ${companyFilter}
      group by status
      union all
      select 'follow_up', 'Follow-up pastoral', status,
             count(*)::int,
             min(created_at) filter (where status in ('open', 'in_progress'))
      from public.person_follow_up_tasks
      ${companyFilter}
      group by status
    `
  })

  const byQueue = new Map<string, QueueSummary>()
  for (const row of rows) {
    const current = byQueue.get(row.queue_key) ?? {
      key: row.queue_key,
      label: row.queue_label,
      pending: 0,
      processing: 0,
      failed: 0,
      dead: 0,
      total: 0,
      oldestPendingAt: null,
    }
    const count = Number(row.count ?? 0)
    current.total += count
    if (row.status === "pending" || row.status === "queued") current.pending += count
    if (row.status === "processing") current.processing += count
    if (row.status === "failed") current.failed += count
    if (row.status === "dead") current.dead += count
    const oldest = iso(row.oldest_pending_at)
    if (oldest && (!current.oldestPendingAt || oldest < current.oldestPendingAt)) current.oldestPendingAt = oldest
    byQueue.set(row.queue_key, current)
  }
  return [...byQueue.values()]
}

async function cronSummaries(sql: Queryable): Promise<CronSummary[]> {
  const jobs = await safeQuery(sql, [] as { jobid: number; jobname: string; schedule: string; active: boolean }[], (db) => db<{ jobid: number; jobname: string; schedule: string; active: boolean }[]>`
    select jobid, jobname, schedule, active from cron.job order by jobname
  `)
  const result: CronSummary[] = []
  for (const job of jobs) {
    const last = await safeQuery(sql, [] as { last_run_at: Date | string | null; last_status: string | null }[], (db) => db<{ last_run_at: Date | string | null; last_status: string | null }[]>`
      select start_time as last_run_at, status as last_status
      from cron.job_run_details
      where jobid = ${job.jobid}
      order by start_time desc nulls last
      limit 1
    `)
    result.push({
      jobName: job.jobname,
      schedule: job.schedule,
      active: Boolean(job.active),
      lastRunAt: iso(last[0]?.last_run_at),
      lastStatus: last[0]?.last_status ?? null,
    })
  }
  return result
}

async function tenantUsage(sql: Queryable, companyId: string | null) {
  type TenantUsageRow = {
    company_id: string
    company_name: string
    people: number
    active_people: number
    groups: number
    deliveries: number
  }
  const rows = await safeQuery(sql, [] as TenantUsageRow[], (db) => companyId
    ? db<TenantUsageRow[]>`
        select c.id as company_id, c.name as company_name,
               count(distinct p.id)::int as people,
               count(distinct p.id) filter (where p.is_active)::int as active_people,
               count(distinct g.id)::int as groups,
               count(distinct d.id)::int as deliveries
        from public.companies c
        left join public.people p on p.company_id = c.id and p.deleted_at is null
        left join public.groups g on g.company_id = c.id and g.deleted_at is null
        left join public.integration_delivery_outbox d on d.company_id = c.id
        where c.id = ${companyId}
        group by c.id, c.name
      `
    : db<TenantUsageRow[]>`
        select c.id as company_id, c.name as company_name,
               count(distinct p.id)::int as people,
               count(distinct p.id) filter (where p.is_active)::int as active_people,
               count(distinct g.id)::int as groups,
               count(distinct d.id)::int as deliveries
        from public.companies c
        left join public.people p on p.company_id = c.id and p.deleted_at is null
        left join public.groups g on g.company_id = c.id and g.deleted_at is null
        left join public.integration_delivery_outbox d on d.company_id = c.id
        where c.active = true
        group by c.id, c.name
        order by people desc, c.name
        limit 20
      `)
  return rows.map((row) => ({
    companyId: String(row.company_id),
    companyName: String(row.company_name),
    people: Number(row.people ?? 0),
    activePeople: Number(row.active_people ?? 0),
    groups: Number(row.groups ?? 0),
    deliveries: Number(row.deliveries ?? 0),
  }))
}

function backupCheck(): HealthCheck {
  const lastRun = env("BACKUP_LAST_RUN_AT")
  const provider = env("BACKUP_PROVIDER") || "provedor não informado"
  if (!lastRun) {
    return { key: "backup", label: "Backup", status: "unknown", detail: "Última execução não informada" }
  }
  const timestamp = Date.parse(lastRun)
  if (!Number.isFinite(timestamp)) {
    return { key: "backup", label: "Backup", status: "degraded", detail: "BACKUP_LAST_RUN_AT inválido" }
  }
  const maxAgeHours = Number(env("BACKUP_MAX_AGE_HOURS") || 36)
  const ageHours = (Date.now() - timestamp) / 3_600_000
  return {
    key: "backup",
    label: "Backup",
    status: ageHours <= maxAgeHours ? "healthy" : "degraded",
    detail: `${provider}; última execução ${new Date(timestamp).toISOString()}`,
  }
}

export async function getOperationalHealthData(companyId: string | null = null): Promise<OperationalHealthData> {
  const sql = getSql()
  const [infrastructure, providers, migrations, queues, cronJobs, tenants] = await Promise.all([
    getInfrastructureChecks(sql),
    providerChecks(sql),
    migrationStatus(sql),
    queueSummaries(sql, companyId),
    cronSummaries(sql),
    tenantUsage(sql, companyId),
  ])
  const backup = backupCheck()
  const checks = [...infrastructure, ...providers, backup]
  const migrationCheck: HealthCheck = {
    key: "migrations",
    label: "Migrations",
    status: migrations.status,
    detail: migrations.detail,
  }
  return {
    checkedAt: new Date().toISOString(),
    environment: environmentName(),
    projectRef: projectRef(),
    overall: overallHealthStatus([...checks, migrationCheck]),
    checks,
    migrations,
    queues,
    cronJobs,
    tenants,
    backup,
  }
}

export async function getAuthorizedOperationalHealthData(companyIdInput?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  await requirePermission("settings.manage_settings", companyId)
  return getOperationalHealthData(user.role === "superadmin" && !companyIdInput ? null : companyId)
}

export async function getPublicHealthData() {
  const sql = getSql()
  const checks = await getInfrastructureChecks(sql)
  const publicChecks = checks.filter((check) => ["database", "storage", "auth", "integration_worker", "volunteer_worker"].includes(check.key))
  return {
    status: overallHealthStatus(publicChecks),
    checkedAt: new Date().toISOString(),
    checks: publicChecks.map(({ key, label, status, latencyMs }) => ({ key, label, status, latencyMs })),
  }
}

export { healthLabel }
