import postgres from "postgres"

if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false })

try {
  const [table] = await sql`
    select relrowsecurity as rls
    from pg_class
    where oid = 'public.ministry_memberships'::regclass
  `
  if (!table?.rls) throw new Error("RLS de ministry_memberships não está ativo")

  const policies = await sql`
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'ministry_memberships'
  `
  if (policies.length < 3) throw new Error("Políticas de ministry_memberships incompletas")

  const [legacy] = await sql`
    select count(*)::integer as total
    from public.profiles
    where role in ('reader', 'guardian')
  `
  if (legacy.total !== 0) throw new Error(`${legacy.total} perfil(is) legado(s) ainda existem`)

  const [unlinked] = await sql`
    select count(*)::integer as total
    from public.profiles
    where role = 'member' and company_id is not null and person_id is null
  `
  if (unlinked.total !== 0) throw new Error(`${unlinked.total} membro(s) sem identidade people`)

  const [constraint] = await sql`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check'
  `
  if (!constraint?.definition.includes("'member'")) throw new Error("Constraint não aceita member")
  if (constraint.definition.includes("'reader'") || constraint.definition.includes("'guardian'")) {
    throw new Error("Constraint ainda aceita papéis legados")
  }

  const counts = await sql`
    select role, count(*)::integer as total
    from public.profiles
    group by role
    order by role
  `
  console.log(JSON.stringify({
    ok: true,
    policies: policies.map((item) => item.policyname),
    roleCounts: counts,
    memberIdentities: "linked",
  }, null, 2))
} finally {
  await sql.end()
}
