"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Bell, Cake, ListChecks, Plus, Send, Smartphone, Users } from "lucide-react"
import { mockNotifications, mockNotificationGroups } from "@/lib/mock/data"
import type { Notification, NotificationGroup } from "@/lib/types"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const statusColors = {
  sent: "bg-success/10 text-success border-success/20",
  scheduled: "bg-info/10 text-info border-info/20",
  draft: "bg-muted text-muted-foreground border-border",
}

const statusLabels = {
  sent: "Enviado",
  scheduled: "Agendado",
  draft: "Rascunho",
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [groups, setGroups] = useState<NotificationGroup[]>(mockNotificationGroups)

  const [notifDialogOpen, setNotifDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)

  const [notifForm, setNotifForm] = useState({
    title: "",
    target: "all",
    content: "",
    schedule: "no",
    sendDate: "",
  })

  const [groupForm, setGroupForm] = useState({
    name: "",
    active: "yes",
  })

  const [birthdayActive, setBirthdayActive] = useState(false)

  const resetNotifForm = () => {
    setNotifForm({ title: "", target: "all", content: "", schedule: "no", sendDate: "" })
  }

  const resetGroupForm = () => {
    setGroupForm({ name: "", active: "yes" })
  }

  const handleSaveNotification = () => {
    if (!notifForm.title || !notifForm.content) {
      toast.error("Preencha os campos obrigatórios")
      return
    }

    const newNotif: Notification = {
      id: `notif${Date.now()}`,
      churchId: "c1",
      title: notifForm.title,
      content: notifForm.content,
      method: "push",
      type: notifForm.target === "all" ? "general" : "group",
      targetGroup: notifForm.target === "all" ? "" : notifForm.target,
      scheduledSend: notifForm.schedule === "yes",
      sendDate: notifForm.schedule === "yes" ? notifForm.sendDate : new Date().toISOString().split("T")[0],
      status: notifForm.schedule === "yes" ? "scheduled" : "draft",
      createdAt: new Date().toISOString().split("T")[0],
    }

    setNotifications((prev) => [newNotif, ...prev])
    toast.success("Notificação criada com sucesso!")
    setNotifDialogOpen(false)
    resetNotifForm()
  }

  const handleSaveGroup = () => {
    if (!groupForm.name) {
      toast.error("Preencha o nome do grupo")
      return
    }

    const newGroup: NotificationGroup = {
      id: `ng${Date.now()}`,
      churchId: "c1",
      name: groupForm.name,
      active: groupForm.active === "yes",
      filters: {},
      createdAt: new Date().toISOString().split("T")[0],
      updatedAt: new Date().toISOString().split("T")[0],
    }

    setGroups((prev) => [newGroup, ...prev])
    toast.success("Grupo criado com sucesso!")
    setGroupDialogOpen(false)
    resetGroupForm()
  }

  const handleSaveBirthday = () => {
    toast.success(birthdayActive ? "Envio de aniversário ativado!" : "Envio de aniversário desativado!")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Notificação</h1>
          <p className="text-muted-foreground">Gerencie notificações push e comunicações</p>
        </div>
      </div>

      <Tabs defaultValue="configurar">
        <TabsList>
          <TabsTrigger value="configurar"><Send />Configurar envio</TabsTrigger>
          <TabsTrigger value="gerais"><ListChecks />Envios gerais</TabsTrigger>
          <TabsTrigger value="grupos"><Users />Grupos específicos</TabsTrigger>
          <TabsTrigger value="aniversario"><Cake />Envio de aniversário</TabsTrigger>
        </TabsList>

        <TabsContent value="configurar" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle>Selecione o tipo de comunicação que deseja enviar</CardTitle>
              <CardDescription>Escolha uma das opções abaixo para configurar o envio</CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                className="flex w-full items-center gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => toast.info("Configure o envio de notificação push")}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">NOTIFICAÇÃO PUSH</p>
                  <p className="text-sm text-muted-foreground">Selecione o tipo de comunicação que deseja enviar</p>
                </div>
              </button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gerais" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button
                onClick={() => {
                  resetNotifForm()
                  setNotifDialogOpen(true)
                }}
                className="gradient-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                NOVO
              </Button>
            </div>

            <Card className="glass overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data cadastro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notif) => (
                    <TableRow key={notif.id}>
                      <TableCell>
                        <Badge className={statusColors[notif.status]}>
                          {statusLabels[notif.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{notif.id}</TableCell>
                      <TableCell className="font-medium">{notif.title}</TableCell>
                      <TableCell className="capitalize">{notif.method}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{notif.content}</TableCell>
                      <TableCell className="capitalize">{notif.type}</TableCell>
                      <TableCell>{format(parseISO(notif.createdAt), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">Nenhuma notificação encontrada</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button
                onClick={() => {
                  resetGroupForm()
                  setGroupDialogOpen(true)
                }}
                className="gradient-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                NOVO
              </Button>
            </div>

            <Card className="glass overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data cadastro</TableHead>
                    <TableHead>Última alteração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <Badge variant={group.active ? "default" : "secondary"}>
                          {group.active ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{group.id}</TableCell>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell>{format(parseISO(group.createdAt), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                      <TableCell>{format(parseISO(group.updatedAt), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">Nenhum grupo encontrado</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="aniversario" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle>Envio de aniversário</CardTitle>
              <CardDescription>Configure o envio automático de mensagens de aniversário</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Ativar o envio de mensagem de aniversário?</p>
                  <p className="text-xs text-muted-foreground">
                    Quando ativo, uma mensagem será enviada automaticamente no dia do aniversário
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{birthdayActive ? "Sim" : "Não"}</span>
                  <Switch checked={birthdayActive} onCheckedChange={setBirthdayActive} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveBirthday} className="gradient-primary">
                  SALVAR
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Notificação Push</DialogTitle>
            <DialogDescription>Crie uma nova notificação push para enviar</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Título da notificação *</Label>
              <Input
                value={notifForm.title}
                onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })}
                placeholder="Título da notificação"
              />
            </div>
            <div className="grid gap-2">
              <Label>Destinatários</Label>
              <Select
                value={notifForm.target}
                onValueChange={(v) => v && setNotifForm({ ...notifForm, target: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as pessoas cadastradas</SelectItem>
                  <SelectItem value="group">Grupo específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Adicione as informações que deseja enviar *</Label>
              <Textarea
                value={notifForm.content}
                onChange={(e) => setNotifForm({ ...notifForm, content: e.target.value })}
                placeholder="Conteúdo da notificação..."
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label>Agendar o envio?</Label>
              <Select
                value={notifForm.schedule}
                onValueChange={(v) => v && setNotifForm({ ...notifForm, schedule: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Não</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {notifForm.schedule === "yes" && (
              <div className="grid gap-2">
                <Label>Data de envio</Label>
                <Input
                  type="date"
                  value={notifForm.sendDate}
                  onChange={(e) => setNotifForm({ ...notifForm, sendDate: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNotification} className="gradient-primary">
              Criar notificação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Grupo</DialogTitle>
            <DialogDescription>Crie um novo grupo para envio de notificações</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="Nome do grupo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Ativo *</Label>
              <Select
                value={groupForm.active}
                onValueChange={(v) => v && setGroupForm({ ...groupForm, active: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Filtrar por campos do usuário</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione os campos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Função</SelectItem>
                  <SelectItem value="age_group">Faixa etária</SelectItem>
                  <SelectItem value="marital_status">Estado civil</SelectItem>
                  <SelectItem value="gender">Gênero</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGroup} className="gradient-primary">
              Criar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
