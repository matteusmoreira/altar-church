"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions";
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { getSql } from "@/lib/db/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Permission } from "@/lib/types";
import type { VolunteerActionResult } from "./types";
import { getVolunteerShiftCandidates } from "./v2-actions";

const uuid = z.string().uuid();
const nullableUuid = z
  .union([uuid, z.null()])
  .optional()
  .transform((value) => value ?? null);
const status = z.enum(["pending", "active", "inactive", "suspended"]);

const volunteerSchema = z.object({
  id: nullableUuid,
  firstName: z.string().trim().min(2, "Nome obrigatório"),
  lastName: z.string().trim().optional().default(""),
  email: z
    .union([z.string().trim().email("E-mail inválido"), z.literal("")])
    .transform((value) => value || null),
  phone: z.string().trim().optional().default(""),
  registrationStatus: status.default("pending"),
  whatsappEnabled: z.boolean().default(false),
  emailEnabled: z.boolean().default(false),
  memberships: z
    .array(
      z.object({
        departmentId: uuid,
        roleName: z.string().trim().min(1).max(80),
      }),
    )
    .default([]),
  invite: z.boolean().default(false),
});

const departmentSchema = z.object({
  id: nullableUuid,
  name: z.string().trim().min(2, "Nome obrigatório"),
  description: z.string().trim().max(500).default(""),
  managerProfileId: nullableUuid,
  active: z.boolean().default(true),
});

const templateSchema = z.object({
  id: nullableUuid,
  name: z.string().trim().min(2, "Nome obrigatório"),
  description: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
  slots: z
    .array(
      z.object({
        departmentId: uuid,
        roleName: z.string().trim().min(1).max(80),
        requiredVolunteers: z.number().int().min(1).max(100),
      }),
    )
    .min(1, "Inclua ao menos uma vaga"),
});

const scheduleSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mês inválido"),
});
const assignmentSchema = z.object({
  shiftId: uuid,
  volunteerId: uuid,
  status: z
    .enum(["proposed", "notified", "confirmed", "declined", "cancelled"])
    .default("notified"),
});
const feedSchema = z.object({
  id: nullableUuid,
  title: z.string().trim().min(2, "Título obrigatório").max(160),
  content: z.string().trim().min(2, "Conteúdo obrigatório").max(5000),
  audience: z.enum(["all", "departments"]),
  departmentIds: z.array(uuid).default([]),
  publish: z.boolean().default(false),
});
const checkinSchema = z.object({
  assignmentId: uuid,
  qrToken: z.union([uuid, z.literal("")]).optional(),
});

function failure(error: unknown): VolunteerActionResult {
  if (error instanceof z.ZodError)
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Erro inesperado",
  };
}

async function context(permission: Permission) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acesso negado");
  const companyId = requireUserCompanyId(user);
  await requirePermission(permission, companyId);
  return { user, companyId };
}

async function assertManagerDepartments(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  companyId: string,
  departmentIds: string[],
) {
  if (!user) throw new Error("Acesso negado");
  if (["superadmin", "admin", "pastor"].includes(user.role)) return;
  const uniqueIds = [...new Set(departmentIds)];
  if (uniqueIds.length === 0)
    throw new Error("Acesso departamental obrigatório");
  const rows = await getSql()<{ department_id: string }[]>`
    select department_id from public.volunteer_department_access
    where company_id = ${companyId} and profile_id = ${user.id}
      and department_id = any(${uniqueIds})
  `;
  if (rows.length !== uniqueIds.length)
    throw new Error("Acesso negado ao departamento");
}

async function audit(
  action: string,
  entityTable: string,
  entityId: string,
  companyId: string,
  metadata: Record<string, unknown> = {},
) {
  await writeAuditLog({ action, entityTable, entityId, companyId, metadata });
}

function refresh() {
  revalidatePath("/voluntariado");
  revalidatePath("/eventos");
  revalidatePath("/dashboard");
}

async function assertDepartments(companyId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await getSql()<{ id: string }[]>`
    select id from public.volunteer_departments
    where company_id = ${companyId} and id = any(${ids}) and deleted_at is null
  `;
  if (rows.length !== new Set(ids).size)
    throw new Error("Departamento inválido");
}

