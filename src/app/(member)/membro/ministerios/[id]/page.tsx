import { MinistryWorkspace } from "@/components/ministries/ministry-workspace"
import { requireMemberContext } from "@/lib/member/access"
import { requireMinistryPermission } from "@/lib/ministries/access"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"

export default async function MemberMinistryManagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { companyId } = await requireMemberContext()
  await requireMinistryPermission(id, "ministries.dashboard.view", companyId, { manage: true })
  return <MinistryWorkspace data={await getMinistryWorkspaceData(id, companyId)} initialTab="configuracoes" memberPortal />
}
