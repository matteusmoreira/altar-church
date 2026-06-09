import { SongsClient } from "./songs-client"
import { listSongs } from "@/lib/pastoral/data"
import type { PastoralListFilters } from "@/lib/pastoral/types"

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function textFilter(value: string | string[] | undefined, fallback = "") {
  return firstParam(value)?.trim() || fallback
}

function booleanFilter(value: string | string[] | undefined) {
  const parsed = firstParam(value)
  if (parsed === "yes") return true
  if (parsed === "no") return false
  return null
}

function numberFilter(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(firstParam(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

export default async function SongsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const filters: PastoralListFilters = {
    search: textFilter(params.search),
    isActive: booleanFilter(params.isActive),
    page: numberFilter(params.page, 1),
    pageSize: 10,
  }
  const songsResult = await listSongs(filters)

  return <SongsClient songsResult={songsResult} filters={filters} />
}
