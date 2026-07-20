import { VolunteerPortalV2 } from "@/app/(dashboard)/voluntariado/volunteer-v2-workspace"
import { getVolunteerPortalData } from "@/lib/volunteers/data"

export default async function MemberVolunteerPage() {
  return <VolunteerPortalV2 data={await getVolunteerPortalData()} />
}
