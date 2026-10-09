import { Bell, Cake, ListChecks, Send, Users } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NotificationActionForm } from "@/components/notifications/action-form"
import { PushActivation } from "@/components/notifications/push-activation"
import { QueueRefresh } from "@/components/notifications/queue-refresh"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NotificationMessageFields } from "@/components/notifications/message-fields"
import { notificationPlainText } from "@/lib/notifications/content"
import { EmptyState, PageHeader } from "@/components/shared"
import { saveNotification, saveNotificationGroup } from "@/lib/operational/actions"
import { listNotificationAudienceOptions, listNotificationGroups, listNotifications } from "@/lib/operational/data"
import type { Notification } from "@/lib/types"
import { getNotificationPushSummary } from "@/lib/notifications/data"

async function saveNotificationForm(formData: FormData) {
  "use server"
  const result = await saveNotification(formData)
  if (result.ok && result.id) redirect(`/notificacao/${result.slug || result.id}`)
  return result
}

async function saveNotificationGroupForm(formData: FormData) {
  "use server"
  return saveNotificationGroup(formData)
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
  const [notifications, groups, audiences, push] = await Promise.all([
    listNotifications(),
    listNotificationGroups(),
    listNotificationAudienceOptions(),
    getNotificationPushSummary(),
  ])

  return (
    <div className="space-y-6">
      <QueueRefresh enabled={notifications.some((item) => ['queued', 'processing', 'scheduled'].includes(item.status))} />
      <PageHeader title="Notificação" description="Envie avisos por push, e-mail ou WhatsApp e acompanhe cada entrega." />
      <PushActivation />
      <p className="rounded-lg border p-4 text-sm" role="status">
        {!push.configured ? "Push indisponível: a configuração de envio está incompleta."
          : push.devices === 0 ? "Nenhuma pessoa está habilitada para receber campanhas push. Os destinatários precisam ativar os avisos em Preferências de comunicação."
          : `Push disponível para ${push.people} pessoa(s) em ${push.devices} dispositivo(s) ativo(s).`}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4 text-primary" />
              Nova Notificação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationActionForm action={saveNotificationForm} submitLabel="Criar campanha" testId="notification-campaign-form">
              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" name="title" required />
              </div>
              <NotificationMessageFields>
              <div className="grid gap-2">
                <Label htmlFor="notificationAudience">Público *</Label>
                <select id="notificationAudience" name="audience" defaultValue="all" className="h-10 rounded-md border bg-background px-3 text-sm">
                  {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
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
              </NotificationMessageFields>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scheduledAt">Agendar envio (opcional)</Label>
                  <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
                </div>
                <p className="self-end text-xs text-muted-foreground">Horário da igreja. Sem data, o envio começa agora. Preferências de bloqueio são respeitadas.</p>
              </div>
            </NotificationActionForm>
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
            <NotificationActionForm action={saveNotificationGroupForm} submitLabel="Criar Grupo">
              <div className="grid gap-2">
                <Label htmlFor="groupName">Nome *</Label>
                <Input id="groupName" name="name" required />
              </div>
              <input type="hidden" name="active" value="true" />
            </NotificationActionForm>
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
                <TableCell className="font-medium"><Link href={`/notificacao/${notification.slug || notification.id}`} className="hover:underline">{notification.title}</Link></TableCell>
                <TableCell>{methodLabels[notification.method as keyof typeof methodLabels] ?? notification.method}</TableCell>
                <TableCell className="max-w-sm truncate">{notification.method === "push" ? notificationPlainText(notification.content) : notification.content}</TableCell>
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
        <EmptyState icon={Bell} title="Nenhuma notificação encontrada" />
      )}
    </div>
  )
}
