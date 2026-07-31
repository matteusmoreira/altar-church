import { getEventCheckinSessionPreview } from "@/lib/events/data"
import { EventSessionCheckinClient } from "./event-session-checkin-client"

export default async function EventSessionCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <EventSessionCheckinClient preview={await getEventCheckinSessionPreview(token)} />
}
