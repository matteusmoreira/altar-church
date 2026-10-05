import { getSql } from "@/lib/db/client";

export async function moveAutomationKanban(input: {
  companyId: string;
  runId: string;
  nodeId: string;
  leaseToken: string | null;
  personId: string | null;
  stageId: string;
  cardId?: string;
  actorId: string;
}) {
  if (!input.personId) throw new Error("Pessoa não identificada");
  return getSql().begin(async (tx) => {
    const [run] =
      await tx`select id from public.automation_runs where id=${input.runId} and company_id=${input.companyId} and lease_token=${input.leaseToken} and status='working' for update`;
    if (!run) throw new Error("Execução pausada ou cancelada");
    const [previous] =
      await tx`select card_id from public.automation_kanban_moves where run_id=${input.runId} and node_id=${input.nodeId} and company_id=${input.companyId}`;
    if (previous) return String(previous.card_id);
    const [person] =
      await tx`select id,full_name,phone,email from public.people where id=${input.personId} and company_id=${input.companyId} and deleted_at is null for update`;
    if (!person) throw new Error("Pessoa não encontrada nesta igreja");
    const [stage] =
      await tx`select id from public.crm_stages where id=${input.stageId} and company_id=${input.companyId} and deleted_at is null for share`;
    if (!stage) throw new Error("Coluna não disponível nesta igreja");
    const cards = input.cardId
      ? await tx`select id from public.crm_cards where id=${input.cardId}::uuid and company_id=${input.companyId} and person_id=${input.personId} and deleted_at is null for update`
      : await tx`select id from public.crm_cards where company_id=${input.companyId} and person_id=${input.personId} and deleted_at is null order by created_at desc,id desc limit 1 for update`;
    if (input.cardId && !cards[0])
      throw new Error("Card da resposta não disponível para esta pessoa");
    await tx`select set_config('app.automation_run_id',${input.runId},true)`;
    const [card] = cards[0]
      ? await tx`update public.crm_cards set stage_id=${input.stageId},updated_by=${input.actorId},updated_at=now() where id=${cards[0].id} and company_id=${input.companyId} returning id`
      : await tx`insert into public.crm_cards(company_id,person_id,person_name,person_phone,person_email,stage_id,source,notes,created_by,updated_by) values(${input.companyId},${input.personId},${person.full_name},${person.phone ?? ""},${person.email ?? ""},${input.stageId},'Automação','',${input.actorId},${input.actorId}) returning id`;
    await tx`insert into public.automation_kanban_moves(company_id,run_id,node_id,card_id,stage_id) values(${input.companyId},${input.runId},${input.nodeId},${card.id},${input.stageId})`;
    return String(card.id);
  });
}
