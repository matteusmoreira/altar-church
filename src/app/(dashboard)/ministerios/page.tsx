import { MinistriesClient } from "./ministries-client"
import { MinistryMembershipManager } from "@/components/member/ministry-membership-manager"
import { getCurrentUser } from "@/lib/auth/server"
import { listManagedMinistryMemberships } from "@/lib/member/data"
import { listMinistries, listMinistryLeaderCandidates } from "@/lib/pastoral/data"
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

export default async function MinistriesPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const filters: PastoralListFilters = {
    search: textFilter(params.search),
    isActive: booleanFilter(params.isActive),
    page: numberFilter(params.page, 1),
    pageSize: 10,
  }
  const user = await getCurrentUser()
  const [ministriesResult, leaderCandidates] = await Promise.all([
    listMinistries(filters),
    listMinistryLeaderCandidates(),
  ])

  return (
    <div className="space-y-6">
      <MinistriesClient ministriesResult={ministriesResult} filters={filters} leaderCandidates={leaderCandidates} />
      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl border bg-muted/30" />}>
        <ManagedMemberships user={user} />
      </Suspense>
    </div>
  )
}

async function ManagedMemberships({ user }: { user: Awaited<ReturnType<typeof getCurrentUser>> }) {
  const memberships = user ? await listManagedMinistryMemberships(user) : []
  return <MinistryMembershipManager memberships={memberships} />
}
import { Suspense } from "react"
