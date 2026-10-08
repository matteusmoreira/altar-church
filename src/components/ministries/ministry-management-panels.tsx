"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { zonedDate } from "@/lib/automations/contract"
import { loadMinistryPersonHistory, loadMinistryReport, saveMinistryFollowUp } from "@/lib/ministries/management-actions"
import { reportPeriod } from "@/lib/ministries/management-contract"
import type { MinistryFollowUp, MinistryManagementData, MinistryPersonHistory } from "@/lib/ministries/management-contract"
import type { MinistryMember, MinistryReport } from "@/lib/ministries/types"

const statusLabels = { open: "Aberto", in_progress: "Em andamento", completed: "Concluído", canceled: "Cancelado" }
const priorityLabels = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" }
const selectClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
function dateLabel(value: string, timezone: string) { return new Date(value).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }) }
function localInput(value: string | null, timezone: string) {
  if (!value) return ""
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
  return parts.replace(" ", "T")
}

export function MinistryFollowUps({ ministryId, members, management, query, update, refresh }: {
  ministryId: string; members: MinistryMember[]; management: MinistryManagementData
  query: URLSearchParams; update: (filters: Record<string,string>, replace?: boolean) => void; refresh: () => void
}) {
  const [now] = useState(() => Date.now())
  const [pending,startTransition] = useTransition()
  const [editing,setEditing] = useState<MinistryFollowUp | "new" | null>(null)
  const q = query.get("followSearch") || "", status = query.get("followStatus") || "all", responsible = query.get("responsible") || "all"
  const taskId = query.get("task")
  const filtered = management.followUps.filter(task => (!taskId || task.id===taskId) &&
    (!q || `${task.title} ${task.personName}`.toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR"))) &&
    (status==="all" || task.status===status) && (responsible==="all" || task.responsibleProfileId===responsible) &&
    (query.get("late")!=="true" || ["open","in_progress"].includes(task.status) && task.dueAt && new Date(task.dueAt).getTime()<now))
  function save(task: MinistryFollowUp) {
    startTransition(async () => { const result = await saveMinistryFollowUp({ ...task, ministryId }); if (!result.ok) toast.error(result.error); else { toast.success("Acompanhamento atualizado"); refresh() } })
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Acompanhamentos</h2><p className="text-sm text-muted-foreground">Casos deste ministério, acessíveis à gestão autorizada.</p></div><Button onClick={() => setEditing("new")}>Novo acompanhamento</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div><Label htmlFor="follow-search">Buscar pessoa ou caso</Label><Input id="follow-search" value={q} onChange={e => update({ followSearch: e.target.value },true)} /></div>
      <div><Label htmlFor="follow-status">Situação</Label><select id="follow-status" className={selectClass} value={status} onChange={e => update({ followStatus: e.target.value })}><option value="all">Todas</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><Label htmlFor="follow-responsible">Responsável</Label><select id="follow-responsible" className={selectClass} value={responsible} onChange={e => update({ responsible: e.target.value })}><option value="all">Todos</option>{management.responsibles.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div>
      <div className="flex flex-wrap items-end gap-2"><Button variant={query.get("late")==="true" ? "default" : "outline"} onClick={() => update({ late: query.get("late")==="true" ? "" : "true" })}>Somente vencidos</Button><Button variant="ghost" onClick={() => update({ followSearch: "",followStatus: "",responsible: "",late: "",task: "" })}>Limpar filtros</Button></div>
    </div>
    {filtered.map(task => <Card key={task.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{task.title}</CardTitle><Badge>{statusLabels[task.status]}</Badge></div><CardDescription>{task.personName} · {task.responsibleName || "Sem responsável"} · Prioridade {priorityLabels[task.priority].toLocaleLowerCase("pt-BR")}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm">{task.dueAt ? `Prazo: ${dateLabel(task.dueAt,management.timezone)}` : "Sem prazo definido"}</p><p className="text-sm break-words"><strong>Próxima ação:</strong> {task.nextAction || "Não definida"}</p>{task.notes && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{task.notes}</p>}<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => setEditing(task)}>Editar</Button>{task.status==="open" && <Button disabled={pending} onClick={() => save({ ...task,status: "in_progress" })}>Iniciar</Button>}{["open","in_progress"].includes(task.status) ? <><Button disabled={pending} onClick={() => save({ ...task,status: "completed" })}>Concluir</Button><Button variant="ghost" disabled={pending} onClick={() => save({ ...task,status: "canceled" })}>Cancelar caso</Button></> : <Button disabled={pending} onClick={() => save({ ...task,status: "open" })}>Reabrir</Button>}</div></CardContent></Card>)}
    {!filtered.length && <p className="rounded-xl border p-6 text-sm text-muted-foreground">Nenhum acompanhamento encontrado para os filtros selecionados.</p>}
    <Dialog open={editing!==null} onOpenChange={open => { if (!open && !pending) setEditing(null) }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{editing==="new" ? "Novo acompanhamento" : "Editar acompanhamento"}</DialogTitle><DialogDescription>Registre a próxima ação e o prazo no fuso {management.timezone}.</DialogDescription></DialogHeader>{editing && <form key={editing==="new" ? "new" : editing.id} className="space-y-3" onSubmit={e => {
      e.preventDefault(); const form=new FormData(e.currentTarget)
      startTransition(async () => { try {
        const result=await saveMinistryFollowUp({ ministryId,id: editing==="new" ? undefined : editing.id,personId:String(form.get("personId")),title:String(form.get("title")),notes:String(form.get("notes")),nextAction:String(form.get("nextAction")),responsibleProfileId:String(form.get("responsible")) || null,dueAt:form.get("dueAt") ? zonedDate(String(form.get("dueAt")),management.timezone).toISOString() : null,priority:String(form.get("priority")) as MinistryFollowUp["priority"],status:editing==="new" ? "open" : editing.status })
        if (!result.ok) toast.error(result.error); else { toast.success("Acompanhamento salvo"); setEditing(null); refresh() }
      } catch(error) { toast.error(error instanceof Error ? error.message : "Prazo inválido") } })
    }}><fieldset disabled={pending} className="space-y-3">
      <div><Label htmlFor="follow-person">Pessoa</Label><select id="follow-person" name="personId" disabled={editing!=="new"} required className={selectClass} defaultValue={editing==="new" ? "" : editing.personId}><option value="">Selecione uma pessoa</option>{members.map(person => <option key={person.id} value={person.personId}>{person.personName}</option>)}</select>{editing!=="new" && <input type="hidden" name="personId" value={editing.personId} />}</div>
      <div><Label htmlFor="follow-title">Título</Label><Input id="follow-title" name="title" required minLength={3} maxLength={180} defaultValue={editing==="new" ? "" : editing.title} /></div>
      <div><Label htmlFor="follow-next">Próxima ação</Label><Textarea id="follow-next" name="nextAction" maxLength={2000} defaultValue={editing==="new" ? "" : editing.nextAction} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="follow-owner">Responsável</Label><select id="follow-owner" name="responsible" className={selectClass} defaultValue={editing==="new" ? "" : editing.responsibleProfileId || ""}><option value="">Sem responsável</option>{management.responsibles.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></div><div><Label htmlFor="follow-due">Prazo</Label><Input id="follow-due" name="dueAt" type="datetime-local" defaultValue={editing==="new" ? "" : localInput(editing.dueAt,management.timezone)} /></div></div>
      <div><Label htmlFor="follow-priority">Prioridade</Label><select id="follow-priority" name="priority" className={selectClass} defaultValue={editing==="new" ? "normal" : editing.priority}>{Object.entries(priorityLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><Label htmlFor="follow-notes">Observações do ministério</Label><Textarea id="follow-notes" name="notes" maxLength={10000} defaultValue={editing==="new" ? "" : editing.notes} /></div><div className="flex gap-2"><Button type="submit">{pending ? "Salvando…" : "Salvar acompanhamento"}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Fechar</Button></div>
    </fieldset></form>}</DialogContent></Dialog>
  </div>
}

export function MinistryPersonDetails({ ministryId, member, management, close }: { ministryId: string; member: MinistryMember; management: MinistryManagementData | null; close: () => void }) {
  const [history,setHistory]=useState<MinistryPersonHistory | null>(null)
  const [error,setError]=useState("")
  const [retry,setRetry]=useState(0)
  useEffect(() => { let active=true; void loadMinistryPersonHistory(ministryId,member.personId).then(result => { if (active) { if (result.ok) { setHistory(result.data as MinistryPersonHistory); setError("") } else setError(result.error || "Não foi possível carregar o histórico") } }).catch(() => { if(active) setError("Não foi possível carregar o histórico") }); return () => { active=false } },[ministryId,member.personId,retry])
  const zone=management?.timezone || "America/Sao_Paulo"
  return <Dialog open onOpenChange={open => { if(!open) close() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Detalhes do integrante</DialogTitle><DialogDescription>Participação e acompanhamentos neste ministério.</DialogDescription></DialogHeader><div className="space-y-4">
    <div className="flex items-center gap-3"><Avatar key={member.personId}>{member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.personName} />}<AvatarFallback>{member.personName.slice(0,2)}</AvatarFallback></Avatar><div><p className="font-semibold">{member.personName}</p><p className="text-sm text-muted-foreground">{[member.email,member.phone].filter(Boolean).join(" · ") || "Sem contato"}</p></div></div>
    <p className="text-sm">{member.role==="leader" ? "Líder" : member.role==="coordinator" ? "Coordenador" : "Membro"} · {member.status==="active" ? "Ativo" : member.status==="pending" ? "Pendente" : "Inativo"}{member.joinedAt ? ` · Entrada: ${dateLabel(member.joinedAt,zone)}` : ""}</p><p className="text-sm">Equipes: {member.teamNames.join(", ") || "Sem equipe"}</p>
    {error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(value=>value+1)}>Tentar novamente</Button></div> : !history ? <p role="status">Carregando histórico…</p> : <><h3 className="font-medium">Escalas e funções — até 100 registros recentes</h3>{history.assignments.map(item=><p key={item.id} className="rounded-lg border p-2 text-sm">{item.title} · {item.roleName}<span className="block text-muted-foreground">{dateLabel(item.startsAt,zone)} · {['cancelled','declined'].includes(item.status) ? "Cancelada" : "Escalado"}</span></p>)}{!history.assignments.length && <p className="text-sm text-muted-foreground">Sem escalas registradas.</p>}<h3 className="font-medium">Presença — até 100 registros recentes</h3>{history.attendance.map(item=><p key={item.id} className="rounded-lg border p-2 text-sm">{item.title} · {item.day.split('-').reverse().join('/')} · {item.status==="present" ? "Presente" : item.status==="absent" ? "Ausente" : "Justificado"}</p>)}{!history.attendance.length && <p className="text-sm text-muted-foreground">Sem registros de presença.</p>}</>}
    <h3 className="font-medium">Acompanhamentos do ministério</h3>{!management ? <p role="status">Carregando acompanhamentos…</p> : management.followUps.filter(task=>task.personId===member.personId).map(task=><p key={task.id} className="rounded-lg border p-2 text-sm">{task.title} · {statusLabels[task.status]}<span className="block text-muted-foreground">Próxima ação: {task.nextAction || "Não definida"}</span></p>)}{management && !management.followUps.some(task=>task.personId===member.personId) && <p className="text-sm text-muted-foreground">Nenhum acompanhamento neste ministério.</p>}
  </div></DialogContent></Dialog>
}

export function MinistryReports({ ministryId, initial, query, update }: { ministryId: string; initial: MinistryReport; query: URLSearchParams; update: (filters: Record<string,string>) => void }) {
  const period=query.get("period") || "30"
  const defaults=reportPeriod(period==="90" ? 90 : 30, initial.timezone)
  const from=query.get("from") || defaults.from, to=query.get("to") || defaults.to
  const [report,setReport]=useState(initial)
  const [error,setError]=useState("")
  const [loaded,setLoaded]=useState("")
  const [retry,setRetry]=useState(0)
  useEffect(()=>{let active=true; void loadMinistryReport(ministryId,{from,to}).then(result=>{if(active){ if(result.ok){setReport(result.data as MinistryReport);setLoaded(`${from}:${to}`);setError("")}else setError(result.error || "Não foi possível carregar o relatório") }}).catch(()=>{if(active)setError("Não foi possível carregar o relatório")});return()=>{active=false}},[ministryId,from,to,retry])
  const ready=loaded===`${from}:${to}` && !error
  const exportUrl=`/api/ministerios/${ministryId}/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const present=report.attendance.find(item=>item.status==="present")?.total || 0
  return <div className="space-y-4"><h2 className="font-semibold">Relatórios</h2><p className="text-sm text-muted-foreground">Resultados do período e situação atual do ministério.</p>
    <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="report-period">Período</Label><select id="report-period" value={period} className={selectClass} onChange={e=>{const next=reportPeriod(e.target.value==="90" ? 90 : 30,initial.timezone);update({period:e.target.value,from:next.from,to:next.to})}}><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Personalizado</option></select></div><div><Label htmlFor="report-from">De</Label><Input id="report-from" type="date" value={from} onChange={e=>update({period:"custom",from:e.target.value})} /></div><div><Label htmlFor="report-to">Até</Label><Input id="report-to" type="date" value={to} onChange={e=>update({period:"custom",to:e.target.value})} /></div><Button variant="outline" disabled={!ready} render={<a href={`${exportUrl}&format=xls`} download />} nativeButton={false}>Excel</Button><Button variant="outline" disabled={!ready} render={<a href={`${exportUrl}&format=csv`} download />} nativeButton={false}>CSV</Button></div>
    {error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</Button></div> : !ready ? <p role="status">Carregando resultados do período…</p> : <>
      <p className="text-xs text-muted-foreground">{report.period.from.split('-').reverse().join('/')} a {report.period.to.split('-').reverse().join('/')} · {report.timezone}</p>
      <Card><CardHeader><CardTitle>Resultados do período</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="Horas previstas na escala" value={Math.round(report.volunteerHours*10)/10} help="Soma das durações dos turnos. Não representa horas efetivamente servidas." /><Metric label="Escalas publicadas" value={report.filledScales} /><Metric label="Registros de presença" value={present} /><Metric label="Acompanhamentos concluídos" value={report.completedFollowUps} /><Metric label="Comunicações criadas" value={report.communication.reduce((sum,item)=>sum+item.total,0)} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Situação atual</CardTitle><CardDescription>Estes números representam o cadastro atual, independentemente do período selecionado.</CardDescription></CardHeader><CardContent className="space-y-3"><Metric label="Membros ativos" value={report.retention.currentActive} /><Metric label="Membros ativos há pelo menos 30 dias" value={`${report.retention.rate}%`} help={`${report.retention.activeAt30d} dos ${report.retention.currentActive} membros ativos entraram há pelo menos 30 dias. Não mede retenção histórica.`} /><h3 className="text-sm font-medium">Integrantes ativos por equipe</h3>{report.teamParticipation.map(team=><div key={team.teamId} className="flex justify-between gap-3 rounded-lg border p-3 text-sm"><span>{team.teamName}</span><strong>{team.total}</strong></div>)}{!report.teamParticipation.length && <p className="text-sm text-muted-foreground">Nenhuma equipe cadastrada.</p>}</CardContent></Card>
    </>}
  </div>
}
function Metric({label,value,help}:{label:string;value:string|number;help?:string}) {return <div className="rounded-lg border p-3"><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>{help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}</div>}
