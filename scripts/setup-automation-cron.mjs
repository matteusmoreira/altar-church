import postgres from "postgres";

const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
const target = process.env.AUTOMATION_DISPATCH_URL || (origin ? new URL('/api/internal/automations/dispatch', origin).href : null);
let secret = process.env.AUTOMATION_WORKER_SECRET;
if (!secret && process.env.POSTGRES_URL) {
  const vaultSql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false });
  try {
    const [existing] = await vaultSql`select decrypted_secret from vault.decrypted_secrets where name='automation_worker_secret' limit 1`;
    secret = existing?.decrypted_secret;
  } finally { await vaultSql.end({ timeout: 5 }); }
}
if (!target || !secret) throw new Error("URL e segredo do processador de automações são obrigatórios");
const url = new URL(target);
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/internal/automations/dispatch")
  throw new Error("Use a URL HTTPS canônica do processador de automações");
// This probe never claims runs, creates accounts or sends messages.
const probe = await fetch(url, { headers: { "x-automation-worker-secret": secret }, signal: AbortSignal.timeout(30000) });
const result = await probe.json().catch(() => ({}));
if (!probe.ok || !result.dryRun || !result.schemaReady || result.batchSize !== 500 || result.concurrency !== 4)
  throw new Error(`Processador atualizado ainda não validado: HTTP ${probe.status}`);
console.log(JSON.stringify(result));
if (process.argv.includes("--apply")) {
  if (!process.env.POSTGRES_URL) throw new Error("Conexão do banco obrigatória");
  const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false });
  try {
    await sql.begin(async tx => {
      for (const [name, value] of [["automation_worker_url", url.href], ["automation_worker_secret", secret]]) {
        const [row] = await tx`select id from vault.secrets where name=${name}`;
        if (row) await tx`select vault.update_secret(${row.id}::uuid,${value})`;
        else await tx`select vault.create_secret(${value},${name},'Processador de automações')`;
      }
      const [job] = await tx`select cron.schedule('automation-worker-burst','10 seconds','select public.invoke_automation_worker();') as id`;
      await tx`select cron.alter_job(${job.id}::bigint,active:=true)`;
      if ((await tx`select jobid from cron.job where jobname='automation-worker-minute'`)[0])
        await tx`select cron.unschedule('automation-worker-minute')`;
    });
    console.log(JSON.stringify(await sql`select jobname,schedule,active from cron.job where jobname='automation-worker-burst'`));
  } finally { await sql.end({ timeout: 5 }); }
}
