"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { getOptionalFile, removePersonPhoto, replacePersonPhoto } from "@/lib/files/server"
import { guardianChildSchema } from "./schemas"
import { registerVisitorKid, saveGuardianChild, saveGuardianContact } from "./portal-actions"
import type { KidsActionResult, KidsPortalActionResult } from "./types"

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function refreshKids(personId?: string) {
  revalidatePath("/kids")
  revalidatePath("/kids/recepcao")
  revalidatePath("/membro/kids")
  revalidatePath("/familia/kids")
  revalidatePath("/pessoas")
  if (personId) {
    revalidatePath(`/pessoas/${personId}`)
  }
}

async function uploadPhoto(input: { file: File; personId: string; companyId: string; ownerProfileId?: string | null; source: string }) {
  const uploaded = await replacePersonPhoto(input)
  const user = await getCurrentUser()
  if (user) {
    await writeAuditLog({
      action: "kids.photo.save",
      entityTable: "people",
      entityId: input.personId,
      companyId: input.companyId,
      metadata: { fileId: uploaded.id, source: input.source },
    })
  } else {
    await getSql()`
      insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
      values (${input.companyId}, 'kids.photo.save', 'people', ${input.personId}, ${JSON.stringify({ fileId: uploaded.id, source: input.source })}::jsonb)
    `
  }
}

