import Link from "next/link"
import { Activity, ArrowLeft, CheckCircle2, Clock3, Database, ExternalLink, HardDrive, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatAge, healthLabel, type HealthStatus } from "@/lib/operations/health-core"
import { getAuthorizedOperationalHealthData, type OperationalHealthData } from "@/lib/operations/health"

export const dynamic = "force-dynamic"

function statusClass(status: HealthStatus) {
  if (status === "healthy") return "bg-success/10 text-success border-success/20"
  if (status === "degraded" || status === "unknown" || status === "not_configured") return "bg-warning/10 text-warning border-warning/20"
  return "bg-destructive/10 text-destructive border-destructive/20"
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "healthy") return <CheckCircle2 className="h-4 w-4 text-success" />
  if (status === "degraded" || status === "unknown" || status === "not_configured") return <TriangleAlert className="h-4 w-4 text-warning" />
  return <XCircle className="h-4 w-4 text-destructive" />
}

function StatusBadge({ status }: { status: HealthStatus }) {
  return <Badge className={statusClass(status)}>{healthLabel(status)}</Badge>
}

function dateTime(value: string | null) {
  if (!value) return "Não informado"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Data inválida" : date.toLocaleString("pt-BR")
}

function CheckCard({ check }: { check: OperationalHealthData["checks"][number] }) {
  return (
    <Card className="glass">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <StatusIcon status={check.status} />
          <div className="min-w-0">
            <p className="font-medium">{check.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={check.status} />
          {check.latencyMs !== undefined && <span className="text-[11px] text-muted-foreground">{check.latencyMs} ms</span>}
        </div>
      </CardContent>
    </Card>
  )
}

export default async function OperationalHealthPage() {
  const data = await getAuthorizedOperationalHealthData()
  const backlog = data.queues.reduce((total, queue) => total + queue.pending + queue.processing + queue.failed, 0)
  const dead = data.queues.reduce((total, queue) => total + queue.dead, 0)
  const activeCrons = data.cronJobs.filter((job) => job.active).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/configuracoes" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Configurações</Link>
            <span>/</span>
            <span>Operação</span>
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><Activity className="h-7 w-7 text-primary" /> Saúde operacional</h1>
          <p className="mt-1 text-muted-foreground">Release, banco, filas, workers e integrações em um só lugar.</p>
        </div>
        <Button variant="outline" render={<Link href="/configuracoes/operacao" />}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>

      <Card className="glass border-primary/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <StatusIcon status={data.overall} />
            <div>
              <p className="font-semibold">Estado geral: {healthLabel(data.overall)}</p>
              <p className="text-sm text-muted-foreground">Ambiente {data.environment} · projeto Supabase {data.projectRef} · verificado em {dateTime(data.checkedAt)}</p>
            </div>
          </div>
          <StatusBadge status={data.overall} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Migrations", value: `${data.migrations.remoteCount}/${data.migrations.localCount}`, icon: Database },
          { label: "Fila operacional", value: backlog, icon: Clock3 },
          { label: "Dead letters", value: dead, icon: TriangleAlert },
          { label: "Crons ativos", value: `${activeCrons}/${data.cronJobs.length}`, icon: Activity },
        ].map((metric) => (
          <Card className="glass" key={metric.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <metric.icon className="h-5 w-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">{metric.label}</p><p className="text-xl font-semibold">{metric.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Health checks</h2><p className="text-sm text-muted-foreground">Checks externos não enviam mensagens nem processam filas.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.checks.map((check) => <CheckCard check={check} key={check.key} />)}</div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-primary" /> Migrations e backup</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Repo / remoto</span><span className="font-medium">{data.migrations.localCount} / {data.migrations.remoteCount}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Última local</span><span className="max-w-[60%] truncate text-right font-medium">{data.migrations.localLatest ?? "Não informado"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Última remota</span><span className="max-w-[60%] truncate text-right font-medium">{data.migrations.remoteLatest ?? "Não informado"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Alinhamento</span><StatusBadge status={data.migrations.status} /></div>
            <p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">{data.migrations.detail}</p>
            <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Backup</span><StatusBadge status={data.backup.status} /></div>
            <p className="text-xs text-muted-foreground">{data.backup.detail}</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-primary" /> Workers e cron</CardTitle></CardHeader>
          <CardContent>
            {data.cronJobs.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhum cron encontrado.</p> : <div className="space-y-3">{data.cronJobs.map((job) => <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0" key={job.jobName}><div><p className="font-medium">{job.jobName}</p><p className="text-xs text-muted-foreground">{job.schedule} · última execução {job.lastRunAt ? `${dateTime(job.lastRunAt)} (${formatAge(job.lastRunAt)})` : "não informada"}</p></div><Badge className={job.active && (!job.lastStatus || job.lastStatus === "succeeded") ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{job.active ? job.lastStatus ?? "ativo" : "inativo"}</Badge></div>)}</div>}
          </CardContent>
        </Card>
      </div>

      <Card className="glass">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-4 w-4 text-primary" /> Filas por worker</CardTitle></CardHeader>
        <CardContent>
          {data.queues.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhuma fila encontrada.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.queues.map((queue) => <div className="rounded-lg border border-border/40 p-4" key={queue.key}><div className="flex items-center justify-between"><p className="font-medium">{queue.label}</p><Badge variant="outline">{queue.total} total</Badge></div><div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs"><div><p className="text-muted-foreground">Pend.</p><p className="font-semibold">{queue.pending}</p></div><div><p className="text-muted-foreground">Proc.</p><p className="font-semibold">{queue.processing}</p></div><div><p className="text-muted-foreground">Falha</p><p className="font-semibold text-warning">{queue.failed}</p></div><div><p className="text-muted-foreground">Dead</p><p className="font-semibold text-destructive">{queue.dead}</p></div></div><p className="mt-3 text-xs text-muted-foreground">Atraso: {queue.oldestPendingAt ? formatAge(queue.oldestPendingAt) : "sem pendência"}</p><p className="text-xs text-muted-foreground">Mais antiga: {queue.oldestPendingAt ? dateTime(queue.oldestPendingAt) : "sem pendência"}</p></div>)}</div>}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Uso por tenant</CardTitle></CardHeader>
        <CardContent>
          {data.tenants.length === 0 ? <p className="py-6 text-sm text-muted-foreground">Nenhuma igreja ativa encontrada.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-border/40 text-left text-muted-foreground"><th className="p-2">Igreja</th><th className="p-2 text-right">Pessoas</th><th className="p-2 text-right">Ativas</th><th className="p-2 text-right">Grupos</th><th className="p-2 text-right">Entregas</th></tr></thead><tbody>{data.tenants.map((tenant) => <tr className="border-b border-border/30 last:border-0" key={tenant.companyId}><td className="p-2 font-medium">{tenant.companyName}</td><td className="p-2 text-right">{tenant.people}</td><td className="p-2 text-right">{tenant.activePeople}</td><td className="p-2 text-right">{tenant.groups}</td><td className="p-2 text-right">{tenant.deliveries}</td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><Link href="/api/health" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Endpoint health <ExternalLink className="h-3.5 w-3.5" /></Link><Link href="/api/ready" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Endpoint ready <ExternalLink className="h-3.5 w-3.5" /></Link></div>
    </div>
  )
}
