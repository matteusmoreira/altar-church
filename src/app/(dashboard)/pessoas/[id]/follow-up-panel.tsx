"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Activity, CheckCircle2, Clock3, ListTodo, Plus, UserRound } from "lucide-react"
import { toast } from "sonner"
import { savePersonFollowUpTask, updatePersonFollowUpTask } from "@/lib/people/follow-up-actions"
import type { PersonFollowUpTask, PersonTimelineItem } from "@/lib/people/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface FollowUpPanelProps {
  personId: string
  companyId: string
  timeline: PersonTimelineItem[]
  tasks: PersonFollowUpTask[]
  responsibleOptions: { id: string; name: string }[]
}

const priorityLabels = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" }
const statusLabels = { open: "Aberta", in_progress: "Em andamento", completed: "Concluída", canceled: "Cancelada" }
const kindLabels: Record<string, string> = {
  person: "Pessoa", attendance: "Presença", cell: "Célula", ministry: "Ministério", kids: "Kids",
  volunteer: "Voluntariado", crm: "CRM", prayer: "Oração", communication: "Comunicação", audit: "Auditoria",
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem prazo"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Sem prazo" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
}

function localDateTime(value: string | null) {
  return value ? value.slice(0, 16) : ""
}

export function FollowUpPanel({ personId, companyId, timeline, tasks, responsibleOptions }: FollowUpPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [priority, setPriority] = useState("normal")
  const [responsible, setResponsible] = useState("")

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("personId", personId)
    formData.set("companyId", companyId)
    startTransition(async () => {
      const result = await savePersonFollowUpTask(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível criar a tarefa")
        return
      }
      toast.success("Tarefa de follow-up criada")
      event.currentTarget.reset()
      setPriority("normal")
      setResponsible("")
      router.refresh()
    })
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    formData.set("companyId", companyId)
    startTransition(async () => {
      const result = await updatePersonFollowUpTask(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível atualizar a tarefa")
        return
      }
      toast.success("Tarefa atualizada")
      router.refresh()
    })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,.9fr)]">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Linha do tempo</CardTitle>
          <CardDescription>Eventos consolidados por fonte, sem expor conteúdo sensível de oração ou saúde.</CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p> : (
            <div className="space-y-3">
              {timeline.map((item) => (
                <div key={`${item.source}:${item.id}`} className="flex gap-3 rounded-lg border border-border/40 p-3">
                  <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant="outline">{kindLabels[item.kind] ?? item.kind}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-primary" /> Novo follow-up</CardTitle><CardDescription>Salvar aqui também atualiza o vínculo com o CRM existente, sem criar card duplicado.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submitCreate} className="grid gap-3">
              <div className="grid gap-2"><Label htmlFor="followUpTitle">Título</Label><Input id="followUpTitle" name="title" required placeholder="Ex.: ligar para confirmar visita" /></div>
              <div className="grid gap-2"><Label htmlFor="followUpNotes">Observação auditada</Label><Textarea id="followUpNotes" name="notes" rows={3} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="followUpDueAt">Prazo</Label><Input id="followUpDueAt" name="dueAt" type="datetime-local" /></div>
                <div className="grid gap-2"><Label htmlFor="followUpPriority">Prioridade</Label><select id="followUpPriority" name="priority" value={priority} onChange={(event) => setPriority(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="followUpResponsible">Responsável</Label><select id="followUpResponsible" name="responsibleProfileId" value={responsible} onChange={(event) => setResponsible(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">Sem responsável</option>{responsibleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
              <Button type="submit" disabled={pending}><ListTodo className="h-4 w-4" /> Criar tarefa</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ListTodo className="h-4 w-4 text-primary" /> Tarefas ({tasks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhum follow-up pendente.</p>}
            {tasks.map((task) => (
              <form key={task.id} onSubmit={submitUpdate} className="space-y-2 rounded-lg border border-border/40 p-3">
                <input type="hidden" name="taskId" value={task.id} />
                <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{task.title}</p><Badge variant={task.status === "completed" ? "default" : task.status === "canceled" ? "secondary" : "outline"}>{statusLabels[task.status]}</Badge></div>
                <p className="text-xs text-muted-foreground">{task.notes || "Sem observação"}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span><Clock3 className="mr-1 inline h-3 w-3" />{formatDateTime(task.dueAt)}</span><span>{priorityLabels[task.priority]}</span>{task.responsibleName && <span><UserRound className="mr-1 inline h-3 w-3" />{task.responsibleName}</span>}</div>
                <div className="grid gap-2 sm:grid-cols-2"><select name="status" defaultValue={task.status} className="h-9 rounded-md border bg-background px-2 text-xs">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input name="dueAt" type="datetime-local" defaultValue={localDateTime(task.dueAt)} className="h-9 text-xs" /></div>
                <Button type="submit" size="sm" variant="outline" disabled={pending}><CheckCircle2 className="h-3.5 w-3.5" /> Salvar status</Button>
              </form>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