export async function saveKidsPersonPhoto(formData: FormData): Promise<KidsActionResult> {
  try {
    const personId = z.string().uuid().parse(text(formData, "personId"))
    const subject = z.enum(["child", "guardian"]).parse(text(formData, "subject"))
    const remove = text(formData, "remove") === "true"
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user)
    await requirePermission(subject === "child" ? "kids.children.manage" : "kids.guardians.manage", companyId)

    const rows = subject === "child"
      ? await getSql()<{ id: string }[]>`
          select person.id
          from public.people person
          join public.kid_profiles kid on kid.person_id = person.id and kid.deleted_at is null
          where person.id = ${personId} and person.company_id = ${companyId} and person.deleted_at is null
          limit 1
        `
      : await getSql()<{ id: string }[]>`
          select person.id
          from public.people person
          join public.kid_guardians guardian on guardian.person_id = person.id and guardian.deleted_at is null
          where person.id = ${personId} and person.company_id = ${companyId} and person.deleted_at is null
          limit 1
        `
    if (!rows[0]?.id) throw new Error("Pessoa não encontrada no Kids")

    if (remove) {
      const oldFileId = await removePersonPhoto(personId, companyId)
      await writeAuditLog({ action: "kids.photo.delete", entityTable: "people", entityId: personId, companyId, metadata: { oldFileId, subject } })
    } else {
      const file = getOptionalFile(formData, "file")
      if (!file) throw new Error("Foto obrigatória")
      await uploadPhoto({ file, personId, companyId, ownerProfileId: user.id, source: `dashboard-${subject}` })
    }
    refreshKids(personId)
    return { ok: true, id: personId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function saveGuardianChildWithPhotos(formData: FormData): Promise<KidsPortalActionResult> {
  try {
    const payload = guardianChildSchema.parse(JSON.parse(text(formData, "payload")))
    const result = await saveGuardianChild(payload)
    if (!result.ok) return result

    const { requireGuardianUser } = await import("./portal")
    const user = await requireGuardianUser().catch(() => getCurrentUser())
    const churchId = user?.churchId
    if (!user || !churchId) throw new Error("Acesso negado")

    const warnings: string[] = []
    const childPhoto = getOptionalFile(formData, "childPhoto")
    const guardianPhoto = getOptionalFile(formData, "guardianPhoto")
    const childPhotoRemoved = text(formData, "childPhotoRemoved") === "true"

    if (childPhotoRemoved && result.personId) {
      const oldFileId = await removePersonPhoto(result.personId, churchId).catch((err) => {
        console.error("Erro ao remover foto da criança:", err)
        warnings.push("remover foto da criança")
        return null
      })
      if (oldFileId) {
        await writeAuditLog({
          action: "kids.photo.delete",
          entityTable: "people",
          entityId: result.personId,
          companyId: churchId,
          metadata: { oldFileId, subject: "guardian-child-photo" },
        })
      }
    } else if (childPhoto && result.personId) {
      await uploadPhoto({
        file: childPhoto,
        personId: result.personId,
        companyId: churchId,
        ownerProfileId: user.id,
        source: "guardian-registration-child",
      }).catch((err) => {
        console.error("Erro ao salvar foto da criança:", err)
        warnings.push("foto da criança")
      })
    }

    const guardianPersonId = result.guardianPersonIds?.[0]
    if (guardianPhoto && guardianPersonId) {
      await uploadPhoto({
        file: guardianPhoto,
        personId: guardianPersonId,
        companyId: churchId,
        ownerProfileId: user.id,
        source: "guardian-registration-self",
      }).catch((err) => {
        console.error("Erro ao salvar foto do responsável:", err)
        warnings.push("foto do responsável")
      })
    }

    refreshKids(result.personId ?? undefined)
    return { ...result, warning: warnings.length ? `Cadastro salvo, mas não foi possível salvar ${warnings.join(" e ")}.` : undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function saveGuardianSelfPhoto(formData: FormData): Promise<KidsPortalActionResult> {
  try {
    const { requireGuardianUser } = await import("./portal")
    const user = await requireGuardianUser()
    if (!user.churchId) throw new Error("Acesso negado")

    const remove = text(formData, "remove") === "true"
    const sql = getSql()
    const guardianPerson = await sql<{ id: string }[]>`
      select id from public.people
      where profile_id = ${user.id} and company_id = ${user.churchId} and deleted_at is null
      limit 1
    `
    const personId = guardianPerson[0]?.id
    if (!personId) throw new Error("Cadastro de responsável não encontrado")

    if (remove) {
      const oldFileId = await removePersonPhoto(personId, user.churchId)
      await writeAuditLog({
        action: "kids.photo.delete",
        entityTable: "people",
        entityId: personId,
        companyId: user.churchId,
        metadata: { oldFileId, subject: "guardian-self" },
      })
    } else {
      const file = getOptionalFile(formData, "file")
      if (!file) throw new Error("Foto obrigatória")
      await uploadPhoto({
        file,
        personId,
        companyId: user.churchId,
        ownerProfileId: user.id,
        source: "guardian-self-photo",
      })
    }

    refreshKids(personId)
    return { ok: true, id: personId, personId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function saveGuardianContactWithPhoto(formData: FormData): Promise<KidsPortalActionResult> {
  try {
    const payload = JSON.parse(text(formData, "payload")) as unknown
    const result = await saveGuardianContact(payload)
    if (!result.ok) return result

    const photo = getOptionalFile(formData, "photo")
    if (!photo) return result

    const user = await getCurrentUser()
    if (!user?.churchId || !result.id || !result.personId) throw new Error("Acesso negado")
    const allowed = await getSql()<{ id: string }[]>`
      select person.id
      from public.kid_guardians guardian
      join public.people person on person.id = guardian.person_id and person.deleted_at is null
      where guardian.id = ${result.id}
        and guardian.person_id = ${result.personId}
        and guardian.company_id = ${user.churchId}
        and guardian.created_by = ${user.id}
        and guardian.is_primary = false
        and guardian.deleted_at is null
        and person.created_by = ${user.id}
        and person.profile_id is null
        and exists (
          select 1 from public.kid_guardians owner
          where owner.kid_id = guardian.kid_id
            and owner.profile_id = ${user.id}
            and owner.deleted_at is null
        )
      limit 1
    `
    if (!allowed[0]?.id) {
      return { ...result, warning: "Contato salvo. Foto não alterada porque esta pessoa já tinha cadastro na igreja." }
    }

    try {
      await uploadPhoto({
        file: photo,
        personId: result.personId,
        companyId: user.churchId,
        ownerProfileId: user.id,
        source: "guardian-authorized-contact",
      })
    } catch {
      return { ...result, warning: "Contato salvo, mas não foi possível salvar a foto." }
    }
    refreshKids(result.personId)
    return result
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function registerVisitorKidWithPhotos(formData: FormData): Promise<KidsPortalActionResult> {
  try {
    const payload = JSON.parse(text(formData, "payload")) as unknown
    const result = await registerVisitorKid(payload as never)
    if (!result.ok) return result

    const sql = getSql()
    const companyRows = await sql<{ company_id: string }[]>`
      select company_id from public.kid_profiles where id = ${result.id ?? null} limit 1
    `
    const companyId = companyRows[0]?.company_id
    if (!companyId) return { ...result, warning: "Cadastro salvo sem fotos." }

    const warnings: string[] = []
    const childPhoto = getOptionalFile(formData, "childPhoto")
    const guardianPhoto = getOptionalFile(formData, "guardianPhoto")

    if (childPhoto && result.personId) {
      if (result.createdPerson && result.personId) {
        await uploadPhoto({
          file: childPhoto,
          personId: result.personId,
          companyId,
          source: "public-registration-child",
        }).catch(() => warnings.push("foto da criança"))
      } else {
        warnings.push("foto da criança já cadastrada (preservada)")
      }
    }
    const guardianPersonId = result.guardianPersonIds?.[0]
    if (guardianPhoto && guardianPersonId) {
      if (result.createdGuardian && guardianPersonId) {
        await uploadPhoto({
          file: guardianPhoto,
          personId: guardianPersonId,
          companyId,
          source: "public-registration-guardian",
        }).catch(() => warnings.push("foto do responsável"))
      } else {
        warnings.push("foto do responsável já cadastrado (preservada)")
      }
    }
    refreshKids(result.personId ?? undefined)
    return { ok: true, id: result.id, warning: warnings.length ? `Cadastro salvo; a recepção deve revisar ${warnings.join(" e ")}.` : undefined }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}
