import { ContentClient } from "./content-client"
import { getContentDashboardData } from "@/lib/content/data"

export default async function ContentPage() {
  const data = await getContentDashboardData()

  return <ContentClient data={data} />
}
