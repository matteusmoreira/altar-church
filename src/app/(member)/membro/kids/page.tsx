import { FamiliaKidsClient } from "@/app/(portal)/familia/kids/familia-kids-client"
import { getGuardianPortalData } from "@/lib/kids/portal"

export default async function MemberKidsPage() {
  return <FamiliaKidsClient data={await getGuardianPortalData()} embedded />
}
