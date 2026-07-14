import { FormsClient } from "./forms-client"
import { getFormsDashboardData } from "@/lib/forms/data"

export default async function FormulariosPage() {
  const data = await getFormsDashboardData()
  return <FormsClient data={data} />
}
