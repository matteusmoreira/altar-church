"use server";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions";
import { automationAccess } from "./data";
import { revalidatePath } from "next/cache";
export async function enrollReadingParticipant(form: FormData) {
  const { companyId } = await automationAccess("automations.tasks");
  await requirePermission("content.edit", companyId);
  const planId = z.string().uuid().parse(form.get("planId")),
    personId = z.string().uuid().parse(form.get("personId")),
    sql = getSql();
  const rows =
    await sql`insert into public.reading_plan_enrollments(company_id,plan_id,person_id) select ${companyId},p.id,person.id from public.reading_plans p join public.people person on person.id=${personId} and person.company_id=p.company_id and person.is_active and person.deleted_at is null where p.id=${planId} and p.company_id=${companyId} and p.status='published' and p.deleted_at is null on conflict(plan_id,person_id) do nothing returning id`;
  if (!rows[0])
    throw new Error("Plano/pessoa indisponível ou pessoa já inscrita");
  await writeAuditLog({
    action: "discipleship.enroll",
    entityTable: "reading_plan_enrollments",
    entityId: rows[0].id,
    companyId,
  });
  revalidatePath("/discipulado");
}
export async function completeReadingParticipantStep(form: FormData) {
  const { companyId } = await automationAccess("automations.tasks");
  await requirePermission("content.edit", companyId);
  const enrollmentId = z.string().uuid().parse(form.get("enrollmentId")),
    stepId = z.string().uuid().parse(form.get("stepId")),
    sql = getSql();
  await sql.begin(async (tx) => {
    const [enrollment] =
      await tx`select * from public.reading_plan_enrollments where id=${enrollmentId} and company_id=${companyId} and status='in_progress' for update`;
    if (!enrollment) throw new Error("Inscrição não disponível");
    const saved =
      await tx`insert into public.reading_plan_person_progress(company_id,enrollment_id,step_id,person_id) select ${companyId},${enrollmentId},id,${enrollment.person_id} from public.reading_plan_steps where id=${stepId} and plan_id=${enrollment.plan_id} and company_id=${companyId} and deleted_at is null on conflict(enrollment_id,step_id) do nothing returning id`;
    if (!saved[0]) throw new Error("Etapa indisponível ou já concluída");
    const incomplete =
      await tx`select id from public.reading_plan_steps s where s.plan_id=${enrollment.plan_id} and s.company_id=${companyId} and s.deleted_at is null and not exists(select 1 from public.reading_plan_person_progress p where p.enrollment_id=${enrollmentId} and p.step_id=s.id)`;
    if (!incomplete.length)
      await tx`update public.reading_plan_enrollments set status='completed',updated_at=now() where id=${enrollmentId}`;
  });
  await writeAuditLog({
    action: "discipleship.progress",
    entityTable: "reading_plan_enrollments",
    entityId: enrollmentId,
    companyId,
  });
  revalidatePath("/discipulado");
}
