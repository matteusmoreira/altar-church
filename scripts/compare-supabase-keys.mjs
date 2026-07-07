import { createClient } from "@supabase/supabase-js"

const url = "https://zsldqioutjxchgmmwtfi.supabase.co"
const publishable = "sb_publishable_-8KTZHp7WFeY4hSc27_2XQ_F46GI_8x"
const anon =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzbGRxaW91dGp4Y2hnbW13dGZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMjQ1NjEsImV4cCI6MjA5NTYwMDU2MX0.ZyPINpRsGaLdiSiBWpKAc9qFfcNeDPTpT1zKTu8bF0Y"

for (const [name, key] of [
  ["publishable", publishable],
  ["anon", anon],
]) {
  const { error } = await createClient(url, key).auth.signInWithPassword({
    email: "e2e.superadmin@altar-church.test",
    password: "AltarChurch-E2E-2026!",
  })
  console.log(name, error?.message ?? "ok")
}