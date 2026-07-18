import "server-only"

import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { createClient } from "@/lib/supabase/server"
import { decryptHealthDetails, formatChildLabelName } from "./security"
import { ageMonthsAt } from "./suggest"
import { EMPTY_KID_ADDRESS } from "./form-model"
import { listKidCustomFields, listPersonKidCustomValues } from "./custom-fields"
import type {
  GuardianChildItem,
  GuardianPortalData,
  KidConsentType,
  KidGuardianItem,
  KidHealthDetails,
} from "./types"

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

/**
 * Vincula automaticamente registros de responsável à conta autenticada:
 * - kid_guardians.profile_id quando o e-mail da pessoa coincide com o da conta;
 * - people.profile_id / profiles.person_id (backlinks 1:1 quando livres).
 */
async function autoLinkGuardian(userId: string, email: string) {
  const sql = getSql()
  await sql`
    update public.kid_guardians guardian
    set profile_id = ${userId}
    from public.people person
    where person.id = guardian.person_id
      and guardian.profile_id is null
      and guardian.deleted_at is null
      and person.deleted_at is null
      and person.email is not null
      and lower(person.email) = lower(${email})
  `
  await sql`
    update public.people person
    set profile_id = ${userId}
    where person.deleted_at is null
      and person.profile_id is null
      and person.email is not null
      and lower(person.email) = lower(${email})
      and not exists (
        select 1 from public.people other
        where other.profile_id = ${userId} and other.deleted_at is null and other.id <> person.id
      )
  `
  await sql`
    update public.profiles profile
    set person_id = (
      select person.id from public.people person
      where person.profile_id = ${userId} and person.deleted_at is null
      order by person.created_at
      limit 1
    )
    where profile.id = ${userId}
      and profile.person_id is null
      and exists (
        select 1 from public.people person
        where person.profile_id = ${userId} and person.deleted_at is null
      )
  `
}

/**
 * Usuário do portal familiar. Se o login (OTP) ainda não tem perfil, cria o perfil
 * guardian a partir do vínculo existente de responsável (cadastro feito na recepção
 * ou no formulário de visitante). Redireciona para /familia/login quando não autenticado.
 */
export async function requireGuardianUser() {
  const existing = await getCurrentUser()
  if (existing) {
    await autoLinkGuardian(existing.id, existing.email)
    return existing
  }

  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser?.email) redirect("/familia/login")

  const sql = getSql()
  const links = await sql<{ company_id: string; guardian_name: string }[]>`
    select guardian.company_id, person.full_name as guardian_name
    from public.kid_guardians guardian
    join public.people person on person.id = guardian.person_id and person.deleted_at is null
    where guardian.deleted_at is null
      and person.email is not null
      and lower(person.email) = lower(${authUser.email})
    order by guardian.created_at
    limit 1
  `
  const link = links[0]
  if (!link) redirect("/familia/login?erro=sem-cadastro")

  await sql`
    insert into public.profiles (company_id, name, email, role, active, auth_user_id)
    values (${link.company_id}, ${link.guardian_name}, ${authUser.email.toLowerCase()}, 'guardian', true, ${authUser.id})
    on conflict (email) do update
    set auth_user_id = coalesce(public.profiles.auth_user_id, excluded.auth_user_id),
        updated_at = now()
  `

  const user = await getCurrentUser()
  if (!user) redirect("/familia/login?erro=sem-cadastro")
  await autoLinkGuardian(user.id, user.email)
  return user
}

export async function getGuardianKidIds(profileId: string): Promise<string[]> {
  const sql = getSql()
  const rows = await sql<{ kid_id: string }[]>`
    select kid_id from public.kid_guardians
    where profile_id = ${profileId} and deleted_at is null
  `
  return rows.map((row) => row.kid_id)
}

const EMPTY_DETAILS: KidHealthDetails = {
  allergies: "",
  dietaryRestrictions: "",
  medication: "",
  specialNeeds: "",
  instructions: "",
}

function toGuardianItem(value: unknown, photoUrls = new Map<string, string>(), customValues = new Map<string, import("./types").KidCustomFieldValue[]>()): KidGuardianItem[] {
  if (!Array.isArray(value)) return []
  return value.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      personId: String(item.personId),
      profileId: item.profileId ? String(item.profileId) : null,
      name: String(item.name ?? ""),
      phone: String(item.phone ?? ""),
      email: item.email ? String(item.email) : null,
      relationship: (item.relationship as KidGuardianItem["relationship"]) ?? "guardian",
      isPrimary: Boolean(item.isPrimary),
      canCheckin: Boolean(item.canCheckin),
      canCheckout: Boolean(item.canCheckout),
      isEmergencyContact: Boolean(item.isEmergencyContact),
      whatsappEnabled: Boolean(item.whatsappEnabled),
      emailEnabled: Boolean(item.emailEnabled),
      photoUrl: item.photoPath ? photoUrls.get(String(item.photoPath)) ?? null : null,
      address: { ...EMPTY_KID_ADDRESS },
      customValues: customValues.get(String(item.personId)) ?? [],
    }
  })
}

