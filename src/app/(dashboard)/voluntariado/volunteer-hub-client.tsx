"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import { CalendarDays, CheckCircle2, ClipboardCheck, Megaphone, QrCode, UsersRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/shared"
import {
  checkInVolunteerAssignment,
  createVolunteerCheckinQr,
  generateMonthlyVolunteerSchedule,
  markVolunteerFeedRead,
  publishVolunteerSchedule,
  saveVolunteer,
  saveVolunteerAssignment,
  saveVolunteerDepartment,
  saveVolunteerFeedPost,
  saveVolunteerTemplate,
} from "@/lib/volunteers/actions"
import type { VolunteerDashboardData, VolunteerPortalData, VolunteerShift } from "@/lib/volunteers/types"
import { useRouter } from "next/navigation"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function QrScanner({ onRead }: { onRead: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controls = useRef<IScannerControls | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => () => controls.current?.stop(), [])

  async function start() {
    try {
      setError("")
      const reader = new BrowserQRCodeReader()
      controls.current = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (!result) return
        onRead(result.getText())
        controls.current?.stop()
        controls.current = null
        setActive(false)
      })
      setActive(true)
    } catch {
      setError("Câmera indisponível. Cole código QR abaixo.")
    }
  }

  return (
    <div className="space-y-2">
      {!active ? <Button type="button" variant="outline" size="sm" onClick={start}><QrCode className="mr-2 h-4 w-4" />Ler QR</Button> : <video ref={videoRef} className="max-h-48 w-full rounded-lg bg-black" muted playsInline />}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function ShiftAssignment({ shift, volunteerIds }: { shift: VolunteerShift; volunteerIds: { id: string; name: string }[] }) {
  const router = useRouter()
  const [volunteerId, setVolunteerId] = useState("")
  async function assign() {
    if (!volunteerId) return toast.error("Selecione voluntário")
    const result = await saveVolunteerAssignment({ shiftId: shift.id, volunteerId })
    if (showResult(result)) {
      toast.success("Voluntário escalado")
      router.refresh()
    }
  }
  const filled = shift.assignments.filter((assignment) => !["declined", "cancelled"].includes(assignment.status)).length
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{shift.departmentName} · {shift.roleName}</p><p className="text-xs text-muted-foreground">{shift.eventTitle} · {formatDate(shift.startsAt)}</p></div>
        <Badge variant={filled >= shift.requiredVolunteers ? "default" : "secondary"}>{filled}/{shift.requiredVolunteers} vagas</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">{shift.assignments.map((assignment) => <Badge key={assignment.id} variant="outline">{assignment.volunteerName}</Badge>)}</div>
      {filled < shift.requiredVolunteers && (
        <div className="mt-3 flex gap-2">
          <select className="h-9 min-w-48 rounded-md border bg-background px-2 text-sm" value={volunteerId} onChange={(event) => setVolunteerId(event.target.value)}>
            <option value="">Escolher voluntário</option>
            {volunteerIds.map((volunteer) => <option key={volunteer.id} value={volunteer.id}>{volunteer.name}</option>)}
          </select>
          <Button type="button" size="sm" onClick={assign}>Escalar</Button>
        </div>
      )}
    </div>
  )
}

