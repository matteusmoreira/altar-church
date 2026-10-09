"use client"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { chatRequest } from "@/components/ministries/chat-client"
import type { MemberMinistryDetails } from "@/lib/member/types"
import { AssignmentAbsence } from "./assignment-absence"
import { cn } from "@/lib/utils"

const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
const statuses: Record<string,string> = { notified: "Escalado", confirmed: "Confirmado", declined: "Ausência avisada", checked_in: "Check-in realizado", checked_out: "Serviço concluído", no_show: "Ausência registrada" }
export function MinistryInformation({ ministryId, name, open, onOpenChange }: { ministryId: string; name: string; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [data, setData] = useState<MemberMinistryDetails | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const meetingDay = data?.meetingDay == null ? "" : ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][data.meetingDay] || ""
  async function load(cursor?: string) {
    const current = ++version.current
    setBusy(true)
    try {
      const result = await chatRequest<MemberMinistryDetails>(`/api/v1/member/ministries/${ministryId}/details${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
      if (current !== version.current) return
      setData(previous => cursor && previous ? { ...result, activities: [...previous.activities,...result.activities.filter(item => !previous.activities.some(old => old.id===item.id))] } : result); setError("")
    } catch (err) { if (current===version.current) setError(err instanceof Error ? err.message : "Não foi possível carregar") }
    finally { if (current===version.current) setBusy(false) }
  }
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const current = ++version.current
    void chatRequest<MemberMinistryDetails>(`/api/v1/member/ministries/${ministryId}/details`, "GET", undefined, controller.signal).then(result => { if (!controller.signal.aborted && current===version.current) { setData(result); setError("") } }).catch(err => { if (!controller.signal.aborted && current===version.current) setError(err instanceof Error ? err.message : "Não foi possível carregar") })
    return () => { controller.abort() }
  }, [open,ministryId])
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>Informações, recursos, agenda e sua participação na escala</DialogDescription></DialogHeader>
    {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>}
    {!data && !error && <p role="status">Carregando informações…</p>}
    {data && <div className="space-y-5 break-words">
      <section className="space-y-2 rounded-xl bg-muted/40 p-4 text-sm"><p className="whitespace-pre-wrap">{data.description || "Nenhuma descrição informada."}</p><p><strong>Liderança:</strong> {data.leaderName || "Não informada"}</p><p><strong>Contato:</strong> {data.contact || "Não informado"}</p>{(meetingDay || data.meetingTime) && <p><strong>Encontro habitual:</strong> {meetingDay} {data.meetingTime?.slice(0,5)}</p>}{data.meetingLocation && <p><strong>Local habitual:</strong> {data.meetingLocation}</p>}</section>
      <section className="space-y-3" aria-label="Recursos do ministério">
        <h3 className="font-semibold">Recursos</h3>
        {!data.resources.length && <p className="text-sm text-muted-foreground">Nenhum recurso disponível neste ministério.</p>}
        {data.resources.map(resource => <article key={resource.id} className="min-w-0 space-y-3 rounded-xl border p-4">
          <div><h4 className="font-semibold">{resource.title}</h4><p className="text-xs text-muted-foreground">{resource.category}</p></div>
          {resource.description && <p className="whitespace-pre-wrap text-sm">{resource.description}</p>}
          {resource.fileUrl && resource.mimeType?.startsWith("image/") && <a href={resource.fileUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Abrir imagem: ${resource.title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resource.fileUrl} alt={resource.title} loading="lazy" className="max-h-80 w-full rounded-lg object-contain" />
          </a>}
          <div className="flex flex-wrap gap-3 text-sm">
            {resource.fileUrl && <a href={resource.fileUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-4">{resource.fileName || "Abrir arquivo"}</a>}
            {resource.externalUrl && <a href={resource.externalUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">Abrir link</a>}
          </div>
          {!resource.fileUrl && !resource.externalUrl && <p className="text-sm text-muted-foreground">Arquivo indisponível.</p>}
        </article>)}
      </section>
      <h3 className="font-semibold">Próximas atividades e escalas</h3>
      {!data.activities.length && <p className="text-sm text-muted-foreground">Nenhuma atividade futura publicada neste ministério.</p>}
      {data.activities.map(activity => <section key={activity.id} className="space-y-3 rounded-xl border p-4"><h4 className="font-semibold">{activity.title}</h4><p className="text-sm">{date(activity.startsAt)}{activity.endsAt ? ` até ${time(activity.endsAt)}` : ""}{activity.recurring ? " · Atividade recorrente" : ""}</p><p className="text-sm text-muted-foreground">{activity.location || "Local não informado"}</p>{activity.description && <p className="whitespace-pre-wrap text-sm">{activity.description}</p>}
        <h5 className="text-sm font-semibold">Escala publicada</h5>{!activity.scale.length && <p className="text-sm text-muted-foreground">Nenhuma escala publicada para esta atividade.</p>}
        {activity.scale.map(item => <div key={item.id} className={cn("space-y-2 rounded-lg bg-muted/30 p-3 text-sm",item.isMine && "border border-primary bg-primary/5")}><p className="font-semibold">{item.role}{item.isMine ? " · Sua função" : ""}</p><p>{item.personName || "Vaga disponível"}{item.status ? ` · ${statuses[item.status] || "Escalado"}` : ""}</p><p>{time(item.startsAt)}{item.endsAt ? ` – ${time(item.endsAt)}` : ""}</p>{item.instructions && <p className="whitespace-pre-wrap">{item.instructions}</p>}{item.isMine && item.assignmentId && <AssignmentAbsence key={`${item.assignmentId}:${item.status}`} assignmentId={item.assignmentId} status={item.status} reason={item.declineReason} canDecline={!!item.canDecline} onSaved={() => void load()} />}</div>)}
      </section>)}
      {data.nextCursor && <Button variant="outline" disabled={busy} onClick={() => void load(data.nextCursor!)}>{busy ? "Carregando…" : "Carregar mais atividades"}</Button>}
    </div>}
  </DialogContent></Dialog>
}
