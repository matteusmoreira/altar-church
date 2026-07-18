import { getGuardianPortalData } from "@/lib/kids/portal"
import { FamiliaKidsClient } from "./familia-kids-client"

export default async function FamiliaKidsPage() {
  const data = await getGuardianPortalData()
  return <FamiliaKidsClient data={data} />
}
