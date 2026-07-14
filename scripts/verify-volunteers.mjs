import postgres from "postgres"

const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false })

try {
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name like 'volunteer%'
    order by 1
  `
  console.log("tables", tables.map((t) => t.table_name))

  const mods = await sql`
    select id, route, active from public.system_modules where id = 'volunteers'
  `
  console.log("module", mods)

  const cm = await sql`
    select count(*)::int as c
    from public.company_modules
    where module_id = 'volunteers' and enabled
  `
  console.log("company_modules_enabled", cm[0])

  const company = await sql`select id from public.companies limit 1`
  const cid = company[0]?.id
  if (!cid) {
    console.log("no company")
    process.exit(0)
  }

  const volunteers = await sql`
    select count(*)::int as c
    from public.volunteer_profiles
    where company_id = ${cid} and deleted_at is null
  `
  const depts = await sql`
    select count(*)::int as c
    from public.volunteer_departments
    where company_id = ${cid}
  `
  console.log({ volunteers: volunteers[0], depts: depts[0] })

  const list = await sql`
    select vp.id, person.full_name as name,
           coalesce(string_agg(distinct department.name, '|' order by department.name), '') as department_names
    from public.volunteer_profiles vp
    join public.people person on person.id = vp.person_id and person.deleted_at is null
    left join public.volunteer_department_memberships membership
      on membership.volunteer_id = vp.id and membership.is_active
    left join public.volunteer_departments department
      on department.id = membership.department_id and department.deleted_at is null
    where vp.company_id = ${cid} and vp.deleted_at is null
    group by vp.id, person.id
    order by person.full_name
    limit 5
  `
  console.log("list_ok", list.length, list[0] ?? null)

  const metrics = await sql`
    select
      count(*) filter (where vp.registration_status = 'active' and person.is_active)::integer as active_volunteers,
      count(distinct assignment.id) filter (where date_trunc('month', shift.starts_at) = date_trunc('month', now()))::integer as assigned_this_month,
      coalesce(sum(shift.required_volunteers - assignment_counts.assigned_count) filter (where date_trunc('month', shift.starts_at) = date_trunc('month', now())), 0)::integer as open_vacancies,
      count(distinct assignment.id) filter (where assignment.checked_in_at >= date_trunc('month', now()))::integer as checkins_this_month,
      count(*) filter (where vp.created_at >= date_trunc('month', now()))::integer as monthly_growth
    from public.volunteer_profiles vp
    join public.people person on person.id = vp.person_id
    left join public.volunteer_assignments assignment on assignment.volunteer_id = vp.id
    left join public.volunteer_shifts shift on shift.id = assignment.shift_id
    left join lateral (
      select count(*)::integer as assigned_count
      from public.volunteer_assignments current_assignment
      where current_assignment.shift_id = shift.id
        and current_assignment.status not in ('declined', 'cancelled')
    ) assignment_counts on true
    where vp.company_id = ${cid} and vp.deleted_at is null
  `
  console.log("metrics_ok", metrics[0])
} finally {
  await sql.end()
}
