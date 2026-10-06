import postgres from "postgres"

const target = process.env.MINISTRY_CHAT_DISPATCH_URL
const secret = process.env.INTEGRATION_WORKER_SECRET
if (!target || !secret) throw new Error("URL do dispatch do chat e segredo do worker obrigatórios")
const url = new URL(target)
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/internal/ministries/chat/dispatch") throw new Error("URL HTTPS do dispatch do chat inválida")
const probe = await fetch(url, { headers: { "x-integration-worker-secret": secret }, signal: AbortSignal.timeout(30_000) })
const result = await probe.json().catch(() => ({}))
if (!probe.ok || result.data?.dryRun !== true || result.data?.pushConfigured !== true) throw new Error(`Backend do chat não validado: HTTP ${probe.status}`)
console.log(JSON.stringify(result.data))
if (process.argv.includes("--apply")) {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")
  const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false, max_pipeline: 1 })
  try {
    await sql.begin(async tx => {
      for (const [name,value] of [["ministry_chat_dispatch_url",url.href],["ministry_chat_worker_secret",secret]]) {
        const rows = await tx`select id from vault.secrets where name=${name}`
        if (rows[0]) await tx`select vault.update_secret(${rows[0].id}::uuid,${value})`
        else await tx`select vault.create_secret(${value},${name},'Ministry chat push worker')`
      }
      await tx.unsafe(`select cron.schedule('ministry-chat-push-every-minute','* * * * *',$job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name='ministry_chat_dispatch_url' limit 1),
          headers := jsonb_build_object('Content-Type','application/json','x-integration-worker-secret',
            (select decrypted_secret from vault.decrypted_secrets where name='ministry_chat_worker_secret' limit 1)),
          body := '{}'::jsonb, timeout_milliseconds := 60000
        );$job$)`)
    })
    console.log(JSON.stringify(await sql`select jobname,schedule,active from cron.job where jobname='ministry-chat-push-every-minute'`))
  } finally { await sql.end() }
}