async function inviteVolunteer(input: {
  companyId: string;
  personId: string;
  name: string;
  email: string;
  actorId: string;
}) {
  const sql = getSql();
  const existingRows = await sql<
    {
      id: string;
      person_id: string | null;
      role: string;
      auth_user_id: string | null;
    }[]
  >`
    select id, person_id, role, auth_user_id
    from public.profiles
    where company_id = ${input.companyId} and lower(email) = lower(${input.email})
    limit 1
  `;
  const existing = existingRows[0];
  if (existing?.person_id && existing.person_id !== input.personId)
    throw new Error("E-mail já vinculado a outra pessoa");

  let profileId = existing?.id ?? null;
  if (existing) {
    await sql`
      update public.profiles
      set person_id = ${input.personId}, name = ${input.name}, active = true, updated_at = now()
      where id = ${existing.id}
    `;
  } else {
    const rows = await sql<{ id: string }[]>`
      insert into public.profiles (company_id, person_id, name, email, role, active)
      values (${input.companyId}, ${input.personId}, ${input.name}, ${input.email}, 'volunteer', true)
      returning id
    `;
    profileId = rows[0]?.id ?? null;
  }
  if (!profileId) throw new Error("Perfil de acesso não foi salvo");

  if (existing?.auth_user_id) return profileId;
  const supabase = createSupabaseAdminClient();
  if (!supabase)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY obrigatória para convite");
  const invited = await supabase.auth.admin.inviteUserByEmail(input.email, {
    data: {
      name: input.name,
      role: existing?.role ?? "volunteer",
      company_id: input.companyId,
    },
  });
  if (invited.error || !invited.data.user?.id)
    throw new Error(
      `Convite Auth falhou: ${invited.error?.message ?? "sem usuário"}`,
    );
  await sql`
    update public.profiles set auth_user_id = ${invited.data.user.id}, updated_at = now()
    where id = ${profileId}
  `;
  return profileId;
}

