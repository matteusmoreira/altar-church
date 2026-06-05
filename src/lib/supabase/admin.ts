import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env"

export function createSupabaseAdminClient() {
  const serviceRoleKey = getSupabaseServiceRoleKey()
  if (!serviceRoleKey) {
    return null
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
