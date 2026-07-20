"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions";
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { getSql } from "@/lib/db/client";
import { uploadManagedFile } from "@/lib/files/server";
import type { Permission } from "@/lib/types";
import {
  rankVolunteersForShift,
  selectVolunteersForShift,
  type SchedulerCandidateInput,
} from "./scheduler";
import type { VolunteerActionResult } from "./types";
import { requireVolunteerSelfContext } from "./access";

const uuid = z.string().uuid();
const optionalUuid = z
  .union([uuid, z.null()])
  .optional()
  .transform((value) => value ?? null);

function resultError(error: unknown): VolunteerActionResult {
  if (error instanceof z.ZodError)
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Erro inesperado",
  };
}

function refreshVolunteerPaths() {
  revalidatePath("/voluntariado");
  revalidatePath("/membro/voluntariado");
  revalidatePath("/eventos");
  revalidatePath("/louvor");
  revalidatePath("/dashboard");
}

async function managerContext(
  permission: Permission,
  departmentId?: string | null,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acesso negado");
  const companyId = requireUserCompanyId(user);
  await requirePermission(permission, companyId);
  if (
    user.role === "superadmin" ||
    user.role === "admin" ||
    user.role === "pastor"
  )
    return { user, companyId };
  const sql = getSql();
  const rows = departmentId
    ? await sql<{ allowed: boolean }[]>`
        select exists(select 1 from public.volunteer_department_access
          where company_id = ${companyId} and department_id = ${departmentId} and profile_id = ${user.id}) as allowed
      `
    : await sql<{ allowed: boolean }[]>`
        select exists(select 1 from public.volunteer_department_access
          where company_id = ${companyId} and profile_id = ${user.id}) as allowed
      `;
  if (!rows[0]?.allowed) throw new Error("Acesso negado");
  return { user, companyId };
}