export async function saveVolunteer(
  input: z.input<typeof volunteerSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = volunteerSchema.parse(input);
    const { user, companyId } = await context(
      parsed.id ? "volunteers.edit" : "volunteers.create",
    );
    await assertDepartments(
      companyId,
      parsed.memberships.map((membership) => membership.departmentId),
    );
    const sql = getSql();
    const existingDepartments = parsed.id
      ? await sql<{ department_id: string }[]>`
          select department_id from public.volunteer_department_memberships
          where volunteer_id = ${parsed.id} and company_id = ${companyId} and is_active
        `
      : [];
    await assertManagerDepartments(user, companyId, [
      ...existingDepartments.map((row) => row.department_id),
      ...parsed.memberships.map((membership) => membership.departmentId),
    ]);
    const fullName = [parsed.firstName, parsed.lastName]
      .filter(Boolean)
      .join(" ");
    let volunteerId = parsed.id;
    let personId: string | null = null;

    await sql.begin(async (tx) => {
      if (parsed.id) {
        const existing = await tx<{ person_id: string }[]>`
          select person_id from public.volunteer_profiles where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null
        `;
        personId = existing[0]?.person_id ?? null;
        if (!personId) throw new Error("Voluntário não encontrado");
        await tx`
          update public.people
          set first_name = ${parsed.firstName}, last_name = ${parsed.lastName}, full_name = ${fullName},
              email = ${parsed.email}, phone = ${parsed.phone}, person_type = 'volunteer', updated_by = ${user.id}
          where id = ${personId} and company_id = ${companyId} and deleted_at is null
        `;
        await tx`
          update public.volunteer_profiles
          set registration_status = ${parsed.registrationStatus}, whatsapp_enabled = ${parsed.whatsappEnabled},
              email_enabled = ${parsed.emailEnabled}, updated_by = ${user.id}
          where id = ${parsed.id} and company_id = ${companyId}
        `;
      } else {
        const people = await tx<{ id: string }[]>`
          insert into public.people (company_id, first_name, last_name, full_name, email, phone, status, person_type, is_active, created_by, updated_by)
          values (${companyId}, ${parsed.firstName}, ${parsed.lastName}, ${fullName}, ${parsed.email}, ${parsed.phone}, 'active', 'volunteer', true, ${user.id}, ${user.id})
          returning id
        `;
        personId = people[0]?.id ?? null;
        if (!personId) throw new Error("Pessoa não foi salva");
        const volunteers = await tx<{ id: string }[]>`
          insert into public.volunteer_profiles (company_id, person_id, registration_status, whatsapp_enabled, email_enabled, created_by, updated_by)
          values (${companyId}, ${personId}, ${parsed.registrationStatus}, ${parsed.whatsappEnabled}, ${parsed.emailEnabled}, ${user.id}, ${user.id})
          returning id
        `;
        volunteerId = volunteers[0]?.id ?? null;
      }
      if (!volunteerId || !personId)
        throw new Error("Voluntário não foi salvo");
      await tx`delete from public.volunteer_department_memberships where volunteer_id = ${volunteerId}`;
      for (const membership of parsed.memberships) {
        await tx`
          insert into public.volunteer_department_memberships (company_id, department_id, volunteer_id, role_name)
          values (${companyId}, ${membership.departmentId}, ${volunteerId}, ${membership.roleName})
        `;
      }
    });

    if (parsed.invite) {
      if (!parsed.email || !personId)
        throw new Error("E-mail obrigatório para convite");
      await requirePermission("volunteers.invite", companyId);
      await inviteVolunteer({
        companyId,
        personId,
        name: fullName,
        email: parsed.email,
        actorId: user.id,
      });
    }
    await audit(
      "volunteer.save",
      "volunteer_profiles",
      volunteerId ?? "",
      companyId,
      { invite: parsed.invite },
    );
    refresh();
    return { ok: true, id: volunteerId ?? undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function saveVolunteerDepartment(
  input: z.input<typeof departmentSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = departmentSchema.parse(input);
    const { user, companyId } = await context(
      parsed.id ? "volunteers.edit" : "volunteers.create",
    );
    await assertManagerDepartments(
      user,
      companyId,
      parsed.id ? [parsed.id] : [],
    );
    const sql = getSql();
    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.volunteer_departments
          set name = ${parsed.name}, description = ${parsed.description}, manager_profile_id = ${parsed.managerProfileId},
              is_active = ${parsed.active}, updated_by = ${user.id}
          where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.volunteer_departments (company_id, name, description, manager_profile_id, is_active, created_by, updated_by)
          values (${companyId}, ${parsed.name}, ${parsed.description}, ${parsed.managerProfileId}, ${parsed.active}, ${user.id}, ${user.id}) returning id
        `;
    if (!rows[0]?.id) throw new Error("Departamento não foi salvo");
    await audit(
      "volunteer_department.save",
      "volunteer_departments",
      rows[0].id,
      companyId,
    );
    refresh();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return failure(error);
  }
}

export async function saveVolunteerTemplate(
  input: z.input<typeof templateSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = templateSchema.parse(input);
    const { user, companyId } = await context(
      parsed.id ? "schedules.edit" : "schedules.create",
    );
    await assertDepartments(
      companyId,
      parsed.slots.map((slot) => slot.departmentId),
    );
    await assertManagerDepartments(
      user,
      companyId,
      parsed.slots.map((slot) => slot.departmentId),
    );
    const sql = getSql();
    let templateId = parsed.id;
    await sql.begin(async (tx) => {
      if (parsed.id) {
        const rows = await tx<{ id: string }[]>`
          update public.volunteer_schedule_templates
          set name = ${parsed.name}, description = ${parsed.description}, is_active = ${parsed.active}, updated_by = ${user.id}
          where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null returning id
        `;
        templateId = rows[0]?.id ?? null;
        await tx`delete from public.volunteer_schedule_template_slots where template_id = ${parsed.id}`;
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.volunteer_schedule_templates (company_id, name, description, is_active, created_by, updated_by)
          values (${companyId}, ${parsed.name}, ${parsed.description}, ${parsed.active}, ${user.id}, ${user.id}) returning id
        `;
        templateId = rows[0]?.id ?? null;
      }
      if (!templateId) throw new Error("Template não foi salvo");
      for (const [sortOrder, slot] of parsed.slots.entries()) {
        await tx`
          insert into public.volunteer_schedule_template_slots (company_id, template_id, department_id, role_name, required_volunteers, sort_order)
          values (${companyId}, ${templateId}, ${slot.departmentId}, ${slot.roleName}, ${slot.requiredVolunteers}, ${sortOrder})
        `;
      }
    });
    await audit(
      "volunteer_template.save",
      "volunteer_schedule_templates",
      templateId ?? "",
      companyId,
    );
    refresh();
    return { ok: true, id: templateId ?? undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function generateMonthlyVolunteerSchedule(
  input: z.input<typeof scheduleSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = scheduleSchema.parse(input);
    const { user, companyId } = await context("schedules.create");
    const sql = getSql();
    const events = await sql<
      {
        id: string;
        volunteer_template_id: string;
        starts_at: Date;
        ends_at: Date | null;
      }[]
    >`
      select id, volunteer_template_id, starts_at, ends_at
      from public.events
      where company_id = ${companyId} and volunteer_template_id is not null and deleted_at is null
        and starts_at >= ${parsed.month}::date
        and starts_at < (${parsed.month}::date + interval '1 month')
        and status = 'published'
    `;
    const eventTemplateIds = events.map((event) => event.volunteer_template_id);
    const templateDepartments = eventTemplateIds.length
      ? await sql<{ department_id: string }[]>`
          select distinct department_id from public.volunteer_schedule_template_slots
          where company_id = ${companyId} and template_id = any(${eventTemplateIds})
        `
      : [];
    await assertManagerDepartments(
      user,
      companyId,
      templateDepartments.map((row) => row.department_id),
    );
    const scheduleRows = await sql<{ id: string }[]>`
      insert into public.volunteer_schedules (company_id, month, created_by, updated_by)
      values (${companyId}, ${parsed.month}, ${user.id}, ${user.id})
      on conflict (company_id, month) do update set updated_by = excluded.updated_by, updated_at = now()
      returning id
    `;
    const scheduleId = scheduleRows[0]?.id;
    if (!scheduleId) throw new Error("Escala não foi gerada");
    for (const event of events) {
      const slots = await sql<
        {
          id: string;
          department_id: string;
          role_name: string;
          required_volunteers: number;
        }[]
      >`
        select id, department_id, role_name, required_volunteers
        from public.volunteer_schedule_template_slots
        where company_id = ${companyId} and template_id = ${event.volunteer_template_id}
      `;
      for (const slot of slots) {
        const startsAt = event.starts_at;
        const endsAt =
          event.ends_at ?? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
        const opensAt = new Date(startsAt.getTime() - 30 * 60 * 1000);
        const closesAt = new Date(endsAt.getTime() + 30 * 60 * 1000);
        await sql`
          insert into public.volunteer_shifts (
            company_id, schedule_id, event_id, template_slot_id, department_id, role_name, required_volunteers,
            starts_at, ends_at, checkin_opens_at, checkin_closes_at
          ) values (
            ${companyId}, ${scheduleId}, ${event.id}, ${slot.id}, ${slot.department_id}, ${slot.role_name}, ${slot.required_volunteers},
            ${startsAt}, ${endsAt}, ${opensAt}, ${closesAt}
          ) on conflict (schedule_id, event_id, template_slot_id) do nothing
        `;
      }
    }
    await audit(
      "volunteer_schedule.generate",
      "volunteer_schedules",
      scheduleId,
      companyId,
      { month: parsed.month, events: events.length },
    );
    refresh();
    return { ok: true, id: scheduleId };
  } catch (error) {
    return failure(error);
  }
}

