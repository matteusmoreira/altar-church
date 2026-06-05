import { Eye, EyeOff, Megaphone, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { deleteAnnouncement, saveAnnouncement } from "@/lib/operational/actions"
import { listAnnouncements } from "@/lib/operational/data"
import type { Announcement } from "@/lib/types"

async function saveAnnouncementForm(formData: FormData) {
  "use server"
  await saveAnnouncement(formData)
}

async function deleteAnnouncementForm(formData: FormData) {
  "use server"
  await deleteAnnouncement(formData)
}

const priorityLabels: Record<Announcement["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value))
}

export default async function CommunicationPage() {
  const announcements = await listAnnouncements()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Comunicação</h1>
        <p className="text-muted-foreground">Avisos e comunicados persistidos da igreja.</p>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Novo Aviso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveAnnouncementForm} className="grid gap-4 lg:grid-cols-6">
            <div className="grid gap-2 lg:col-span-3">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="priority">Prioridade</Label>
              <Select name="priority" defaultValue="medium">
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="published">Status</Label>
              <Select name="published" defaultValue="draft">
                <SelectTrigger id="published">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 lg:col-span-6">
              <Label htmlFor="content">Conteúdo *</Label>
              <Textarea id="content" name="content" rows={4} required />
            </div>
            <div className="lg:col-span-6">
              <Button type="submit" className="gradient-primary">
                Criar Aviso
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {announcements.map((announcement) => (
          <Card key={announcement.id} className="glass">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{announcement.title}</h2>
                    <Badge>{priorityLabels[announcement.priority]}</Badge>
                    <Badge variant={announcement.published ? "default" : "secondary"}>
                      {announcement.published ? (
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          Publicado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <EyeOff className="h-3 w-3" />
                          Rascunho
                        </span>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{announcement.content}</p>
                  <p className="text-xs text-muted-foreground">
                    Por {announcement.authorName || "Sistema"} em {formatDate(announcement.createdAt)}
                  </p>
                </div>
                <form action={deleteAnnouncementForm}>
                  <input type="hidden" name="id" value={announcement.id} />
                  <Button type="submit" variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {announcements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Megaphone className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhum aviso encontrado</p>
        </div>
      )}
    </div>
  )
}
