import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .reduce((acc, line) => {
    const index = line.indexOf("=")
    if (index > 0) acc[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    return acc
  }, {})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const email = "e2e.superadmin@altar-church.test"
const password = env.E2E_DEFAULT_PASSWORD

console.log("url", env.NEXT_PUBLIC_SUPABASE_URL)
console.log("password set", Boolean(password))

const t0 = Date.now()
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
console.log("signIn", Date.now() - t0, "ms", error?.message ?? "ok", data?.user?.id ?? "no-user")