function ManagerHub({ data }: { data: VolunteerDashboardData }) {
  const router = useRouter()
  const [volunteerForm, setVolunteerForm] = useState({ firstName: "", lastName: "", email: "", phone: "", departmentId: "", roleName: "Voluntário", whatsappEnabled: false, emailEnabled: false, invite: false })
  const [departmentForm, setDepartmentForm] = useState({ name: "", description: "" })
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", departmentId: "", roleName: "", requiredVolunteers: 1 })
  const [templateSlots, setTemplateSlots] = useState<{ departmentId: string; roleName: string; requiredVolunteers: number }[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [feedForm, setFeedForm] = useState({ title: "", content: "", audience: "all" as "all" | "departments", departmentId: "" })
  const [qrToken, setQrToken] = useState("")

  async function addVolunteer() {
    const result = await saveVolunteer({
      id: null,
      firstName: volunteerForm.firstName,
      lastName: volunteerForm.lastName,
      email: volunteerForm.email,
      phone: volunteerForm.phone,
      registrationStatus: "active",
      whatsappEnabled: volunteerForm.whatsappEnabled,
      emailEnabled: volunteerForm.emailEnabled,
      memberships: volunteerForm.departmentId ? [{ departmentId: volunteerForm.departmentId, roleName: volunteerForm.roleName }] : [],
      invite: volunteerForm.invite,
    })
    if (showResult(result)) { toast.success("Voluntário salvo"); setVolunteerForm({ firstName: "", lastName: "", email: "", phone: "", departmentId: "", roleName: "Voluntário", whatsappEnabled: false, emailEnabled: false, invite: false }); router.refresh() }
  }
  async function addDepartment() {
    const result = await saveVolunteerDepartment({ id: null, managerProfileId: null, ...departmentForm })
    if (showResult(result)) { toast.success("Departamento salvo"); setDepartmentForm({ name: "", description: "" }); router.refresh() }
  }
  function addSlot() {
    if (!templateForm.departmentId || !templateForm.roleName) return toast.error("Departamento e função obrigatórios")
    setTemplateSlots((current) => [...current, { departmentId: templateForm.departmentId, roleName: templateForm.roleName, requiredVolunteers: templateForm.requiredVolunteers }])
    setTemplateForm((current) => ({ ...current, departmentId: "", roleName: "", requiredVolunteers: 1 }))
  }
  async function addTemplate() {
    const result = await saveVolunteerTemplate({ id: null, name: templateForm.name, description: templateForm.description, slots: templateSlots })
    if (showResult(result)) { toast.success("Template salvo"); setTemplateForm({ name: "", description: "", departmentId: "", roleName: "", requiredVolunteers: 1 }); setTemplateSlots([]); router.refresh() }
  }
  async function generate() {
    const result = await generateMonthlyVolunteerSchedule({ month: `${month}-01` })
    if (showResult(result)) { toast.success("Escala gerada. Ajuste vagas antes de publicar."); router.refresh() }
  }
  async function publish(id: string) {
    const result = await publishVolunteerSchedule(id)
    if (showResult(result)) { toast.success("Escala publicada e avisos enfileirados"); router.refresh() }
  }
  async function publishFeed() {
    const result = await saveVolunteerFeedPost({
      id: null,
      title: feedForm.title,
      content: feedForm.content,
      audience: feedForm.audience,
      departmentIds: feedForm.audience === "departments" && feedForm.departmentId ? [feedForm.departmentId] : [],
      publish: true,
    })
    if (showResult(result)) { toast.success("Atualização publicada e avisos enfileirados"); setFeedForm({ title: "", content: "", audience: "all", departmentId: "" }); router.refresh() }
  }
  async function openQr(shiftId: string) {
    const result = await createVolunteerCheckinQr(shiftId)
    if (showResult(result) && result.qrToken) setQrToken(result.qrToken)
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Voluntariado</h1><p className="text-muted-foreground">Pessoas, vagas, escalas, check-in e avisos.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard title="Voluntários ativos" value={data.metrics.activeVolunteers} icon={UsersRound} color="gradient-primary" />
        <MetricCard title="Escalados mês" value={data.metrics.assignedThisMonth} icon={CalendarDays} color="bg-info" />
        <MetricCard title="Vagas abertas" value={data.metrics.openVacancies} icon={ClipboardCheck} color="bg-warning" />
        <MetricCard title="Check-ins mês" value={data.metrics.checkinsThisMonth} icon={CheckCircle2} color="bg-success" />
        <MetricCard title="Crescimento mês" value={data.metrics.monthlyGrowth} icon={UsersRound} color="bg-primary" />
      </div>
      <Tabs defaultValue="volunteers">
        <TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="volunteers">Voluntários</TabsTrigger><TabsTrigger value="departments">Departamentos</TabsTrigger><TabsTrigger value="templates">Templates</TabsTrigger><TabsTrigger value="schedules">Escalas</TabsTrigger><TabsTrigger value="feed">Feed</TabsTrigger></TabsList>
        <TabsContent value="volunteers" className="space-y-4">
          <Card><CardHeader><CardTitle>Novo voluntário</CardTitle><CardDescription>Cadastro já cria pessoa tipo voluntário. Convite libera portal restrito.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Nome" value={volunteerForm.firstName} onChange={(event) => setVolunteerForm({ ...volunteerForm, firstName: event.target.value })} />
            <Input placeholder="Sobrenome" value={volunteerForm.lastName} onChange={(event) => setVolunteerForm({ ...volunteerForm, lastName: event.target.value })} />
            <Input type="email" placeholder="E-mail" value={volunteerForm.email} onChange={(event) => setVolunteerForm({ ...volunteerForm, email: event.target.value })} />
            <Input placeholder="WhatsApp" value={volunteerForm.phone} onChange={(event) => setVolunteerForm({ ...volunteerForm, phone: event.target.value })} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={volunteerForm.departmentId} onChange={(event) => setVolunteerForm({ ...volunteerForm, departmentId: event.target.value })}><option value="">Sem departamento</option>{data.departments.filter((department) => department.active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
            <Input placeholder="Função" value={volunteerForm.roleName} onChange={(event) => setVolunteerForm({ ...volunteerForm, roleName: event.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={volunteerForm.whatsappEnabled} onChange={(event) => setVolunteerForm({ ...volunteerForm, whatsappEnabled: event.target.checked })} />Receber WhatsApp</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={volunteerForm.emailEnabled} onChange={(event) => setVolunteerForm({ ...volunteerForm, emailEnabled: event.target.checked })} />Receber e-mail</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={volunteerForm.invite} onChange={(event) => setVolunteerForm({ ...volunteerForm, invite: event.target.checked })} />Enviar convite portal</label>
            <Button type="button" onClick={addVolunteer}>Salvar voluntário</Button>
          </CardContent></Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.volunteers.map((volunteer) => <Card key={volunteer.id}><CardContent className="p-4"><div className="flex justify-between gap-2"><div><p className="font-medium">{volunteer.name}</p><p className="text-xs text-muted-foreground">{volunteer.email ?? (volunteer.phone || "Sem contato")}</p></div><Badge variant={volunteer.status === "active" ? "default" : "secondary"}>{volunteer.status}</Badge></div><p className="mt-3 text-sm text-muted-foreground">{volunteer.departmentNames.join(", ") || "Sem departamento"}</p><p className="mt-1 text-xs text-muted-foreground">{volunteer.checkins}/{volunteer.assignments} participações</p></CardContent></Card>)}</div>
        </TabsContent>
        <TabsContent value="departments" className="space-y-4"><Card><CardHeader><CardTitle>Novo departamento</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Input placeholder="Nome" value={departmentForm.name} onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })} /><Input placeholder="Descrição" value={departmentForm.description} onChange={(event) => setDepartmentForm({ ...departmentForm, description: event.target.value })} /><Button type="button" onClick={addDepartment}>Salvar departamento</Button></CardContent></Card><div className="grid gap-3 md:grid-cols-3">{data.departments.map((department) => <Card key={department.id}><CardContent className="p-4"><p className="font-medium">{department.name}</p><p className="text-sm text-muted-foreground">{department.description || "Sem descrição"}</p></CardContent></Card>)}</div></TabsContent>
        <TabsContent value="templates" className="space-y-4"><Card><CardHeader><CardTitle>Template de vagas</CardTitle><CardDescription>Use no evento. Geração mensal preserva ajustes já feitos.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-2"><Input placeholder="Nome template" value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /><Input placeholder="Descrição" value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} /></div><div className="grid gap-3 md:grid-cols-4"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={templateForm.departmentId} onChange={(event) => setTemplateForm({ ...templateForm, departmentId: event.target.value })}><option value="">Departamento</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><Input placeholder="Função" value={templateForm.roleName} onChange={(event) => setTemplateForm({ ...templateForm, roleName: event.target.value })} /><Input type="number" min="1" value={templateForm.requiredVolunteers} onChange={(event) => setTemplateForm({ ...templateForm, requiredVolunteers: Number(event.target.value) })} /><Button type="button" variant="outline" onClick={addSlot}>Adicionar vaga</Button></div><div className="flex flex-wrap gap-2">{templateSlots.map((slot, index) => <Badge key={`${slot.departmentId}-${slot.roleName}-${index}`} variant="secondary">{data.departments.find((department) => department.id === slot.departmentId)?.name} · {slot.roleName} × {slot.requiredVolunteers}</Badge>)}</div><Button type="button" onClick={addTemplate}>Salvar template</Button></CardContent></Card><div className="grid gap-3 md:grid-cols-2">{data.templates.map((template) => <Card key={template.id}><CardContent className="p-4"><p className="font-medium">{template.name}</p><p className="text-sm text-muted-foreground">{template.description}</p><div className="mt-3 flex flex-wrap gap-1">{template.slots.map((slot) => <Badge key={slot.id} variant="outline">{slot.departmentName}: {slot.roleName} × {slot.requiredVolunteers}</Badge>)}</div></CardContent></Card>)}</div></TabsContent>
        <TabsContent value="schedules" className="space-y-4"><Card><CardHeader><CardTitle>Gerar escala mensal</CardTitle><CardDescription>Eventos publicados com template viram vagas no mês escolhido.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><Input className="w-48" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button type="button" onClick={generate}>Gerar vagas</Button></CardContent></Card>{data.schedules.map((schedule) => <Card key={schedule.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Escala {schedule.month.slice(0, 7)}</CardTitle><CardDescription>{schedule.shifts.length} vagas de serviço</CardDescription></div><div className="flex gap-2"><Badge variant={schedule.status === "published" ? "default" : "secondary"}>{schedule.status}</Badge>{schedule.status !== "published" && <Button type="button" size="sm" onClick={() => publish(schedule.id)}>Publicar</Button>}</div></div></CardHeader><CardContent className="space-y-3">{schedule.shifts.map((shift) => <div key={shift.id} className="space-y-2"><ShiftAssignment shift={shift} volunteerIds={data.volunteers.filter((volunteer) => volunteer.status === "active").map((volunteer) => ({ id: volunteer.id, name: volunteer.name }))} /><Button type="button" variant="ghost" size="sm" onClick={() => openQr(shift.id)}><QrCode className="mr-2 h-4 w-4" />QR check-in</Button></div>)}</CardContent></Card>)}</TabsContent>
        <TabsContent value="feed" className="space-y-4"><Card><CardHeader><CardTitle>Nova atualização</CardTitle><CardDescription>Publica no portal. WhatsApp e e-mail vão apenas para contatos autorizados.</CardDescription></CardHeader><CardContent className="space-y-3"><Input placeholder="Título" value={feedForm.title} onChange={(event) => setFeedForm({ ...feedForm, title: event.target.value })} /><Textarea placeholder="Informação para voluntários" value={feedForm.content} onChange={(event) => setFeedForm({ ...feedForm, content: event.target.value })} /><div className="flex flex-wrap gap-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={feedForm.audience} onChange={(event) => setFeedForm({ ...feedForm, audience: event.target.value as "all" | "departments" })}><option value="all">Todos</option><option value="departments">Departamento</option></select>{feedForm.audience === "departments" && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={feedForm.departmentId} onChange={(event) => setFeedForm({ ...feedForm, departmentId: event.target.value })}><option value="">Departamento</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>}<Button type="button" onClick={publishFeed}><Megaphone className="mr-2 h-4 w-4" />Publicar</Button></div></CardContent></Card>{data.feedPosts.map((post) => <Card key={post.id}><CardContent className="p-4"><p className="font-medium">{post.title}</p><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p></CardContent></Card>)}</TabsContent>
      </Tabs>
      {qrToken && <Card className="fixed bottom-4 right-4 z-30 w-72 shadow-xl"><CardHeader><CardTitle className="text-base">QR de check-in</CardTitle><CardDescription>Válido por 10 minutos. Voluntário precisa estar autenticado.</CardDescription></CardHeader><CardContent className="flex flex-col items-center gap-3"><QRCodeSVG value={qrToken} size={190} includeMargin /><code className="w-full break-all rounded bg-muted p-2 text-xs">{qrToken}</code><Button type="button" variant="outline" onClick={() => setQrToken("")}>Fechar</Button></CardContent></Card>}
    </div>
  )
}

function VolunteerPortal({ data }: { data: VolunteerPortalData }) {
  const router = useRouter()
  const [tokens, setTokens] = useState<Record<string, string>>({})
  async function checkin(assignmentId: string) {
    const result = await checkInVolunteerAssignment({ assignmentId, qrToken: tokens[assignmentId] || "" })
    if (showResult(result)) { toast.success("Presença confirmada"); router.refresh() }
  }
  async function read(postId: string) {
    const result = await markVolunteerFeedRead(postId)
    if (showResult(result)) router.refresh()
  }
  return (
    <div className="space-y-6"><div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Minha escala</h1><p className="text-muted-foreground">Olá, {data.volunteer.name}. Veja tarefas, check-in e avisos.</p></div><div className="grid gap-4 sm:grid-cols-3"><MetricCard title="Escalas" value={data.volunteer.assignments} icon={CalendarDays} color="gradient-primary" /><MetricCard title="Check-ins" value={data.volunteer.checkins} icon={CheckCircle2} color="bg-success" /><MetricCard title="Departamentos" value={data.volunteer.departmentNames.length} icon={UsersRound} color="bg-info" /></div><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Próximas escalas</CardTitle></CardHeader><CardContent className="space-y-3">{data.upcomingAssignments.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma escala próxima.</p>}{data.upcomingAssignments.map((shift) => { const assignment = shift.assignments[0]; const checked = assignment.status === "checked_in"; return <div key={shift.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{shift.eventTitle}</p><p className="text-sm text-muted-foreground">{shift.departmentName} · {shift.roleName}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(shift.startsAt)}</p></div><Badge variant={checked ? "default" : "secondary"}>{checked ? "Presente" : assignment.status}</Badge></div>{!checked && <div className="mt-3 space-y-2"><Input placeholder="Código QR (opcional)" value={tokens[assignment.id] ?? ""} onChange={(event) => setTokens({ ...tokens, [assignment.id]: event.target.value })} /><QrScanner onRead={(token) => setTokens({ ...tokens, [assignment.id]: token })} /><Button type="button" size="sm" onClick={() => checkin(assignment.id)}>Confirmar presença</Button></div>}</div>})}</CardContent></Card><Card><CardHeader><CardTitle>Atualizações</CardTitle></CardHeader><CardContent className="space-y-3">{data.feedPosts.length === 0 && <p className="text-sm text-muted-foreground">Sem atualizações.</p>}{data.feedPosts.map((post) => <button key={post.id} type="button" onClick={() => post.unread && read(post.id)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/40"><div className="flex items-center justify-between gap-2"><p className="font-medium">{post.title}</p>{post.unread && <Badge>Nova</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p></button>)}</CardContent></Card></div></div>
  )
}

export function VolunteerHubClient(props: { mode: "manager"; data: VolunteerDashboardData } | { mode: "volunteer"; data: VolunteerPortalData }) {
  return props.mode === "manager" ? <ManagerHub data={props.data} /> : <VolunteerPortal data={props.data} />
}
