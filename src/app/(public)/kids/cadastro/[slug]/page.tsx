import { getVisitorFormInfo } from "@/lib/kids/portal-actions"
import { CadastroVisitanteClient } from "./cadastro-client"

export default async function KidVisitorRegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const info = await getVisitorFormInfo(slug)
  return <CadastroVisitanteClient slug={slug} info={info} />
}