async function volunteerContext(permission: Permission) {
  void permission;
  return requireVolunteerSelfContext();
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

const roleSchema = z.object({
  id: optionalUuid,
  departmentId: z.string().uuid("Selecione uma equipe"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  instructions: z.string().trim().max(3000).default(""),
  active: z.boolean().default(true),
});

export async function saveVolunteerDepartmentRole(
  input: z.input<typeof roleSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = roleSchema.parse(input);
    const { user, companyId } = await managerContext(
      "volunteers.edit",
      parsed.departmentId,
    );
    const sql = getSql();
    const duplicates = await sql<{ id: string }[]>`
      select id from public.volunteer_department_roles
      where company_id = ${companyId}
        and department_id = ${parsed.departmentId}
        and lower(name) = lower(${parsed.name})
        and deleted_at is null
        and (${parsed.id}::uuid is null or id <> ${parsed.id}::uuid)
      limit 1
    `;
    if (duplicates[0]?.id)
      throw new Error("Já existe uma função com este nome nesta equipe");
    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.volunteer_department_roles set department_id = ${parsed.departmentId}, name = ${parsed.name},
            description = ${parsed.description}, instructions = ${parsed.instructions}, is_active = ${parsed.active}
          where id = ${parsed.id} and company_id = ${companyId}
            and deleted_at is null returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.volunteer_department_roles(company_id, department_id, name, description, instructions)
          values (${companyId}, ${parsed.departmentId}, ${parsed.name}, ${parsed.description}, ${parsed.instructions}) returning id
        `;
    if (!rows[0]?.id)
      throw new Error(
        "Função não encontrada. Recarregue a página e tente novamente",
      );
    await audit(
      "volunteer_department_role.save",
      "volunteer_department_roles",
      rows[0].id,
      companyId,
      { actor: user.id },
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

const accessSchema = z.object({
  departmentId: uuid,
  profileId: uuid,
  role: z.enum(["coordinator", "leader", "scheduler"]),
});

export async function saveVolunteerDepartmentAccess(
  input: z.input<typeof accessSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = accessSchema.parse(input);
    const { companyId } = await managerContext(
      "volunteer_settings.manage",
      parsed.departmentId,
    );
    const rows = await getSql()<{ id: string }[]>`
      insert into public.volunteer_department_access(company_id, department_id, profile_id, access_role)
      select ${companyId}, ${parsed.departmentId}, profile.id, ${parsed.role}
      from public.profiles profile where profile.id = ${parsed.profileId} and profile.company_id = ${companyId} and profile.active
      on conflict (department_id, profile_id) do update set access_role = excluded.access_role, updated_at = now()
      returning id
    `;
    if (!rows[0]?.id) throw new Error("Perfil ou departamento inválido");
    await audit(
      "volunteer_department_access.save",
      "volunteer_department_access",
      rows[0].id,
      companyId,
      { role: parsed.role },
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

const availabilitySchema = z
  .object({
    desiredServicesPerMonth: z.number().int().min(0).max(31),
    maxServicesPerMonth: z.number().int().min(1).max(62),
    minimumRestHours: z.number().int().min(0).max(168),
    rules: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          available: z.boolean(),
          startsAt: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .nullable(),
          endsAt: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .nullable(),
          validFrom: z.string().date().nullable(),
          validUntil: z.string().date().nullable(),
        }),
      )
      .max(50),
    exceptions: z
      .array(
        z.object({
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          available: z.boolean(),
          reason: z.string().trim().max(300).default(""),
        }),
      )
      .max(200),
    preferences: z
      .array(
        z.object({
          departmentId: uuid,
          roleId: optionalUuid,
          roleName: z.string().trim().min(1).max(80),
          preference: z.number().int().min(-2).max(2),
        }),
      )
      .max(100),
  })
  .refine(
    (value) => value.desiredServicesPerMonth <= value.maxServicesPerMonth,
    { message: "Frequência desejada deve respeitar limite mensal" },
  );

export async function saveMyVolunteerAvailability(
  input: z.input<typeof availabilitySchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = availabilitySchema.parse(input);
    const { user, companyId, volunteerId } = await volunteerContext(
      "volunteer.self.availability",
    );
    const sql = getSql();
    await sql.begin(async (tx) => {
      await tx`update public.volunteer_profiles set desired_services_per_month = ${parsed.desiredServicesPerMonth},
        max_services_per_month = ${parsed.maxServicesPerMonth}, minimum_rest_hours = ${parsed.minimumRestHours}, updated_by = ${user.id}
        where id = ${volunteerId} and company_id = ${companyId}`;
      await tx`delete from public.volunteer_availability_rules where volunteer_id = ${volunteerId}`;
      await tx`delete from public.volunteer_availability_exceptions where volunteer_id = ${volunteerId}`;
      await tx`delete from public.volunteer_role_preferences where volunteer_id = ${volunteerId}`;
      for (const rule of parsed.rules)
        await tx`
        insert into public.volunteer_availability_rules(company_id, volunteer_id, weekday, available, starts_at, ends_at, valid_from, valid_until)
        values (${companyId}, ${volunteerId}, ${rule.weekday}, ${rule.available}, ${rule.startsAt}, ${rule.endsAt}, ${rule.validFrom}, ${rule.validUntil})
      `;
      for (const exception of parsed.exceptions)
        await tx`
        insert into public.volunteer_availability_exceptions(company_id, volunteer_id, starts_at, ends_at, available, reason)
        values (${companyId}, ${volunteerId}, ${exception.startsAt}, ${exception.endsAt}, ${exception.available}, ${exception.reason})
      `;
      for (const preference of parsed.preferences)
        await tx`
        insert into public.volunteer_role_preferences(company_id, volunteer_id, department_id, role_id, role_name, preference)
        values (${companyId}, ${volunteerId}, ${preference.departmentId}, ${preference.roleId}, ${preference.roleName}, ${preference.preference})
      `;
    });
    await audit(
      "volunteer_availability.save",
      "volunteer_profiles",
      volunteerId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: volunteerId };
  } catch (error) {
    return resultError(error);
  }
}

export async function saveVolunteerAvailabilityForManager(
  input: z.input<typeof availabilitySchema> & { volunteerId: string },
): Promise<VolunteerActionResult> {
  try {
    const volunteerId = uuid.parse(input.volunteerId);
    const rows = await getSql()<{ department_id: string }[]>`
      select department_id from public.volunteer_department_memberships where volunteer_id = ${volunteerId} and is_active
    `;
    if (rows.length === 0) {
      const access = await managerContext("volunteers.edit");
      if (!["superadmin", "admin", "pastor"].includes(access.user.role))
        throw new Error("Acesso negado");
    }
    for (const row of rows)
      await managerContext("volunteers.edit", row.department_id);
    const current = await getCurrentUser();
    if (!current) throw new Error("Acesso negado");
    // Manager flow uses the same durable writes, but cannot impersonate self action.
    const parsed = availabilitySchema.parse(input);
    const companyId = requireUserCompanyId(current);
    const sql = getSql();
    await sql.begin(async (tx) => {
      await tx`update public.volunteer_profiles set desired_services_per_month = ${parsed.desiredServicesPerMonth},
        max_services_per_month = ${parsed.maxServicesPerMonth}, minimum_rest_hours = ${parsed.minimumRestHours}, updated_by = ${current.id}
        where id = ${volunteerId} and company_id = ${companyId}`;
      await tx`delete from public.volunteer_availability_rules where volunteer_id = ${volunteerId}`;
      await tx`delete from public.volunteer_availability_exceptions where volunteer_id = ${volunteerId}`;
      await tx`delete from public.volunteer_role_preferences where volunteer_id = ${volunteerId}`;
      for (const rule of parsed.rules)
        await tx`insert into public.volunteer_availability_rules(company_id, volunteer_id, weekday, available, starts_at, ends_at, valid_from, valid_until)
        values (${companyId}, ${volunteerId}, ${rule.weekday}, ${rule.available}, ${rule.startsAt}, ${rule.endsAt}, ${rule.validFrom}, ${rule.validUntil})`;
      for (const exception of parsed.exceptions)
        await tx`insert into public.volunteer_availability_exceptions(company_id, volunteer_id, starts_at, ends_at, available, reason)
        values (${companyId}, ${volunteerId}, ${exception.startsAt}, ${exception.endsAt}, ${exception.available}, ${exception.reason})`;
      for (const preference of parsed.preferences)
        await tx`insert into public.volunteer_role_preferences(company_id, volunteer_id, department_id, role_id, role_name, preference)
        values (${companyId}, ${volunteerId}, ${preference.departmentId}, ${preference.roleId}, ${preference.roleName}, ${preference.preference})`;
    });
    await audit(
      "volunteer_availability.manager_save",
      "volunteer_profiles",
      volunteerId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: volunteerId };
  } catch (error) {
    return resultError(error);
  }
}

export async function generateSmartVolunteerSchedule(
  scheduleIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const scheduleId = uuid.parse(scheduleIdInput);
    const sql = getSql();
    const scheduleRows = await sql<
      { company_id: string }[]
    >`select company_id from public.volunteer_schedules where id = ${scheduleId}`;
    const companyId = scheduleRows[0]?.company_id;
    if (!companyId) throw new Error("Escala não encontrada");
    const { user } = await managerContext("schedules.edit");
    const settingRows = await sql<{ timezone: string }[]>`
      select timezone from public.volunteer_module_settings where company_id = ${companyId}
    `;
    const timezone = settingRows[0]?.timezone ?? "America/Sao_Paulo";
    const [
      shiftRows,
      volunteerRows,
      membershipRows,
      ruleRows,
      exceptionRows,
      preferenceRows,
      assignmentRows,
    ] = await Promise.all([
      sql<
        Record<string, unknown>[]
      >`select id, department_id, role_name, required_volunteers, starts_at, coalesce(ends_at, starts_at + interval '2 hours') as ends_at
        from public.volunteer_shifts where schedule_id = ${scheduleId} and company_id = ${companyId} order by starts_at, id`,
      sql<
        Record<string, unknown>[]
      >`select volunteer.id, person.full_name as name, volunteer.registration_status,
          volunteer.desired_services_per_month, volunteer.max_services_per_month, volunteer.minimum_rest_hours
        from public.volunteer_profiles volunteer join public.people person on person.id = volunteer.person_id
        where volunteer.company_id = ${companyId} and volunteer.deleted_at is null`,
      sql<
        Record<string, unknown>[]
      >`select volunteer_id, department_id, role_name from public.volunteer_department_memberships
        where company_id = ${companyId} and is_active`,
      sql<
        Record<string, unknown>[]
      >`select volunteer_id, weekday, available, starts_at, ends_at, valid_from, valid_until
        from public.volunteer_availability_rules where company_id = ${companyId}`,
      sql<
        Record<string, unknown>[]
      >`select volunteer_id, starts_at, ends_at, available from public.volunteer_availability_exceptions
        where company_id = ${companyId} and ends_at >= now() - interval '1 month'`,
      sql<
        Record<string, unknown>[]
      >`select volunteer_id, department_id, role_name, preference from public.volunteer_role_preferences where company_id = ${companyId}`,
      sql<
        Record<string, unknown>[]
      >`select assignment.id, assignment.volunteer_id, assignment.shift_id, assignment.status,
          assignment.is_locked, shift.starts_at, coalesce(shift.ends_at, shift.starts_at + interval '2 hours') as ends_at, shift.role_name
        from public.volunteer_assignments assignment join public.volunteer_shifts shift on shift.id = assignment.shift_id
        where assignment.company_id = ${companyId} and shift.starts_at >= now() - interval '6 months'`,
    ]);
    for (const departmentId of new Set(
      shiftRows.map((row) => String(row.department_id)),
    )) {
      await managerContext("schedules.edit", departmentId);
    }
    const textTime = (value: unknown) =>
      value ? String(value).slice(0, 5) : null;
    const iso = (value: unknown) =>
      value instanceof Date ? value.toISOString() : String(value);
    const candidates: SchedulerCandidateInput[] = volunteerRows.map((row) => {
      const memberships = membershipRows.filter(
        (item) => item.volunteer_id === row.id,
      );
      return {
        id: String(row.id),
        name: String(row.name),
        active: row.registration_status === "active",
        departmentIds: memberships.map((item) => String(item.department_id)),
        roleNames: memberships.map((item) => String(item.role_name)),
        desiredServicesPerMonth: Number(row.desired_services_per_month),
        maxServicesPerMonth: Number(row.max_services_per_month),
        minimumRestHours: Number(row.minimum_rest_hours),
        preference: 0,
        availabilityRules: ruleRows
          .filter((item) => item.volunteer_id === row.id)
          .map((item) => ({
            weekday: Number(item.weekday),
            available: Boolean(item.available),
            startsAt: textTime(item.starts_at),
            endsAt: textTime(item.ends_at),
            validFrom: item.valid_from
              ? iso(item.valid_from).slice(0, 10)
              : null,
            validUntil: item.valid_until
              ? iso(item.valid_until).slice(0, 10)
              : null,
          })),
        availabilityExceptions: exceptionRows
          .filter((item) => item.volunteer_id === row.id)
          .map((item) => ({
            startsAt: iso(item.starts_at),
            endsAt: iso(item.ends_at),
            available: Boolean(item.available),
          })),
        assignments: assignmentRows
          .filter((item) => item.volunteer_id === row.id)
          .map((item) => ({
            startsAt: iso(item.starts_at),
            endsAt: iso(item.ends_at),
            status: String(item.status),
            roleName: String(item.role_name),
          })),
      };
    });
    let created = 0;
    let shortages = 0;
    for (const shiftRow of shiftRows) {
      const shift = {
        id: String(shiftRow.id),
        departmentId: String(shiftRow.department_id),
        roleName: String(shiftRow.role_name),
        requiredVolunteers: Number(shiftRow.required_volunteers),
        startsAt: iso(shiftRow.starts_at),
        endsAt: iso(shiftRow.ends_at),
        timezone,
      };
      const existing = assignmentRows.filter(
        (item) =>
          item.shift_id === shiftRow.id &&
          !["declined", "cancelled"].includes(String(item.status)),
      );
      const lockedIds = new Set(
        existing
          .filter((item) => item.is_locked)
          .map((item) => String(item.volunteer_id)),
      );
      const needed = Math.max(0, shift.requiredVolunteers - existing.length);
      if (needed === 0) continue;
      const prepared = candidates.map((candidate) => ({
        ...candidate,
        preference: Number(
          preferenceRows.find(
            (item) =>
              item.volunteer_id === candidate.id &&
              item.department_id === shift.departmentId &&
              String(item.role_name).toLocaleLowerCase("pt-BR") ===
                shift.roleName.toLocaleLowerCase("pt-BR"),
          )?.preference ?? 0,
        ),
      }));
      const selected = selectVolunteersForShift(
        prepared,
        { ...shift, requiredVolunteers: needed },
        lockedIds,
      );
      shortages += needed - selected.length;
      for (const candidate of selected) {
        const rows = await sql<{ id: string }[]>`
          insert into public.volunteer_assignments(company_id, shift_id, volunteer_id, status, score, score_reasons, created_by, updated_by)
          values (${companyId}, ${shift.id}, ${candidate.volunteerId}, 'proposed', ${candidate.score}, ${JSON.stringify(candidate.reasons)}::jsonb, ${user.id}, ${user.id})
          on conflict (shift_id, volunteer_id) do update set score = excluded.score, score_reasons = excluded.score_reasons,
            updated_by = excluded.updated_by, updated_at = now() where not public.volunteer_assignments.is_locked returning id
        `;
        if (rows[0]?.id) {
          created += 1;
          const target = candidates.find(
            (item) => item.id === candidate.volunteerId,
          );
          target?.assignments.push({
            startsAt: shift.startsAt,
            endsAt: shift.endsAt,
            status: "proposed",
            roleName: shift.roleName,
          });
        }
      }
    }
    await audit(
      "volunteer_schedule.smart_generate",
      "volunteer_schedules",
      scheduleId,
      companyId,
      { created, shortages },
    );
    refreshVolunteerPaths();
    return { ok: true, id: scheduleId, data: { created, shortages } };
  } catch (error) {
    return resultError(error);
  }
}

export async function getVolunteerShiftCandidates(
  shiftIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const shiftId = uuid.parse(shiftIdInput);
    const sql = getSql();
    const shifts = await sql<
      Record<string, unknown>[]
    >`select id, company_id, department_id, role_name, required_volunteers, starts_at,
      coalesce(ends_at, starts_at + interval '2 hours') as ends_at from public.volunteer_shifts where id = ${shiftId}`;
    const shiftRow = shifts[0];
    if (!shiftRow) throw new Error("Vaga não encontrada");
    await managerContext("schedules.view", String(shiftRow.department_id));
    const settingRows = await sql<{ timezone: string }[]>`
      select timezone from public.volunteer_module_settings where company_id = ${String(shiftRow.company_id)}
    `;
    const timezone = settingRows[0]?.timezone ?? "America/Sao_Paulo";
    const volunteers = await sql<Record<string, unknown>[]>`
      select volunteer.id, person.full_name as name, volunteer.registration_status, volunteer.desired_services_per_month,
        volunteer.max_services_per_month, volunteer.minimum_rest_hours,
        array_agg(distinct membership.department_id::text) as department_ids,
        array_agg(distinct membership.role_name) as role_names,
        coalesce(preference.preference, 0) as preference
      from public.volunteer_profiles volunteer join public.people person on person.id = volunteer.person_id
      join public.volunteer_department_memberships membership on membership.volunteer_id = volunteer.id and membership.is_active
      left join public.volunteer_role_preferences preference on preference.volunteer_id = volunteer.id
        and preference.department_id = ${String(shiftRow.department_id)} and lower(preference.role_name) = lower(${String(shiftRow.role_name)})
      where volunteer.company_id = ${String(shiftRow.company_id)} and volunteer.deleted_at is null
      group by volunteer.id, person.full_name, preference.preference
    `;
    const iso = (value: unknown) =>
      value instanceof Date ? value.toISOString() : String(value);
    const candidates: SchedulerCandidateInput[] = [];
    for (const volunteer of volunteers) {
      const [rules, exceptions, history] = await Promise.all([
        sql<
          Record<string, unknown>[]
        >`select weekday, available, starts_at, ends_at, valid_from, valid_until from public.volunteer_availability_rules where volunteer_id = ${String(volunteer.id)}`,
        sql<
          Record<string, unknown>[]
        >`select starts_at, ends_at, available from public.volunteer_availability_exceptions where volunteer_id = ${String(volunteer.id)}`,
        sql<
          Record<string, unknown>[]
        >`select shift.starts_at, coalesce(shift.ends_at, shift.starts_at + interval '2 hours') as ends_at, assignment.status, shift.role_name
          from public.volunteer_assignments assignment join public.volunteer_shifts shift on shift.id = assignment.shift_id where assignment.volunteer_id = ${String(volunteer.id)}`,
      ]);
      candidates.push({
        id: String(volunteer.id),
        name: String(volunteer.name),
        active: volunteer.registration_status === "active",
        departmentIds: volunteer.department_ids as string[],
        roleNames: volunteer.role_names as string[],
        desiredServicesPerMonth: Number(volunteer.desired_services_per_month),
        maxServicesPerMonth: Number(volunteer.max_services_per_month),
        minimumRestHours: Number(volunteer.minimum_rest_hours),
        preference: Number(volunteer.preference),
        availabilityRules: rules.map((row) => ({
          weekday: Number(row.weekday),
          available: Boolean(row.available),
          startsAt: row.starts_at ? String(row.starts_at).slice(0, 5) : null,
          endsAt: row.ends_at ? String(row.ends_at).slice(0, 5) : null,
          validFrom: row.valid_from ? iso(row.valid_from).slice(0, 10) : null,
          validUntil: row.valid_until
            ? iso(row.valid_until).slice(0, 10)
            : null,
        })),
        availabilityExceptions: exceptions.map((row) => ({
          startsAt: iso(row.starts_at),
          endsAt: iso(row.ends_at),
          available: Boolean(row.available),
        })),
        assignments: history.map((row) => ({
          startsAt: iso(row.starts_at),
          endsAt: iso(row.ends_at),
          status: String(row.status),
          roleName: String(row.role_name),
        })),
      });
    }
    const ranked = rankVolunteersForShift(candidates, {
      id: shiftId,
      departmentId: String(shiftRow.department_id),
      roleName: String(shiftRow.role_name),
      requiredVolunteers: Number(shiftRow.required_volunteers),
      startsAt: iso(shiftRow.starts_at),
      endsAt: iso(shiftRow.ends_at),
      timezone,
    });
    return { ok: true, id: shiftId, data: ranked };
  } catch (error) {
    return resultError(error);
  }
}

const responseSchema = z.object({
  assignmentId: uuid,
  response: z.enum(["confirmed", "declined"]),
  reason: z.string().trim().max(500).default(""),
});
export async function respondVolunteerAssignment(
  input: z.input<typeof responseSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = responseSchema.parse(input);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.respond",
    );
    const rows = await getSql()<{ id: string }[]>`
      update public.volunteer_assignments set status = ${parsed.response}, responded_at = now(),
        decline_reason = ${parsed.response === "declined" ? parsed.reason : null}, updated_at = now()
      where id = ${parsed.assignmentId} and company_id = ${companyId} and volunteer_id = ${volunteerId}
        and status in ('proposed', 'notified') returning id
    `;
    if (!rows[0]?.id) throw new Error("Escala não encontrada ou já respondida");
    await audit(
      `volunteer_assignment.${parsed.response}`,
      "volunteer_assignments",
      rows[0].id,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

const swapSchema = z.object({
  assignmentId: uuid,
  replacementVolunteerId: optionalUuid,
  reason: z.string().trim().min(2).max(500),
});
export async function requestVolunteerSwap(
  input: z.input<typeof swapSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = swapSchema.parse(input);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.swap",
    );
    const rows = await getSql()<{ id: string }[]>`
      insert into public.volunteer_swap_requests(company_id, assignment_id, requested_by_volunteer_id, replacement_volunteer_id, status, reason)
      select ${companyId}, assignment.id, ${volunteerId}, ${parsed.replacementVolunteerId},
        case when ${parsed.replacementVolunteerId}::uuid is null then 'open' else 'offered' end, ${parsed.reason}
      from public.volunteer_assignments assignment
      where assignment.id = ${parsed.assignmentId} and assignment.volunteer_id = ${volunteerId}
        and assignment.status in ('notified', 'confirmed') returning id
    `;
    if (!rows[0]?.id) throw new Error("Escala não pode ser trocada");
    await audit(
      "volunteer_swap.request",
      "volunteer_swap_requests",
      rows[0].id,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

export async function acceptVolunteerSwap(
  swapIdInput: string,
  accept: boolean,
): Promise<VolunteerActionResult> {
  try {
    const swapId = uuid.parse(swapIdInput);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.swap",
    );
    const sql = getSql();
    const rows = await sql<
      { id: string; assignment_id: string; require_approval: boolean }[]
    >`
      update public.volunteer_swap_requests swap set status = ${accept ? "accepted" : "rejected"}, replacement_responded_at = now(), updated_at = now()
      from public.volunteer_module_settings settings
      where swap.id = ${swapId} and swap.company_id = ${companyId} and swap.replacement_volunteer_id = ${volunteerId}
        and swap.status = 'offered' and settings.company_id = swap.company_id
      returning swap.id, swap.assignment_id, settings.require_swap_approval
    `;
    const swap = rows[0];
    if (!swap) throw new Error("Troca não encontrada");
    if (accept && !swap.require_approval) {
      await sql.begin(async (tx) => {
        await tx`update public.volunteer_assignments assignment set volunteer_id = ${volunteerId}, status = 'confirmed', responded_at = now(), updated_at = now()
          where assignment.id = ${swap.assignment_id}`;
        await tx`update public.volunteer_swap_requests set status = 'approved', reviewed_at = now() where id = ${swapId}`;
      });
    }
    await audit(
      accept ? "volunteer_swap.accept" : "volunteer_swap.reject",
      "volunteer_swap_requests",
      swapId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: swapId };
  } catch (error) {
    return resultError(error);
  }
}

export async function reviewVolunteerSwap(
  swapIdInput: string,
  approve: boolean,
): Promise<VolunteerActionResult> {
  try {
    const swapId = uuid.parse(swapIdInput);
    const sql = getSql();
    const swapRows = await sql<
      {
        company_id: string;
        assignment_id: string;
        replacement_volunteer_id: string | null;
        department_id: string;
      }[]
    >`
      select swap.company_id, swap.assignment_id, swap.replacement_volunteer_id, shift.department_id
      from public.volunteer_swap_requests swap join public.volunteer_assignments assignment on assignment.id = swap.assignment_id
      join public.volunteer_shifts shift on shift.id = assignment.shift_id where swap.id = ${swapId} and swap.status in ('open', 'accepted')
    `;
    const swap = swapRows[0];
    if (!swap) throw new Error("Troca não encontrada");
    const { user, companyId } = await managerContext(
      "volunteer_swap.manage",
      swap.department_id,
    );
    if (approve && !swap.replacement_volunteer_id)
      throw new Error("Substituto obrigatório");
    await sql.begin(async (tx) => {
      await tx`update public.volunteer_swap_requests set status = ${approve ? "approved" : "rejected"}, reviewed_by = ${user.id}, reviewed_at = now(), updated_at = now() where id = ${swapId}`;
      if (approve)
        await tx`update public.volunteer_assignments set volunteer_id = ${swap.replacement_volunteer_id}, status = 'confirmed', responded_at = now(), updated_by = ${user.id}, updated_at = now() where id = ${swap.assignment_id}`;
    });
    await audit(
      approve ? "volunteer_swap.approve" : "volunteer_swap.reject",
      "volunteer_swap_requests",
      swapId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: swapId };
  } catch (error) {
    return resultError(error);
  }
}

export async function checkOutVolunteerAssignment(
  assignmentIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const assignmentId = uuid.parse(assignmentIdInput);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.checkin",
    );
    const rows = await getSql()<{ id: string }[]>`
      update public.volunteer_assignments set status = 'checked_out', checked_out_at = now(), checkout_source = 'button', updated_at = now()
      where id = ${assignmentId} and company_id = ${companyId} and volunteer_id = ${volunteerId} and status = 'checked_in' returning id
    `;
    if (!rows[0]?.id) throw new Error("Check-out indisponível");
    await audit(
      "volunteer_checkout.create",
      "volunteer_assignments",
      assignmentId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: assignmentId };
  } catch (error) {
    return resultError(error);
  }
}

export async function uploadVolunteerShiftFile(
  formData: FormData,
): Promise<VolunteerActionResult> {
  try {
    const shiftId = uuid.parse(String(formData.get("shiftId") ?? ""));
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("Arquivo obrigatório");
    const user = await getCurrentUser();
    if (!user) throw new Error("Acesso negado");
    const companyId = requireUserCompanyId(user);
    const rows = await getSql()<
      { department_id: string; is_participant: boolean }[]
    >`
      select shift.department_id, exists(
        select 1 from public.volunteer_assignments assignment
        join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
        join public.profiles profile on profile.id = ${user.id}
        join public.people identity on identity.id = volunteer.person_id
          and (profile.person_id = identity.id or identity.profile_id = profile.id)
        where assignment.shift_id = shift.id
          and assignment.status not in ('declined', 'cancelled')
      ) as is_participant
      from public.volunteer_shifts shift where shift.id = ${shiftId} and shift.company_id = ${companyId}
    `;
    if (!rows[0]) throw new Error("Escala não encontrada");
    if (!rows[0].is_participant)
      await managerContext("volunteer_chat.manage", rows[0].department_id);
    const uploaded = await uploadManagedFile({
      file,
      companyId,
      ownerProfileId: user.id,
      entityTable: "volunteer_shifts",
      entityId: shiftId,
      purpose: "attachment",
      metadata: { kind: "volunteer-shift-chat" },
      allowedMimeTypes: new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "video/mp4",
        "video/webm",
      ]),
      allowedExtensions: new Set([
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".pdf",
        ".txt",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".mp4",
        ".webm",
      ]),
      maxSizeBytes: 30 * 1024 * 1024,
    });
    return {
      ok: true,
      id: uploaded.id,
      data: { fileName: uploaded.originalName },
    };
  } catch (error) {
    return resultError(error);
  }
}

const messageSchema = z.object({
  shiftId: uuid,
  body: z.string().trim().min(1).max(4000),
  fileIds: z.array(uuid).max(10).default([]),
});
export async function sendVolunteerShiftMessage(
  input: z.input<typeof messageSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = messageSchema.parse(input);
    const user = await getCurrentUser();
    if (!user) throw new Error("Acesso negado");
    const companyId = requireUserCompanyId(user);
    const sql = getSql();
    const access = await sql<
      { department_id: string; is_participant: boolean }[]
    >`
      select shift.department_id, exists(select 1 from public.volunteer_assignments assignment
        join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
        join public.profiles profile on profile.id = ${user.id}
        join public.people identity on identity.id = volunteer.person_id
          and (profile.person_id = identity.id or identity.profile_id = profile.id)
        where assignment.shift_id = shift.id and assignment.status not in ('declined', 'cancelled')) as is_participant
      from public.volunteer_shifts shift where shift.id = ${parsed.shiftId} and shift.company_id = ${companyId}
    `;
    if (!access[0]) throw new Error("Escala não encontrada");
    if (!access[0].is_participant)
      await managerContext("volunteer_chat.manage", access[0].department_id);
    const messageId = await sql.begin(async (tx) => {
      const conversations = await tx<{ id: string }[]>`
        insert into public.volunteer_shift_conversations(company_id, shift_id) values (${companyId}, ${parsed.shiftId})
        on conflict (shift_id) do update set last_message_at = now(), updated_at = now() returning id
      `;
      const conversationId = conversations[0]?.id;
      if (!conversationId) throw new Error("Conversa não foi criada");
      const messages = await tx<{ id: string }[]>`
        insert into public.volunteer_shift_messages(company_id, conversation_id, sender_profile_id, body)
        values (${companyId}, ${conversationId}, ${user.id}, ${parsed.body}) returning id
      `;
      const id = messages[0]?.id;
      if (!id) throw new Error("Mensagem não foi enviada");
      for (const fileId of parsed.fileIds)
        await tx`
        insert into public.volunteer_message_files(message_id, file_id)
        select ${id}, file.id from public.app_files file where file.id = ${fileId} and file.company_id = ${companyId} and file.deleted_at is null
        on conflict do nothing
      `;
      return id;
    });
    await audit(
      "volunteer_chat.send",
      "volunteer_shift_messages",
      messageId,
      companyId,
      { shiftId: parsed.shiftId },
    );
    refreshVolunteerPaths();
    return { ok: true, id: messageId };
  } catch (error) {
    return resultError(error);
  }
}

const feedbackSchema = z.object({
  assignmentId: uuid,
  rating: z.number().int().min(1).max(5),
  loadRating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).default(""),
  requestContact: z.boolean().default(false),
});
export async function saveVolunteerFeedback(
  input: z.input<typeof feedbackSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = feedbackSchema.parse(input);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.feedback",
    );
    const rows = await getSql()<{ id: string }[]>`
      insert into public.volunteer_feedbacks(company_id, assignment_id, volunteer_id, rating, load_rating, comment, request_contact)
      select ${companyId}, assignment.id, ${volunteerId}, ${parsed.rating}, ${parsed.loadRating}, ${parsed.comment}, ${parsed.requestContact}
      from public.volunteer_assignments assignment where assignment.id = ${parsed.assignmentId} and assignment.volunteer_id = ${volunteerId}
        and assignment.status in ('checked_in', 'checked_out')
      on conflict (assignment_id, volunteer_id) do update set rating = excluded.rating, load_rating = excluded.load_rating,
        comment = excluded.comment, request_contact = excluded.request_contact, updated_at = now() returning id
    `;
    if (!rows[0]?.id) throw new Error("Feedback disponível após servir");
    await audit(
      "volunteer_feedback.save",
      "volunteer_feedbacks",
      rows[0].id,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

const recognitionSchema = z.object({
  volunteerId: uuid,
  kind: z.enum(["milestone", "thanks", "achievement"]),
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().max(1000).default(""),
  milestone: z.number().int().positive().nullable().optional(),
});
export async function grantVolunteerRecognition(
  input: z.input<typeof recognitionSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = recognitionSchema.parse(input);
    const sql = getSql();
    const memberships = await sql<
      { department_id: string }[]
    >`select department_id from public.volunteer_department_memberships where volunteer_id = ${parsed.volunteerId} and is_active`;
    const access = await managerContext(
      "volunteer_recognition.manage",
      memberships[0]?.department_id,
    );
    if (
      memberships.length === 0 &&
      !["superadmin", "admin", "pastor"].includes(access.user.role)
    )
      throw new Error("Acesso negado");
    for (const membership of memberships.slice(1))
      await managerContext(
        "volunteer_recognition.manage",
        membership.department_id,
      );
    const { user, companyId } = access;
    const rows = await sql<{ id: string }[]>`
      insert into public.volunteer_recognitions(company_id, volunteer_id, kind, title, message, milestone, granted_by)
      select ${companyId}, volunteer.id, ${parsed.kind}, ${parsed.title}, ${parsed.message}, ${parsed.milestone ?? null}, ${user.id}
      from public.volunteer_profiles volunteer where volunteer.id = ${parsed.volunteerId} and volunteer.company_id = ${companyId} returning id
    `;
    if (!rows[0]?.id) throw new Error("Voluntário não encontrado");
    await audit(
      "volunteer_recognition.grant",
      "volunteer_recognitions",
      rows[0].id,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: rows[0].id };
  } catch (error) {
    return resultError(error);
  }
}

const notificationPreferencesSchema = z.object({
  scheduleEnabled: z.boolean(),
  reminderEnabled: z.boolean(),
  swapEnabled: z.boolean(),
  chatEnabled: z.boolean(),
  feedEnabled: z.boolean(),
  recognitionEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  emailEnabled: z.boolean(),
});
export async function saveMyVolunteerNotificationPreferences(
  input: z.input<typeof notificationPreferencesSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = notificationPreferencesSchema.parse(input);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.preferences",
    );
    await getSql()`
      insert into public.volunteer_notification_preferences(volunteer_id, company_id, schedule_enabled, reminder_enabled, swap_enabled,
        chat_enabled, feed_enabled, recognition_enabled, push_enabled, whatsapp_enabled, email_enabled)
      values (${volunteerId}, ${companyId}, ${parsed.scheduleEnabled}, ${parsed.reminderEnabled}, ${parsed.swapEnabled},
        ${parsed.chatEnabled}, ${parsed.feedEnabled}, ${parsed.recognitionEnabled}, ${parsed.pushEnabled}, ${parsed.whatsappEnabled}, ${parsed.emailEnabled})
      on conflict (volunteer_id) do update set schedule_enabled = excluded.schedule_enabled, reminder_enabled = excluded.reminder_enabled,
        swap_enabled = excluded.swap_enabled, chat_enabled = excluded.chat_enabled, feed_enabled = excluded.feed_enabled,
        recognition_enabled = excluded.recognition_enabled, push_enabled = excluded.push_enabled,
        whatsapp_enabled = excluded.whatsapp_enabled, email_enabled = excluded.email_enabled, updated_at = now()
    `;
    await audit(
      "volunteer_preferences.save",
      "volunteer_notification_preferences",
      volunteerId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: volunteerId };
  } catch (error) {
    return resultError(error);
  }
}

const pushSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(5),
  userAgent: z.string().max(500).default(""),
});
export async function saveVolunteerPushSubscription(
  input: z.input<typeof pushSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = pushSchema.parse(input);
    const { companyId, volunteerId } = await volunteerContext(
      "volunteer.self.preferences",
    );
    const rows = await getSql()<{ id: string }[]>`
      insert into public.volunteer_push_subscriptions(company_id, volunteer_id, endpoint, p256dh, auth_key, user_agent)
      values (${companyId}, ${volunteerId}, ${parsed.endpoint}, ${parsed.p256dh}, ${parsed.auth}, ${parsed.userAgent})
      on conflict (endpoint) do update set volunteer_id = excluded.volunteer_id, p256dh = excluded.p256dh,
        auth_key = excluded.auth_key, user_agent = excluded.user_agent, is_active = true, updated_at = now() returning id
    `;
    await getSql()`update public.volunteer_notification_preferences set push_enabled = true where volunteer_id = ${volunteerId}`;
    return { ok: true, id: rows[0]?.id };
  } catch (error) {
    return resultError(error);
  }
}

const servicePlanSchema = z.object({
  eventId: uuid,
  positions: z
    .array(
      z.object({
        departmentId: uuid,
        roleId: uuid,
        requiredVolunteers: z.number().int().min(1).max(100),
        instructions: z.string().trim().max(2000).default(""),
      }),
    )
    .min(1, "Inclua ao menos uma função")
    .max(100),
  timeline: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        plannedAt: z.string().datetime(),
        durationMinutes: z.number().int().min(1).max(1440),
        responsibleProfileId: optionalUuid,
        instructions: z.string().trim().max(2000).default(""),
      }),
    )
    .max(200)
    .default([]),
  modelName: z
    .union([z.string().trim().min(2).max(120), z.literal("")])
    .default(""),
});

export async function saveVolunteerServicePlan(
  input: z.input<typeof servicePlanSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = servicePlanSchema.parse(input);
    const { user, companyId } = await managerContext("schedules.edit");
    const sql = getSql();
    const events = await sql<
      { id: string; volunteer_schedule_published_at: Date | null }[]
    >`
      select id, volunteer_schedule_published_at from public.events
      where id = ${parsed.eventId}
        and company_id = ${companyId}
        and deleted_at is null
    `;
    if (!events[0]?.id) throw new Error("Culto não encontrado");
    if (events[0].volunteer_schedule_published_at)
      throw new Error("Escala publicada; planejamento está bloqueado");
    const roleIds = [...new Set(parsed.positions.map((item) => item.roleId))];
    const roles = await sql<
      { id: string; department_id: string; name: string; instructions: string }[]
    >`
      select id, department_id, name, instructions
      from public.volunteer_department_roles
      where company_id = ${companyId}
        and id = any(${roleIds}::uuid[])
        and is_active
        and deleted_at is null
    `;
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    for (const position of parsed.positions) {
      const role = rolesById.get(position.roleId);
      if (!role || role.department_id !== position.departmentId)
        throw new Error("Função não pertence à equipe selecionada");
      await managerContext("schedules.edit", position.departmentId);
    }

    let modelId: string | null = null;
    await sql.begin(async (tx) => {
      const keptPositionIds: string[] = [];
      for (const [index, position] of parsed.positions.entries()) {
        const role = rolesById.get(position.roleId);
        if (!role) throw new Error("Função inválida");
        const saved = await tx<{ id: string }[]>`
          insert into public.volunteer_event_positions (
            company_id, event_id, department_id, role_id, role_name,
            required_volunteers, instructions, sort_order, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.eventId}, ${position.departmentId},
            ${position.roleId}, ${role.name}, ${position.requiredVolunteers},
            ${position.instructions || role.instructions}, ${index}, ${user.id}, ${user.id}
          )
          on conflict (event_id, department_id, role_id) do update
          set role_name = excluded.role_name,
              required_volunteers = excluded.required_volunteers,
              instructions = excluded.instructions,
              sort_order = excluded.sort_order,
              updated_by = excluded.updated_by,
              updated_at = now()
          returning id
        `;
        if (saved[0]?.id) keptPositionIds.push(saved[0].id);
      }
      await tx`
        delete from public.volunteer_event_positions
        where event_id = ${parsed.eventId}
          and company_id = ${companyId}
          and id <> all(${keptPositionIds}::uuid[])
      `;
      await tx`
        delete from public.volunteer_event_timeline_items
        where event_id = ${parsed.eventId} and company_id = ${companyId}
      `;
      for (const [index, item] of parsed.timeline.entries()) {
        await tx`
          insert into public.volunteer_event_timeline_items (
            company_id, event_id, title, planned_at, duration_minutes,
            responsible_profile_id, instructions, sort_order
          )
          values (
            ${companyId}, ${parsed.eventId}, ${item.title}, ${item.plannedAt},
            ${item.durationMinutes}, ${item.responsibleProfileId},
            ${item.instructions}, ${index}
          )
        `;
      }
      if (parsed.modelName) {
        const templates = await tx<{ id: string }[]>`
          insert into public.volunteer_schedule_templates (
            company_id, name, description, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.modelName}, 'Modelo criado em Cultos e escalas',
            true, ${user.id}, ${user.id}
          )
          on conflict (company_id, name) do update
          set is_active = true, deleted_at = null, updated_by = excluded.updated_by, updated_at = now()
          returning id
        `;
        modelId = templates[0]?.id ?? null;
        if (!modelId) throw new Error("Modelo não foi salvo");
        await tx`
          delete from public.volunteer_schedule_template_slots
          where template_id = ${modelId}
        `;
        for (const [index, position] of parsed.positions.entries()) {
          const role = rolesById.get(position.roleId);
          if (!role) throw new Error("Função inválida");
          await tx`
            insert into public.volunteer_schedule_template_slots (
              company_id, template_id, department_id, role_id, role_name,
              required_volunteers, instructions, sort_order
            )
            values (
              ${companyId}, ${modelId}, ${position.departmentId}, ${position.roleId},
              ${role.name}, ${position.requiredVolunteers},
              ${position.instructions || role.instructions}, ${index}
            )
          `;
        }
      }
    });
    await audit(
      "volunteer_service_plan.save",
      "events",
      parsed.eventId,
      companyId,
      { positions: parsed.positions.length, timeline: parsed.timeline.length, modelId },
    );
    refreshVolunteerPaths();
    return { ok: true, id: parsed.eventId, data: { modelId } };
  } catch (error) {
    return resultError(error);
  }
}

export async function generateVolunteerScheduleForEvent(
  eventIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const eventId = uuid.parse(eventIdInput);
    const { user, companyId } = await managerContext("schedules.create");
    const sql = getSql();
    const events = await sql<
      {
        id: string;
        starts_at: Date;
        ends_at: Date | null;
        status: string;
        month: string;
        volunteer_schedule_published_at: Date | null;
      }[]
    >`
      select event.id, event.starts_at, event.ends_at, event.status,
             event.volunteer_schedule_published_at,
             to_char(
               event.starts_at at time zone coalesce(settings.timezone, 'America/Sao_Paulo'),
               'YYYY-MM-01'
             ) as month
      from public.events event
      left join public.volunteer_module_settings settings on settings.company_id = event.company_id
      where event.id = ${eventId}
        and event.company_id = ${companyId}
        and event.deleted_at is null
    `;
    const event = events[0];
    if (!event) throw new Error("Culto não encontrado");
    if (event.status !== "published")
      throw new Error("Publique o culto em Eventos antes de gerar a escala");
    if (event.volunteer_schedule_published_at)
      throw new Error("Escala deste culto já foi publicada");
    const positions = await sql<
      {
        id: string;
        department_id: string;
        role_id: string;
        role_name: string;
        required_volunteers: number;
        instructions: string;
      }[]
    >`
      select id, department_id, role_id, role_name, required_volunteers, instructions
      from public.volunteer_event_positions
      where event_id = ${eventId} and company_id = ${companyId}
      order by sort_order
    `;
    if (positions.length === 0)
      throw new Error("Configure equipes e funções antes de gerar a escala");
    for (const departmentId of new Set(
      positions.map((position) => position.department_id),
    ))
      await managerContext("schedules.create", departmentId);

    const scheduleRows = await sql<{ id: string; status: string }[]>`
      insert into public.volunteer_schedules (company_id, month, created_by, updated_by)
      values (${companyId}, ${event.month}::date, ${user.id}, ${user.id})
      on conflict (company_id, month) do update
      set updated_by = excluded.updated_by, updated_at = now()
      returning id, status
    `;
    const schedule = scheduleRows[0];
    if (!schedule?.id) throw new Error("Escala não foi criada");

    const startsAt = event.starts_at;
    const endsAt =
      event.ends_at ?? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    const opensAt = new Date(startsAt.getTime() - 30 * 60 * 1000);
    const closesAt = new Date(endsAt.getTime() + 30 * 60 * 1000);
    const positionIds = positions.map((position) => position.id);
    await sql.begin(async (tx) => {
      await tx`
        delete from public.volunteer_shifts
        where schedule_id = ${schedule.id}
          and event_id = ${eventId}
          and (
            event_position_id is null
            or event_position_id <> all(${positionIds}::uuid[])
          )
      `;
      for (const position of positions) {
        await tx`
          insert into public.volunteer_shifts (
            company_id, schedule_id, event_id, event_position_id,
            department_id, role_id, role_name, required_volunteers, instructions,
            starts_at, ends_at, checkin_opens_at, checkin_closes_at
          )
          values (
            ${companyId}, ${schedule.id}, ${eventId}, ${position.id},
            ${position.department_id}, ${position.role_id}, ${position.role_name},
            ${position.required_volunteers}, ${position.instructions},
            ${startsAt}, ${endsAt}, ${opensAt}, ${closesAt}
          )
          on conflict (schedule_id, event_id, event_position_id)
            where event_position_id is not null
          do update set
            department_id = excluded.department_id,
            role_id = excluded.role_id,
            role_name = excluded.role_name,
            required_volunteers = excluded.required_volunteers,
            instructions = excluded.instructions,
            starts_at = excluded.starts_at,
            ends_at = excluded.ends_at,
            checkin_opens_at = excluded.checkin_opens_at,
            checkin_closes_at = excluded.checkin_closes_at,
            updated_at = now()
        `;
      }
    });
    const generated = await generateSmartVolunteerSchedule(schedule.id);
    if (!generated.ok) return generated;
    await audit(
      "volunteer_schedule.event_generate",
      "events",
      eventId,
      companyId,
      { scheduleId: schedule.id, positions: positions.length },
    );
    return {
      ok: true,
      id: schedule.id,
      data: generated.data,
    };
  } catch (error) {
    return resultError(error);
  }
}

export async function publishVolunteerEventSchedule(
  eventIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const eventId = uuid.parse(eventIdInput);
    const { user, companyId } = await managerContext("schedules.publish");
    const sql = getSql();
    const events = await sql<
      { id: string; volunteer_schedule_published_at: Date | null }[]
    >`
      select id, volunteer_schedule_published_at
      from public.events
      where id = ${eventId}
        and company_id = ${companyId}
        and deleted_at is null
    `;
    const event = events[0];
    if (!event) throw new Error("Culto não encontrado");
    const departments = await sql<{ department_id: string }[]>`
      select distinct department_id
      from public.volunteer_shifts
      where event_id = ${eventId} and company_id = ${companyId}
    `;
    if (departments.length === 0)
      throw new Error("Gere o rascunho antes de publicar");
    for (const row of departments)
      await managerContext("schedules.publish", row.department_id);

    await sql`
      update public.volunteer_assignments assignment
      set status = 'notified',
          notified_at = coalesce(notified_at, now()),
          updated_by = ${user.id},
          updated_at = now()
      from public.volunteer_shifts shift
      where assignment.shift_id = shift.id
        and shift.event_id = ${eventId}
        and shift.company_id = ${companyId}
        and assignment.status = 'proposed'
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
      select assignment.id as assignment_id, volunteer.id as volunteer_id,
             person.email, person.phone,
             coalesce(preference.email_enabled, volunteer.email_enabled) as email_enabled,
             coalesce(preference.whatsapp_enabled, volunteer.whatsapp_enabled) as whatsapp_enabled,
             coalesce(preference.push_enabled, false) as push_enabled,
             event.title as event_title, shift.starts_at
      from public.volunteer_assignments assignment
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      join public.events event on event.id = shift.event_id
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
      join public.people person on person.id = volunteer.person_id
      left join public.volunteer_notification_preferences preference
        on preference.volunteer_id = volunteer.id
      where shift.event_id = ${eventId}
        and shift.company_id = ${companyId}
        and assignment.status not in ('declined', 'cancelled')
    `;
    for (const recipient of recipients) {
      const content = `Sua escala foi publicada: ${recipient.event_title} em ${recipient.starts_at.toLocaleString("pt-BR")}.`;
      if (recipient.whatsapp_enabled && recipient.phone)
        await sql`
          insert into public.volunteer_delivery_outbox (
            company_id, volunteer_id, assignment_id, channel, recipient, subject, content
          )
          values (
            ${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id},
            'whatsapp', ${recipient.phone}, 'Sua escala', ${content}
          )
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
      if (recipient.email_enabled && recipient.email)
        await sql`
          insert into public.volunteer_delivery_outbox (
            company_id, volunteer_id, assignment_id, channel, recipient, subject, content
          )
          values (
            ${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id},
            'email', ${recipient.email}, 'Sua escala foi publicada', ${content}
          )
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
      if (recipient.push_enabled)
        await sql`
          insert into public.volunteer_delivery_outbox (
            company_id, volunteer_id, assignment_id, channel, recipient,
            subject, content, event_kind, payload
          )
          values (
            ${companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id},
            'push', '', 'Nova escala', ${content}, 'schedule',
            ${JSON.stringify({ url: "/voluntariado", assignmentId: recipient.assignment_id })}::jsonb
          )
          on conflict (assignment_id, volunteer_id, channel) do nothing
        `;
    }
    await sql`
      update public.events
      set volunteer_schedule_published_at = coalesce(volunteer_schedule_published_at, now()),
          updated_by = ${user.id},
          updated_at = now()
      where id = ${eventId} and company_id = ${companyId}
    `;
    await audit(
      "volunteer_schedule.event_publish",
      "events",
      eventId,
      companyId,
      { recipients: recipients.length },
    );
    refreshVolunteerPaths();
    return { ok: true, id: eventId };
  } catch (error) {
    return resultError(error);
  }
}

const eventPlanSchema = z.object({
  eventId: uuid,
  title: z.string().trim().min(2).max(120).default("Repertório"),
  notes: z.string().trim().max(3000).default(""),
  setlist: z
    .array(
      z.object({
        songId: optionalUuid,
        title: z.string().trim().min(1).max(200),
        tone: z.string().trim().max(30).default(""),
        responsibleProfileId: optionalUuid,
        notes: z.string().trim().max(1000).default(""),
        spotifyUrl: z.union([z.string().url(), z.literal("")]).default(""),
        deezerUrl: z.union([z.string().url(), z.literal("")]).default(""),
        cifraClubUrl: z.union([z.string().url(), z.literal("")]).default(""),
      }),
    )
    .max(100),
  timeline: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        plannedAt: z.string().datetime(),
        actualStartedAt: z.string().datetime().nullable().optional(),
        durationMinutes: z.number().int().min(1).max(1440),
        responsibleProfileId: optionalUuid,
        instructions: z.string().trim().max(2000).default(""),
      }),
    )
    .max(200),
});
export async function saveVolunteerEventPlan(
  input: z.input<typeof eventPlanSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = eventPlanSchema.parse(input);
    const { user, companyId } = await managerContext(
      "volunteer_worship.manage",
    );
    const sql = getSql();
    const setlistId = await sql.begin(async (tx) => {
      const setlists = await tx<{ id: string }[]>`
        insert into public.volunteer_event_setlists(company_id, event_id, title, notes, created_by, updated_by)
        select ${companyId}, event.id, ${parsed.title}, ${parsed.notes}, ${user.id}, ${user.id}
        from public.events event where event.id = ${parsed.eventId} and event.company_id = ${companyId} and event.deleted_at is null
        on conflict (event_id) do update set title = excluded.title, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now()
        returning id
      `;
      const id = setlists[0]?.id;
      if (!id) throw new Error("Evento não encontrado");
      await tx`delete from public.volunteer_event_setlist_items where setlist_id = ${id}`;
      await tx`delete from public.volunteer_event_timeline_items where event_id = ${parsed.eventId}`;
      for (const [index, item] of parsed.setlist.entries())
        await tx`
        insert into public.volunteer_event_setlist_items(company_id, setlist_id, song_id, title, tone, responsible_profile_id, notes, spotify_url, deezer_url, cifra_club_url, sort_order)
        values (${companyId}, ${id}, ${item.songId}, ${item.title}, ${item.tone}, ${item.responsibleProfileId}, ${item.notes}, ${item.spotifyUrl}, ${item.deezerUrl}, ${item.cifraClubUrl}, ${index})
      `;
      for (const [index, item] of parsed.timeline.entries())
        await tx`
        insert into public.volunteer_event_timeline_items(company_id, event_id, title, planned_at, actual_started_at, duration_minutes, responsible_profile_id, instructions, sort_order)
        values (${companyId}, ${parsed.eventId}, ${item.title}, ${item.plannedAt}, ${item.actualStartedAt ?? null}, ${item.durationMinutes}, ${item.responsibleProfileId}, ${item.instructions}, ${index})
      `;
      return id;
    });
    await audit(
      "volunteer_event_plan.save",
      "volunteer_event_setlists",
      setlistId,
      companyId,
      { eventId: parsed.eventId },
    );
    refreshVolunteerPaths();
    return { ok: true, id: setlistId };
  } catch (error) {
    return resultError(error);
  }
}

const moduleSettingsSchema = z.object({
  v2Enabled: z.boolean(),
  timezone: z.string().trim().min(3).max(80).default("America/Sao_Paulo"),
  requireSwapApproval: z.boolean().default(true),
  reminderHours: z
    .array(z.number().int().min(1).max(720))
    .min(1)
    .max(10)
    .transform((values) => [...new Set(values)].sort((a, b) => b - a)),
});
export async function saveVolunteerModuleSettings(
  input: z.input<typeof moduleSettingsSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = moduleSettingsSchema.parse(input);
    const { companyId } = await managerContext("volunteer_settings.manage");
    await getSql()`insert into public.volunteer_module_settings(company_id, v2_enabled, timezone, require_swap_approval, reminder_hours)
      values (${companyId}, ${parsed.v2Enabled}, ${parsed.timezone}, ${parsed.requireSwapApproval}, ${parsed.reminderHours})
      on conflict (company_id) do update set v2_enabled = excluded.v2_enabled, timezone = excluded.timezone,
        require_swap_approval = excluded.require_swap_approval, reminder_hours = excluded.reminder_hours, updated_at = now()`;
    await audit(
      "volunteer_settings.save",
      "volunteer_module_settings",
      companyId,
      companyId,
      parsed,
    );
    refreshVolunteerPaths();
    return { ok: true, id: companyId };
  } catch (error) {
    return resultError(error);
  }
}

export async function setVolunteerV2Enabled(
  enabled: boolean,
): Promise<VolunteerActionResult> {
  return saveVolunteerModuleSettings({
    v2Enabled: enabled,
    timezone: "America/Sao_Paulo",
    requireSwapApproval: true,
    reminderHours: [72, 24, 2],
  });
}

export async function softDeleteVolunteer(
  volunteerIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const volunteerId = uuid.parse(volunteerIdInput);
    const sql = getSql();
    const rows = await sql<
      { company_id: string; person_id: string; department_ids: string[] }[]
    >`
      select volunteer.company_id, volunteer.person_id,
        coalesce(array_agg(membership.department_id::text) filter (where membership.department_id is not null), '{}') as department_ids
      from public.volunteer_profiles volunteer left join public.volunteer_department_memberships membership on membership.volunteer_id = volunteer.id and membership.is_active
      where volunteer.id = ${volunteerId} and volunteer.deleted_at is null group by volunteer.id
    `;
    const row = rows[0];
    if (!row) throw new Error("Voluntário não encontrado");
    let access = await managerContext("volunteers.edit", row.department_ids[0]);
    if (
      row.department_ids.length === 0 &&
      !["superadmin", "admin", "pastor"].includes(access.user.role)
    ) {
      throw new Error("Voluntário sem departamento exige administrador");
    }
    for (const departmentId of row.department_ids.slice(1)) {
      access = await managerContext("volunteers.edit", departmentId);
    }
    const { user, companyId } = access;
    if (!["superadmin", "admin"].includes(user.role))
      throw new Error("Somente administrador pode excluir voluntário");
    await sql.begin(async (tx) => {
      await tx`update public.volunteer_profiles set registration_status = 'inactive', deleted_at = now(), updated_by = ${user.id} where id = ${volunteerId} and company_id = ${companyId}`;
      await tx`update public.volunteer_department_memberships set is_active = false, updated_at = now() where volunteer_id = ${volunteerId}`;
    });
    await audit(
      "volunteer.delete",
      "volunteer_profiles",
      volunteerId,
      companyId,
    );
    refreshVolunteerPaths();
    return { ok: true, id: volunteerId };
  } catch (error) {
    return resultError(error);
  }
}

export async function softDeleteVolunteerDepartment(
  departmentIdInput: string,
): Promise<VolunteerActionResult> {
  try {
    const departmentId = uuid.parse(departmentIdInput);
    const { user, companyId } = await managerContext("volunteers.edit", departmentId);
    if (!["superadmin", "admin"].includes(user.role))
      throw new Error("Somente administrador pode excluir equipe");
    const sql = getSql();
    const departments = await sql<{ id: string }[]>`
      select id from public.volunteer_departments
      where id = ${departmentId} and company_id = ${companyId} and deleted_at is null
    `;
    if (!departments[0]?.id) throw new Error("Equipe não encontrada");
    await sql.begin(async (tx) => {
      await tx`
        delete from public.volunteer_event_positions position
        using public.events event
        where position.event_id = event.id
          and position.department_id = ${departmentId}
          and event.volunteer_schedule_published_at is null
      `;
      await tx`delete from public.volunteer_schedule_template_slots where department_id = ${departmentId}`;
      await tx`delete from public.volunteer_department_access where department_id = ${departmentId}`;
      await tx`update public.volunteer_department_memberships set is_active = false, updated_at = now() where department_id = ${departmentId}`;
      await tx`update public.volunteer_department_roles set is_active = false, deleted_at = now(), updated_at = now() where department_id = ${departmentId} and deleted_at is null`;
      await tx`
        update public.volunteer_departments
        set is_active = false, deleted_at = now(), updated_by = ${user.id}, updated_at = now()
        where id = ${departmentId} and company_id = ${companyId}
      `;
    });
    await audit("volunteer_department.delete", "volunteer_departments", departmentId, companyId);
    refreshVolunteerPaths();
    return { ok: true, id: departmentId };
  } catch (error) {
    return resultError(error);
  }
}