export async function saveVolunteerAssignment(
  input: z.input<typeof assignmentSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = assignmentSchema.parse(input);
    const { user, companyId } = await context("schedules.edit");
    const sql = getSql();
    const shiftDepartments = await sql<{ department_id: string }[]>`
      select department_id from public.volunteer_shifts
      where id = ${parsed.shiftId} and company_id = ${companyId}
    `;
    await assertManagerDepartments(
      user,
      companyId,
      shiftDepartments.map((row) => row.department_id),
    );
    const checks = await sql<
      {
        shift_exists: boolean;
        volunteer_exists: boolean;
        available: boolean;
        already_assigned: boolean;
      }[]
    >`
      select
        exists(select 1 from public.volunteer_shifts where id = ${parsed.shiftId} and company_id = ${companyId}) as shift_exists,
        exists(select 1 from public.volunteer_profiles where id = ${parsed.volunteerId} and company_id = ${companyId} and registration_status = 'active' and deleted_at is null) as volunteer_exists,
        (
          (select count(*) from public.volunteer_assignments where shift_id = ${parsed.shiftId} and status not in ('declined', 'cancelled'))
          < (select required_volunteers from public.volunteer_shifts where id = ${parsed.shiftId})
        ) as available,
        exists(select 1 from public.volunteer_assignments where shift_id = ${parsed.shiftId} and volunteer_id = ${parsed.volunteerId}) as already_assigned
    `;
    const check = checks[0];
    if (!check?.shift_exists || !check.volunteer_exists)
      throw new Error("Escala ou voluntário inválido");
    if (!check.available && !check.already_assigned)
      throw new Error("Todas as vagas desta função já foram preenchidas");
    let score: number | null = null;
    let scoreReasons: unknown[] = [
      { code: "manual", label: "Escolha manual do líder", points: 0 },
    ];
    if (!["declined", "cancelled"].includes(parsed.status)) {
      const ranked = await getVolunteerShiftCandidates(parsed.shiftId);
      if (!ranked.ok || !Array.isArray(ranked.data))
        throw new Error(ranked.error ?? "Não foi possível validar candidato");
      const candidate = ranked.data.find(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "volunteerId" in item &&
          (item as { volunteerId: string }).volunteerId === parsed.volunteerId,
      ) as
        | {
            eligible: boolean;
            score: number;
            reasons: unknown[];
            blockers: string[];
          }
        | undefined;
      if (!candidate?.eligible)
        throw new Error(
          candidate?.blockers.join("; ") || "Voluntário indisponível",
        );
      score = candidate.score;
      scoreReasons = candidate.reasons;
    }
    const rows = await sql<{ id: string }[]>`
      insert into public.volunteer_assignments (company_id, shift_id, volunteer_id, status, score, score_reasons, is_locked, created_by, updated_by)
      values (${companyId}, ${parsed.shiftId}, ${parsed.volunteerId}, ${parsed.status}, ${score}, ${JSON.stringify(scoreReasons)}::jsonb, true, ${user.id}, ${user.id})
      on conflict (shift_id, volunteer_id) do update set status = excluded.status, score = excluded.score,
        score_reasons = excluded.score_reasons, is_locked = true, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `;
    await audit(
      "volunteer_assignment.save",
      "volunteer_assignments",
      rows[0].id,
      companyId,
    );
    refresh();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return failure(error);
  }
}

