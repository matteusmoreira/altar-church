import Link from "next/link"
import { ArrowRight, CalendarClock, Settings2, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPersonFormOptions } from "@/lib/people/data"
import { listFollowUpResponsibleOptions, listPersonFollowUpTasks } from "@/lib/people/follow-up"
import type { PersonFollowUpStatus } from "@/lib/people/types"

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem prazo"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Sem prazo" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
}

const statusLabels: Record<PersonFollowUpStatus | "all", string> = { all: "Todos", open: "Aberta", in_progress: "Em andamento", completed: "Concluída", canceled: "Cancelada" }
const priorityLabels = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" }

export default async function FollowUpPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const status = (first(params.status) ?? "all") as PersonFollowUpStatus | "all"
  const responsibleProfileId = first(params.responsibleProfileId) ?? "all"
  const cellId = first(params.cellId) ?? "all"
  const journeyStatus = first(params.journeyStatus) ?? "all"
  const [tasks, formOptions, responsibleOptions] = await Promise.all([
    listPersonFollowUpTasks(null, null, { status, responsibleProfileId, cellId, journeyStatus }),
    getPersonFormOptions(),
    listFollowUpResponsibleOptions(),
  ])
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Follow-up pastoral</h1><p className="text-muted-foreground">Tarefas por jornada, status, célula e responsável.</p></div>
        <Button render={<Link href="/configuracoes/follow-up" />} nativeButton={false} variant="outline"><Settings2 className="h-4 w-4" /> Configurar gatilhos</Button>
      </div>
      <Card className="glass"><CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader><CardContent><form method="get" className="grid gap-3 md:grid-cols-4">
        <div className="grid gap-2"><Label htmlFor="followUpStatus">Status</Label><select id="followUpStatus" name="status" defaultValue={status} className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="grid gap-2"><Label htmlFor="followUpCell">Célula</Label><select id="followUpCell" name="cellId" defaultValue={cellId} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">Todas</option>{formOptions.cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.name}</option>)}</select></div>
        <div className="grid gap-2"><Label htmlFor="followUpResponsibleFilter">Responsável</Label><select id="followUpResponsibleFilter" name="responsibleProfileId" defaultValue={responsibleProfileId} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">Todos</option>{responsibleOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
        <div className="grid gap-2"><Label htmlFor="followUpJourney">Jornada/status da pessoa</Label><Input id="followUpJourney" name="journeyStatus" defaultValue={journeyStatus === "all" ? "" : journeyStatus} placeholder="Ex.: following" /></div>
        <Button type="submit" variant="outline" className="md:col-span-4">Aplicar filtros</Button>
      </form></CardContent></Card>
      <Card className="glass"><CardHeader><CardTitle className="text-base">Tarefas ({tasks.length})</CardTitle><CardDescription>Itens criados manualmente ou por gatilho deduplicado.</CardDescription></CardHeader><CardContent className="space-y-3">
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>}
        {tasks.map((task) => <div key={task.id} className="flex flex-col gap-3 rounded-lg border border-border/40 p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/pessoas/${task.personId}`} className="font-medium hover:underline">{task.personName}</Link><Badge variant="outline">{statusLabels[task.status]}</Badge><Badge variant="outline">{priorityLabels[task.priority]}</Badge></div><p className="mt-1 text-sm">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.notes || "Sem observação"}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span><CalendarClock className="mr-1 inline h-3 w-3" />{formatDateTime(task.dueAt)}</span>{task.responsibleName && <span><UserRound className="mr-1 inline h-3 w-3" />{task.responsibleName}</span>}<span>Origem: {task.origin}</span></div></div><Button render={<Link href={`/pessoas/${task.personId}`} />} nativeButton={false} variant="ghost" size="sm">Abrir pessoa <ArrowRight className="h-4 w-4" /></Button></div>)}
      </CardContent></Card>
    </div>
  )
}
