"use client"

import { useTransition } from "react"
import Link from "next/link"
import { ListChecks, Send, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { EventDetail } from "@/lib/operational/data"
import { generateVolunteerScheduleForEvent, publishVolunteerEventSchedule } from "@/lib/volunteers/v2-actions"

export function EventVolunteerOperations({ event, canEdit }: { event: EventDetail; canEdit: boolean }) {
  const [pending, startTransition] = useTransition()
  return <div className="flex flex-wrap gap-2"><Button render={<Link href="/voluntariado" />} nativeButton={false} variant="outline"><ListChecks className="mr-2 h-4 w-4" />Abrir Voluntariado</Button>{canEdit && <><Button variant="outline" disabled={pending || event.status !== "published"} onClick={() => startTransition(async () => { const result = await generateVolunteerScheduleForEvent(event.id); if (result.ok) toast.success("Rascunho da escala gerado"); else toast.error(result.error ?? "Não foi possível gerar a escala") })}><WandSparkles className="mr-2 h-4 w-4" />Gerar rascunho</Button><Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await publishVolunteerEventSchedule(event.id); if (result.ok) toast.success("Escala publicada"); else toast.error(result.error ?? "Não foi possível publicar") })}><Send className="mr-2 h-4 w-4" />Publicar escala</Button></>}</div>
}
