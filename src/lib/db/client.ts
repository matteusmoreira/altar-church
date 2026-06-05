import postgres from "postgres"

declare global {
  var ecclesiaHubSql: ReturnType<typeof postgres> | undefined
}

export function getSql() {
  const connectionString = process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error("POSTGRES_URL is required to connect to Supabase Postgres")
  }

  const sql =
    globalThis.ecclesiaHubSql ??
    postgres(connectionString, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    })

  if (process.env.NODE_ENV !== "production") {
    globalThis.ecclesiaHubSql = sql
  }

  return sql
}
