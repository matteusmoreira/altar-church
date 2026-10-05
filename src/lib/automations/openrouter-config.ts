import "server-only"
import { getSql } from "@/lib/db/client"

export const OPENROUTER_SECRET_NAME = "altar_church_openrouter_api_key"

export async function getOpenRouterApiKey() {
  const sql = getSql()
  const [secret] = await sql<{ token: string }[]>`
    select decrypted_secret as token from vault.decrypted_secrets
    where name=${OPENROUTER_SECRET_NAME} limit 1
  `
  return secret?.token || process.env.OPENROUTER_API_KEY?.trim() || ""
}
