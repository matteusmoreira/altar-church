import { Bell, Cake, ListChecks, Send, Users } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { saveNotification, saveNotificationGroup } from "@/lib/operational/actions"
import { listNotificationAudienceOptions, listNotificationGroups, listNotifications } from "@/lib/operational/data"
import type { Notification } from "@/lib/types"

async function saveNotificationForm(formData: FormData) {
  "use server"
  await saveNotification(formData)
}

async function saveNotificationGroupForm(formData: FormData) {
  "use server"
  await saveNotificationGroup(formData)
}

const statusLabels: Record<Notification["status"], string> = {
  sent: "Enviado",
  scheduled: "Agendado",
  draft: "Rascunho",
  queued: "Na fila",
  processing: "Processando",
  completed: "Concluído",
  failed: "Falhou",
  canceled: "Cancelado",
}

const audienceLabels = {
  all: "Todas as pessoas",
  cell: "Uma célula",
  ministry: "Um ministério",
  visitors: "Visitantes",
  birthdays: "Aniversariantes de hoje",
  manual: "Seleção manual",
}

const methodLabels = { push: "Push", email: "E-mail", whatsapp: "WhatsApp" }

function formatDate(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

export default async function NotificationsPage() {
  const [notifications, groups, audiences] = await Promise.all([
    listNotifications(),
    listNotificationGroups(),
    listNotificationAudienceOptions(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Notificação</h1>
        <p className="text-muted-foreground">Notificações push e grupos de envio persistidos.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" />
              Nova Notificação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveNotificationForm} className="grid gap-4" data-testid="notification-campaign-form">
              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notificationMethod">Canal *</Label>
                <Select name="method" defaultValue="push">
                  <SelectTrigger id="notificationMethod"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notificationAudience">Público *</Label>
                <Select name="audience" defaultValue="all">
                  <SelectTrigger id="notificationAudience"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(audienceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="audienceRefId">Célula/ministério (quando aplicável)</Label>
                <select id="audienceRefId" name="audienceRefId" className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Não se aplica</option>
                  <optgroup label="Células">
                    {audiences.cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.name}</option>)}
                  </optgroup>
                  <optgroup label="Ministérios">
                    {audiences.ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="audiencePersonIds">Seleção manual (Ctrl/Cmd para vários)</Label>
                <select id="audiencePersonIds" name="audiencePersonIds" multiple size={4} className="rounded-md border bg-background px-3 py-2 text-sm">
                  {audiences.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content">Conteúdo *</Label>
                <Textarea id="content" name="content" rows={4} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scheduledAt">Agendar envio (opcional)</Label>
                  <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
                </div>
                <p className="self-end text-xs text-muted-foreground">Sem data, campanha entra na fila agora. Preferências opt-out são respeitadas.</p>
              </div>
              <Button type="submit" className="gradient-primary">
                Criar campanha
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Novo Grupo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveNotificationGroupForm} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="groupName">Nome *</Label>
                <Input id="groupName" name="name" required />
              </div>
              <input type="hidden" name="active" value="true" />
              <Button type="submit" className="gradient-primary">
                Criar Grupo
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="glass overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            Envios Gerais
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Conteúdo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Envio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((notification) => (
              <TableRow key={notification.id}>
                <TableCell>
                  <Badge>{statusLabels[notification.status]}</Badge>
                </TableCell>
                <TableCell className="font-medium"><Link href={`/notificacao/${notification.id}`} className="hover:underline">{notification.title}</Link></TableCell>
                <TableCell>{methodLabels[notification.method as keyof typeof methodLabels] ?? notification.method}</TableCell>
                <TableCell className="max-w-sm truncate">{notification.content}</TableCell>
                <TableCell>{notification.audienceKind ? audienceLabels[notification.audienceKind] : notification.type}</TableCell>
                <TableCell>
                  <span>{notification.deliverySent ?? 0}/{notification.deliveryTotal ?? notification.snapshotCount ?? 0}</span>
                  {((notification.deliveryFailed ?? 0) + (notification.deliveryDead ?? 0)) > 0 && <span className="ml-2 text-xs text-destructive">{(notification.deliveryFailed ?? 0) + (notification.deliveryDead ?? 0)} falha(s)</span>}
                </TableCell>
                <TableCell>{formatDate(notification.sendDate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="glass overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="h-4 w-4 text-primary" />
            Grupos Específicos
          </CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ativo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead>Última alteração</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>
                  <Badge variant={group.active ? "default" : "secondary"}>{group.active ? "Sim" : "Não"}</Badge>
                </TableCell>
                <TableCell className="font-medium">{group.name}</TableCell>
                <TableCell>{formatDate(group.createdAt.slice(0, 10))}</TableCell>
                <TableCell>{formatDate(group.updatedAt.slice(0, 10))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {notifications.length === 0 && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma notificação encontrada</p>
        </div>
      )}
    </div>
  )
}
