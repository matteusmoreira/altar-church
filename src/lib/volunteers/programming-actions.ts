"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions";
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server";
import { getSql } from "@/lib/db/client";
import type { Permission } from "@/lib/types";
import type { VolunteerActionResult } from "./types";
import {
  generateVolunteerScheduleForEvent,
  publishVolunteerEventSchedule,
} from "./v2-actions";

const uuid = z.string().uuid();
const positionSchema = z.object({
  departmentId: uuid,
  roleId: uuid,
  requiredVolunteers: z.number().int().min(1).max(100),
  instructions: z.string().trim().max(2000).default(""),
});

const programmingSchema = z
  .object({
    id: z.union([uuid, z.null()]).optional().default(null),
    occurrenceEventId: z.union([uuid, z.null()]).optional().default(null),
    editScope: z.enum(["series", "occurrence"]).default("series"),
    title: z.string().trim().min(2, "Informe o título").max(160),
    description: z.string().trim().max(5000).default(""),
    kind: z.enum(["service", "cleaning", "rehearsal", "meeting", "outreach", "other"]),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(1).max(1440),
    location: z.string().trim().max(240).default(""),
    timezone: z.string().trim().min(1).max(100).default("America/Sao_Paulo"),
    recurrenceFrequency: z.enum(["none", "weekly", "monthly"]),
    recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    recurrenceUntil: z.union([z.string().date(), z.null()]).default(null),
    positions: z.array(positionSchema).min(1, "Inclua ao menos uma equipe e função").max(100),
  })
  .superRefine((value, context) => {
    const roleIds = value.positions.map((position) => position.roleId);
    if (new Set(roleIds).size !== roleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message: "Cada função deve aparecer apenas uma vez; use quantidade para abrir mais vagas",
      });
    }
    if (value.recurrenceFrequency === "weekly" && value.recurrenceWeekdays.length === 0) {
      context.addIssue({ code: "custom", path: ["recurrenceWeekdays"], message: "Escolha ao menos um dia" });
    }
    if (value.editScope === "occurrence" && !value.occurrenceEventId) {
      context.addIssue({ code: "custom", path: ["occurrenceEventId"], message: "Ocorrência inválida" });
    }
    if (value.recurrenceUntil && value.recurrenceUntil < value.startsAt.slice(0, 10)) {
      context.addIssue({ code: "custom", path: ["recurrenceUntil"], message: "Término deve ser posterior ao início" });
    }
  });

function failure(error: unknown): VolunteerActionResult {
  if (error instanceof z.ZodError)
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" };
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" };
}

function refresh() {
  revalidatePath("/voluntariado");
  revalidatePath("/programacao");
  revalidatePath("/eventos");
  revalidatePath("/membro/voluntariado");
  revalidatePath("/dashboard");
}

async function context(permission: Permission, departmentId?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Acesso negado");
  const companyId = requireUserCompanyId(user);
  await requirePermission(permission, companyId);
  if (["superadmin", "admin", "pastor"].includes(user.role)) return { user, companyId };
  const rows = await getSql()<{ allowed: boolean }[]>`
    select exists(
      select 1 from public.volunteer_department_access access
      where access.company_id = ${companyId}
        and access.profile_id = ${user.id}
        and (${departmentId ?? null}::uuid is null or access.department_id = ${departmentId ?? null}::uuid)
    ) as allowed
  `;
  if (!rows[0]?.allowed) throw new Error("Acesso negado para esta equipe");
  return { user, companyId };
}

async function loadRoles(
  companyId: string,
  positions: z.infer<typeof positionSchema>[],
) {
  const roleIds = [...new Set(positions.map((position) => position.roleId))];
  const rows = await getSql()<{
    id: string;
    department_id: string;
    name: string;
    instructions: string;
  }[]>`
    select id, department_id, name, instructions
    from public.volunteer_department_roles
    where company_id = ${companyId}
      and id = any(${roleIds}::uuid[])
      and is_active
      and deleted_at is null
  `;
  const roles = new Map(rows.map((row) => [row.id, row]));
  for (const position of positions) {
    const role = roles.get(position.roleId);
    if (!role || role.department_id !== position.departmentId)
      throw new Error("Função não pertence à equipe selecionada");
  }
  return roles;
}

