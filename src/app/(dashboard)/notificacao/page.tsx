import { Bell, Cake, ListChecks, Send, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { saveNotification, saveNotificationGroup } from "@/lib/operational/actions"
import { listNotificationGroups, listNotifications } from "@/lib/operational/data"
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
}

function formatDate(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

export default async function NotificationsPage() {
  const [notifications, groups] = await Promise.all([listNotifications(), listNotificationGroups()])

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
            <form action={saveNotificationForm} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="targetGroup">Destinatários</Label>
                <Select name="type" defaultValue="general">
                  <SelectTrigger id="targetGroup">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Todas as pessoas</SelectItem>
                    <SelectItem value="group">Grupo específico</SelectItem>
                    <SelectItem value="birthday">Aniversariantes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content">Conteúdo *</Label>
                <Textarea id="content" name="content" rows={4} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="sendDate">Data de envio</Label>
                  <Input id="sendDate" name="sendDate" type="date" />
                </div>
                <label className="flex items-end gap-2 text-sm">
                  <input name="scheduledSend" type="checkbox" className="mb-3 h-4 w-4 rounded border-border" />
                  Agendar envio
                </label>
              </div>
              <Button type="submit" className="gradient-primary">
                Criar Notificação
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
              <TableHead>Envio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((notification) => (
              <TableRow key={notification.id}>
                <TableCell>
                  <Badge>{statusLabels[notification.status]}</Badge>
                </TableCell>
                <TableCell className="font-medium">{notification.title}</TableCell>
                <TableCell className="uppercase">{notification.method}</TableCell>
                <TableCell className="max-w-sm truncate">{notification.content}</TableCell>
                <TableCell>{notification.type}</TableCell>
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
