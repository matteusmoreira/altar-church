import { randomBytes } from "node:crypto"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Gera uma senha aleatória e descartável para a conta técnica.
 *
 * O e-mail da conta é derivado do telefone (`phone-<telefone>@...`), portanto
 * previsível. Uma senha fixa aqui permitiria que qualquer pessoa que conheça o
 * telefone de um membro assumisse a conta. O usuário nunca recebe este valor:
 * o primeiro acesso acontece pelo fluxo de recuperação por WhatsApp, que define
 * a senha definitiva.
 */
function generateDisposablePassword() {
  return randomBytes(32).toString("base64url")
}

const FORM_ACCOUNT_EMAIL_DOMAIN = "accounts.altar-church.invalid"

export interface PreparedFormAccount {
  companyId: string
  phone: string
  name: string
  authUserId: string
  authEmail: string
  existingProfileId: string | null
  existingPersonId: string | null
  authUserCreated: boolean
}

function isAlreadyRegisteredMessage(message: string) {
  return /already|registered|exists|duplicate/i.test(message)
}

function buildAuthEmail(phone: string) {
  return `phone-${phone}@${FORM_ACCOUNT_EMAIL_DOMAIN}`
}

async function findAuthUserIdByEmail(email: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return null

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) {
    throw new Error(`Consulta Auth falhou: ${users.error.message}`)
  }

  return users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null
}

async function createAuthUser(input: {
  email: string
  name: string
  companyId: string
  allowExisting: boolean
}) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    throw new Error("Criação de conta indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor.")
  }

  const created = await supabase.auth.admin.createUser({
    email: input.email,
    password: generateDisposablePassword(),
    email_confirm: true,
    user_metadata: {
      name: input.name,
      role: "member",
      company_id: input.companyId,
      source: "public_form",
    },
  })

  if (!created.error && created.data.user?.id) {
    return { id: created.data.user.id, created: true }
  }

  const message = created.error?.message ?? ""
  if (!input.allowExisting || !isAlreadyRegisteredMessage(message)) {
    throw new Error(`Auth falhou: ${message || "não foi possível criar o usuário"}`)
  }

  const existingId = await findAuthUserIdByEmail(input.email)
  if (!existingId) {
    throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
  }

  return { id: existingId, created: false }
}

export async function prepareFormAccount(input: {
  companyId: string
  name: string
  phone: string
}) {
  const sql = getSql()
  const phonePeople = await sql<{
    id: string
    company_id: string
    profile_id: string | null
  }[]>`
    select id, company_id, profile_id
    from public.people
    where deleted_at is null
      and (
        regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${input.phone}
        or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${`55${input.phone}`}
      )
    order by created_at, id
  `
  const otherChurchPeople = phonePeople.filter((person) => person.company_id !== input.companyId)
  if (otherChurchPeople.length > 0) {
    throw new Error("Este telefone ja esta cadastrado em outra igreja")
  }
  const sameChurchPeople = phonePeople.filter((person) => person.company_id === input.companyId)
  if (sameChurchPeople.length > 1) {
    throw new Error("Ha mais de uma Pessoa com este telefone; corrija o cadastro antes de continuar")
  }

  const profileRows = await sql<{
    id: string
    company_id: string | null
    auth_user_id: string | null
    person_id: string | null
    email: string
  }[]>`
    select id, company_id, auth_user_id, person_id, email
    from public.profiles
    where login_phone = ${input.phone}
  `
  if (profileRows.length > 1) {
    throw new Error("Ha mais de uma conta com este telefone; corrija os vinculos antes de continuar")
  }
  const profile = profileRows[0]

  if (profile && profile.company_id !== input.companyId) {
    throw new Error("Este telefone já está vinculado a outra igreja")
  }

  const linkedProfileId = sameChurchPeople[0]?.profile_id ?? null
  if (linkedProfileId && linkedProfileId !== profile?.id) {
    throw new Error("Este telefone ja esta vinculado a outra conta")
  }

  if (profile?.auth_user_id) {
    return {
      companyId: input.companyId,
      phone: input.phone,
      name: input.name,
      authUserId: profile.auth_user_id,
      authEmail: profile.email,
      existingProfileId: profile.id,
      existingPersonId: profile.person_id,
      authUserCreated: false,
    } satisfies PreparedFormAccount
  }

  if (profile) {
    const authEmail = buildAuthEmail(input.phone)
    const conflictingEmail = await sql<{ id: string }[]>`
      select id
      from public.profiles
      where lower(email) = lower(${authEmail})
        and id <> ${profile.id}
      limit 1
    `
    if (conflictingEmail[0]) {
      throw new Error("Ja existe uma conta tecnica para este telefone")
    }
    const auth = await createAuthUser({
      email: authEmail,
      name: input.name,
      companyId: input.companyId,
      allowExisting: false,
    })
    return {
      companyId: input.companyId,
      phone: input.phone,
      name: input.name,
      authUserId: auth.id,
      authEmail,
      existingProfileId: profile.id,
      existingPersonId: profile.person_id,
      authUserCreated: auth.created,
    } satisfies PreparedFormAccount
  }

  const authEmail = buildAuthEmail(input.phone)
  const conflictingEmail = await sql<{ id: string; company_id: string | null }[]>`
    select id, company_id
    from public.profiles
    where lower(email) = lower(${authEmail})
    limit 1
  `
  if (conflictingEmail[0]) {
    throw new Error("Já existe uma conta técnica para este telefone; procure a administração")
  }

  const auth = await createAuthUser({
    email: authEmail,
    name: input.name,
    companyId: input.companyId,
    allowExisting: false,
  })

  return {
    companyId: input.companyId,
    phone: input.phone,
    name: input.name,
    authUserId: auth.id,
    authEmail,
    existingProfileId: null,
    existingPersonId: null,
    authUserCreated: auth.created,
  } satisfies PreparedFormAccount
}

export async function deletePreparedAuthUser(authUserId: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return
  const { error } = await supabase.auth.admin.deleteUser(authUserId)
  if (error) throw new Error(`Limpeza da conta Auth falhou: ${error.message}`)
}
