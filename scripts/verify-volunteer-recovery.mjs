import assert from "node:assert/strict"
import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatório")

const sql = postgres(connectionString, { max: 1, prepare: false })
const rollback = Symbol("rollback")

try {
  const [schema] = await sql`
    select
      to_regclass('public.volunteer_event_positions') is not null as has_positions,
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'events'
          and column_name = 'volunteer_schedule_published_at'
      ) as has_publish_state,
      exists(
        select 1 from pg_indexes
        where schemaname = 'public'
          and indexname = 'volunteer_shifts_event_position_unique'
      ) as has_shift_uniqueness,
      exists(
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'volunteer_event_positions'
      ) as has_rls_policy
  `
  assert.equal(schema.has_positions, true)
  assert.equal(schema.has_publish_state, true)
  assert.equal(schema.has_shift_uniqueness, true)
  assert.equal(schema.has_rls_policy, true)

  await sql.begin(async (tx) => {
    const [fixture] = await tx`
      select company.id as company_id, profile.id as actor_id
      from public.companies company
      join lateral (
        select id from public.profiles
        where company_id = company.id and active
        order by case when role in ('admin', 'pastor') then 0 else 1 end
        limit 1
      ) profile on true
      where company.active
      limit 1
    `
    if (!fixture) throw new Error("Fixture de igreja indisponível")
    const suffix = crypto.randomUUID().slice(0, 8)
    const [department] = await tx`
      insert into public.volunteer_departments(
        company_id, name, created_by, updated_by
      )
      values (
        ${fixture.company_id}, ${`Recovery ${suffix}`},
        ${fixture.actor_id}, ${fixture.actor_id}
      )
      returning id
    `
    const [role] = await tx`
      insert into public.volunteer_department_roles(
        company_id, department_id, name, instructions
      )
      values (
        ${fixture.company_id}, ${department.id}, 'Recepção', 'Chegar 30 minutos antes'
      )
      returning id
    `
    const [person] = await tx`
      insert into public.people(
        company_id, first_name, full_name, person_type, status, is_active,
        created_by, updated_by
      )
      values (
        ${fixture.company_id}, ${`Membro ${suffix}`}, ${`Membro ${suffix}`},
        'member', 'active', true, ${fixture.actor_id}, ${fixture.actor_id}
      )
      returning id
    `
    const [volunteer] = await tx`
      insert into public.volunteer_profiles(
        company_id, person_id, registration_status, created_by, updated_by
      )
      values (
        ${fixture.company_id}, ${person.id}, 'active',
        ${fixture.actor_id}, ${fixture.actor_id}
      )
      returning id
    `
    await tx`
      insert into public.volunteer_department_memberships(
        company_id, department_id, volunteer_id, role_id, role_name, preferred
      )
      values (
        ${fixture.company_id}, ${department.id}, ${volunteer.id},
        ${role.id}, 'Recepção', true
      )
    `
    const [classification] = await tx`
      select person_type from public.people where id = ${person.id}
    `
    assert.equal(classification.person_type, "member")

    const [event] = await tx`
      insert into public.events(
        company_id, title, starts_at, ends_at, status, created_by, updated_by
      )
      values (
        ${fixture.company_id}, ${`Culto Recovery ${suffix}`},
        '2035-01-07T18:00:00-03:00', '2035-01-07T20:00:00-03:00',
        'published', ${fixture.actor_id}, ${fixture.actor_id}
      )
      returning id
    `
    let positionId
    for (const quantity of [1, 2]) {
      const [position] = await tx`
        insert into public.volunteer_event_positions(
          company_id, event_id, department_id, role_id, role_name,
          required_volunteers, created_by, updated_by
        )
        values (
          ${fixture.company_id}, ${event.id}, ${department.id}, ${role.id},
          'Recepção', ${quantity}, ${fixture.actor_id}, ${fixture.actor_id}
        )
        on conflict (event_id, department_id, role_id) do update
        set required_volunteers = excluded.required_volunteers
        returning id
      `
      positionId ??= position.id
      assert.equal(position.id, positionId)
    }
    const [schedule] = await tx`
      insert into public.volunteer_schedules(
        company_id, month, created_by, updated_by
      )
      values (
        ${fixture.company_id}, '2035-01-01', ${fixture.actor_id}, ${fixture.actor_id}
      )
      returning id
    `
    for (const quantity of [1, 2]) {
      await tx`
        insert into public.volunteer_shifts(
          company_id, schedule_id, event_id, event_position_id,
          department_id, role_id, role_name, required_volunteers,
          starts_at, ends_at, checkin_opens_at, checkin_closes_at
        )
        values (
          ${fixture.company_id}, ${schedule.id}, ${event.id}, ${positionId},
          ${department.id}, ${role.id}, 'Recepção', ${quantity},
          '2035-01-07T18:00:00-03:00', '2035-01-07T20:00:00-03:00',
          '2035-01-07T17:30:00-03:00', '2035-01-07T20:30:00-03:00'
        )
        on conflict (schedule_id, event_id, event_position_id)
          where event_position_id is not null
        do update set required_volunteers = excluded.required_volunteers
      `
    }
    const [counts] = await tx`
      select
        (select count(*)::int from public.volunteer_event_positions where event_id = ${event.id}) as positions,
        (select count(*)::int from public.volunteer_shifts where event_id = ${event.id}) as shifts
    `
    assert.equal(counts.positions, 1)
    assert.equal(counts.shifts, 1)
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end()
}

console.log("Volunteer recovery: schema, vínculo, classificação e idempotência OK")
