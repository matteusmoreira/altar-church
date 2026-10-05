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
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function FollowUpPanel({ personId, companyId, timeline, tasks, responsibleOptions }: FollowUpPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [priority, setPriority] = useState("normal")
  const [responsible, setResponsible] = useState("")

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const dueAt = String(formData.get("dueAt") ?? "")
    if (dueAt) formData.set("dueAt", new Date(dueAt).toISOString())
    formData.set("personId", personId)
    formData.set("companyId", companyId)
    startTransition(async () => {
      try {
        const result = await savePersonFollowUpTask(formData)
        if (!result.ok) {
          toast.error(result.error ?? "Não foi possível criar a tarefa")
          return
        }
        toast.success("Tarefa de follow-up criada")
        form.reset()
        setPriority("normal")
        setResponsible("")
        router.refresh()
      } catch {
        toast.error("Não foi possível concluir a operação. Atualize a ficha para conferir as tarefas antes de tentar novamente.")
      }
    })
  }

  function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const dueAt = String(formData.get("dueAt") ?? "")
    if (dueAt) formData.set("dueAt", new Date(dueAt).toISOString())
    formData.set("companyId", companyId)
    startTransition(async () => {
      try {
        const result = await updatePersonFollowUpTask(formData)
        if (!result.ok) {
          toast.error(result.error ?? "Não foi possível atualizar a tarefa")
          return
        }
        toast.success("Tarefa atualizada")
        router.refresh()
      } catch {
        toast.error("Não foi possível atualizar a tarefa. Tente novamente.")
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Follow-up Tasks Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" /> Novo follow-up
            </CardTitle>
            <CardDescription>
              Agende uma tarefa pastoral ou de cuidado para esta pessoa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitCreate} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="followUpTitle">Título da tarefa *</Label>
                <Input id="followUpTitle" name="title" required placeholder="Ex.: Ligar para confirmar visita" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="followUpNotes">Observação / Detalhes</Label>
                <Textarea id="followUpNotes" name="notes" rows={2} placeholder="Orientações ou histórico do contato..." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="followUpDueAt">Prazo</Label>
                  <Input id="followUpDueAt" name="dueAt" type="datetime-local" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="followUpPriority">Prioridade</Label>
                  <select
                    id="followUpPriority"
                    name="priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {Object.entries(priorityLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="followUpResponsible">Responsável</Label>
                <select
                  id="followUpResponsible"
                  name="responsibleProfileId"
                  value={responsible}
                  onChange={(event) => setResponsible(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Sem responsável definido</option>
                  {responsibleOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                <ListTodo className="mr-1.5 h-4 w-4" /> Criar tarefa
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="h-4 w-4 text-primary" /> Tarefas de cuidado ({tasks.length})
            </CardTitle>
            <CardDescription>
              Acompanhamento e tarefas pendentes atribuídas a líderes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <p>Nenhum follow-up pendente para esta pessoa.</p>
              </div>
            ) : (
              tasks.map((task) => (
                <form key={task.id} onSubmit={submitUpdate} className="space-y-2.5 rounded-xl border border-border/50 bg-card/60 p-3.5 transition-colors hover:border-border">
                  <input type="hidden" name="taskId" value={task.id} />
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{task.title}</p>
                    <Badge variant={task.status === "completed" ? "default" : task.status === "canceled" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                      {statusLabels[task.status]}
                    </Badge>
                  </div>
                  {task.notes && (
                    <p className="text-xs text-muted-foreground">{task.notes}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock3 className="h-3 w-3 text-primary" />
                      {formatDateTime(task.dueAt)}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {priorityLabels[task.priority]}
                    </Badge>
                    {task.responsibleName && (
                      <span className="flex items-center gap-1 font-medium">
                        <UserRound className="h-3 w-3" />
                        {task.responsibleName}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 pt-1 sm:grid-cols-2">
                    <select
                      name="status"
                      defaultValue={task.status}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {Object.entries(statusLabels).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <Input
                      name="dueAt"
                      type="datetime-local"
                      defaultValue={localDateTime(task.dueAt)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-7 text-xs w-full">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Atualizar tarefa
                  </Button>
                </form>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline Section */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Linha do tempo integrada
          </CardTitle>
          <CardDescription>
            Histórico consolidado de eventos, presenças, células, ministérios e Kids vinculados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>Nenhum evento registrado ainda nesta linha do tempo.</p>
            </div>
          ) : (
            <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-[2px] before:bg-border/60">
              {timeline.map((item) => (
                <div key={`${item.source}:${item.id}`} className="relative flex gap-3.5 pl-1">
                  <div className="relative mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-primary/20 text-primary">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-border/40 bg-card/50 p-3.5 shadow-2xs transition-colors hover:border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase">
                          {kindLabels[item.kind] ?? item.kind}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(item.occurredAt)}
                        </span>
                      </div>
                    </div>
                    {item.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
