"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assertSuperadmin } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { openRouterModels } from "@/lib/automations/ai"
import { OPENROUTER_SECRET_NAME } from "@/lib/automations/openrouter-config"

export async function getAdminOpenRouterSettings(companyIdInput?: string) {
  await assertSuperadmin()
  const companyId = companyIdInput ? z.string().uuid().parse(companyIdInput) : null
  const sql = getSql()
  const [secret] = await sql<{ id: string }[]>`select id from vault.secrets where name=${OPENROUTER_SECRET_NAME} limit 1`
  const [settings] = companyId ? await sql<{ allowed_models: string[]; monthly_budget_usd: string }[]>`
    select allowed_models,monthly_budget_usd from public.automation_settings where company_id=${companyId}
  ` : []
  return {
    keySource: secret ? "panel" as const : process.env.OPENROUTER_API_KEY?.trim() ? "environment" as const : "missing" as const,
    models: settings?.allowed_models ?? [],
    budget: Number(settings?.monthly_budget_usd ?? 0),
  }
}

export async function saveAdminOpenRouterKey(keyInput: string) {
  await assertSuperadmin()
  const parsed = z.string().trim().min(20).max(512).regex(/^sk-or-[A-Za-z0-9_-]+$/).safeParse(keyInput)
  if (!parsed.success) return { ok: false as const, error: "Informe uma chave válida do OpenRouter (sk-or-…)." }
  try {
    await getSql().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${OPENROUTER_SECRET_NAME}))`
      const [secret] = await tx`select id from vault.secrets where name=${OPENROUTER_SECRET_NAME} limit 1`
      if (secret) await tx`select vault.update_secret(${secret.id}::uuid,${parsed.data})`
      else await tx`select vault.create_secret(${parsed.data},${OPENROUTER_SECRET_NAME},'OpenRouter central de automações')`
    })
  } catch {
    // Database exceptions can include query parameters. Never return them to the client.
    return { ok: false as const, error: "Não foi possível salvar a chave no cofre. Verifique a disponibilidade do Vault." }
  }
  await writeAuditLog({ action: "automation.openrouter.key.save", entityTable: "vault.secrets", companyId: null })
  revalidatePath("/admin")
  revalidatePath("/automacoes")
  return { ok: true as const }
}

export async function getAdminOpenRouterModels() {
  await assertSuperadmin()
  return (await openRouterModels()).map(({ id }) => id).sort()
}

export async function saveAdminOpenRouterSettings(input: { companyId: string; models: string[]; budget: number }) {
  await assertSuperadmin()
  const parsed = z.object({
    companyId: z.string().uuid(),
    models: z.array(z.string().trim().min(1).max(180)).max(20),
    budget: z.number().finite().min(0).max(100000),
  }).safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Confira a igreja, os modelos (até 20) e o orçamento (US$ 0 a 100.000)." }
  const { companyId, budget } = parsed.data
  const models = [...new Set(parsed.data.models)]
  if (models.length) {
    const available = new Set((await openRouterModels()).map(({ id }) => id))
    if (models.some((id) => !available.has(id))) return { ok: false as const, error: "Há um modelo indisponível ou sem suporte a respostas estruturadas. Consulte os modelos disponíveis." }
  }
  const sql = getSql()
  const [company] = await sql`select id from public.companies where id=${companyId}`
  if (!company) return { ok: false as const, error: "Igreja não encontrada." }
  await sql`
    insert into public.automation_settings(company_id,allowed_models,monthly_budget_usd)
    values(${companyId},${sql.array(models)}::text[],${budget})
    on conflict(company_id) do update set allowed_models=excluded.allowed_models,
    monthly_budget_usd=excluded.monthly_budget_usd,updated_at=now()
  `
  await writeAuditLog({ action: "automation.openrouter.settings.save", entityTable: "automation_settings", companyId, metadata: { models, budget } })
  revalidatePath("/admin")
  revalidatePath("/automacoes")
  return { ok: true as const }
}
