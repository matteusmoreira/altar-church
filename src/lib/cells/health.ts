import { getSql } from "@/lib/db/client"
import { getCellContext } from "./access"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"

export type CellHealthRow = {
  id: string
  name: string
  memberCount: number
  activeMemberCount: number
  capacity: number
  attendance7: number
  attendance30: number
  newParticipants30: number
  openPrayerCount: number
  pendingReports30: number
  lastCommunicationAt: string | null
  absenceDays: number
  growthTarget: number
  alertsEnabled: boolean
  growthProgress: number
  health: "healthy" | "attention" | "critical"
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null
}

function validUuid(value?: string | null) {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null
}

export async function listCellHealth(cellIdInput?: string | null): Promise<CellHealthRow[]> {
  const context = await getCellContext()
  await requirePermission("cells.view", context.companyId)
  const cellId = validUuid(cellIdInput)
  const rows = await getSql()<{
    id: string
    name: string
    capacity: number
    member_count: number
    active_member_count: number
    attendance7: number
    attendance30: number
    new_participants30: number
    open_prayer_count: number
    pending_reports30: number
    last_communication_at: Date | string | null
    absence_days: number
    growth_target: number
    alerts_enabled: boolean
  }[]>`
    select
      cell.id, cell.name, cell.max_capacity as capacity,
      (select count(*)::integer from public.group_members member where member.company_id = ${context.companyId} and member.group_id = cell.id) as member_count,
      (select count(*)::integer from public.group_members member where member.company_id = ${context.companyId} and member.group_id = cell.id and member.status = 'active') as active_member_count,
      (select count(*)::integer from public.attendance_records attendance
        inner join public.group_meetings meeting on meeting.id = attendance.event_ref_id and meeting.group_id = cell.id
        where attendance.company_id = ${context.companyId} and attendance.event_type = 'cell' and attendance.status = 'present'
          and attendance.deleted_at is null and attendance.occurred_on >= current_date - 7) as "attendance7",
      (select count(*)::integer from public.attendance_records attendance
        inner join public.group_meetings meeting on meeting.id = attendance.event_ref_id and meeting.group_id = cell.id
        where attendance.company_id = ${context.companyId} and attendance.event_type = 'cell' and attendance.status = 'present'
          and attendance.deleted_at is null and attendance.occurred_on >= current_date - 30) as "attendance30",
      (select count(*)::integer from public.group_members member
        where member.company_id = ${context.companyId} and member.group_id = cell.id and member.joined_at >= current_date - 30) as "new_participants30",
      (select count(*)::integer from public.cell_prayer_requests prayer
        where prayer.company_id = ${context.companyId} and prayer.group_id = cell.id and prayer.status in ('open', 'praying') and prayer.deleted_at is null) as open_prayer_count,
      (select count(*)::integer from public.group_meetings meeting
        where meeting.company_id = ${context.companyId} and meeting.group_id = cell.id and meeting.deleted_at is null
          and meeting.starts_at >= now() - interval '30 days' and meeting.report_status <> 'reported') as pending_reports30,
      (select max(notice.published_at) from public.cell_notices notice
        left join public.cell_notice_targets target on target.notice_id = notice.id
        where notice.company_id = ${context.companyId} and notice.deleted_at is null and notice.is_active = true
          and (notice.audience = 'all' or target.group_id = cell.id)) as last_communication_at,
      coalesce(setting.absence_days, 30) as absence_days,
      coalesce(setting.growth_target, 0) as growth_target,
      coalesce(setting.alerts_enabled, true) as alerts_enabled
    from public.groups cell
    left join public.cell_health_settings setting on setting.group_id = cell.id and setting.company_id = ${context.companyId}
    where cell.company_id = ${context.companyId} and cell.type = 'cell' and cell.deleted_at is null
      and (${cellId}::uuid is null or cell.id = ${cellId}::uuid)
      and (${context.user.role} not in ('cell_supervisor', 'cell_leader')
        or (${context.user.role} = 'cell_supervisor' and cell.coordinator_person_id = ${context.personId})
        or (${context.user.role} = 'cell_leader' and cell.leader_person_id = ${context.personId}))
    order by cell.name
  `
  return rows.map((row) => {
    const memberCount = Number(row.member_count ?? 0)
    const activeMemberCount = Number(row.active_member_count ?? 0)
    const growthTarget = Number(row.growth_target ?? 0)
    const growthProgress = growthTarget > 0 ? Math.min(100, Math.round((Number(row.new_participants30 ?? 0) / growthTarget) * 100)) : 0
    const staleCommunication = !row.last_communication_at || new Date(row.last_communication_at).getTime() < Date.now() - 30 * 86400000
    const critical = activeMemberCount === 0 || (row.alerts_enabled && Number(row.pending_reports30 ?? 0) >= 3)
    const attention = !critical && row.alerts_enabled && (Number(row.pending_reports30 ?? 0) > 0 || staleCommunication || Number(row.attendance7 ?? 0) === 0)
    return {
      id: row.id,
      name: row.name,
      memberCount,
      activeMemberCount,
      capacity: Number(row.capacity ?? 0),
      attendance7: Number(row.attendance7 ?? 0),
      attendance30: Number(row.attendance30 ?? 0),
      newParticipants30: Number(row.new_participants30 ?? 0),
      openPrayerCount: Number(row.open_prayer_count ?? 0),
      pendingReports30: Number(row.pending_reports30 ?? 0),
      lastCommunicationAt: iso(row.last_communication_at),
      absenceDays: Number(row.absence_days ?? 30),
      growthTarget,
      alertsEnabled: row.alerts_enabled,
      growthProgress,
      health: critical ? "critical" : attention ? "attention" : "healthy",
    }
  })
}

export async function saveCellHealthSettings(input: {
  groupId: string
  absenceDays: number
  growthTarget: number
  alertsEnabled: boolean
}) {
  const context = await getCellContext()
  await requirePermission("cells.edit", context.companyId)
  const rows = await getSql()<{ id: string }[]>`
    insert into public.cell_health_settings (company_id, group_id, absence_days, growth_target, alerts_enabled, created_by, updated_by)
    select ${context.companyId}, cell.id, ${input.absenceDays}, ${input.growthTarget}, ${input.alertsEnabled}, ${context.user.id}, ${context.user.id}
    from public.groups cell
    where cell.id = ${input.groupId} and cell.company_id = ${context.companyId} and cell.type = 'cell' and cell.deleted_at is null
    on conflict (company_id, group_id) do update
      set absence_days = excluded.absence_days, growth_target = excluded.growth_target,
          alerts_enabled = excluded.alerts_enabled, updated_by = excluded.updated_by, updated_at = now()
    returning id
  `
  if (!rows[0]) throw new Error("Célula não encontrada")
  await writeAuditLog({ action: "cell.health.settings.save", entityTable: "cell_health_settings", entityId: rows[0].id, companyId: context.companyId, metadata: input })
  return rows[0].id
}
