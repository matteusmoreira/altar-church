import postgres from "postgres"

if (!process.env.POSTGRES_URL) {
  console.error("POSTGRES_URL obrigatório")
  process.exit(1)
}

const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  ssl: "require",
  prepare: false,
  connect_timeout: 20,
})

try {
  const [table] = await sql`
    select relrowsecurity as rls
    from pg_class
    where oid = 'public.uazapi_instances'::regclass
  `
  const policies = await sql`
    select policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'uazapi_instances'
  `
  const columns = await sql`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'uazapi_instances'
  `
  const [limits] = await sql`
    select count(*)::int as plans,
      count(*) filter (where uazapi_instance_limit between 0 and 100)::int as valid
    from public.system_plans
  `
  const [vault] = await sql`
    select
      count(*) filter (where instance.active)::int as active_instances,
      count(secret.id) filter (where instance.active)::int as vaulted_instances
    from public.uazapi_instances instance
    left join vault.decrypted_secrets secret on secret.id = instance.vault_secret_id
  `
  const [credentialFunction] = await sql`
    select
      has_function_privilege('service_role', 'public.get_company_uazapi_credential(uuid)', 'execute') as service_role_execute,
      has_function_privilege('authenticated', 'public.get_company_uazapi_credential(uuid)', 'execute') as authenticated_execute,
      has_function_privilege('anon', 'public.get_company_uazapi_credential(uuid)', 'execute') as anon_execute
  `

  const policyText = JSON.stringify(policies)
  const checks = {
    rls: table?.rls === true,
    adminPolicies:
      policies.length === 2 &&
      policyText.includes("admin") &&
      policyText.includes("superadmin"),
    noPlaintextTokenColumn: !columns.some(({ column_name }) =>
      ["token", "instance_token", "secret"].includes(column_name),
    ),
    planLimits: limits.plans > 0 && limits.plans === limits.valid,
    allActiveTokensVaulted: vault.active_instances === vault.vaulted_instances,
    workerOnlyCredentialFunction:
      credentialFunction.service_role_execute === true &&
      credentialFunction.authenticated_execute === false &&
      credentialFunction.anon_execute === false,
  }

  console.log(JSON.stringify({ checks, counts: { policies: policies.length, ...limits, ...vault } }, null, 2))
  if (Object.values(checks).some((value) => value !== true)) process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
