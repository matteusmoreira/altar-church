import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/server"
import { getCellCheckinPreview } from "@/lib/cells/data"
import { CellCheckinClient } from "./cell-checkin-client"

export default async function CellCheckinPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const token = (await searchParams)?.token?.trim() ?? ""
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/celulas/check-in?token=${token}`)}`)
  const preview = await getCellCheckinPreview(token)
  return <CellCheckinClient preview={preview} />
}
