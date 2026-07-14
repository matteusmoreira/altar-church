import { getCurrentUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"
import { getVolunteerDashboardData, getVolunteerPortalData } from "@/lib/volunteers/data"
import { VolunteerHubClient } from "./volunteer-hub-client"

export default async function VolunteerPage() {
  const user = await getCurrentUser()
  if (!user) return null
  if (hasPermission(user.role, "volunteers.view")) {
    return <VolunteerHubClient mode="manager" data={await getVolunteerDashboardData()} />
  }
  return <VolunteerHubClient mode="volunteer" data={await getVolunteerPortalData()} />
}
