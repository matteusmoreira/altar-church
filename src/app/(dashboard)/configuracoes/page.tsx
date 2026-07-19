import { SettingsClient } from "./settings-client"
import { getSettingsData } from "@/lib/settings/data"
import { getUazapiInstancesData } from "@/lib/uazapi/data"

export default async function SettingsPage() {
  const [settingsData, uazapiData] = await Promise.all([
    getSettingsData(),
    getUazapiInstancesData(),
  ])

  return <SettingsClient settingsData={settingsData} uazapiData={uazapiData} />
}
