import { VisitorsClient } from "./visitors-client"
import { listPeople } from "@/lib/people/data"
import type { PeopleListFilters } from "@/lib/people/types"

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function textFilter(value: string | string[] | undefined, fallback = "") {
  return firstParam(value)?.trim() || fallback
}

function numberFilter(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(firstParam(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

export default async function VisitorsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const filters: PeopleListFilters = {
    search: textFilter(params.search),
    personType: "visitor",
    page: numberFilter(params.page, 1),
    pageSize: 10,
  }

  const visitorsResult = await listPeople(filters)

  return <VisitorsClient visitorsResult={visitorsResult} filters={filters} />
}
