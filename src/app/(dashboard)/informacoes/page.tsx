import { ChurchInfoClient } from "./church-info-client"
import { getChurchInfoData } from "@/lib/church-info/data"

export default async function ChurchInfoPage() {
  const churchInfoData = await getChurchInfoData()

  return <ChurchInfoClient churchInfoData={churchInfoData} />
}