export async function publishVolunteerSchedule(
  scheduleId: string,
): Promise<VolunteerActionResult> {
  try {
    const id = uuid.parse(scheduleId);
    const { user, companyId } = await context("schedules.publish");
    const sql = getSql();
    const scheduleDepartments = await sql<{ department_id: string }[]>`
      select distinct shift.department_id
      from public.volunteer_shifts shift
      where shift.schedule_id = ${id} and shift.company_id = ${companyId}
    `;
    await assertManagerDepartments(
      user,
      companyId,
      scheduleDepartments.map((row) => row.department_id),
    );
    const schedules = await sql<{ id: string }[]>`
      update public.volunteer_schedules set status = 'published', published_at = now(), updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} returning id
    `;
    if (!schedules[0]?.id) throw new Error("Escala não encontrada");
    await sql`
      update public.volunteer_assignments assignment
      set status = 'notified', notified_at = coalesce(notified_at, now()), updated_by = ${user.id}, updated_at = now()
      from public.volunteer_shifts shift
      where assignment.shift_id = shift.id and shift.schedule_id = ${id} and assignment.status = 'proposed'
    `;
    const recipients = await sql<
      {
        assignment_id: string;
        volunteer_id: string;
        email: string | null;
        phone: string;
        email_enabled: boolean;
        whatsapp_enabled: boolean;
        push_enabled: boolean;
        event_title: string;
        starts_at: Date;
      }[]
    >`
      select assignment.id as assignment_id, volunteer.id as volunteer_id, person.email, person.phone,
             coalesce(preference.email_enabled, volunteer.email_enabled) as email_enabled,
             coalesce(preference.whatsapp_enabled, volunteer.whatsapp_enabled) as whatsapp_enabled,
             coalesce(preference.push_enabled, false) as push_enabled,
             coalesce(event.title, 'Escala') as event_title, shift.starts_at
      from public.volunteer_assignments assignment
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
      join public.people person on person.id = volunteer.person_id
      left join public.volunteer_notification_preferences preference on preference.volunteer_id = volunteer.id
      left join public.events event on event.id = shift.event_id
      where shift.schedule_id = ${id} and assignment.status not in ('declined', 'cancelled')
    `;
    for (const recipient of recipients) {
      const content = `Sua escala foi publicada: ${recipient.event_title} em ${recipient.starts_at.toLocaleString("pt-BR")}.`;
      if (recipient.whatsapp_enabled && recipient.phone) {
        await sql`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content)
          values (${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'whatsapp', ${recipient.phone}, 'Sua escala', ${content})
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
      }
      if (recipient.email_enabled && recipient.email) {
        await sql`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content)
          values (${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'email', ${recipient.email}, 'Sua escala foi publicada', ${content})
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
      }
      if (recipient.push_enabled) {
        await sql`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content, event_kind, payload)
          values (${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'push', '', 'Nova escala', ${content}, 'schedule',
            ${JSON.stringify({ url: "/voluntariado", assignmentId: recipient.assignment_id })}::jsonb)
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
      }
    }
    await audit(
      "volunteer_schedule.publish",
      "volunteer_schedules",
      id,
      companyId,
      { recipients: recipients.length },
    );
    refresh();
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}

export async function saveVolunteerFeedPost(
  input: z.input<typeof feedSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = feedSchema.parse(input);
    if (parsed.audience === "departments" && parsed.departmentIds.length === 0)
      throw new Error("Selecione departamentos");
    const { user, companyId } = await context(
      parsed.publish ? "volunteer_feed.publish" : "volunteer_feed.create",
    );
    await assertManagerDepartments(user, companyId, parsed.departmentIds);
    await assertDepartments(companyId, parsed.departmentIds);
    const sql = getSql();
    let postId = parsed.id;
    await sql.begin(async (tx) => {
      if (parsed.id) {
        const rows = await tx<{ id: string }[]>`
          update public.volunteer_feed_posts
          set title = ${parsed.title}, content = ${parsed.content}, audience = ${parsed.audience},
              status = ${parsed.publish ? "published" : "draft"}, published_at = case when ${parsed.publish} then coalesce(published_at, now()) else null end
          where id = ${parsed.id} and company_id = ${companyId} returning id
        `;
        postId = rows[0]?.id ?? null;
        await tx`delete from public.volunteer_feed_post_departments where post_id = ${parsed.id}`;
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.volunteer_feed_posts (company_id, title, content, status, audience, published_at, author_profile_id)
          values (${companyId}, ${parsed.title}, ${parsed.content}, ${parsed.publish ? "published" : "draft"}, ${parsed.audience}, ${parsed.publish ? new Date() : null}, ${user.id})
          returning id
        `;
        postId = rows[0]?.id ?? null;
      }
      if (!postId) throw new Error("Post não foi salvo");
      for (const departmentId of parsed.departmentIds) {
        await tx`insert into public.volunteer_feed_post_departments (post_id, department_id) values (${postId}, ${departmentId})`;
      }
    });
    if (parsed.publish && postId) {
      const recipients = await sql<
        {
          id: string;
          email: string | null;
          phone: string;
          email_enabled: boolean;
          whatsapp_enabled: boolean;
        }[]
      >`
        select distinct volunteer.id, person.email, person.phone, volunteer.email_enabled, volunteer.whatsapp_enabled
        from public.volunteer_profiles volunteer
        join public.people person on person.id = volunteer.person_id
        left join public.volunteer_department_memberships membership on membership.volunteer_id = volunteer.id and membership.is_active
        where volunteer.company_id = ${companyId} and volunteer.registration_status = 'active' and volunteer.deleted_at is null
          and (${parsed.audience} = 'all' or membership.department_id = any(${parsed.departmentIds}))
      `;
      for (const recipient of recipients) {
        if (recipient.whatsapp_enabled && recipient.phone)
          await sql`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, feed_post_id, channel, recipient, subject, content)
          values (${companyId}, ${recipient.id}, ${postId}, 'whatsapp', ${recipient.phone}, ${parsed.title}, ${parsed.content})
          on conflict (feed_post_id, volunteer_id, channel) do nothing
        `;
        if (recipient.email_enabled && recipient.email)
          await sql`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, feed_post_id, channel, recipient, subject, content)
          values (${companyId}, ${recipient.id}, ${postId}, 'email', ${recipient.email}, ${parsed.title}, ${parsed.content})
          on conflict (feed_post_id, volunteer_id, channel) do nothing
        `;
      }
    }
    await audit(
      "volunteer_feed.save",
      "volunteer_feed_posts",
      postId ?? "",
      companyId,
      { published: parsed.publish },
    );
    refresh();
    return { ok: true, id: postId ?? undefined };
  } catch (error) {
    return failure(error);
  }
}

