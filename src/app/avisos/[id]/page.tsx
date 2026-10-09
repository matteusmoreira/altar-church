import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Bell } from "lucide-react"
import { getCurrentUser } from "@/lib/auth/server"
import { isPortalRole } from "@/lib/member/access"
import { getMyPushNotification } from "@/lib/notifications/data"
import { NotificationRichContent } from "@/components/notifications/rich-content"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export default async function PushMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/avisos/${id}`)}`)
  const message = await getMyPushNotification(id)
  if (!message) notFound()
  const home = (user.roles ?? [user.role]).some(isPortalRole) ? "/membro" : "/dashboard"
  return <main className="mx-auto min-h-dvh max-w-2xl space-y-5 px-4 py-6 sm:py-10">
    <Link href={home} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Voltar ao início</Link>
    <Card>
      <CardHeader><p className="flex items-center gap-2 text-sm text-muted-foreground"><Bell className="size-4" />Aviso da sua igreja</p><CardTitle className="break-words text-2xl">{message.title}</CardTitle></CardHeader>
      <CardContent><NotificationRichContent content={message.content} /></CardContent>
    </Card>
  </main>
}
