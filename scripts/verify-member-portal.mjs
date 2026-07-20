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

  const [brokenMinistryLeaders] = await sql`
    select count(*)::integer as total
    from public.ministries ministry
    join public.people person
      on person.id = ministry.leader_person_id
     and person.company_id = ministry.company_id
     and person.deleted_at is null
    left join public.ministry_memberships membership
      on membership.ministry_id = ministry.id
     and membership.person_id = person.id
     and membership.role = 'leader'
     and membership.status = 'active'
    left join public.profiles profile
      on profile.id = person.profile_id or profile.person_id = person.id
    where ministry.deleted_at is null
      and (
        membership.id is null
        or (profile.id is not null and profile.role = 'member')
      )
  `
  if (brokenMinistryLeaders.total !== 0) {
    throw new Error(`${brokenMinistryLeaders.total} líder(es) de ministério sem vínculo ou perfil correto`)
  }

  const [wrongPersonaRoles] = await sql`
    select count(*)::integer as total
    from public.profiles profile
    join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where person.person_type in ('visitor', 'attendee')
      and profile.role <> 'member'
  `
  if (wrongPersonaRoles.total !== 0) {
    throw new Error(`${wrongPersonaRoles.total} visitante(s)/frequentador(es) fora do papel member`)
  }

  const ministryPolicies = await sql`
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'ministries'
      and policyname in (
        'Ministry administrators insert',
        'Ministry administrators update',
        'Ministry leaders update own',
        'Ministry administrators delete'
      )
  `
  if (ministryPolicies.length !== 4) throw new Error("Políticas de configuração própria de ministério incompletas")

  const updateColumns = await sql`
    select column_name
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'ministries'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
    order by column_name
  `
  const allowedUpdateColumns = updateColumns.map((row) => row.column_name)
  const expectedUpdateColumns = ["contact", "description", "is_active", "name"]
  if (JSON.stringify(allowedUpdateColumns) !== JSON.stringify(expectedUpdateColumns)) {
    throw new Error(`Colunas editáveis pelo líder divergentes: ${allowedUpdateColumns.join(", ")}`)
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
    ministryLeaders: "linked",
    commonPersonas: "member",
    ministryLeaderUpdateColumns: allowedUpdateColumns,
  }, null, 2))
} finally {
  await sql.end()
}
