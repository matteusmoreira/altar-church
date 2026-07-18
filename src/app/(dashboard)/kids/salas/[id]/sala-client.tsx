"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Baby, BookOpenCheck, CheckCircle2, Megaphone, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { usePermission } from "@/lib/permissions"
import { maskPhone } from "@/lib/kids/security"
import { callKidGuardian, resolveKidIncident, saveKidIncident, saveKidLessonReport } from "@/lib/kids/actions"
import type { KidIncidentSeverity, KidRoomPanelData } from "@/lib/kids/types"

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function formatTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function ageLabel(ageMonths: number | null) {
  if (ageMonths == null) return "—"
  const years = Math.floor(ageMonths / 12)
  const months = ageMonths % 12
  if (years === 0) return `${months}m`
  if (months === 0) return `${years}a`
  return `${years}a ${months}m`
}

const SEVERITY_LABELS: Record<KidIncidentSeverity, string> = {
  info: "Observação",
  warning: "Atenção",
  critical: "Crítico",
}

const SEVERITY_VARIANTS: Record<KidIncidentSeverity, "secondary" | "outline" | "destructive"> = {
  info: "secondary",
  warning: "outline",
  critical: "destructive",
}

export function SalaClient({ data }: { data: KidRoomPanelData }) {
  const router = useRouter()
  const canManageSessions = usePermission("kids.sessions.manage")
  const [callReason, setCallReason] = useState<Record<string, string>>({})
  const [incidentForm, setIncidentForm] = useState<{ kidId: string; severity: KidIncidentSeverity; title: string; description: string }>({
    kidId: "",
    severity: "info",
    title: "",
    description: "",
  })
  const [reportForm, setReportForm] = useState({ kidId: "", title: "", content: "", sharedWithGuardians: false })
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        toast.success(success)
        after?.()
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  async function submitIncident() {
    await run(
      () =>
        saveKidIncident({
          id: null,
          sessionId: data.sessionId,
          sessionClassroomId: data.sessionClassroomId,
          kidId: incidentForm.kidId || null,
          severity: incidentForm.severity,
          title: incidentForm.title,
          description: incidentForm.description,
        }),
      "Incidente registrado",
      () => setIncidentForm({ kidId: "", severity: "info", title: "", description: "" }),
    )
  }

  async function submitReport() {
    await run(
      () =>
        saveKidLessonReport({
          id: null,
          sessionId: data.sessionId,
          sessionClassroomId: data.sessionClassroomId,
          kidId: reportForm.kidId || null,
          title: reportForm.title,
          content: reportForm.content,
          sharedWithGuardians: reportForm.sharedWithGuardians,
        }),
      "Relatório de aula salvo",
      () => setReportForm({ kidId: "", title: "", content: "", sharedWithGuardians: false }),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{data.classroomName}</h1>
          <p className="text-muted-foreground">
            {data.sessionTitle} · {data.occupied}/{data.capacity} criança(s)
            {data.sessionStatus !== "open" ? " · sessão não está aberta" : ""}
          </p>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => router.refresh()} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {data.attendances.length === 0 && (
            <Card className="glass">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Baby className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma criança nesta sala no momento.</p>
              </CardContent>
            </Card>
          )}
          {data.attendances.map((attendance) => (
            <Card key={attendance.id} className="glass">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{attendance.childName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ageLabel(attendance.ageMonths)} · entrada {formatTime(attendance.checkedInAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {attendance.status === "checkout_requested" && (
                      <Badge variant="default" className="animate-pulse">Retirada solicitada</Badge>
                    )}
                    {attendance.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                    {attendance.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                    {attendance.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                    {attendance.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Responsável: {attendance.primaryGuardianName ?? "—"}
                  {attendance.primaryGuardianPhone ? ` · ${maskPhone(attendance.primaryGuardianPhone)}` : ""}
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Motivo do chamado (ex.: troca, choro, saúde)"
                    className="h-10"
                    value={callReason[attendance.id] ?? ""}
                    onChange={(event) => setCallReason({ ...callReason, [attendance.id]: event.target.value })}
                  />
                  <Button
                    type="button"
                    className="h-10"
                    disabled={pending}
                    onClick={() =>
                      void run(
                        () =>
                          callKidGuardian({
                            attendanceId: attendance.id,
                            reason: (callReason[attendance.id] ?? "").trim() || "Chamado da sala",
                          }),
                        "Responsável chamado",
                      )
                    }
                  >
                    <Megaphone className="mr-1 h-4 w-4" />Chamar responsável
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" />Relatório de aula</CardTitle>
              <CardDescription>Registre resumo coletivo ou individual e, se autorizado, compartilhe com responsáveis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={reportForm.kidId}
                onChange={(event) => setReportForm({ ...reportForm, kidId: event.target.value })}
              >
                <option value="">Relatório coletivo da sala</option>
                {data.attendances.map((attendance) => (
                  <option key={attendance.kidId} value={attendance.kidId}>{attendance.childName}</option>
                ))}
              </select>
              <Input
                placeholder="Título *"
                value={reportForm.title}
                onChange={(event) => setReportForm({ ...reportForm, title: event.target.value })}
              />
              <Textarea
                placeholder="Resumo da aula, participação e observações"
                rows={4}
                value={reportForm.content}
                onChange={(event) => setReportForm({ ...reportForm, content: event.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reportForm.sharedWithGuardians}
                  onChange={(event) => setReportForm({ ...reportForm, sharedWithGuardians: event.target.checked })}
                />
                Compartilhar com responsáveis autorizados
              </label>
              <Button type="button" className="w-full" disabled={pending || reportForm.title.trim().length < 2} onClick={() => void submitReport()}>
                Salvar relatório
              </Button>
            </CardContent>
          </Card>

          {data.reports.length > 0 && (
            <Card className="glass">
              <CardHeader><CardTitle>Relatórios desta sessão</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.reports.map((report) => (
                  <div key={report.id} className="rounded-md border border-border/40 p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{report.title}</span>
                      {report.sharedWithGuardians && <Badge variant="secondary">Compartilhado</Badge>}
                    </div>
                    {report.childName && <p className="text-xs text-muted-foreground">{report.childName}</p>}
                    {report.content && <p className="mt-1 whitespace-pre-wrap text-xs">{report.content}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{report.authorName ?? "—"} · {formatTime(report.createdAt)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Registrar incidente</CardTitle>
              <CardDescription>Observação, ocorrência ou alerta da aula.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={incidentForm.kidId}
                onChange={(event) => setIncidentForm({ ...incidentForm, kidId: event.target.value })}
              >
                <option value="">Sala toda / sem criança específica</option>
                {data.attendances.map((attendance) => (
                  <option key={attendance.kidId} value={attendance.kidId}>{attendance.childName}</option>
                ))}
              </select>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={incidentForm.severity}
                onChange={(event) => setIncidentForm({ ...incidentForm, severity: event.target.value as KidIncidentSeverity })}
              >
                {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <Input
                placeholder="Título *"
                value={incidentForm.title}
                onChange={(event) => setIncidentForm({ ...incidentForm, title: event.target.value })}
              />
              <Textarea
                placeholder="Descrição (opcional)"
                rows={3}
                value={incidentForm.description}
                onChange={(event) => setIncidentForm({ ...incidentForm, description: event.target.value })}
              />
              <Button type="button" className="w-full" disabled={pending || incidentForm.title.trim().length < 2} onClick={() => void submitIncident()}>
                Registrar
              </Button>
            </CardContent>
          </Card>

          {data.incidents.length > 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Incidentes da sessão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.incidents.map((incident) => (
                  <div key={incident.id} className="space-y-1 rounded-md border border-border/40 p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{incident.title}</span>
                      <Badge variant={SEVERITY_VARIANTS[incident.severity]}>{SEVERITY_LABELS[incident.severity]}</Badge>
                    </div>
                    {incident.childName && <p className="text-xs text-muted-foreground">{incident.childName}</p>}
                    {incident.description && <p className="text-xs">{incident.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {incident.reportedByName ?? "—"} · {formatTime(incident.createdAt)}
                        {incident.resolvedAt ? ` · resolvido ${formatTime(incident.resolvedAt)}` : ""}
                      </p>
                      {!incident.resolvedAt && (data.canManage || canManageSessions) && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => void run(() => resolveKidIncident(incident.id), "Incidente resolvido")}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