export async function createVolunteerCheckinQr(
  shiftId: string,
): Promise<VolunteerActionResult> {
  try {
    const id = uuid.parse(shiftId);
    const { user, companyId } = await context("volunteer_checkin.create");
    const sql = getSql();
    const departments = await sql<{ department_id: string }[]>`
      select department_id from public.volunteer_shifts where id = ${id} and company_id = ${companyId}
    `;
    await assertManagerDepartments(
      user,
      companyId,
      departments.map((row) => row.department_id),
    );
    const rows = await sql<{ token: string }[]>`
      insert into public.volunteer_checkin_qr_sessions (company_id, shift_id, expires_at, created_by)
      select ${companyId}, id, now() + interval '10 minutes', ${user.id}
      from public.volunteer_shifts where id = ${id} and company_id = ${companyId}
      returning token
    `;
    if (!rows[0]?.token) throw new Error("Escala não encontrada");
    await audit("volunteer_checkin.qr", "volunteer_shifts", id, companyId);
    return { ok: true, qrToken: rows[0].token };
  } catch (error) {
    return failure(error);
  }
}

export async function checkInVolunteerAssignment(
  input: z.input<typeof checkinSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = checkinSchema.parse(input);
    const user = await getCurrentUser();
    if (!user || !user.churchId) throw new Error("Acesso negado");
    await requirePermission("volunteer.self.checkin", user.churchId);
    const sql = getSql();
    const rows = await sql<{ id: string; shift_id: string }[]>`
      select assignment.id, assignment.shift_id
      from public.volunteer_assignments assignment
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
      join public.profiles profile on profile.person_id = volunteer.person_id
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      where assignment.id = ${parsed.assignmentId} and profile.id = ${user.id} and assignment.company_id = ${user.churchId}
        and assignment.status in ('notified', 'confirmed')
        and now() between shift.checkin_opens_at and shift.checkin_closes_at
      limit 1
    `;
    const assignment = rows[0];
    if (!assignment) throw new Error("Check-in indisponível");
    const source = parsed.qrToken ? "qr" : "button";
    if (parsed.qrToken) {
      const sessions = await sql<{ token: string }[]>`
        select token from public.volunteer_checkin_qr_sessions
        where token = ${parsed.qrToken} and shift_id = ${assignment.shift_id} and company_id = ${user.churchId} and expires_at > now()
      `;
      if (!sessions[0]) throw new Error("QR inválido ou expirado");
    }
    await sql`
      update public.volunteer_assignments
      set status = 'checked_in', checked_in_at = coalesce(checked_in_at, now()), checkin_source = ${source}, updated_by = ${user.id}
      where id = ${assignment.id}
    `;
    await audit(
      "volunteer_checkin.create",
      "volunteer_assignments",
      assignment.id,
      user.churchId,
      { source },
    );
    refresh();
    return { ok: true, id: assignment.id };
  } catch (error) {
    return failure(error);
  }
}

export async function markVolunteerFeedRead(
  postId: string,
): Promise<VolunteerActionResult> {
  try {
    const id = uuid.parse(postId);
    const user = await getCurrentUser();
    if (!user || !user.churchId) throw new Error("Acesso negado");
    await requirePermission("volunteer.self.view", user.churchId);
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`
      select volunteer.id
      from public.volunteer_profiles volunteer
      join public.profiles profile on profile.person_id = volunteer.person_id
      where profile.id = ${user.id} and volunteer.company_id = ${user.churchId} and volunteer.deleted_at is null
      limit 1
    `;
    if (!rows[0]?.id) throw new Error("Perfil de voluntário não vinculado");
    await sql`
      insert into public.volunteer_feed_reads (post_id, volunteer_id) values (${id}, ${rows[0].id})
      on conflict (post_id, volunteer_id) do nothing
    `;
    revalidatePath("/voluntariado");
    return { ok: true, id };
  } catch (error) {
    return failure(error);
  }
}
