import { redirect } from "next/navigation"

import { LandingPage } from "@/components/landing/landing-page"
import { getCurrentUser } from "@/lib/auth/server"
import { isPortalRole } from "@/lib/member/access"

export default async function Home() {
  const user = await getCurrentUser()
  if (user) {
    if (isPortalRole(user.role)) redirect("/membro")
    redirect("/dashboard")
  }
  return <LandingPage />
}
