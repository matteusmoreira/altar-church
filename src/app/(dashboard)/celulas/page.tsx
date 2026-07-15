import { GroupsClient } from "../gceus/groups-client"
import { CellFeaturesClient } from "./cell-features-client"
import { getCellFeaturesData } from "@/lib/cells/data"
import { getGroupFormOptions, getGroupsDashboardData, listGroupMeetingReports, listGroupMembers, listGroups } from "@/lib/groups/data"
import type { GroupListFilters } from "@/lib/groups/types"

type SearchParams = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export default async function CellsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const features = await getCellFeaturesData()
  if (features.mode === "portal") return <CellFeaturesClient data={features} />

  const params = (await searchParams) ?? {}
  const page = Number(first(params.page))
  const filters: GroupListFilters = {
    search: first(params.search)?.trim() ?? "",
    categoryId: first(params.categoryId) ?? "all",
    type: "cell",
    isActive: first(params.status) === "active" ? true : first(params.status) === "inactive" ? false : null,
    meetingDay: first(params.meetingDay) ?? "all",
    page: Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1,
    pageSize: 20,
  }
  const [groupsResult, dashboard, formOptions, meetings, members] = await Promise.all([
    listGroups(filters), getGroupsDashboardData(), getGroupFormOptions(), listGroupMeetingReports(), listGroupMembers(),
  ])
  return (
    <div className="space-y-8">
      <GroupsClient dashboard={dashboard} filters={filters} formOptions={formOptions} groupsResult={groupsResult} members={members} meetings={meetings} />
      <CellFeaturesClient data={features} />
    </div>
  )
}
