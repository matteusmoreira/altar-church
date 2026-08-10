"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { generatePasswordResetCode, hashPasswordResetValue, verifyPasswordResetHash } from "./otp-security"
import { buildPasswordResetUazapiPayload } from "./password-recovery-payload"
import { normalizeBrazilianWhatsapp } from "./phone"

const whatsappSchema = z.string().trim().transform((value, context) => {
  const phone = normalizeBrazilianWhatsapp(value)
  if (!phone) {
    context.addIssue({ code: "custom", message: "Informe um WhatsApp móvel válido com DDD" })
    return z.NEVER
  }
  return phone
})
const completeSchema = z.object({
  requestId: z.string().uuid("Solicitação inválida"),
  code: z.string().trim().regex(/^\d{6}$/, "Informe os 6 dígitos"),
  newPassword: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres").max(128),
})

type RecoveryResult = { ok: boolean; error?: string; requestId?: string }

async function requestIp() {
  const headerStore = await headers()
  const forwarded = headerStore.get("x-forwarded-for") ?? ""
  return forwarded.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown"
}

function publicRequestResult(requestId: string): RecoveryResult {
  return { ok: true, requestId }
}

async function markDelivery(requestId: string, status: "sent" | "failed", providerMessageId?: string) {
  await getSql()`
    update public.auth_password_reset_challenges
    set delivery_status = ${status}, provider_message_id = ${providerMessageId ?? null}
    where id = ${requestId}
  `
}

export async function requestPasswordReset(whatsappInput: string): Promise<RecoveryResult> {
  const requestId = randomUUID()
  let whatsapp: string
  try {
    whatsapp = whatsappSchema.parse(whatsappInput)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "WhatsApp inválido" }
  }

  try {
    const sql = getSql()
    const profiles = await sql<{
      id: string
      company_id: string
      login_phone: string
    }[]>`
      select id, company_id, login_phone
      from public.profiles
      where active = true
        and role <> 'superadmin'
        and company_id is not null
        and auth_user_id is not null
        and login_phone is not null
        and login_phone = ${whatsapp}
      limit 1
    `
    const profile = profiles[0]
    if (!profile) return publicRequestResult(requestId)

    const ipHash = hashPasswordResetValue("ip", await requestIp())
    const limits = await sql<{ profile_requests: number; ip_requests: number }[]>`
      select
        count(*) filter (where profile_id = ${profile.id})::integer as profile_requests,
        count(*) filter (where request_ip_hash = ${ipHash})::integer as ip_requests
      from public.auth_password_reset_challenges
      where created_at > now() - interval '1 hour'
        and (profile_id = ${profile.id} or request_ip_hash = ${ipHash})
    `
    if (
      Number(limits[0]?.profile_requests ?? 0) >= 3 ||
      Number(limits[0]?.ip_requests ?? 0) >= 20
    ) {
      return publicRequestResult(requestId)
    }

    const code = generatePasswordResetCode()
    const codeHash = hashPasswordResetValue(requestId, code)
    await sql.begin(async (tx) => {
      await tx`
        update public.auth_password_reset_challenges
        set invalidated_at = now()
        where profile_id = ${profile.id}
          and consumed_at is null
          and invalidated_at is null
      `
      await tx`
        insert into public.auth_password_reset_challenges (
          id, company_id, profile_id, code_hash, request_ip_hash, expires_at
        )
        values (
          ${requestId}, ${profile.company_id}, ${profile.id}, ${codeHash}, ${ipHash},
          now() + interval '10 minutes'
        )
      `
    })

    const admin = createSupabaseAdminClient()
    if (!admin) throw new Error("Supabase Admin indisponível")
    const { data: credentials, error: credentialError } = await admin.rpc(
      "get_company_uazapi_credential",
      { p_company_id: profile.company_id },
    )
    const credential = Array.isArray(credentials) ? credentials[0] as {
      base_url?: string
      instance_token?: string
    } | undefined : undefined
    if (credentialError || !credential?.base_url || !credential.instance_token) {
      throw new Error("Igreja sem instância Uazapi conectada")
    }

    const response = await fetch(`${credential.base_url.replace(/\/$/, "")}/send/menu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: credential.instance_token,
      },
      body: JSON.stringify(buildPasswordResetUazapiPayload({
        phone: profile.login_phone,
        code,
        requestId,
      })),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`Uazapi recusou o envio (${response.status})`)
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    const providerMessageId = String(payload.id ?? payload.messageId ?? payload.key ?? "") || undefined
    await markDelivery(requestId, "sent", providerMessageId)
    await sql`
      insert into public.audit_logs (
        company_id, actor_profile_id, action, entity_table, entity_id, metadata
      )
      values (
        ${profile.company_id}, ${profile.id}, 'auth.password_reset.requested',
        'auth_password_reset_challenges', ${requestId},
        ${JSON.stringify({ channel: "whatsapp" })}::jsonb
      )
    `
  } catch (error) {
    await markDelivery(requestId, "failed").catch(() => undefined)
    console.error("Falha sanitizada no envio de recuperação por WhatsApp", {
      requestId,
      reason: error instanceof Error ? error.name : "unknown",
    })
  }

  return publicRequestResult(requestId)
}

export async function completePasswordReset(input: z.input<typeof completeSchema>): Promise<RecoveryResult> {
  try {
    const parsed = completeSchema.parse(input)
    const sql = getSql()
    const verified = await sql.begin(async (tx) => {
      const rows = await tx<{
        profile_id: string
        company_id: string
        code_hash: string
        attempt_count: number
        auth_user_id: string
      }[]>`
        select challenge.profile_id, challenge.company_id, challenge.code_hash,
          challenge.attempt_count, profile.auth_user_id
        from public.auth_password_reset_challenges challenge
        join public.profiles profile
          on profile.id = challenge.profile_id
         and profile.company_id = challenge.company_id
         and profile.active = true
         and profile.role <> 'superadmin'
        where challenge.id = ${parsed.requestId}
          and challenge.delivery_status = 'sent'
          and challenge.expires_at > now()
          and challenge.invalidated_at is null
          and challenge.consumed_at is null
        for update of challenge
      `
      const challenge = rows[0]
      if (!challenge || challenge.attempt_count >= 5) return null

      const valid = verifyPasswordResetHash(parsed.requestId, parsed.code, challenge.code_hash)
      if (!valid) {
        await tx`
          update public.auth_password_reset_challenges
          set attempt_count = attempt_count + 1
          where id = ${parsed.requestId}
        `
        return null
      }

      await tx`
        update public.auth_password_reset_challenges
        set attempt_count = attempt_count + 1, consumed_at = now()
        where id = ${parsed.requestId}
      `
      return challenge
    })

    if (!verified) return { ok: false, error: "Código inválido ou expirado. Solicite um novo código." }
    const admin = createSupabaseAdminClient()
    if (!admin) throw new Error("Supabase Admin indisponível")
    const { error } = await admin.auth.admin.updateUserById(verified.auth_user_id, {
      password: parsed.newPassword,
    })
    if (error) throw error

    await sql`
      insert into public.audit_logs (
        company_id, actor_profile_id, action, entity_table, entity_id, metadata
      )
      values (
        ${verified.company_id}, ${verified.profile_id}, 'auth.password_reset.completed',
        'profiles', ${verified.profile_id}, ${JSON.stringify({ channel: "whatsapp" })}::jsonb
      )
    `
    return { ok: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
    }
    return {
      ok: false,
      error: "Não foi possível atualizar a senha. Solicite um novo código e tente novamente.",
    }
  }
}
