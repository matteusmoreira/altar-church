import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/server"
import { FamiliaLoginClient } from "./familia-login-client"

export default async function FamiliaLoginPage({ searchParams }: { searchParams?: Promise<{ erro?: string }> }) {
  const user = await getCurrentUser()
  if (user) redirect(user.role === "member" ? "/membro/kids" : "/dashboard")
  const params = (await searchParams) ?? {}
  return <FamiliaLoginClient error={params.erro ?? ""} />
}
