import assert from "node:assert/strict"
import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatório")

const sql = postgres(connectionString, { max: 1, prepare: false })
const rollback = Symbol("rollback")

async function visibleDepartments(tx, authUserId) {
  await tx.unsafe("reset role")
  await tx`select set_config('request.jwt.claim.sub', ${authUserId}, true)`
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: authUserId, role: "authenticated" })}, true)`
  await tx.unsafe("set local role authenticated")
  const rows = await tx`select id::text from public.volunteer_departments order by id`
  return rows.map((row) => row.id)
}

try {
  await sql.begin(async (tx) => {
    const [fixture] = await tx`
      select volunteer.id as volunteer_id, volunteer.person_id, volunteer.company_id,
        admin.auth_user_id as admin_auth_user_id,
        leader.id as leader_profile_id, leader.auth_user_id as leader_auth_user_id,
        superadmin.auth_user_id as superadmin_auth_user_id
      from public.volunteer_profiles volunteer
      join lateral (
        select auth_user_id from public.profiles
        where company_id = volunteer.company_id and role = 'admin' and auth_user_id is not null limit 1
      ) admin on true
      join lateral (
        select id, auth_user_id from public.profiles
        where company_id = volunteer.company_id and role = 'reader' and auth_user_id is not null limit 1
      ) leader on true
      join lateral (
        select auth_user_id from public.profiles
        where role = 'superadmin' and auth_user_id is not null limit 1
      ) superadmin on true
      where volunteer.deleted_at is null
      limit 1
    `
    if (!fixture) throw new Error("Fixture RLS indisponível")

    const suffix = crypto.randomUUID().slice(0, 8)
    const [departmentA] = await tx`
      insert into public.volunteer_departments(company_id, name)
      values (${fixture.company_id}, ${`RLS A ${suffix}`}) returning id::text
    `
    const [departmentB] = await tx`
      insert into public.volunteer_departments(company_id, name)
      values (${fixture.company_id}, ${`RLS B ${suffix}`}) returning id::text
    `
    await tx`
      insert into public.volunteer_department_memberships(company_id, department_id, volunteer_id, role_name)
      values
        (${fixture.company_id}, ${departmentA.id}, ${fixture.volunteer_id}, 'Teste'),
        (${fixture.company_id}, ${departmentB.id}, ${fixture.volunteer_id}, 'Teste')
    `
    await tx`
      update public.profiles set role = 'ministry_leader'
      where id = ${fixture.leader_profile_id}
    `
    await tx`
      insert into public.volunteer_department_access(company_id, department_id, profile_id, access_role)
      values (${fixture.company_id}, ${departmentA.id}, ${fixture.leader_profile_id}, 'leader')
    `

    const superadmin = await visibleDepartments(tx, fixture.superadmin_auth_user_id)
    const admin = await visibleDepartments(tx, fixture.admin_auth_user_id)
    const leader = await visibleDepartments(tx, fixture.leader_auth_user_id)
    const nobody = await visibleDepartments(tx, crypto.randomUUID())

    assert.ok(superadmin.includes(departmentA.id) && superadmin.includes(departmentB.id))
    assert.ok(admin.includes(departmentA.id) && admin.includes(departmentB.id))
    assert.ok(leader.includes(departmentA.id), "líder não viu departamento autorizado")
    assert.ok(!leader.includes(departmentB.id), "líder viu outro departamento")
    assert.equal(nobody.length, 0, "usuário sem vínculo viu dados")

    await tx.unsafe("reset role")
    await tx`update public.profiles set person_id = ${fixture.person_id}, role = 'volunteer' where id = ${fixture.leader_profile_id}`
    const volunteer = await visibleDepartments(tx, fixture.leader_auth_user_id)
    assert.ok(volunteer.includes(departmentA.id) && volunteer.includes(departmentB.id), "voluntário não viu os próprios departamentos")

    await tx.unsafe("reset role")
    await tx`select set_config('request.jwt.claim.sub', ${fixture.admin_auth_user_id}, true)`
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: fixture.admin_auth_user_id, role: "authenticated" })}, true)`
    await tx.unsafe("set local role authenticated")
    await assert.rejects(
      () => tx`insert into public.volunteer_departments(company_id, name) values (${fixture.company_id}, ${`RLS forbidden ${suffix}`})`,
      /permission denied/,
    )

    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await sql.end()
}

console.log("RLS voluntariado V2: superadmin/admin/leader/self/no-link OK; writes autenticados revogados")