export async function getGuardianPortalData(): Promise<GuardianPortalData> {
  const user = await requireGuardianUser()
  if (!user.churchId) redirect("/familia/login?erro=sem-cadastro")
  const companyId = user.churchId
  const sql = getSql()

  const rows = await sql<{
    kid_id: string
    person_id: string
    first_name: string
    last_name: string
    full_name: string
    birth_date: Date | string | null
    congregation_id: string | null
    congregation_name: string | null
    is_visitor: boolean
    notes: string | null
    has_allergy: boolean | null
    has_dietary_restriction: boolean | null
    has_medication: boolean | null
    has_special_needs: boolean | null
    details_encrypted: string | null
    granted_consents: string[] | null
    guardians: unknown
    attendance_id: string | null
    session_id: string | null
    session_title: string | null
    attendance_status: string | null
    classroom_name: string | null
    checked_in_at: Date | string | null
    pin_expires_at: Date | string | null
    photo_path: string | null
  }[]>`
    select
      kid.id as kid_id,
      kid.person_id,
      kid.is_visitor,
      kid.notes,
      p.first_name,
      p.last_name,
      p.full_name,
      p.birth_date,
      p.congregation_id,
      child_photo.storage_path as photo_path,
      congregation.name as congregation_name,
      hp.has_allergy, hp.has_dietary_restriction, hp.has_medication, hp.has_special_needs,
      hp.details_encrypted,
      (select array_agg(consent.consent_type) from public.kid_consents consent
        where consent.kid_id = kid.id and consent.status = 'granted') as granted_consents,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', guardian.id,
          'personId', guardian.person_id,
          'profileId', guardian.profile_id,
          'name', guardian_person.full_name,
          'phone', guardian_person.phone,
          'email', guardian_person.email,
          'relationship', guardian.relationship,
          'isPrimary', guardian.is_primary,
          'canCheckin', guardian.can_checkin,
          'canCheckout', guardian.can_checkout,
          'isEmergencyContact', guardian.is_emergency_contact,
          'whatsappEnabled', guardian.whatsapp_enabled,
          'emailEnabled', guardian.email_enabled
          , 'photoPath', guardian_photo.storage_path
        ) order by guardian.is_primary desc, guardian_person.full_name)
        from public.kid_guardians guardian
        join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
        left join public.app_files guardian_photo on guardian_photo.id = guardian_person.photo_file_id and guardian_photo.is_active = true and guardian_photo.deleted_at is null
        where guardian.kid_id = kid.id and guardian.deleted_at is null
      ), '[]'::jsonb) as guardians,
      attendance.id as attendance_id,
      attendance.session_id,
      session.title as session_title,
      attendance.status as attendance_status,
      attendance.classroom_name,
      attendance.checked_in_at,
      credential.pin_expires_at
    from public.kid_profiles kid
    join public.people p on p.id = kid.person_id and p.deleted_at is null
    left join public.congregations congregation on congregation.id = p.congregation_id
    left join public.app_files child_photo on child_photo.id = p.photo_file_id and child_photo.is_active = true and child_photo.deleted_at is null
    left join public.kid_health_profiles hp on hp.kid_id = kid.id and hp.deleted_at is null
    left join lateral (
      select a.id, a.session_id, a.status, a.classroom_name, a.checked_in_at
      from public.kid_attendances a
      join public.kid_sessions s on s.id = a.session_id and s.deleted_at is null and s.status = 'open'
      where a.kid_id = kid.id and a.company_id = ${companyId}
        and a.status in ('checked_in', 'checkout_requested')
      order by a.checked_in_at desc
      limit 1
    ) attendance on true
    left join public.kid_sessions session on session.id = attendance.session_id
    left join public.kid_pickup_credentials credential
      on credential.attendance_id = attendance.id and credential.status = 'active'
    where kid.company_id = ${companyId}
      and kid.deleted_at is null
      and kid.id in (
        select guardian.kid_id from public.kid_guardians guardian
        where guardian.profile_id = ${user.id} and guardian.deleted_at is null
      )
    order by p.first_name, p.full_name
  `

  const [congregations, companyRows, reportRows, guardianRows, customFields] = await Promise.all([
    sql<{ id: string; name: string }[]>`
      select id, name from public.congregations
      where company_id = ${companyId} and deleted_at is null and is_active = true
      order by name
    `,
    sql<{ name: string }[]>`
      select name from public.companies where id = ${companyId} limit 1
    `,
    sql<{
      id: string
      title: string
      content: string
      created_at: Date | string
      classroom_name: string | null
      session_title: string | null
      child_full_name: string | null
    }[]>`
      select
        report.id, report.title, report.content, report.created_at,
        classroom.name as classroom_name,
        session.title as session_title,
        child_person.full_name as child_full_name
      from public.kid_lesson_reports report
      join public.kid_sessions session on session.id = report.session_id
      left join public.kid_session_classrooms sc on sc.id = report.session_classroom_id
      left join public.kid_classrooms classroom on classroom.id = sc.classroom_id
      left join public.kid_profiles child on child.id = report.kid_id
      left join public.people child_person on child_person.id = child.person_id
      where report.company_id = ${companyId}
        and report.deleted_at is null
        and report.shared_with_guardians = true
        and (
          report.kid_id in (
            select guardian.kid_id from public.kid_guardians guardian
            where guardian.profile_id = ${user.id} and guardian.deleted_at is null
          )
          or (
            report.kid_id is null
            and report.session_id in (
              select distinct attendance.session_id from public.kid_attendances attendance
              where attendance.kid_id in (
                select guardian.kid_id from public.kid_guardians guardian
                where guardian.profile_id = ${user.id} and guardian.deleted_at is null
              )
            )
          )
        )
      order by report.created_at desc
      limit 5
    `,
    sql<{ id: string; storage_path: string | null; postal_code: string; address: string; address_number: string; address_complement: string; neighborhood: string; city: string; state: string; country: string }[]>`
      select person.id, file.storage_path, person.postal_code, person.address, person.address_number,
             person.address_complement, person.neighborhood, person.city, person.state, person.country
      from public.people person
      left join public.app_files file on file.id = person.photo_file_id and file.is_active = true and file.deleted_at is null
      where person.profile_id = ${user.id} and person.company_id = ${companyId} and person.deleted_at is null
      limit 1
    `,
    listKidCustomFields(companyId, { surface: "portal" }),
  ])

  const photoPaths = rows.flatMap((row) => [
    row.photo_path ?? "",
    ...(Array.isArray(row.guardians) ? row.guardians.map((guardian) => String((guardian as Record<string, unknown>).photoPath ?? "")) : []),
  ])
  photoPaths.push(guardianRows[0]?.storage_path ?? "")
  const photoUrls = await createSignedUrlsByStoragePath(photoPaths)
  const personIds = rows.flatMap((row) => [row.person_id, ...(Array.isArray(row.guardians) ? row.guardians.map((guardian) => String((guardian as Record<string, unknown>).personId ?? "")) : [])]).concat(guardianRows[0]?.id ?? "").filter(Boolean)
  const customValues = await listPersonKidCustomValues(personIds)

  const children: GuardianChildItem[] = rows.map((row) => {
    let details = { ...EMPTY_DETAILS }
    if (row.details_encrypted) {
      try {
        details = { ...EMPTY_DETAILS, ...(JSON.parse(decryptHealthDetails(row.details_encrypted)) as Partial<KidHealthDetails>) }
      } catch {
        details = { ...EMPTY_DETAILS }
      }
    }
    const birthDate = dateOnly(row.birth_date)
    return {
      kidId: row.kid_id,
      personId: row.person_id,
      firstName: row.first_name,
      lastName: row.last_name ?? "",
      fullName: row.full_name,
      birthDate,
      ageMonths: ageMonthsAt(birthDate),
      congregationId: row.congregation_id,
      congregationName: row.congregation_name,
      isVisitor: row.is_visitor,
      notes: row.notes ?? "",
      health: {
        hasAllergy: Boolean(row.has_allergy),
        hasDietaryRestriction: Boolean(row.has_dietary_restriction),
        hasMedication: Boolean(row.has_medication),
        hasSpecialNeeds: Boolean(row.has_special_needs),
      },
      healthDetails: details,
      consents: (row.granted_consents ?? []) as KidConsentType[],
      guardians: toGuardianItem(row.guardians, photoUrls, customValues),
      activeAttendance: row.attendance_id
        ? {
            attendanceId: row.attendance_id,
            sessionId: row.session_id ?? "",
            sessionTitle: row.session_title ?? "",
            classroomName: row.classroom_name ?? "",
            status: (row.attendance_status ?? "checked_in") as "checked_in" | "checkout_requested",
            checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : "",
            pinExpiresAt: row.pin_expires_at ? new Date(row.pin_expires_at).toISOString() : null,
          }
        : null,
      photoUrl: row.photo_path ? photoUrls.get(row.photo_path) ?? null : null,
      customValues: customValues.get(row.person_id) ?? [],
    }
  })

  return {
    guardianName: user.name,
    guardianPhotoUrl: guardianRows[0]?.storage_path ? photoUrls.get(guardianRows[0].storage_path) ?? null : null,
    guardianAddress: guardianRows[0] ? {
      postalCode: guardianRows[0].postal_code, street: guardianRows[0].address,
      number: guardianRows[0].address_number, complement: guardianRows[0].address_complement,
      neighborhood: guardianRows[0].neighborhood, city: guardianRows[0].city,
      state: guardianRows[0].state, country: guardianRows[0].country,
    } : { ...EMPTY_KID_ADDRESS },
    guardianCustomValues: customValues.get(guardianRows[0]?.id ?? "") ?? [],
    companyName: companyRows[0]?.name ?? "",
    children,
    congregations: congregations.map((row) => ({ id: row.id, name: row.name })),
    recentReports: reportRows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content ?? "",
      classroomName: row.classroom_name,
      sessionTitle: row.session_title ?? "",
      childName: row.child_full_name ? formatChildLabelName(row.child_full_name) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    })),
    customFields,
  }
}
