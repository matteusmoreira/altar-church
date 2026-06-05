import { SettingsClient } from "./settings-client"
import { getSettingsData } from "@/lib/settings/data"

export default async function SettingsPage() {
  const settingsData = await getSettingsData()

  return <SettingsClient settingsData={settingsData} />
}
