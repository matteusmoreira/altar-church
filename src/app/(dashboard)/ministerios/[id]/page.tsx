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
  // Se acessado por ID (UUID) ou slug diferente e o ministério tiver slug amigável,
  // redireciona para a rota com slug canônico
  const friendlySlug = data.workspace.profile.slug
  if (friendlySlug && id !== friendlySlug) {
    redirect(`/ministerios/${friendlySlug}`)
  }

  return <MinistryWorkspace data={data} />
}
