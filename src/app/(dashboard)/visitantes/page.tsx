import { VisitorsClient } from "./visitors-client"
import { getPersonFormOptions, getVisitorMetrics, listPeople } from "@/lib/people/data"
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
  const stage = textFilter(params.stage, "all")
  const source = textFilter(params.source, "all")
  const cellId = textFilter(params.cellId, "all")

  const filters: PeopleListFilters = {
    search: textFilter(params.search),
    personType: "visitor",
    journeyStatus: stage === "all" ? undefined : stage,
    accessProfile: source === "all" ? undefined : source,
    cellId: cellId === "all" ? undefined : (cellId as string | "none"),
    page: numberFilter(params.page, 1),
    pageSize: 12,
  }

  const [visitorsResult, formOptions, metrics] = await Promise.all([
    listPeople(filters),
    getPersonFormOptions(),
    getVisitorMetrics(),
  ])

  return (
    <VisitorsClient
      visitorsResult={visitorsResult}
      filters={filters}
      formOptions={formOptions}
      metrics={metrics}
    />
  )
}
