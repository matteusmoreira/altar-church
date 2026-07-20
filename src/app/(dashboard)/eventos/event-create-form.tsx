"use client"

import { FormEvent, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveEvent } from "@/lib/operational/actions"
import type { ChurchEvent } from "@/lib/types"

const typeLabels: Record<ChurchEvent["type"], string> = {
  service: "Culto",
  prayer: "Oração",
  youth: "Jovens",
  children: "Crianças",
  special: "Especial",
  meeting: "Reunião",
}

const statusLabels: Record<ChurchEvent["status"], string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
}

interface EventCreateFormProps {
  canCreate: boolean
  volunteerTemplates: { id: string; name: string }[]
}

export function EventCreateForm({ canCreate, volunteerTemplates }: EventCreateFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        const result = await saveEvent(formData)
        if (!result.ok) {
          toast.error(result.error ?? "Não foi possível criar o evento")
          return
        }

        toast.success("Evento criado com sucesso")
        formRef.current?.reset()
        router.refresh()
      } catch {
        toast.error("Não foi possível criar o evento. Tente novamente.")
      }
    })
  }

  if (!canCreate) {
    return (
      <Card className="glass">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Seu perfil pode consultar eventos, mas não possui permissão para criá-los.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plus className="h-4 w-4 text-primary" />
          Novo Evento
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-6">
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="title">Título *</Label>
            <Input id="title" name="title" placeholder="Culto de domingo" required disabled={isPending} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="type">Tipo</Label>
            <Select name="type" defaultValue="service" disabled={isPending}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue="published" disabled={isPending}>
              <SelectTrigger id="status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="startDate">Início *</Label>
            <Input id="startDate" name="startDate" type="datetime-local" required disabled={isPending} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="endDate">Fim</Label>
            <Input id="endDate" name="endDate" type="datetime-local" disabled={isPending} />
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="location">Local</Label>
            <Input id="location" name="location" placeholder="Templo principal" disabled={isPending} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="maxCapacity">Capacidade</Label>
            <Input id="maxCapacity" name="maxCapacity" type="number" min="0" placeholder="0" disabled={isPending} />
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label htmlFor="onlineLink">Link online</Label>
            <Input id="onlineLink" name="onlineLink" placeholder="https://..." disabled={isPending} />
          </div>
          <div className="flex items-end gap-4">
            <input type="hidden" name="isPublic" value="true" />
            <label className="flex items-center gap-2 text-sm">
              <input name="registrationEnabled" type="checkbox" className="h-4 w-4 rounded border-border" disabled={isPending} />
              Inscrição
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="isOnline" type="checkbox" className="h-4 w-4 rounded border-border" disabled={isPending} />
              Online
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="recurring" type="checkbox" className="h-4 w-4 rounded border-border" disabled={isPending} />
              Recorrente
            </label>
          </div>
          <div className="grid gap-2 lg:col-span-6">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Detalhes do evento" disabled={isPending} />
          </div>
          <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 lg:col-span-6">
            <div>
              <p className="text-sm font-medium">Voluntariado — opcional</p>
              <p className="text-xs text-muted-foreground">
                Aplique modelo de equipes e funções somente quando quiser preparar escala deste evento.
              </p>
            </div>
            <div className="grid max-w-md gap-2">
              <Label htmlFor="volunteerTemplateId">Modelo de escala</Label>
              <Select name="volunteerTemplateId" defaultValue="none" disabled={isPending}>
                <SelectTrigger id="volunteerTemplateId"><SelectValue placeholder="Não aplicar modelo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não aplicar modelo</SelectItem>
                  {volunteerTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="lg:col-span-6">
            <Button type="submit" className="gradient-primary" disabled={isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {isPending ? "Criando..." : "Criar Evento"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
