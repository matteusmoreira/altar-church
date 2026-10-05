import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getCompanyEnabledModuleIds } from "@/lib/admin/data";
import { getSql } from "@/lib/db/client";
import { hasPermission, type Permission, type UserRole } from "@/lib/types";
import { parseStoredFlowDefinition, type AudienceFilter, type FlowDefinition } from "./contract";

export async function automationAccess(
  permission: Permission = "automations.view",
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acesso negado");
  const companyId = requireUserCompanyId(user);
  await requirePermission(permission, companyId);
  if (
    user.role !== "superadmin" &&
    !(await getCompanyEnabledModuleIds(companyId)).includes("automations")
  )
    throw new Error("Automações não estão habilitadas nesta igreja");
  return { user, companyId };
}
export function definitionPermissions(
  definition: FlowDefinition,
): Permission[] {
  const permissions = new Set<Permission>(["members.view"]);
  for (const n of definition.nodes) {
    const c = n.config,
      event = c.event ?? "";
    if (c.filter?.cellId || c.filter?.inCell || c.filter?.withoutCell || c.cellId || event.startsWith("cell."))
      permissions.add("cells.view");
    if (c.filter?.ministryId || event.startsWith("ministry."))
      permissions.add("ministries.view");
    if (event.startsWith("event.")) permissions.add("events.view");
    if (event.startsWith("volunteer.")) permissions.add("volunteers.view");
    if (event.startsWith("discipleship.")) permissions.add("content.view");
    if (event.startsWith("form.")) permissions.add("forms.view");
    if (event.startsWith("finance.")) permissions.add("finance.view");
    if (event.startsWith("kids.")) permissions.add("kids.children.manage");
    if (event.startsWith("prayer.")) permissions.add("prayer.view");
    if (event.startsWith("crm.")) permissions.add("crm.view");
    if (n.kind === "kanban_move") permissions.add("crm.edit");
    if (event.startsWith("content.")) permissions.add("content.view");
    if (c.filter?.absenceDays || event.startsWith("attendance."))
      permissions.add("attendance.view");
    if (n.kind === "update" || n.kind === "interest")
      permissions.add("members.edit");
    if (n.kind === "whatsapp" || (n.kind === "ai" && c.mode === "conversation"))
      permissions.add("communication.send");
    if (["task", "assign", "handoff", "notify"].includes(n.kind))
      permissions.add("automations.tasks");
  }
  return [...permissions];
}
export function assertDefinitionPermissions(
  role: UserRole,
  definition: FlowDefinition,
) {
  if (definitionPermissions(definition).some((p) => !hasPermission(role, p)))
    throw new Error(
      "Seu perfil não possui acesso a todos os módulos usados neste fluxo",
    );
}
export type AudiencePerson = {
  id: string;
  full_name: string;
  phone: string | null;
  person_type: string;
  status: string;
  birth_date: string | Date | null;
  baptism_date: string | Date | null;
  cell_name: string | null;
  leader_name: string | null;
  meeting_time: string | null;
  company_name: string;
};
export async function selectAudience(
  companyId: string,
  filter: AudienceFilter = {},
  personId?: string | null,
) {
  const sql = getSql();
  return sql<AudiencePerson[]>`
    select p.id,p.full_name,p.phone,p.person_type,p.status,p.birth_date,p.baptism_date,company.name as company_name,
     selected_cell.name as cell_name,selected_cell.leader_name,selected_cell.meeting_time
    from public.people p join public.companies company on company.id=p.company_id
    left join lateral (
      select g.name,l.full_name as leader_name,g.meeting_time::text from public.group_members gm
      join public.groups g on g.id=gm.group_id and g.company_id=p.company_id and g.type='cell' and g.is_active and g.deleted_at is null
      left join public.people l on l.id=g.leader_person_id and l.company_id=p.company_id
      where gm.person_id=p.id and gm.company_id=p.company_id and gm.status='active'
       and (${filter.cellId ?? null}::uuid is null or g.id=${filter.cellId ?? null}::uuid)
      order by gm.joined_at desc limit 1
    ) selected_cell on true
    where p.company_id=${companyId} and p.deleted_at is null and p.is_active=true
     and (${personId ?? null}::uuid is null or p.id=${personId ?? null}::uuid)
     and (${filter.personType ?? null}::text is null or p.person_type=${filter.personType ?? null})
     and (${filter.status ?? null}::text is null or p.status=${filter.status ?? null})
     and (${filter.congregationId ?? null}::uuid is null or p.congregation_id=${filter.congregationId ?? null}::uuid)
     and (${filter.cellId ?? null}::uuid is null or selected_cell.name is not null)
     and (${filter.inCell ?? false}=false or selected_cell.name is not null)
     and (${filter.withoutCell ?? false}=false or not exists(select 1 from public.group_members gm join public.groups g on g.id=gm.group_id and g.company_id=p.company_id where gm.person_id=p.id and gm.company_id=p.company_id and gm.status='active' and g.type='cell' and g.is_active and g.deleted_at is null))
     and (${filter.ministryId ?? null}::uuid is null or exists(select 1 from public.ministry_memberships m where m.company_id=p.company_id and m.person_id=p.id and m.ministry_id=${filter.ministryId ?? null}::uuid and m.status='active'))
     and (${filter.activityId ?? null}::uuid is null or exists(select 1 from public.person_activity_assignments a where a.company_id=p.company_id and a.person_id=p.id and a.activity_id=${filter.activityId ?? null}::uuid and a.is_active=true))
     and (${filter.minAge ?? null}::integer is null or extract(year from age(p.birth_date))>=${filter.minAge ?? null})
     and (${filter.maxAge ?? null}::integer is null or extract(year from age(p.birth_date))<=${filter.maxAge ?? null})
     and (${filter.absenceDays ?? null}::integer is null or not exists(select 1 from public.attendance_records a where a.company_id=p.company_id and a.person_id=p.id and a.status='present' and a.deleted_at is null and a.occurred_on>=current_date-(${filter.absenceDays ?? 1}::integer)))
    order by p.full_name
  `;
}
export function personContext(p: AudiencePerson): Record<string, unknown> {
  return {
    nome: p.full_name,
    primeiro_nome: p.full_name.split(" ")[0],
    igreja: p.company_name,
    celula: p.cell_name ?? "",
    lider: p.leader_name ?? "",
    horario: p.meeting_time ?? "",
    person_type: p.person_type,
    status: p.status,
  };
}
export async function getAutomationWorkspace() {
  const { user, companyId } = await automationAccess();
  const sql = getSql();
  const [
    flows,
    runs,
    tasks,
    settings,
    archive,
    instances,
    people,
    cells,
    responsible,
    usage,
    steps,
    deliveries,
    interests,
    congregations,
    ministries,
    activities,
    forms,
    stages,
  ] = await Promise.all([
    sql`select id,name,description,draft,revision,status,published_version_id,updated_at from public.automation_flows where company_id=${companyId} and status<>'archived' order by updated_at desc`,
    sql`select r.id,r.flow_id,r.node_id,r.status,r.last_error,r.due_at,r.created_at,p.full_name as person_name,f.name as flow_name from public.automation_runs r join public.automation_flows f on f.id=r.flow_id left join public.people p on p.id=r.person_id and p.company_id=r.company_id where r.company_id=${companyId} order by r.created_at desc limit 150`,
    sql`select t.*,p.full_name as person_name,pr.name as responsible_name from public.automation_tasks t left join public.people p on p.id=t.person_id and p.company_id=t.company_id left join public.profiles pr on pr.id=t.responsible_id and pr.company_id=t.company_id where t.company_id=${companyId} and (${["superadmin", "admin", "pastor"].includes(user.role)} or t.responsible_id=${user.id}) order by t.created_at desc limit 150`,
    sql`select company_id,timezone,quiet_start::text,quiet_end::text,allowed_models,monthly_budget_usd,knowledge from public.automation_settings where company_id=${companyId}`,
    sql`select kind,source_id,snapshot,archived_at from public.automation_legacy_archive where company_id=${companyId} order by archived_at desc limit 500`,
    sql`select id,name,status from public.uazapi_instances where company_id=${companyId} and active order by name`,
    sql`select id,full_name,phone from public.people where company_id=${companyId} and deleted_at is null and is_active order by full_name`,
    sql`select g.id,g.name,g.automation_whatsapp_chat_id,(select p.id from public.profiles p where p.company_id=g.company_id and p.person_id=g.leader_person_id and p.active order by p.created_at limit 1) as responsible_id from public.groups g where g.company_id=${companyId} and g.type='cell' and g.deleted_at is null and g.is_active order by g.name`,
    sql`select id,name as full_name,login_phone as phone from public.profiles where company_id=${companyId} and active order by name`,
    sql`select model,flow_id,run_id,count(*)::int as calls,sum(coalesce(cost_usd,reserved_usd))::text as cost from public.automation_ai_usage where company_id=${companyId} and status<>'failed' and created_at>=date_trunc('month',now()) group by model,flow_id,run_id`,
    sql`select id,run_id,node_id,status,detail,created_at from public.automation_steps where company_id=${companyId} order by created_at desc limit 300`,
    sql`select id,run_id,node_id,status,last_error,chat_id,receipts from public.automation_deliveries where company_id=${companyId} order by created_at desc limit 300`,
    sql`select i.interest,p.full_name as person_name,i.created_at from public.automation_interests i join public.people p on p.id=i.person_id and p.company_id=i.company_id where i.company_id=${companyId} order by i.created_at desc limit 150`,
    sql`select id,name from public.congregations where company_id=${companyId} and deleted_at is null order by name`,
    hasPermission(user.role, "ministries.view")
      ? sql`select id,name from public.ministries where company_id=${companyId} and deleted_at is null order by name`
      : [],
    sql`select id,description as name from public.person_activities where company_id=${companyId} and deleted_at is null order by description`,
    hasPermission(user.role, "forms.view") ? sql`select id,title as name,(create_person or create_account_after_submit) as creates_person from public.forms where company_id=${companyId} and deleted_at is null order by title` : [],
    hasPermission(user.role, "crm.view") ? sql`select id,name from public.crm_stages where company_id=${companyId} and deleted_at is null order by sort_order,created_at` : [],
  ]);
  return JSON.parse(
    JSON.stringify({
      companyId,
      userId: user.id,
      role: user.role,
      flows: flows.map((flow) => ({
        ...flow,
        draft: parseStoredFlowDefinition(flow.draft),
      })),
      runs,
      tasks,
      settings: settings[0] ?? null,
      archive,
      instances,
      people,
      cells,
      responsible,
      usage,
      steps,
      deliveries,
      interests,
      congregations,
      ministries,
      activities,
      forms,
      stages,
    }),
  );
}
