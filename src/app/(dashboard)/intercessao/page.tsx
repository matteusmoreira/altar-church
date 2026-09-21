import { CheckCircle2, Clock, HandHeart, Heart, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { MetricCard, MetricGrid, PageHeader } from "@/components/shared"
import { deletePrayerRequest, savePrayerRequest } from "@/lib/operational/actions"
import { listPrayerRequests } from "@/lib/operational/data"
import type { PrayerRequest } from "@/lib/types"

async function savePrayerRequestForm(formData: FormData) {
  "use server"
  await savePrayerRequest(formData)
}

async function deletePrayerRequestForm(formData: FormData) {
  "use server"
  await deletePrayerRequest(formData)
}

const prayerReasons = ["Ação de Graças", "Conversão", "Crescimento", "Família", "Finanças", "Igreja", "Missões", "Pessoal", "Saúde", "Trabalho"]

const statusLabels: Record<PrayerRequest["status"], string> = {
  open: "Aberto",
  praying: "Em oração",
  answered: "Respondido",
  archived: "Arquivado",
}

export default async function PrayerPage() {
  const requests = await listPrayerRequests()
  const open = requests.filter((request) => request.status === "open").length
  const praying = requests.filter((request) => request.status === "praying").length
  const answered = requests.filter((request) => request.status === "answered").length
  const archived = requests.filter((request) => request.status === "archived").length

  return (
    <div className="space-y-6">
      <PageHeader title="Oração / Intercessão" description="Pedidos de oração persistidos por igreja." />

      <MetricGrid columns={4}>
        <MetricCard title="Abertos" value={open} icon={Heart} tone="primary" />
        <MetricCard title="Em oração" value={praying} icon={Clock} tone="primary" />
        <MetricCard title="Respondidos" value={answered} icon={CheckCircle2} tone="primary" />
        <MetricCard title="Arquivados" value={archived} icon={HandHeart} tone="primary" />
      </MetricGrid>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Novo Pedido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePrayerRequestForm} className="grid gap-4 lg:grid-cols-6">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" name="city" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="state">Estado</Label>
              <Input id="state" name="state" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prayerReason">Motivo</Label>
              <Select name="prayerReason" defaultValue="Pessoal">
                <SelectTrigger id="prayerReason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prayerReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="open">
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
            <div className="grid gap-2 lg:col-span-6">
              <Label htmlFor="message">Mensagem *</Label>
              <Textarea id="message" name="message" rows={4} required />
            </div>
            <div className="flex flex-wrap items-center gap-4 lg:col-span-6">
              <input type="hidden" name="active" value="true" />
              <input type="hidden" name="publishOnWall" value="true" />
              <label className="flex items-center gap-2 text-sm">
                <input name="receiveVisit" type="checkbox" className="h-4 w-4 rounded border-border" />
                Receber visita
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="receiveCall" type="checkbox" className="h-4 w-4 rounded border-border" />
                Receber ligação
              </label>
              <Button type="submit" variant="brand">
                Cadastrar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visita</TableHead>
              <TableHead>Ligação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium">{request.name}</TableCell>
                <TableCell>{request.prayerReason}</TableCell>
                <TableCell className="max-w-sm truncate">{request.message}</TableCell>
                <TableCell>
                  <Badge>{statusLabels[request.status]}</Badge>
                </TableCell>
                <TableCell>{request.receiveVisit ? "Sim" : "Não"}</TableCell>
                <TableCell>{request.receiveCall ? "Sim" : "Não"}</TableCell>
                <TableCell>
                  <form action={deletePrayerRequestForm}>
                    <input type="hidden" name="id" value={request.id} />
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
