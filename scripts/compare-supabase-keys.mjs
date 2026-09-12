import { createClient } from "@supabase/supabase-js"

// Nenhuma credencial fica versionada aqui. Informe via ambiente:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   E2E_SUPERADMIN_EMAIL, E2E_DEFAULT_PASSWORD
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
if (!url) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")
}

const candidates = [
  ["publishable", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
  ["anon", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
].filter(([, key]) => Boolean(key))

if (candidates.length === 0) {
  throw new Error(
    "Nenhuma chave configurada: defina NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY",
  )
}

const email = process.env.E2E_SUPERADMIN_EMAIL ?? "e2e.superadmin@altar-church.test"
const password = process.env.E2E_DEFAULT_PASSWORD
if (!password) {
  throw new Error("E2E_DEFAULT_PASSWORD nao configurado no ambiente")
}

for (const [name, key] of candidates) {
  const { error } = await createClient(url, key).auth.signInWithPassword({ email, password })
  console.log(name, error?.message ?? "ok")
}
