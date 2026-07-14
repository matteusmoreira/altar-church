import { ArrowRight, Phone, Plus, Trash2, UserPlus, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { deleteCrmCard, saveCrmCard } from "@/lib/operational/actions"
import { listCrmCards, listPeopleDirectory } from "@/lib/operational/data"
import type { CRMCard } from "@/lib/types"

async function saveCrmCardForm(formData: FormData) {
  "use server"
  await saveCrmCard(formData)
}

async function deleteCrmCardForm(formData: FormData) {
  "use server"
  await deleteCrmCard(formData)
}

const stages: { key: CRMCard["stage"]; label: string }[] = [
  { key: "new", label: "Novo" },
  { key: "contacted", label: "Contactado" },
  { key: "meeting", label: "Reunião" },
  { key: "visiting", label: "Visitando" },
  { key: "member", label: "Membro" },
  { key: "inactive", label: "Inativo" },
]

function formatDate(value?: string) {
  if (!value) return ""
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

export default async function CRMPage() {
  const [cards, people] = await Promise.all([listCrmCards(), listPeopleDirectory()])
  const cardsByStage = new Map<CRMCard["stage"], CRMCard[]>()
  for (const stage of stages) cardsByStage.set(stage.key, [])
  for (const card of cards) cardsByStage.get(card.stage)?.push(card)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">CRM / Kanban</h1>
          <p className="text-muted-foreground">Acompanhamento vinculado ao cadastro de pessoas.</p>
        </div>
        <Badge variant="outline" className="w-fit gap-1">
          <Users className="h-3 w-3" />
          {cards.length} cards
        </Badge>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Novo Card
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveCrmCardForm} className="grid gap-4 lg:grid-cols-6">
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
              <Input id="personName" name="personName" placeholder="Nome da pessoa" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personPhone">Telefone</Label>
              <Input id="personPhone" name="personPhone" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="personEmail">Email</Label>
              <Input id="personEmail" name="personEmail" type="email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="stage">Estágio</Label>
              <Select name="stage" defaultValue="new">
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.key} value={stage.key}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastContact">Último contato</Label>
              <Input id="lastContact" name="lastContact" type="date" />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="source">Origem</Label>
              <Input id="source" name="source" />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="assignedToName">Responsável</Label>
              <Input id="assignedToName" name="assignedToName" />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <div className="lg:col-span-6">
              <Button type="submit" className="gradient-primary">
                <UserPlus className="mr-2 h-4 w-4" />
                Criar Card
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-6">
        {stages.map((stage) => (
          <div key={stage.key} className="glass flex min-h-64 flex-col rounded-xl p-3">
            <div className="mb-3 flex items-center justify-between">
              <Badge>{stage.label}</Badge>
              <span className="text-xs text-muted-foreground">{cardsByStage.get(stage.key)?.length ?? 0}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {(cardsByStage.get(stage.key) ?? []).map((card) => (
                <div key={card.id} className="glass-strong rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-medium text-sm">{card.personName}</span>
                      {card.personId ? (
                        <p className="text-[11px] text-muted-foreground">cadastro vinculado</p>
                      ) : null}
                    </div>
                    <form action={deleteCrmCardForm}>
                      <input type="hidden" name="id" value={card.id} />
                      <Button type="submit" variant="ghost" size="icon" className="h-7 w-7">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </form>
                  </div>
                  {card.personPhone && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {card.personPhone}
                    </div>
                  )}
                  {card.source && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      {card.source}
                    </div>
                  )}
                  {card.assignedToName && <p className="mt-1 text-xs text-muted-foreground">{card.assignedToName}</p>}
                  {card.lastContact && <p className="mt-1 text-xs text-muted-foreground">{formatDate(card.lastContact)}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
