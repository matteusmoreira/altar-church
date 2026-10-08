import type { TransactionSql } from "postgres"

// Caller must authorize the manager; all identifiers are checked again in this transaction.
export async function copyScaleTransaction(tx: TransactionSql, access: { companyId: string; ministryId: string; user: { id: string } }, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error("Selecione outra atividade de destino")
  const events = await tx<{ id: string; starts_at: Date; ends_at: Date | null; status: string; volunteer_schedule_published_at: Date | null }[]>`
    select id,starts_at,ends_at,status,volunteer_schedule_published_at from public.events
    where id in (${sourceId},${targetId}) and company_id=${access.companyId} and ministry_id=${access.ministryId}
      and deleted_at is null order by id for update`
  const target = events.find(event => event.id === targetId)
  if (events.length !== 2 || !target) throw new Error("Atividades fora deste ministério")
  if (target.status === "cancelled" || target.volunteer_schedule_published_at) throw new Error("Atividade cancelada ou com escala publicada")
  const existing = await tx`select id from public.volunteer_event_positions where event_id=${targetId}
    union all select id from public.volunteer_shifts where event_id=${targetId}`
  if (existing.length) throw new Error("O destino já possui uma estrutura de escala")
  const positions = await tx<{ id: string; department_id: string; role_id: string; role_name: string; required_volunteers: number; instructions: string; sort_order: number }[]>`
    select p.id,p.department_id,p.role_id,p.role_name,p.required_volunteers,p.instructions,p.sort_order
    from public.volunteer_event_positions p join public.volunteer_departments d on d.id=p.department_id and d.company_id=p.company_id
    join public.volunteer_department_roles r on r.id=p.role_id and r.company_id=p.company_id and r.department_id=d.id
    where p.event_id=${sourceId} and p.company_id=${access.companyId} and d.ministry_id=${access.ministryId}
      and d.deleted_at is null and r.deleted_at is null and d.is_active and r.is_active order by p.sort_order,p.id`
  if (!positions.length) throw new Error("A escala de origem não possui funções disponíveis")
  const month = await tx<{ month: string }[]>`select to_char(${target.starts_at}::timestamptz at time zone
    coalesce((select timezone from public.church_profiles where company_id=${access.companyId}),'America/Sao_Paulo'),'YYYY-MM-01') as month`
  const schedules = await tx<{ id: string; status: string }[]>`insert into public.volunteer_schedules(company_id,month,created_by,updated_by)
    values(${access.companyId},${month[0].month}::date,${access.user.id},${access.user.id})
    on conflict(company_id,month) do update set updated_by=excluded.updated_by returning id,status`
  const schedule = schedules[0]
  if (schedule.status !== "draft") throw new Error("O mês de destino não está em rascunho")
  const startsAt = new Date(target.starts_at)
  const endsAt = target.ends_at ? new Date(target.ends_at) : new Date(startsAt.getTime()+2*3600000)
  const omitted: string[] = []
  let copied = 0
  for (const position of positions) {
    const [saved] = await tx<{ id: string }[]>`insert into public.volunteer_event_positions
      (company_id,event_id,department_id,role_id,role_name,required_volunteers,instructions,sort_order,created_by,updated_by)
      values(${access.companyId},${targetId},${position.department_id},${position.role_id},${position.role_name},
        ${position.required_volunteers},${position.instructions},${position.sort_order},${access.user.id},${access.user.id}) returning id`
    const [shift] = await tx<{ id: string }[]>`insert into public.volunteer_shifts
      (company_id,schedule_id,event_id,event_position_id,department_id,role_id,role_name,required_volunteers,instructions,starts_at,ends_at,checkin_opens_at,checkin_closes_at)
      values(${access.companyId},${schedule.id},${targetId},${saved.id},${position.department_id},${position.role_id},${position.role_name},
        ${position.required_volunteers},${position.instructions},${startsAt},${endsAt},${new Date(startsAt.getTime()-1800000)},${new Date(endsAt.getTime()+1800000)}) returning id`
    const people = await tx<{ volunteer_id: string; person_name: string; eligible: boolean }[]>`
      select distinct v.id as volunteer_id,p.full_name as person_name,
        (v.deleted_at is null and v.registration_status='active' and p.is_active and p.deleted_at is null and exists(
          select 1 from public.ministry_memberships m where m.company_id=${access.companyId} and m.ministry_id=${access.ministryId}
            and m.person_id=v.person_id and m.status='active' and m.left_at is null)) as eligible
      from public.volunteer_assignments a join public.volunteer_shifts s on s.id=a.shift_id and s.company_id=a.company_id
      join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=a.company_id
      join public.people p on p.id=v.person_id and p.company_id=a.company_id
      where s.event_id=${sourceId} and s.event_position_id=${position.id} and a.company_id=${access.companyId}
        and a.status not in ('declined','cancelled') order by p.full_name`
    let filled = 0
    for (const person of people) {
      if (!person.eligible || filled >= position.required_volunteers) { omitted.push(`${person.person_name} — ${position.role_name}`); continue }
      await tx`insert into public.volunteer_department_memberships(company_id,department_id,volunteer_id,role_name,role_id,preferred,is_active)
        values(${access.companyId},${position.department_id},${person.volunteer_id},${position.role_name},${position.role_id},true,true)
        on conflict(department_id,volunteer_id,role_name) do update set role_id=excluded.role_id,is_active=true`
      await tx`insert into public.volunteer_assignments(company_id,shift_id,volunteer_id,status,score,score_reasons,is_locked,created_by,updated_by)
        values(${access.companyId},${shift.id},${person.volunteer_id},'proposed',0,'[]'::jsonb,true,${access.user.id},${access.user.id})`
      filled++; copied++
    }
  }
  return { positions: positions.length, copied, omitted }
}
