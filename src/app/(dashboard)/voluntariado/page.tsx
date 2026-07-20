import { getCurrentUser } from "@/lib/auth/server"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"
import { VolunteerHubClient } from "./volunteer-hub-client"

export default async function VolunteerPage() {
  const user = await getCurrentUser()
  if (!user) return null
  return <VolunteerHubClient mode="manager" data={await getVolunteerDashboardData()} />
}
