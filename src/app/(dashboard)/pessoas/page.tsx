import { MembersClient } from "./members-client"
import {
  getPeopleDashboardData,
  getPersonFormOptions,
  listDuplicateCandidates,
  listPeople,
} from "@/lib/people/data"
import { listCrmStages } from "@/lib/operational/data"
import type { PeopleListFilters, PersonStatus, PersonType } from "@/lib/people/types"
import type { CRMStage } from "@/lib/types"

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function textFilter(value: string | string[] | undefined, fallback = "all") {
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

function statusFilter(value: string | string[] | undefined): PeopleListFilters["status"] {
  const parsed = textFilter(value)
  return ["active", "inactive", "visitor"].includes(parsed) ? (parsed as PersonStatus) : "all"
}

function personTypeFilter(value: string | string[] | undefined): PeopleListFilters["personType"] {
  const parsed = textFilter(value)
  return ["visitor", "attendee", "member", "leader", "volunteer"].includes(parsed)
    ? (parsed as PersonType)
    : "all"
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const filters: PeopleListFilters = {
    search: firstParam(params.search)?.trim() ?? "",
    status: statusFilter(params.status),
    personType: personTypeFilter(params.personType),
    congregationId: textFilter(params.congregationId),
    baptized: booleanFilter(params.baptized),
    emailValidated: booleanFilter(params.emailValidated),
    isActive: booleanFilter(params.isActive),
    kidsRole: ["any", "child", "guardian"].includes(textFilter(params.kidsRole))
      ? textFilter(params.kidsRole) as "any" | "child" | "guardian"
      : "all",
    page: numberFilter(params.page, 1),
    pageSize: 20,
  }

  const [peopleResult, dashboard, formOptions, duplicateCandidates, crmStages] = await Promise.all([
    listPeople(filters),
    getPeopleDashboardData(),
    getPersonFormOptions(),
    listDuplicateCandidates(),
    listCrmStages().catch((): CRMStage[] => []),
  ])

  return (
    <MembersClient
      crmStages={crmStages}
      dashboard={dashboard}
      duplicateCandidates={duplicateCandidates}
      filters={filters}
      formOptions={formOptions}
      peopleResult={peopleResult}
    />
  )
}
