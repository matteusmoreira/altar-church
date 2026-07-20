import { redirect } from "next/navigation"

import { LandingPage } from "@/components/landing/landing-page"
import { getCurrentUser } from "@/lib/auth/server"

export default async function Home() {
  const user = await getCurrentUser()
  if (user) {
    if (user.role === "guardian") redirect("/familia/kids")
    if (user.role === "volunteer") redirect("/voluntariado")
    redirect("/dashboard")
  }
  return <LandingPage />
}
