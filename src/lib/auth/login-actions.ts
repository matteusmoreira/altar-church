"use server"

import { createHash } from "node:crypto"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { createClient } from "@/lib/supabase/server"
import { normalizeBrazilianWhatsapp } from "./phone"

const loginSchema = z.object({
  method: z.enum(["email", "whatsapp"]),
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
})

export type LoginMethod = z.infer<typeof loginSchema>["method"]

export async function loginWithIdentifier(input: z.input<typeof loginSchema>) {
  try {
    const parsed = loginSchema.parse(input)
    const sql = getSql()
    const normalizedPhone = parsed.method === "whatsapp"
      ? normalizeBrazilianWhatsapp(parsed.identifier)
      : null

    const rows = parsed.method === "email"
      ? await sql<{ email: string }[]>`
          select email
          from public.profiles
          where active = true and lower(email) = lower(${parsed.identifier})
          limit 1
        `
      : normalizedPhone
        ? await sql<{ email: string }[]>`
            select email
            from public.profiles
            where active = true
              and company_id is not null
              and login_phone = ${normalizedPhone}
            limit 1
          `
        : []

    // A chamada ao Auth também acontece para identificadores inexistentes, reduzindo
    // diferenças observáveis entre "usuário não existe" e "senha incorreta".
    const fallbackKey = createHash("sha256")
      .update(`${parsed.method}:${parsed.identifier.toLowerCase()}`)
      .digest("hex")
      .slice(0, 24)
    const email = rows[0]?.email ?? `invalid-${fallbackKey}@altar-church.invalid`
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.password,
    })

    return { ok: !error && Boolean(rows[0]) }
  } catch {
    return { ok: false }
  }
}