async function replaceEventPositions(
  eventId: string,
  companyId: string,
  userId: string,
  positions: z.infer<typeof positionSchema>[],
  roles: Awaited<ReturnType<typeof loadRoles>>,
) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`delete from public.volunteer_event_positions where event_id = ${eventId} and company_id = ${companyId}`;
    for (const [index, position] of positions.entries()) {
      const role = roles.get(position.roleId);
      if (!role) throw new Error("Função inválida");
      await tx`
        insert into public.volunteer_event_positions(
          company_id, event_id, department_id, role_id, role_name,
          required_volunteers, instructions, sort_order, created_by, updated_by
        ) values (
          ${companyId}, ${eventId}, ${position.departmentId}, ${position.roleId}, ${role.name},
          ${position.requiredVolunteers}, ${position.instructions || role.instructions}, ${index}, ${userId}, ${userId}
        )
      `;
    }
  });
}

export async function saveVolunteerProgramming(
  input: z.input<typeof programmingSchema>,
): Promise<VolunteerActionResult> {
  try {
    const parsed = programmingSchema.parse(input);
    const { user, companyId } = await context(parsed.id ? "schedules.edit" : "schedules.create");
    for (const departmentId of new Set(parsed.positions.map((position) => position.departmentId)))
      await context(parsed.id ? "schedules.edit" : "schedules.create", departmentId);
    const roles = await loadRoles(companyId, parsed.positions);
    const startsAt = new Date(parsed.startsAt);
    const endsAt = new Date(startsAt.getTime() + parsed.durationMinutes * 60_000);
    const sql = getSql();

    if (parsed.editScope === "occurrence") {
      const rows = await sql<{ id: string; volunteer_schedule_published_at: Date | null }[]>`
        update public.events
        set title = ${parsed.title}, description = ${parsed.description}, type = ${parsed.kind},
            starts_at = ${startsAt}, ends_at = ${endsAt}, location = ${parsed.location},
            updated_by = ${user.id}, updated_at = now()
        where id = ${parsed.occurrenceEventId}
          and company_id = ${companyId}
          and deleted_at is null
          and volunteer_schedule_published_at is null
        returning id, volunteer_schedule_published_at
      `;
      if (!rows[0]?.id) throw new Error("Ocorrência publicada ou não encontrada");
      await replaceEventPositions(rows[0].id, companyId, user.id, parsed.positions, roles);
      const generated = await generateVolunteerScheduleForEvent(rows[0].id);
      if (!generated.ok) throw new Error(generated.error ?? "Escala não foi recriada");
      await writeAuditLog({
        action: "volunteer_programming.occurrence_update",
        entityTable: "events",
        entityId: rows[0].id,
        companyId,
        metadata: { positions: parsed.positions.length },
      });
      refresh();
      return { ok: true, id: rows[0].id, data: { skippedPublished: 0, ...(generated.data as object) } };
    }

    let programmingId = parsed.id;
    let templateId: string | null = null;
    let skippedPublished = 0;
    await sql.begin(async (tx) => {
      if (programmingId) {
        const existing = await tx<{ id: string }[]>`
          select id from public.programmings
          where id = ${programmingId} and company_id = ${companyId} and deleted_at is null
        `;
        if (!existing[0]?.id) throw new Error("Programação não encontrada");
        const skipped = await tx<{ count: number }[]>`
          select count(*)::integer as count from public.events
          where programming_id = ${programmingId}
            and starts_at >= ${startsAt}
            and volunteer_schedule_published_at is not null
            and deleted_at is null
        `;
        skippedPublished = Number(skipped[0]?.count ?? 0);
        await tx`
          delete from public.events
          where programming_id = ${programmingId}
            and starts_at >= ${startsAt}
            and volunteer_schedule_published_at is null
        `;
        await tx`
          update public.programmings
          set title = ${parsed.title}, description = ${parsed.description}, kind = ${parsed.kind},
              starts_at = ${startsAt}, duration_minutes = ${parsed.durationMinutes}, location = ${parsed.location},
              timezone = ${parsed.timezone}, recurrence_frequency = ${parsed.recurrenceFrequency},
              recurrence_weekdays = ${parsed.recurrenceWeekdays}::smallint[], recurrence_until = ${parsed.recurrenceUntil}::date,
              recurrence_needs_review = false, is_recurring = ${parsed.recurrenceFrequency !== "none"},
              recurrence_rule = ${parsed.recurrenceFrequency}, is_active = true,
              updated_by = ${user.id}, updated_at = now()
          where id = ${programmingId} and company_id = ${companyId}
        `;
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.programmings(
            company_id, title, description, starts_at, duration_minutes, kind, location, timezone,
            recurrence_frequency, recurrence_weekdays, recurrence_until, recurrence_needs_review,
            is_recurring, recurrence_rule, is_active, created_by, updated_by
          ) values (
            ${companyId}, ${parsed.title}, ${parsed.description}, ${startsAt}, ${parsed.durationMinutes},
            ${parsed.kind}, ${parsed.location}, ${parsed.timezone}, ${parsed.recurrenceFrequency},
            ${parsed.recurrenceWeekdays}::smallint[], ${parsed.recurrenceUntil}::date, false,
            ${parsed.recurrenceFrequency !== "none"}, ${parsed.recurrenceFrequency}, true, ${user.id}, ${user.id}
          ) returning id
        `;
        programmingId = rows[0]?.id ?? null;
      }
      if (!programmingId) throw new Error("Programação não foi salva");

      const templates = await tx<{ id: string }[]>`
        insert into public.volunteer_schedule_templates(
          company_id, owner_programming_id, name, description, is_active, created_by, updated_by
        ) values (
          ${companyId}, ${programmingId}, ${`${parsed.title} · ${programmingId.slice(0, 8)}`},
          'Equipes da programação', true, ${user.id}, ${user.id}
        )
        on conflict (owner_programming_id) where owner_programming_id is not null
        do update set name = excluded.name, is_active = true, deleted_at = null,
          updated_by = excluded.updated_by, updated_at = now()
        returning id
      `;
      templateId = templates[0]?.id ?? null;
      if (!templateId) throw new Error("Equipes não foram salvas");
      await tx`delete from public.volunteer_schedule_template_slots where template_id = ${templateId}`;
      for (const [index, position] of parsed.positions.entries()) {
        const role = roles.get(position.roleId);
        if (!role) throw new Error("Função inválida");
        await tx`
          insert into public.volunteer_schedule_template_slots(
            company_id, template_id, department_id, role_id, role_name,
            required_volunteers, instructions, sort_order
          ) values (
            ${companyId}, ${templateId}, ${position.departmentId}, ${position.roleId}, ${role.name},
            ${position.requiredVolunteers}, ${position.instructions || role.instructions}, ${index}
          )
        `;
      }
      await tx`
        update public.programmings set volunteer_template_id = ${templateId}, updated_by = ${user.id}, updated_at = now()
        where id = ${programmingId}
      `;
    });

    if (!programmingId) throw new Error("Programação não foi salva");
    await sql`select public.materialize_volunteer_programmings(${companyId}, 90)`;

    const monthStart = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1));
    const events = await sql<{ id: string }[]>`
      select id from public.events
      where programming_id = ${programmingId}
        and starts_at >= ${monthStart} and starts_at < ${monthEnd}
        and volunteer_schedule_published_at is null and deleted_at is null
      order by starts_at
    `;
    let generated = 0;
    let shortages = 0;
    for (const event of events) {
      const result = await generateVolunteerScheduleForEvent(event.id);
      if (result.ok) {
        generated += Number((result.data as { created?: number } | undefined)?.created ?? 0);
        shortages += Number((result.data as { shortages?: number } | undefined)?.shortages ?? 0);
      }
    }
    await writeAuditLog({
      action: parsed.id ? "volunteer_programming.series_update" : "volunteer_programming.create",
      entityTable: "programmings",
      entityId: programmingId,
      companyId,
      metadata: { frequency: parsed.recurrenceFrequency, positions: parsed.positions.length, skippedPublished },
    });
    refresh();
    return { ok: true, id: programmingId, data: { generated, shortages, skippedPublished } };
  } catch (error) {
    return failure(error);
  }
}

const monthSchema = z.string().regex(/^\d{4}-\d{2}-01$/, "Mês inválido");

export async function prepareVolunteerProgrammingMonth(monthInput: string): Promise<VolunteerActionResult> {
  try {
    const month = monthSchema.parse(monthInput);
    const { companyId } = await context("schedules.create");
    const sql = getSql();
    await sql`select public.materialize_volunteer_programmings(${companyId}, 90)`;
    const events = await sql<{ id: string }[]>`
      select event.id
      from public.events event
      where event.company_id = ${companyId}
        and event.programming_id is not null
        and event.starts_at >= ${month}::date
        and event.starts_at < ${month}::date + interval '1 month'
        and event.volunteer_schedule_published_at is null
        and event.deleted_at is null
        and exists(select 1 from public.volunteer_event_positions position where position.event_id = event.id)
      order by event.starts_at
    `;
    let generated = 0;
    let shortages = 0;
    for (const event of events) {
      const result = await generateVolunteerScheduleForEvent(event.id);
      if (!result.ok) continue;
      generated += Number((result.data as { created?: number } | undefined)?.created ?? 0);
      shortages += Number((result.data as { shortages?: number } | undefined)?.shortages ?? 0);
    }
    refresh();
    return { ok: true, data: { events: events.length, generated, shortages } };
  } catch (error) {
    return failure(error);
  }
}

export async function publishVolunteerProgrammingEvents(eventIdsInput: string[]): Promise<VolunteerActionResult> {
  try {
    const eventIds = z.array(uuid).min(1, "Selecione programações").max(50).parse(eventIdsInput);
    const { companyId } = await context("schedules.publish");
    const allowed = await getSql()<{ id: string }[]>`
      select id from public.events
      where company_id = ${companyId} and id = any(${eventIds}::uuid[]) and deleted_at is null
    `;
    if (allowed.length !== new Set(eventIds).size) throw new Error("Programação inválida");
    let published = 0;
    const errors: string[] = [];
    for (const eventId of eventIds) {
      const result = await publishVolunteerEventSchedule(eventId);
      if (result.ok) published += 1;
      else errors.push(result.error ?? "Falha ao publicar");
    }
    refresh();
    return {
      ok: errors.length === 0,
      error: errors[0],
      data: { published, failed: errors.length },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteVolunteerProgramming(programmingIdInput: string): Promise<VolunteerActionResult> {
  try {
    const programmingId = uuid.parse(programmingIdInput);
    const { user, companyId } = await context("schedules.edit");
    if (!["superadmin", "admin"].includes(user.role))
      throw new Error("Somente administrador pode excluir programação");
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`
      select id from public.programmings
      where id = ${programmingId} and company_id = ${companyId} and deleted_at is null
    `;
    if (!rows[0]?.id) throw new Error("Programação não encontrada");
    const published = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.events
      where programming_id = ${programmingId}
        and volunteer_schedule_published_at is not null
        and deleted_at is null
    `;
    await sql.begin(async (tx) => {
      await tx`
        delete from public.events
        where programming_id = ${programmingId}
          and volunteer_schedule_published_at is null
      `;
      await tx`
        update public.programmings
        set is_active = false, deleted_at = now(), updated_by = ${user.id}, updated_at = now()
        where id = ${programmingId} and company_id = ${companyId}
      `;
    });
    await writeAuditLog({
      action: "volunteer_programming.delete",
      entityTable: "programmings",
      entityId: programmingId,
      companyId,
      metadata: { preservedPublishedOccurrences: Number(published[0]?.count ?? 0) },
    });
    refresh();
    return {
      ok: true,
      id: programmingId,
      data: { preservedPublishedOccurrences: Number(published[0]?.count ?? 0) },
    };
  } catch (error) {
    return failure(error);
  }
}
