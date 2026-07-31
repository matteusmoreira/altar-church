import { notFound } from "next/navigation"
import { getPublicEventRegistration } from "@/lib/events/data"
import { GuestRegistrationClient } from "./guest-registration-client"

export default async function GuestRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const registration = await getPublicEventRegistration(token)
  if (!registration) notFound()
  return <GuestRegistrationClient registration={registration} />
}
