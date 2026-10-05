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
    const databaseUrl = new URL(connectionString)
    // Serverless instances must share backend connections by transaction.
    if (process.env.VERCEL && databaseUrl.hostname.endsWith(".pooler.supabase.com") && databaseUrl.port === "5432") {
      databaseUrl.port = "6543"
    }
    const connectionOptions = {
      // Pooler em modo sessao tem so 15 slots compartilhados com todas as
      // instancias serverless: cada instancia segura ate `max` conexoes por
      // `idle_timeout` segundos. Padroes baixos evitam EMAXCONNSESSION.
      max: integerEnv("POSTGRES_POOL_MAX", 2, 1, 20),
      // Evita novo handshake TLS a cada ação após poucos segundos sem tráfego.
      idle_timeout: integerEnv("POSTGRES_IDLE_TIMEOUT_SECONDS", 30, 10, 1_800),
      connect_timeout: 10,
      prepare: false,
      // Zero impede o onexecute do sql.begin de reservar a conexão no postgres.js.
      max_pipeline: 1,
      // Uma query lenta nao pode travar metade do pool de 2 (achado Fase 2 da auditoria).
      connection: {
        statement_timeout: integerEnv("POSTGRES_STATEMENT_TIMEOUT_MS", 15_000, 1_000, 300_000),
      },
    }
    globalThis.ecclesiaHubSql = postgres(databaseUrl.toString(), connectionOptions)
  }

  return globalThis.ecclesiaHubSql
}
