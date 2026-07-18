"use client"

import { AlertTriangle, Baby, CalendarCheck2, Download, HeartPulse, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MetricCard } from "@/components/shared"
import { usePermission } from "@/lib/permissions"
import type { KidsReportsData } from "@/lib/kids/types"

function formatDate(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value))
}

function formatDateTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberta",
  closed: "Encerrada",
  cancelled: "Cancelada",
}

const SEVERITY_LABELS: Record<string, string> = {
  info: "Observação",
  warning: "Atenção",
  critical: "Crítico",
}

export function KidsReportsTab({ data }: { data: KidsReportsData }) {
  const canExport = usePermission("kids.reports.export")
  const maxWeekly = Math.max(1, ...data.weekly.map((row) => row.attendances))
  const retention = data.metrics.activeChildren > 0
    ? Math.round((data.metrics.childrenWithAttendance30d / data.metrics.activeChildren) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Presenças (30 dias)" value={data.metrics.attendancesLast30d} icon={CalendarCheck2} />
        <MetricCard title="Crianças presentes (30d)" value={`${data.metrics.childrenWithAttendance30d}/${data.metrics.activeChildren}`} icon={Users} color="bg-info" />
        <MetricCard title="Visitantes (30d)" value={data.metrics.newVisitorsLast30d} icon={UserPlus} color="bg-success" />
        <MetricCard title="Incidentes (30d)" value={`${data.metrics.incidentsLast30d} · ${data.metrics.criticalIncidentsLast30d} críticos`} icon={AlertTriangle} color="bg-warning" />
      </div>

      {canExport && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" render={<a href="/api/kids/export?type=presencas" download />}>
            <Download className="mr-2 h-4 w-4" />Exportar presenças (XLS)
          </Button>
          <Button type="button" variant="outline" render={<a href="/api/kids/export?type=criancas" download />}>
            <Download className="mr-2 h-4 w-4" />Exportar crianças (XLS)
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Frequência semanal</CardTitle>
            <CardDescription>Presenças por semana (últimas 8 semanas).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.weekly.length === 0 && <p className="text-sm text-muted-foreground">Sem presenças no período.</p>}
            {data.weekly.map((row) => (
              <div key={row.week} className="flex items-center gap-3">
                <span className="w-16 text-xs text-muted-foreground">{formatDate(row.week)}</span>
                <div className="h-5 flex-1 rounded bg-muted/50">
                  <div
                    className="h-5 rounded gradient-primary"
                    style={{ width: `${Math.max(4, Math.round((row.attendances / maxWeekly) * 100))}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-medium">{row.attendances}</span>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Retenção: {retention}% das crianças ativas estiveram presentes nos últimos 30 dias.
              Visitantes que retornaram (2+ presenças): {data.metrics.returningVisitors}.
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle>Sessões recentes</CardTitle>
            <CardDescription>Presentes, saídas e visitantes por sessão.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.sessions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sessão ainda.</p>}
            {data.sessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-2 text-sm">
                <div>
                  <p className="font-medium">{session.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(session.startsAt)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{session.present + session.checkedOut} criança(s)</Badge>
                  {session.visitors > 0 && <Badge variant="outline">{session.visitors} visitante(s)</Badge>}
                  <Badge variant="outline">{STATUS_LABELS[session.status] ?? session.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HeartPulse className="h-5 w-5" />Necessidades por sala</CardTitle>
            <CardDescription>Crianças com alertas (presença nos últimos 90 dias). Detalhes ficam no perfil autorizado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.healthByClassroom.length === 0 && <p className="text-sm text-muted-foreground">Nenhum alerta registrado.</p>}
            {data.healthByClassroom.map((row) => (
              <div key={row.classroomName} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/50 p-2 text-sm">
                <span className="font-medium">{row.classroomName}</span>
                <div className="flex flex-wrap gap-1">
                  {row.allergy > 0 && <Badge variant="destructive">{row.allergy} alergia(s)</Badge>}
                  {row.dietary > 0 && <Badge variant="outline">{row.dietary} restrição(ões)</Badge>}
                  {row.medication > 0 && <Badge variant="outline">{row.medication} medicação(ões)</Badge>}
                  {row.specialNeeds > 0 && <Badge variant="outline">{row.specialNeeds} atenção</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Baby className="h-5 w-5" />Incidentes recentes</CardTitle>
            <CardDescription>Últimos registros operacionais e de segurança.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentIncidents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum incidente registrado.</p>}
            {data.recentIncidents.map((incident) => (
              <div key={incident.id} className="space-y-1 rounded-md border border-border/50 p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{incident.title}</span>
                  <Badge variant={incident.severity === "critical" ? "destructive" : incident.severity === "warning" ? "outline" : "secondary"}>
                    {SEVERITY_LABELS[incident.severity] ?? incident.severity}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {incident.childName ? `${incident.childName} · ` : ""}{incident.reportedByName ?? "—"} · {formatDateTime(incident.createdAt)}
                  {incident.resolvedAt ? " · resolvido" : " · em aberto"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
