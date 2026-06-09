import { GroupsClient } from "./groups-client"
import {
  getGroupFormOptions,
  getGroupsDashboardData,
  listGroupMeetingReports,
  listGroupMembers,
  listGroups,
} from "@/lib/groups/data"
import type { GroupListFilters, GroupType } from "@/lib/groups/types"

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function numberFilter(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(firstParam(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function groupTypeFilter(value: string | string[] | undefined): GroupListFilters["type"] {
  const parsed = firstParam(value)
  return ["cell", "ministry", "department", "class"].includes(parsed ?? "") ? (parsed as GroupType) : "all"
}

function activeFilter(value: string | string[] | undefined) {
  const parsed = firstParam(value)
  if (parsed === "active") return true
  if (parsed === "inactive") return false
  return null
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const params = (await searchParams) ?? {}
  const filters: GroupListFilters = {
    search: firstParam(params.search)?.trim() ?? "",
    categoryId: firstParam(params.categoryId) ?? "all",
    type: groupTypeFilter(params.type),
    isActive: activeFilter(params.status),
    meetingDay: firstParam(params.meetingDay) ?? "all",
    page: numberFilter(params.page, 1),
    pageSize: 20,
  }

  const [groupsResult, dashboard, formOptions, meetings, members] = await Promise.all([
    listGroups(filters),
    getGroupsDashboardData(),
    getGroupFormOptions(),
    listGroupMeetingReports(),
    listGroupMembers(),
  ])

  return (
    <GroupsClient
      dashboard={dashboard}
      filters={filters}
      formOptions={formOptions}
      groupsResult={groupsResult}
      members={members}
      meetings={meetings}
    />
  )
}
