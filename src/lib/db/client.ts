import postgres from "postgres"

declare global {
  var ecclesiaHubSql: ReturnType<typeof postgres> | undefined
}

function integerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function getSql() {
  const connectionString = process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error("POSTGRES_URL is required to connect to Supabase Postgres")
  }

  if (!globalThis.ecclesiaHubSql) {
    globalThis.ecclesiaHubSql = postgres(connectionString, {
      max: integerEnv("POSTGRES_POOL_MAX", 5, 1, 20),
      // Evita novo handshake TLS a cada ação após poucos segundos sem tráfego.
      idle_timeout: integerEnv("POSTGRES_IDLE_TIMEOUT_SECONDS", 300, 20, 1_800),
      connect_timeout: 10,
      prepare: false,
    })
  }

  return globalThis.ecclesiaHubSql
}
