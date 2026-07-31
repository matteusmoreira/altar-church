"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Globe, MapPin, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveEvent } from "@/lib/operational/actions"
import type { ChurchEvent } from "@/lib/types"

const typeLabels: Record<ChurchEvent["type"], string> = {
  service: "Culto",
  prayer: "Oração",
  youth: "Jovens",
  children: "Crianças",
  special: "Especial",
  meeting: "Reunião",
}

const statusLabels: Record<ChurchEvent["status"], string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
}

function localDateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function EventCreateForm({
  canCreate,
  event,
  volunteerTemplates,
  ministries,
  forms,
}: {
  canCreate: boolean
  event?: ChurchEvent & { volunteerTemplateId?: string | null; ministryId?: string | null; registrationFormId?: string | null }
  volunteerTemplates: { id: string; name: string }[]
  ministries: { id: string; name: string }[]
  forms: { id: string; title: string; slug: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOnline, setIsOnline] = useState(Boolean(event?.isOnline))
  const [registrationEnabled, setRegistrationEnabled] = useState(Boolean(event?.registrationEnabled))
  const [isPublic, setIsPublic] = useState(event?.isPublic ?? true)
  const [isRecurring, setIsRecurring] = useState(Boolean(event?.recurring))
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(event?.recurrenceFrequency ?? (event?.recurring ? "weekly" : "none"))

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const formData = new FormData(formEvent.currentTarget)
    startTransition(async () => {
      const result = await saveEvent(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar o evento")
        return
      }
      if (event) toast.success("Evento atualizado")
      else toast.success("Evento criado com sucesso")
      if (event) router.refresh()
      else if (result.id) router.push(`/eventos/${result.id}`)
    })
  }

  if (!canCreate && !event) {
    return <Card className="glass"><CardContent className="p-4 text-sm text-muted-foreground">Seu perfil pode consultar eventos, mas não possui permissão para criá-los.</CardContent></Card>
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><CalendarPlus className="h-4 w-4 text-primary" />{event ? "Editar evento" : "Novo evento"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {event && <input type="hidden" name="id" value={event.id} />}
          <section className="space-y-4">
            <div><p className="flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4 text-primary" />Informações básicas</p><p className="text-sm text-muted-foreground">Nome, tipo e estado de publicação do evento.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="grid gap-2 md:col-span-3"><Label htmlFor="title">Título *</Label><Input id="title" name="title" defaultValue={event?.title} placeholder="Culto de domingo" required disabled={isPending} /></div>
              <div className="grid gap-2 md:col-span-1"><Label htmlFor="type">Tipo</Label><Select name="type" defaultValue={event?.type ?? "service"} disabled={isPending}><SelectTrigger id="type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="status">Status</Label><Select name="status" defaultValue={event?.status ?? "draft"} disabled={isPending}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2 md:col-span-6"><Label htmlFor="description">Descrição</Label><Textarea id="description" name="description" defaultValue={event?.description} rows={3} placeholder="Objetivo, público e orientações" disabled={isPending} /></div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-5">
            <div><p className="font-medium">Vínculos operacionais</p><p className="text-sm text-muted-foreground">Conecte ministério e formulário público já existentes, sem criar cadastro paralelo.</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="ministryId">Ministério</Label><Select name="ministryId" defaultValue={event?.ministryId ?? "none"} disabled={isPending}><SelectTrigger id="ministryId"><SelectValue placeholder="Sem ministério" /></SelectTrigger><SelectContent><SelectItem value="none">Sem ministério</SelectItem>{ministries.map((ministry) => <SelectItem key={ministry.id} value={ministry.id}>{ministry.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label htmlFor="registrationFormId">Formulário público</Label><Select name="registrationFormId" defaultValue={event?.registrationFormId ?? "none"} disabled={isPending}><SelectTrigger id="registrationFormId"><SelectValue placeholder="Sem formulário" /></SelectTrigger><SelectContent><SelectItem value="none">Sem formulário</SelectItem>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-5">
            <div><p className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-primary" />Data e local</p><p className="text-sm text-muted-foreground">Datas são gravadas como horário do tenant, com referência inicial em America/Sao_Paulo.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="startDate">Início *</Label><Input id="startDate" name="startDate" type="datetime-local" defaultValue={localDateTime(event?.startDate)} required disabled={isPending} /></div>
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="endDate">Fim</Label><Input id="endDate" name="endDate" type="datetime-local" defaultValue={localDateTime(event?.endDate)} disabled={isPending} /></div>
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="location">Local</Label><Input id="location" name="location" defaultValue={event?.location} placeholder="Templo principal" disabled={isPending} /></div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-5">
            <div><p className="flex items-center gap-2 font-medium"><Globe className="h-4 w-4 text-primary" />Inscrição e visibilidade</p><p className="text-sm text-muted-foreground">Capacidade 0 significa ilimitada. Link online só é exigido quando o evento é online.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="registrationEnabled" name="registrationEnabled" checked={registrationEnabled} onChange={(event) => setRegistrationEnabled(event.currentTarget.checked)} disabled={isPending} className="h-4 w-4 rounded border-border" /><Label htmlFor="registrationEnabled">Aceitar inscrições</Label></div>
              {registrationEnabled && <div className="grid gap-2 md:col-span-2"><Label htmlFor="maxCapacity">Capacidade</Label><Input id="maxCapacity" name="maxCapacity" type="number" min="0" defaultValue={event?.maxCapacity ?? 0} disabled={isPending} /></div>}
              {!registrationEnabled && <input type="hidden" name="maxCapacity" value={event?.maxCapacity ?? 0} />}
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="isPublic" name="isPublic" value="true" checked={isPublic} onChange={(event) => setIsPublic(event.currentTarget.checked)} disabled={isPending} className="h-4 w-4 rounded border-border" /><Label htmlFor="isPublic">Evento público</Label></div>
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="isOnline" name="isOnline" checked={isOnline} onChange={(event) => setIsOnline(event.currentTarget.checked)} disabled={isPending} className="h-4 w-4 rounded border-border" /><Label htmlFor="isOnline">Evento online</Label></div>
              {isOnline && <div className="grid gap-2 md:col-span-4"><Label htmlFor="onlineLink">Link online *</Label><Input id="onlineLink" name="onlineLink" type="url" defaultValue={event?.onlineLink} placeholder="https://..." required disabled={isPending} /></div>}
              {!isOnline && <input type="hidden" name="onlineLink" value={event?.onlineLink ?? ""} />}
            </div>
          </section>

          <section className="space-y-4 border-t pt-5">
            <div><p className="font-medium">Voluntariado — opcional</p><p className="text-sm text-muted-foreground">Vincule modelo existente. Escala detalhada continua no módulo Voluntariado.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="recurring" name="recurring" value="true" checked={isRecurring} onChange={(e) => { setIsRecurring(e.currentTarget.checked); if (!e.currentTarget.checked) setRecurrenceFrequency("none") }} disabled={isPending} className="h-4 w-4 rounded border-border" /><Label htmlFor="recurring">Evento recorrente</Label></div>
              {isRecurring && <><div className="grid gap-2 md:col-span-2"><Label htmlFor="recurrenceFrequency">Frequência</Label><Select name="recurrenceFrequency" value={recurrenceFrequency} onValueChange={(value) => setRecurrenceFrequency(value ?? "none")} disabled={isPending}><SelectTrigger id="recurrenceFrequency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="monthly">Mensal</SelectItem></SelectContent></Select></div><div className="grid gap-2 md:col-span-2"><Label htmlFor="recurrenceUntil">Repetir até</Label><Input id="recurrenceUntil" name="recurrenceUntil" type="date" defaultValue={event?.recurrenceUntil ?? ""} disabled={isPending} /></div><div className="flex flex-wrap items-center gap-3 md:col-span-6"><span className="text-sm font-medium">Dias da semana</span>{[[0, "Dom"], [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"]].map(([value, label]) => <label key={String(value)} className="flex items-center gap-1 text-sm"><input type="checkbox" name="recurrenceWeekdays" value={String(value)} defaultChecked={event?.recurrenceWeekdays?.includes(Number(value))} disabled={isPending || recurrenceFrequency !== "weekly"} className="h-4 w-4" />{label}</label>)}</div></>}
              {event?.programmingId && <div className="grid gap-2 md:col-span-6"><Label htmlFor="recurrenceEditScope">Aplicar alterações da recorrência</Label><Select name="recurrenceEditScope" defaultValue="series" disabled={isPending}><SelectTrigger id="recurrenceEditScope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="occurrence">Somente esta ocorrência</SelectItem><SelectItem value="following">Esta e próximas ocorrências</SelectItem><SelectItem value="series">Série inteira</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Ocorrências com escala publicada nunca são apagadas.</p></div>}
              <div className="grid gap-2 md:col-span-4"><Label htmlFor="volunteerTemplateId">Modelo de escala</Label><Select name="volunteerTemplateId" defaultValue={event?.volunteerTemplateId ?? "none"} disabled={isPending}><SelectTrigger id="volunteerTemplateId"><SelectValue placeholder="Não aplicar modelo" /></SelectTrigger><SelectContent><SelectItem value="none">Não aplicar modelo</SelectItem>{volunteerTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </section>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>Voltar</Button><Button type="submit" className="gradient-primary" disabled={isPending}>{isPending ? "Salvando..." : event ? "Salvar alterações" : "Criar rascunho"}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}
