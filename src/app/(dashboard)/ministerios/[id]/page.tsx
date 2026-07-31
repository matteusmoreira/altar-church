import { redirect } from "next/navigation"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"
import { MinistryWorkspace } from "@/components/ministries/ministry-workspace"

export default async function MinistryWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let data
  try {
    data = await getMinistryWorkspaceData(id)
  } catch (error) {
    if (error instanceof Error && /acesso|pertence|não encontrado|nao encontrado/i.test(error.message)) redirect("/dashboard?access=denied")
    throw error
  }
  return <MinistryWorkspace data={data} />
}
