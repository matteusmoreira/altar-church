import { redirect } from "next/navigation"
import { VolunteerPortalV2 } from "@/app/(dashboard)/voluntariado/volunteer-v2-workspace"
import { getVolunteerPortalData } from "@/lib/volunteers/data"
import type { VolunteerPortalData } from "@/lib/volunteers/types"

export default async function MemberVolunteerPage() {
  let data: VolunteerPortalData
  try {
    data = await getVolunteerPortalData()
  } catch (error) {
    if (error instanceof Error && /Perfil de voluntário(?: ativo)? não vinculado/.test(error.message)) {
      redirect("/membro")
    }
    throw error
  }
  return <VolunteerPortalV2 data={data} />
}
