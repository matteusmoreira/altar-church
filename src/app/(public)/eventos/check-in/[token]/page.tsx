import { getEventCheckinPreview } from "@/lib/events/data"
import { EventCheckinClient } from "./event-checkin-client"

type PageProps = { params: Promise<{ token: string }> }

export default async function EventCheckinPage({ params }: PageProps) {
  const { token } = await params
  return <EventCheckinClient preview={await getEventCheckinPreview(token)} />
}
