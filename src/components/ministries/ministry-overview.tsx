"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { MinistryWorkspaceData } from "@/lib/ministries/types"
import { attendanceRate } from "@/lib/ministries/management-contract"
import type { MinistryManagementData } from "@/lib/ministries/management-contract"

export function MinistryOverview({ data, management, error, navigate, action, editTeam, retry }: {
  data: MinistryWorkspaceData; management: MinistryManagementData | null; error: string
  navigate: (tab: string, filters?: Record<string, string>) => void; action: (dialog: string) => void
  editTeam: (team: MinistryWorkspaceData["teams"][number]) => void; retry: () => void
}) {
  const [now] = useState(() => Date.now())
  const { workspace } = data
  const timezone = management?.timezone ?? data.report.timezone ?? "America/Sao_Paulo"
  const format = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" })
  const upcoming = data.scales.filter(scale => new Date(scale.startsAt).getTime() >= now)
  const pending = data.members.filter(member => member.status === "pending")
  const overdue = management?.followUps.filter(task => ["open", "in_progress"].includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < now) ?? []
  const incomplete = upcoming.filter(scale => scale.status === "incomplete")
  const totals = management?.attendance.reduce((sum, row) => ({ present: sum.present+row.present, absent: sum.absent+row.absent, justified: sum.justified+row.justified }), { present: 0, absent: 0, justified: 0 })
  const rate = totals ? attendanceRate(totals.present, totals.absent, totals.justified) : null
  const needs = [
    ...overdue.map(task => ({ key: task.id, text: `${task.title} — ${task.personName}`, detail: `Prazo vencido: ${format(task.dueAt!)}`, label: "Abrir acompanhamento", click: () => navigate("acompanhamentos", { task: task.id, late: "true" }) })),
    ...incomplete.map(scale => ({ key: scale.eventId, text: `${scale.eventTitle}: faltam ${scale.positions.reduce((sum, position) => sum+position.missingVolunteers,0)} pessoas`, detail: format(scale.startsAt), label: "Completar escala", click: () => navigate("escalas", { event: scale.eventId }) })),
    ...pending.map(member => ({ key: member.id, text: `${member.personName} aguarda aprovação`, detail: "Solicitação de participação", label: "Revisar pessoa", click: () => navigate("pessoas", { peopleStatus: "pending", person: member.personId }) })),
    ...data.teams.filter(team => team.isActive && !team.leaderPersonId).map(team => ({ key: team.id, text: `${team.name} está sem responsável`, detail: "Equipe do ministério", label: "Definir responsável", click: () => { navigate("equipes", { team: team.id }); editTeam(team) } })),
    ...(!workspace.profile.leaderPersonId ? [{ key: "leader", text: "Ministério sem líder principal", detail: "Configuração do ministério", label: "Ver configurações", click: () => navigate("configuracoes") }] : []),
  ]
  return <div className="space-y-4">
    {workspace.canManage && <div className="flex flex-wrap gap-2" aria-label="Ações rápidas">
      {[['person','Adicionar pessoa'],['activity','Criar atividade'],['scale','Montar escala'],['communication','Publicar comunicado']].map(([dialog,label]) => <Button key={dialog} variant="outline" onClick={() => action(dialog)}>{label}</Button>)}
    </div>}
    {workspace.canManage && <Card><CardHeader><CardTitle>Precisa da sua atenção</CardTitle><CardDescription>Resolva as pendências do ministério.</CardDescription></CardHeader><CardContent className="space-y-2">
      {needs.map(need => <div key={need.key} className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium break-words">{need.text}</p><p className="text-xs text-muted-foreground">{need.detail}</p></div><Button variant="outline" size="sm" onClick={need.click}>{need.label}</Button></div>)}
      {!needs.length && <p className="text-sm text-muted-foreground">Nenhuma pendência identificada{management ? "." : " nos dados já carregados."}</p>}
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Próximas atividades</CardTitle><CardDescription>Atividade, escala e presença em um só fluxo.</CardDescription></CardHeader><CardContent className="space-y-3">
      {data.agenda.filter(activity => new Date(activity.startsAt).getTime() >= now).slice(0,8).map(activity => {
        const scale = data.scales.find(item => item.eventId === activity.id)
        const teamNames = [...new Set(scale?.positions.flatMap(position => position.assignments.filter(assignment => !["declined", "cancelled"].includes(assignment.status)).flatMap(assignment => data.members.find(member => member.personId === assignment.personId)?.teamNames || [])) || [])]
        const count = scale?.positions.reduce((sum,item) => sum+item.assignedVolunteers,0) ?? activity.assignedVolunteers
        const required = scale?.positions.reduce((sum,item) => sum+item.requiredVolunteers,0) ?? activity.volunteerPositions
        const label = scale?.publishedAt ? "Publicada" : !required ? "Sem escala" : scale?.status === "ready" ? "Completa, aguardando publicação" : scale?.positions.some(p => p.shiftId) ? "Rascunho incompleto" : "Funções cadastradas, aguardando montagem"
        return <div key={activity.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-primary">{format(activity.startsAt)}</p><p className="font-medium">{activity.title}</p><p className="text-xs text-muted-foreground">{activity.location || "Local não informado"}</p>{teamNames.length > 0 && <p className="text-xs text-muted-foreground">Equipes na escala: {teamNames.join(", ")}</p>}<p className="mt-2 text-sm">{required ? `${count} de ${required} posições preenchidas` : "Nenhuma função cadastrada"}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant={scale?.status === "incomplete" ? "destructive" : "outline"}>{label}</Badge><Button variant="outline" size="sm" onClick={() => navigate("escalas", { event: activity.id })}>Ver escala</Button><Button variant="ghost" size="sm" onClick={() => navigate("agenda", { event: activity.id })}>Ver atividade</Button></div></div>
      })}
      {!data.agenda.some(activity => new Date(activity.startsAt).getTime() >= now) && <div className="space-y-2"><p className="text-sm text-muted-foreground">Nenhuma atividade futura cadastrada.</p><Button variant="outline" onClick={() => navigate("agenda")}>Ver agenda</Button></div>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Presença — últimos 30 dias</CardTitle><CardDescription>{rate === null ? "Presença ainda não registrada." : `Presença entre registros: ${rate}% — presentes ÷ presentes, ausentes e justificativas.`}</CardDescription></CardHeader><CardContent>
      {error ? <div role="alert" className="space-y-2"><p>{error}</p><Button variant="outline" onClick={retry}>Tentar novamente</Button></div> : !management ? <p role="status">Carregando participação e acompanhamentos…</p> : management.attendance.length ? <>
        <div className="h-64 min-w-0" aria-label="Gráfico de presença por atividade"><ResponsiveContainer width="100%" height="100%"><BarChart data={management.attendance.map(item => ({ ...item, label: `${item.title} · ${item.day.split('-').reverse().join('/')}` }))} accessibilityLayer><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickFormatter={label => String(label).length > 22 ? `${String(label).slice(0,22)}…` : String(label)} /><YAxis allowDecimals={false} width={32} /><Tooltip contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", borderRadius: 8 }} /><Bar maxBarSize={64} isAnimationActive={false} dataKey="present" name="Presentes" stackId="presence" fill="#16a34a" /><Bar maxBarSize={64} isAnimationActive={false} dataKey="absent" name="Ausentes" stackId="presence" fill="#dc2626" /><Bar maxBarSize={64} isAnimationActive={false} dataKey="justified" name="Justificativas" stackId="presence" fill="#d97706" /></BarChart></ResponsiveContainer></div>
        <p className="mb-3 flex flex-wrap gap-4 text-xs"><span className="text-green-700 dark:text-green-400">● Presentes</span><span className="text-red-700 dark:text-red-400">● Ausentes</span><span className="text-amber-700 dark:text-amber-400">● Justificativas</span></p>
        <ul className="space-y-2 text-sm" aria-label="Valores de presença por atividade">{management.attendance.map(item => <li key={`${item.eventId}:${item.day}`} className="rounded-lg border p-2"><strong>{item.title}</strong> · {item.day.split('-').reverse().join('/')}<span className="block text-muted-foreground">{item.present} presentes · {item.absent} ausentes · {item.justified} justificativas</span></li>)}</ul>
      </> : <Button variant="outline" onClick={() => navigate("escalas")}>Ver escalas e registrar presença</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Equipes do ministério</CardTitle><CardDescription>{workspace.indicators.activeTeams} equipes ativas · {workspace.indicators.openTeamSlots} vagas nas equipes com capacidade definida.</CardDescription></CardHeader><CardContent className="space-y-2">
      {data.teams.filter(team => team.isActive).map(team => <div key={team.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium">{team.name}</p><p className="text-sm text-muted-foreground">{team.leaderName || "Sem responsável"} · {team.memberCount} integrantes</p><p className="text-xs text-muted-foreground">{team.maxCapacity > 0 ? `${team.openSlots} vagas nas equipes · capacidade ${team.maxCapacity}` : "Capacidade não definida"}</p></div><Button size="sm" variant="outline" onClick={() => navigate("equipes", { team: team.id })}>Ver integrantes</Button>{workspace.canManage && <Button size="sm" variant="ghost" onClick={() => { navigate("equipes", { team: team.id }); editTeam(team) }}>Editar responsável</Button>}</div>)}
      {!data.teams.some(team => team.isActive) && <p className="text-sm text-muted-foreground">Nenhuma equipe ativa.</p>}
    </CardContent></Card>
  </div>
}
