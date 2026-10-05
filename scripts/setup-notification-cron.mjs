import postgres from "postgres"

const target = process.env.NOTIFICATIONS_DISPATCH_URL
const secret = process.env.NOTIFICATION_WORKER_SECRET || process.env.INTEGRATION_WORKER_SECRET
if (!target || !secret) throw new Error("NOTIFICATIONS_DISPATCH_URL e segredo do worker são obrigatórios")
const url = new URL(target)
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/internal/notifications/dispatch") {
  throw new Error("Use a URL HTTPS pública do endpoint de notificações")
}

// Prove that the published backend accepts the secret without claiming or sending anything.
const probe = await fetch(url, {
  method: "GET",
  headers: { "Content-Type": "application/json", "x-notification-worker-secret": secret },
  signal: AbortSignal.timeout(30_000),
})
const result = await probe.json().catch(() => ({}))
if (!probe.ok || result.data?.dryRun !== true || result.data?.pushConfigured !== true) {
  throw new Error(`Backend não validado para cron: HTTP ${probe.status}; dryRun=${result.data?.dryRun === true}; pushConfigured=${result.data?.pushConfigured === true}`)
}
console.log(JSON.stringify(result.data))
if (process.argv.includes("--apply")) {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatório")
  const sql = postgres(process.env.POSTGRES_URL, { max: 1, ssl: "require", prepare: false })
  try {
    await sql.begin(async (tx) => {
      for (const [name, value] of [["notification_dispatch_url", url.href], ["notification_worker_secret", secret]]) {
        const rows = await tx`select id from vault.secrets where name = ${name}`
        if (rows[0]) await tx`select vault.update_secret(${rows[0].id}::uuid, ${value})`
        else await tx`select vault.create_secret(${value}, ${name}, 'Altar Church notification cron')`
      }
      await tx.unsafe(`select cron.schedule('notification-delivery-every-minute', '* * * * *', $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'notification_dispatch_url' limit 1),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-notification-worker-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'notification_worker_secret' limit 1)),
          body := '{"batchSize":25}'::jsonb, timeout_milliseconds := 60000
        );$job$)`)
    })
    console.log(JSON.stringify(await sql`select jobname, schedule, active from cron.job where jobname = 'notification-delivery-every-minute'`))
  } finally {
    await sql.end({ timeout: 5 })
  }
}
