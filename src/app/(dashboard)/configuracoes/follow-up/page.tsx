import { FollowUpSettingsClient } from "@/components/people/follow-up-settings-client"
import { listFollowUpResponsibleOptions, listFollowUpTriggers } from "@/lib/people/follow-up"

export default async function FollowUpSettingsPage() {
  const [triggers, responsibleOptions] = await Promise.all([
    listFollowUpTriggers(),
    listFollowUpResponsibleOptions(),
  ])
  return <FollowUpSettingsClient triggers={triggers} responsibleOptions={responsibleOptions} />
}
