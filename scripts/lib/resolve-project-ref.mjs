/**
 * Resolve o project ref do Supabase sem assumir nenhum ambiente por padrão.
 *
 * Ordem de precedência:
 *   1. SUPABASE_PROJECT_REF
 *   2. host de SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *
 * Falha explicitamente se nada estiver configurado. Nunca há fallback para um
 * projeto fixo — isso evita que um script rode silenciosamente contra produção.
 */
export function resolveSupabaseProjectRef() {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim()
  if (explicit) return explicit

  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (url) {
    try {
      const ref = new URL(url).hostname.split(".")[0]
      if (ref) return ref
    } catch {
      // cai no erro abaixo
    }
  }

  console.error(
    "SUPABASE_PROJECT_REF nao configurado e nao foi possivel derivar de SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.",
  )
  process.exit(1)
}
