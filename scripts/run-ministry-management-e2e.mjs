import postgres from "postgres"
import { spawn } from "node:child_process"

// Resolve an explicitly identified E2E account, never the first church in the database.
const sql=postgres(process.env.POSTGRES_URL,{max:1,prepare:false})
let tenant
try {
  const rows=await sql`select c.legacy_id,c.status from public.companies c join public.profiles p on p.company_id=c.id
    where lower(p.email)=lower(${process.env.E2E_ADMIN_EMAIL || "e2e.admin@altar-church.test"}) and p.active and p.deleted_at is null`
  if(rows.length!==1 || rows[0].status!=="test") throw new Error("A conta E2E deve apontar para exatamente uma igreja de teste")
  tenant=rows[0].legacy_id
} finally {await sql.end()}
const child=spawn(process.execPath,["node_modules/@playwright/test/cli.js","test","--config=playwright.ministry-management.config.ts"],{
  env:{...process.env,E2E_COMPANY_LEGACY_ID:tenant},stdio:"inherit",windowsHide:true,
})
child.on("exit",code=>{process.exitCode=code ?? 1})
