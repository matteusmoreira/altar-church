"use client"
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Globe, MapPin, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { prepareEventCoverUpload, finalizeEventCoverUpload } from "@/lib/events/actions"
import { eventLocalDateTime, eventPriceLabel, parseEventValue, parseEventRegistrationSettings } from "@/lib/events/contract"
import { saveEvent } from "@/lib/operational/actions"
import { EventTypePicker } from "@/components/events/event-type-picker"
import { createClient } from "@/lib/supabase/client"
import { EVENT_COVER_MAX_BYTES, EVENT_COVER_MIME_TYPES, templateDisplayOptions } from "@/lib/events/presentation"
import type { ChurchEvent } from "@/lib/types"




export function EventCreateForm({
  eventTypes,
  canCreate,
  event,
  volunteerTemplates,
  ministries,
  forms,
}: {
  eventTypes: string[]
  canCreate: boolean
  event?: ChurchEvent & { volunteerTemplateId?: string | null; ministryId?: string | null; registrationFormId?: string | null }
  volunteerTemplates: { id: string; name: string }[]
  ministries: { id: string; name: string }[]
  forms: { id: string; title: string; slug: string }[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [review, setReview] = useState<Record<string, string>>({})
  const [coverFileId, setCoverFileId] = useState(event?.coverFileId || "")
  const [coverName, setCoverName] = useState(event?.banner ? "Capa atual" : "")
  const [removeCover, setRemoveCover] = useState(false)
  const [coverPreview, setCoverPreview] = useState(event?.banner || "")
  const [uploading, setUploading] = useState(false)
  const [publicationStatus, setPublicationStatus] = useState(event?.status || "draft")
  useEffect(() => () => { if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview) }, [coverPreview])
  const [valueMode, setValueMode] = useState(event?.valueCents ? "value" : "free")
  const [registrationMode, setRegistrationMode] = useState<"internal" | "external">(event?.registrationMode ?? "internal")
  const external = registrationMode === "external"
  const [capacity, setCapacity] = useState(event?.maxCapacity ?? 0)
  const [walkInOverride, setWalkInOverride] = useState<boolean | null>(event ? event.allowWalkIns ?? true : null)
  const steps = ["Informações", "Data e local", "Inscrições e divulgação", "Revisão"]
  function nextStep() {
    const form = formRef.current!
    const controls = Array.from(form.querySelectorAll<HTMLInputElement>(`section[data-step="${step}"] input, section[data-step="${step}"] textarea`))
    if (controls.some(control => !control.reportValidity())) return
    const data = new FormData(form)
    if (uploading) return
    if (step === 2 && valueMode === "value") { try { parseEventValue(String(data.get("eventValue") || "")) } catch (error) { toast.error((error as Error).message); return } }
    if (step === 2) { try { parseEventRegistrationSettings(registrationMode, String(data.get("externalPlatform") || "Sympla"), String(data.get("externalTicketUrl") || "")) } catch (error) { toast.error((error as Error).message); return } }
    setReview(Object.fromEntries(Array.from(data.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string")))
    setStep(step + 1)
  }
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOnline, setIsOnline] = useState(Boolean(event?.isOnline))
  const [registrationEnabled, setRegistrationEnabled] = useState(event?.registrationEnabled ?? true)
  const [isPublic, setIsPublic] = useState(event?.isPublic ?? true)
  const [isRecurring, setIsRecurring] = useState(Boolean(event?.recurring))
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(event?.recurrenceFrequency ?? (event?.recurring ? "weekly" : "none"))

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (step !== 3) { nextStep(); return }
    const formData = new FormData(formEvent.currentTarget)
    for (const control of Array.from(formEvent.currentTarget.querySelectorAll<HTMLInputElement>("input, textarea"))) { if (!control.checkValidity()) { setStep(Number(control.closest("section")?.getAttribute("data-step") || 0)); control.reportValidity(); return } }
    startTransition(async () => {
      const result = await saveEvent(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar o evento")
        return
      }
      if (event) toast.success("Evento atualizado")
      else toast.success("Evento criado com sucesso")
      if (event) router.refresh()
      else if (result.id) router.push(`/eventos/${result.slug || result.id}`)
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
        <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-6">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">{steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={`rounded-lg border p-3 text-sm ${index === step ? "border-primary bg-primary/10 font-semibold" : "text-muted-foreground"}`}>{index + 1}. {label}</li>)}</ol>
          <input type="hidden" name="status" value={publicationStatus} />
          <input type="hidden" name="coverFileId" value={coverFileId} />
          <input type="hidden" name="removeCover" value={String(removeCover)} />
          {event && <input type="hidden" name="id" value={event.id} />}
          <section data-step="0" hidden={step !== 0} className="space-y-4">
            <div><p className="flex items-center gap-2 font-medium"><Settings2 className="h-4 w-4 text-primary" />Informações básicas</p><p className="text-sm text-muted-foreground">Nome, tipo, descrição e capa do evento.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="grid gap-2 md:col-span-3"><Label htmlFor="title">Título *</Label><Input id="title" name="title" defaultValue={event?.title} placeholder="Culto de domingo" required disabled={isPending || uploading} /></div>
              <div className="grid gap-2 md:col-span-3"><Label htmlFor="type">Tipo</Label><EventTypePicker options={eventTypes} initialValue={event?.type} editing={Boolean(event)} disabled={isPending || uploading} /></div>

              <div className="grid gap-3 md:col-span-6"><Label htmlFor="eventCover">Capa do evento</Label><Input id="eventCover" type="file" accept="image/jpeg,image/png,image/webp" disabled={isPending || uploading} onChange={async e => {
                const input = e.currentTarget
                const file = input.files?.[0]
                if (!file) return
                if (file.size > EVENT_COVER_MAX_BYTES || !EVENT_COVER_MIME_TYPES.includes(file.type)) { toast.error("Use uma imagem JPEG, PNG ou WebP de até 20 MB"); input.value = ""; return }
                const previousPreview = coverPreview
                const preview = URL.createObjectURL(file)
                setCoverPreview(preview)
                setUploading(true)
                try {
                  const prepared = await prepareEventCoverUpload({ name: file.name, mimeType: file.type, sizeBytes: file.size, eventId: event?.id })
                  if (!prepared.ok) throw new Error(prepared.error)
                  const uploaded = await createClient().storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type, upsert: false })
                  if (uploaded.error) throw new Error("Não foi possível enviar a capa. Tente novamente.")
                  const completed = await finalizeEventCoverUpload(prepared.id, Boolean(event))
                  if (!completed.ok) throw new Error(completed.error)
                  setRemoveCover(false); setCoverFileId(completed.id); setCoverName(completed.name); if (completed.previewUrl) setCoverPreview(completed.previewUrl)
                } catch (error) { setCoverPreview(previousPreview.startsWith("blob:") ? "" : previousPreview); toast.error(error instanceof Error ? error.message : "Falha ao enviar capa"); input.value = "" }
                finally { setUploading(false) }
              }} /><p className="text-xs text-muted-foreground">JPEG, PNG ou WebP, até 20 MB{coverName ? ` · ${coverName}` : ""}</p>{coverPreview && <div className="overflow-hidden rounded-xl border bg-muted"><img src={coverPreview} alt="Prévia da capa do evento" className="max-h-80 w-full object-contain" /></div>}{uploading && <p role="status" className="text-sm text-primary">Enviando e validando capa...</p>}{(coverFileId || coverPreview) && <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => { setRemoveCover(true); setCoverFileId(""); setCoverName(""); setCoverPreview(""); const input = document.getElementById("eventCover") as HTMLInputElement; input.value = "" }}>Remover capa</Button>}</div>
              <div className="grid gap-2 md:col-span-6"><Label htmlFor="description">Descrição</Label><Textarea id="description" name="description" defaultValue={event?.description} rows={3} placeholder="Objetivo, público e orientações" disabled={isPending || uploading} /></div>
            </div>
          </section>

          <section data-step="2" hidden={step !== 2} className="space-y-4 border-t pt-5">
            <div><p className="font-medium">Vínculos operacionais</p><p className="text-sm text-muted-foreground">Conecte ministério e formulário público já existentes, sem criar cadastro paralelo.</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="ministryId">Ministério</Label><Select name="ministryId" defaultValue={event?.ministryId ?? "none"} disabled={isPending || uploading}><SelectTrigger id="ministryId"><SelectValue placeholder="Sem ministério" /></SelectTrigger><SelectContent><SelectItem value="none">Sem ministério</SelectItem>{ministries.map((ministry) => <SelectItem key={ministry.id} value={ministry.id}>{ministry.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label htmlFor="registrationFormId">Formulário público</Label><Select name="registrationFormId" defaultValue={event?.registrationFormId ?? "none"} disabled={isPending || uploading}><SelectTrigger id="registrationFormId"><SelectValue placeholder="Sem formulário" /></SelectTrigger><SelectContent><SelectItem value="none">Sem formulário</SelectItem>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </section>

          <section data-step="1" hidden={step !== 1} className="space-y-4 border-t pt-5">
            <div><p className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-primary" />Data e local</p><p className="text-sm text-muted-foreground">Informe os horários da igreja. Sem horário final, o evento terá duração de três horas.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="startDate">Início *</Label><Input id="startDate" name="startDate" type="datetime-local" defaultValue={event?.startDate ? eventLocalDateTime(event.startDate, event.timezone) : ""} required disabled={isPending || uploading} /></div>
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="endDate">Fim</Label><Input id="endDate" name="endDate" type="datetime-local" defaultValue={event?.endDate ? eventLocalDateTime(event.endDate, event.timezone) : ""} disabled={isPending || uploading} /></div>
              <div className="grid gap-2 md:col-span-2"><Label htmlFor="location">Local</Label><Input id="location" name="location" defaultValue={event?.location} placeholder="Templo principal" disabled={isPending || uploading} /></div>
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="isOnline" name="isOnline" checked={isOnline} onChange={(event) => setIsOnline(event.currentTarget.checked)} disabled={isPending || uploading} className="h-4 w-4 rounded border-border" /><Label htmlFor="isOnline">Evento online</Label></div>
              {isOnline && <div className="grid gap-2 md:col-span-4"><Label htmlFor="onlineLink">Link online *</Label><Input id="onlineLink" name="onlineLink" type="url" defaultValue={event?.onlineLink} placeholder="https://..." required disabled={isPending || uploading} /></div>}
              {!isOnline && <input type="hidden" name="onlineLink" value={event?.onlineLink ?? ""} />}
            </div>
          </section>

          <section data-step="2" hidden={step !== 2} className="space-y-4 border-t pt-5">
            <div><p className="flex items-center gap-2 font-medium"><Globe className="h-4 w-4 text-primary" />Inscrição e visibilidade</p><p className="text-sm text-muted-foreground">Capacidade 0 significa ilimitada. Link online só é exigido quando o evento é online.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="grid gap-2 md:col-span-6"><Label htmlFor="registrationMode">Onde acontece a inscrição?</Label><Select name="registrationMode" value={registrationMode} onValueChange={mode => setRegistrationMode(mode === "external" ? "external" : "internal")} disabled={isPending || uploading}><SelectTrigger id="registrationMode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">No Altar Church</SelectItem><SelectItem value="external">Em plataforma externa</SelectItem></SelectContent></Select></div>
              {external && <><div className="grid gap-2 md:col-span-2"><Label htmlFor="externalPlatform">Plataforma</Label><Input id="externalPlatform" name="externalPlatform" defaultValue={event?.externalPlatform || "Sympla"} required minLength={2} maxLength={80} disabled={isPending || uploading} /></div><div className="grid gap-2 md:col-span-4"><Label htmlFor="externalTicketUrl">Link dos ingressos *</Label><Input id="externalTicketUrl" name="externalTicketUrl" type="url" defaultValue={event?.externalTicketUrl || ""} placeholder="https://www.sympla.com.br/..." required maxLength={2000} disabled={isPending || uploading} /></div><p className="text-sm text-muted-foreground md:col-span-6">Inscrições e conferência dos ingressos acontecem na plataforma externa. Equipe e escala continuam no Altar Church.</p></>}
              {!external && <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="registrationEnabled" name="registrationEnabled" checked={registrationEnabled} onChange={(event) => setRegistrationEnabled(event.currentTarget.checked)} disabled={isPending || uploading} className="h-4 w-4 rounded border-border" /><Label htmlFor="registrationEnabled">Aceitar inscrições</Label></div>}
              {!external && registrationEnabled && <div className="grid gap-2 md:col-span-2"><Label htmlFor="maxCapacity">Capacidade</Label><Input id="maxCapacity" name="maxCapacity" type="number" min="0" value={capacity} onChange={e => setCapacity(Number(e.target.value))} disabled={isPending || uploading} /></div>}
              {(external || !registrationEnabled) && <input type="hidden" name="maxCapacity" value={event?.maxCapacity ?? 0} />}
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="isPublic" name="isPublic" value="true" checked={isPublic} onChange={(event) => setIsPublic(event.currentTarget.checked)} disabled={isPending || uploading} className="h-4 w-4 rounded border-border" /><Label htmlFor="isPublic">Evento público</Label></div>
            </div>
          </section>

          <section data-step="2" hidden={step !== 2} className="space-y-4 border-t pt-5">
            <div><p className="font-medium">Voluntariado — opcional</p><p className="text-sm text-muted-foreground">Vincule modelo existente. Após salvar, organize pessoas e funções na aba Equipe e escala.</p></div>
            <div className="grid gap-4 md:grid-cols-6">
              <div className="flex items-center gap-3 md:col-span-2"><input type="checkbox" id="recurring" name="recurring" value="true" checked={isRecurring} onChange={(e) => { setIsRecurring(e.currentTarget.checked); if (!e.currentTarget.checked) setRecurrenceFrequency("none") }} disabled={isPending || uploading} className="h-4 w-4 rounded border-border" /><Label htmlFor="recurring">Evento recorrente</Label></div>
              {isRecurring && <><div className="grid gap-2 md:col-span-2"><Label htmlFor="recurrenceFrequency">Frequência</Label><Select name="recurrenceFrequency" value={recurrenceFrequency} onValueChange={(value) => setRecurrenceFrequency(value ?? "none")} disabled={isPending || uploading}><SelectTrigger id="recurrenceFrequency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="monthly">Mensal</SelectItem></SelectContent></Select></div><div className="grid gap-2 md:col-span-2"><Label htmlFor="recurrenceUntil">Repetir até</Label><Input id="recurrenceUntil" name="recurrenceUntil" type="date" defaultValue={event?.recurrenceUntil ?? ""} disabled={isPending || uploading} /></div><div className="flex flex-wrap items-center gap-3 md:col-span-6"><span className="text-sm font-medium">Dias da semana</span>{[[0, "Dom"], [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"]].map(([value, label]) => <label key={String(value)} className="flex items-center gap-1 text-sm"><input type="checkbox" name="recurrenceWeekdays" value={String(value)} defaultChecked={event?.recurrenceWeekdays?.includes(Number(value))} disabled={isPending || recurrenceFrequency !== "weekly"} className="h-4 w-4" />{label}</label>)}</div></>}
              {event?.programmingId && <div className="grid gap-2 md:col-span-6"><Label htmlFor="recurrenceEditScope">Aplicar alterações da recorrência</Label><Select name="recurrenceEditScope" defaultValue="series" disabled={isPending || uploading}><SelectTrigger id="recurrenceEditScope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="occurrence">Somente esta ocorrência</SelectItem><SelectItem value="following">Esta e próximas ocorrências</SelectItem><SelectItem value="series">Série inteira</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Ocorrências com escala publicada nunca são apagadas.</p></div>}
              <div className="grid gap-2 md:col-span-4"><Label htmlFor="volunteerTemplateId">Modelo de escala</Label><Select name="volunteerTemplateId" defaultValue={event?.volunteerTemplateId ?? "none"} disabled={isPending || uploading}><SelectTrigger id="volunteerTemplateId"><SelectValue placeholder="Não aplicar modelo" /></SelectTrigger><SelectContent><SelectItem value="none">Não aplicar modelo</SelectItem>{templateDisplayOptions(volunteerTemplates).map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </section>

          <section data-step="2" hidden={step !== 2} className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor="valueMode">Valor do evento</Label><Select name="valueMode" value={valueMode} onValueChange={v => setValueMode(v || "free")}><SelectTrigger id="valueMode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="free">{external ? "Não informado" : "Gratuito"}</SelectItem><SelectItem value="value">Valor informado</SelectItem></SelectContent></Select></div>
            {valueMode === "value" && <div className="grid gap-2"><Label htmlFor="eventValue">Valor em reais</Label><Input id="eventValue" name="eventValue" inputMode="decimal" placeholder="150,50" defaultValue={event?.valueCents ? (event.valueCents / 100).toFixed(2).replace(".", ",") : ""} required /></div>}
            <div className="grid gap-2 sm:col-span-2"><Label htmlFor="valueInstructions">Orientações sobre o valor</Label><Textarea id="valueInstructions" name="valueInstructions" maxLength={2000} defaultValue={event?.valueInstructions} placeholder="Explique o que está incluído e as orientações da organização." /><p className="text-xs text-muted-foreground">Valor apenas informativo. A inscrição não realiza cobrança.</p></div>
            {!external && <label className="flex items-center gap-3 sm:col-span-2"><input type="checkbox" name="allowWalkIns" checked={walkInOverride ?? capacity === 0} onChange={e => setWalkInOverride(e.target.checked)} />Permitir entrada sem inscrição prévia</label>}
          </section>
          {step === 3 && <section className="space-y-3 rounded-xl border bg-muted/20 p-5"><h2 className="text-lg font-semibold">Revise seu evento</h2><dl className="grid gap-4 sm:grid-cols-2">{[["Título", review.title], ["Início", review.startDate?.replace("T", " às ")], ["Fim", review.endDate?.replace("T", " às ") || "Três horas após o início"], ["Local", review.location || (isOnline ? "Online" : "A confirmar")], ["Valor", eventPriceLabel({ registrationMode, externalPlatform: review.externalPlatform, valueCents: valueMode === "free" ? 0 : parseEventValue(review.eventValue || "") })], ["Inscrições", external ? `Pelo ${review.externalPlatform || "Sympla"}` : registrationEnabled ? capacity ? `${capacity} vagas` : "Sem limite" : "Desabilitadas"], ["Divulgação", isPublic ? "Pública" : "Interna"], ["Entrada sem inscrição", external ? "Conferência pela plataforma externa" : (walkInOverride ?? capacity === 0) ? "Permitida" : "Bloqueada"]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium">{value}</dd></div>)}</dl>{!event && <div className="grid gap-2"><Label htmlFor="publicationStatus">Publicação</Label><Select value={publicationStatus} onValueChange={value => setPublicationStatus(value || "draft")}><SelectTrigger id="publicationStatus"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="published">Criar e publicar agora</SelectItem><SelectItem value="draft">Salvar como rascunho</SelectItem></SelectContent></Select></div>}<p className="text-sm text-muted-foreground">{event ? "As alterações serão salvas no evento atual." : "Publique agora para ativar a página pública ou salve um rascunho para continuar depois."}</p></section>}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-5"><Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending || uploading}>Voltar</Button>{step > 0 && <Button type="button" variant="outline" disabled={isPending || uploading} onClick={() => setStep(step - 1)}>Etapa anterior</Button>}{step < 3 ? <Button key="next-step" type="button" disabled={isPending || uploading} onClick={click => { click.preventDefault(); nextStep() }}>Continuar</Button> : <Button key="save-event" type="submit" className="gradient-primary" disabled={isPending || uploading}>{isPending ? "Salvando..." : event ? "Salvar alterações" : publicationStatus === "published" ? "Criar e publicar" : "Criar rascunho"}</Button>}</div>
        </form>
      </CardContent>
    </Card>
  )
}
