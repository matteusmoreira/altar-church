import { BarChart3, Calendar, Download, Heart, Plus, Repeat } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MetricCard, MetricGrid, PageHeader } from "@/components/shared"
import { saveDonation, saveDonationRecurrence } from "@/lib/operational/actions"
import { getDonationData } from "@/lib/operational/data"
import type { Donation, DonationRecurrence } from "@/lib/types"

async function saveDonationForm(formData: FormData) {
  "use server"
  await saveDonation(formData)
}

async function saveDonationRecurrenceForm(formData: FormData) {
  "use server"
  await saveDonationRecurrence(formData)
}

const statusLabels: Record<Donation["status"], string> = {
  confirmed: "Confirmado",
  pending: "Pendente",
  cancelled: "Cancelado",
}

const methodLabels: Record<Donation["method"], string> = {
  pix: "PIX",
  card: "Cartão",
  boleto: "Boleto",
  cash: "Dinheiro",
}

const frequencyLabels: Record<DonationRecurrence["frequency"], string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  yearly: "Anual",
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

export default async function DonationsPage() {
  const { donations, recurrences } = await getDonationData()
  const totalDonations = donations.reduce((sum, donation) => sum + donation.amount, 0)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const thisMonth = donations
    .filter((donation) => donation.date.startsWith(currentMonth))
    .reduce((sum, donation) => sum + donation.amount, 0)
  const recurringTotal = recurrences
    .filter((recurrence) => recurrence.active)
    .reduce((sum, recurrence) => sum + recurrence.amount, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doação"
        description="Doações e recorrências persistidas."
        actions={
          <a href="/api/donations/export" className={buttonVariants({ variant: "outline" })}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        }
      />

      <MetricGrid columns={3}>
        <MetricCard title="Total Doações" value={`R$ ${money(totalDonations)}`} icon={Heart} tone="primary" />
        <MetricCard title="Este Mês" value={`R$ ${money(thisMonth)}`} icon={Calendar} tone="primary" />
        <MetricCard title="Recorrentes" value={`R$ ${money(recurringTotal)}`} icon={Repeat} tone="primary" />
      </MetricGrid>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4" />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="new">
            <Plus className="h-4 w-4" />
            Nova doação
          </TabsTrigger>
          <TabsTrigger value="recurrences">
            <Repeat className="h-4 w-4" />
            Recorrências
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-6">
          <Card className="glass overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Doações Recentes</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doador</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.map((donation) => (
                  <TableRow key={donation.id}>
                    <TableCell className="font-medium">{donation.donorName || "Anônimo"}</TableCell>
                    <TableCell>{donation.reason || "-"}</TableCell>
                    <TableCell>{methodLabels[donation.method]}</TableCell>
                    <TableCell className="font-semibold text-success">R$ {money(donation.amount)}</TableCell>
                    <TableCell>{formatDate(donation.date)}</TableCell>
                    <TableCell>
                      <Badge>{statusLabels[donation.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="new" className="mt-0 space-y-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Registrar Doação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveDonationForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="donorName">Doador</Label>
                  <Input id="donorName" name="donorName" placeholder="Nome do doador" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="amount">Valor *</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reason">Motivo</Label>
                  <Input id="reason" name="reason" placeholder="Dízimo, oferta..." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="method">Método</Label>
                  <Select name="method" defaultValue="pix">
                    <SelectTrigger id="method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(methodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="date">Data *</Label>
                  <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue="confirmed">
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
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="receiptFile">Comprovante</Label>
                  <Input id="receiptFile" name="receiptFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="brand">
                    Registrar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recurrences" className="mt-0 space-y-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Nova Recorrência
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveDonationRecurrenceForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="userName">Usuário *</Label>
                  <Input id="userName" name="userName" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recurrenceAmount">Valor *</Label>
                  <Input id="recurrenceAmount" name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="recurrenceReason">Motivo</Label>
                  <Input id="recurrenceReason" name="reason" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="frequency">Periodicidade</Label>
                  <Select name="frequency" defaultValue="monthly">
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(frequencyLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-3">
                  <input type="hidden" name="active" value="true" />
                  <Button type="submit" variant="brand">
                    Criar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="glass overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Periodicidade</TableHead>
                  <TableHead>Pendente</TableHead>
                  <TableHead>Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurrences.map((recurrence) => (
                  <TableRow key={recurrence.id}>
                    <TableCell className="font-medium">{recurrence.userName}</TableCell>
                    <TableCell>{recurrence.reason || "-"}</TableCell>
                    <TableCell className="font-semibold text-success">R$ {money(recurrence.amount)}</TableCell>
                    <TableCell>{frequencyLabels[recurrence.frequency]}</TableCell>
                    <TableCell>{recurrence.pending ? "Sim" : "Não"}</TableCell>
                    <TableCell>{recurrence.active ? "Sim" : "Não"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
