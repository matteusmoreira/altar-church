import { CalendarDays, CheckCircle, Clock, Plus, Trash2, UserCheck, UserX } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deleteAttendanceRecord, saveAttendanceRecord } from "@/lib/operational/actions"
import { listAttendanceRecords, listPeopleDirectory } from "@/lib/operational/data"
import type { AttendanceRecord } from "@/lib/types"

async function saveAttendanceRecordForm(formData: FormData) {
  "use server"
  await saveAttendanceRecord(formData)
}

async function deleteAttendanceRecordForm(formData: FormData) {
  "use server"
  await deleteAttendanceRecord(formData)
}

const statusLabels: Record<AttendanceRecord["status"], string> = {
  present: "Presente",
  absent: "Ausente",
  justified: "Justificado",
}

const eventTypeLabels: Record<AttendanceRecord["eventType"], string> = {
  service: "Culto",
  event: "Evento",
  cell: "Célula",
  ministry: "Ministério",
  course: "Curso",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

export default async function AttendancePage() {
  const [records, people] = await Promise.all([listAttendanceRecords(), listPeopleDirectory()])
  const today = new Date().toISOString().slice(0, 10)
  const presentToday = records.filter((record) => record.date === today && record.status === "present").length
  const absentToday = records.filter((record) => record.date === today && record.status === "absent").length
  const justifiedToday = records.filter((record) => record.date === today && record.status === "justified").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Presença e Check-in</h1>
        <p className="text-muted-foreground">Registros vinculados ao cadastro de pessoas quando disponível.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Total Check-ins" value={records.length} icon={CalendarDays} />
        <Metric title="Presentes Hoje" value={presentToday} icon={UserCheck} tone="success" />
        <Metric title="Ausentes Hoje" value={absentToday} icon={UserX} tone="destructive" />
        <Metric title="Justificados" value={justifiedToday} icon={Clock} tone="warning" />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Registrar Presença
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveAttendanceRecordForm} className="grid gap-4 lg:grid-cols-6">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="personId">Pessoa do cadastro</Label>
              <Select name="personId" defaultValue="__manual__">
                <SelectTrigger id="personId">
                  <SelectValue placeholder="Selecione (recomendado)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Digitação manual</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="personName">Nome manual (se não selecionar)</Label>
              <Input id="personName" name="personName" placeholder="Nome completo" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eventType">Tipo</Label>
              <Select name="eventType" defaultValue="service">
                <SelectTrigger id="eventType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(eventTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="eventRefName">Evento</Label>
              <Input id="eventRefName" name="eventRefName" placeholder="Culto de domingo" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="present">
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Data *</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time">Hora</Label>
              <Input id="time" name="time" type="time" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="gradient-primary">
                <CheckCircle className="mr-2 h-4 w-4" />
                Registrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pessoa</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">
                  {record.personName}
                  {record.personId ? (
                    <span className="ml-2 text-xs text-muted-foreground">vinculado</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground">{eventTypeLabels[record.eventType]}</span>
                  {record.eventRefName && <span className="ml-1">{record.eventRefName}</span>}
                </TableCell>
                <TableCell>{formatDate(record.date)}</TableCell>
                <TableCell>{record.time || "-"}</TableCell>
                <TableCell>
                  <Badge>{statusLabels[record.status]}</Badge>
                </TableCell>
                <TableCell>{record.registeredByName || "-"}</TableCell>
                <TableCell>
                  <form action={deleteAttendanceRecordForm}>
                    <input type="hidden" name="id" value={record.id} />
                    <Button type="submit" variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function Metric({
  title,
  value,
  icon: Icon,
  tone = "primary",
}: {
  title: string
  value: number
  icon: React.ElementType
  tone?: "primary" | "success" | "destructive" | "warning"
}) {
  const toneClass = {
    primary: "gradient-primary text-white",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
  }[tone]

  return (
    <Card className="glass">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
