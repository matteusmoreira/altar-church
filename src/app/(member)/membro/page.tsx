import { MemberDashboard } from "@/components/member/member-dashboard"
import { getMemberPortalSummary } from "@/lib/member/data"

export default async function MemberHomePage() {
  return <MemberDashboard data={await getMemberPortalSummary()} />
}
