"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CalendarClock,
  Columns3,
  Edit,
  MoreVertical,
  Phone,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { deleteCrmCard, deleteCrmStage, saveCrmCard, saveCrmStage } from "@/lib/operational/actions"
import type { CRMCard, CRMStage, PersonDirectoryOption } from "@/lib/types"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface CrmClientProps {
  stages: CRMStage[]
  cards: CRMCard[]
  people: PersonDirectoryOption[]
}

type CardFormState = {
  id: string | null
  personId: string
  personName: string
  personPhone: string
  personEmail: string
  stageId: string
  source: string
  assignedToName: string
  lastContact: string
  notes: string
}

type StageFormState = {
  id: string | null
  name: string
  color: string
  sortOrder: string
  isDefault: boolean
}

function formatDate(value?: string) {
  if (!value) return ""
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function emptyCardForm(defaultStageId: string): CardFormState {
  return {
    id: null,
    personId: "__manual__",
    personName: "",
    personPhone: "",
    personEmail: "",
    stageId: defaultStageId,
    source: "",
    assignedToName: "",
    lastContact: "",
    notes: "",
  }
}

function emptyStageForm(sortOrder: number): StageFormState {
  return {
    id: null,
    name: "",
    color: "#6366f1",
    sortOrder: String(sortOrder),
    isDefault: false,
  }
}

export function CrmClient({ stages, cards, people }: CrmClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const defaultStageId =
    stages.find((stage) => stage.isDefault)?.id ?? stages[0]?.id ?? ""

  const [cardOpen, setCardOpen] = useState(false)
  const [cardForm, setCardForm] = useState<CardFormState>(() => emptyCardForm(defaultStageId))
  const [stageOpen, setStageOpen] = useState(false)
  const [stageForm, setStageForm] = useState<StageFormState>(() =>
    emptyStageForm((stages[stages.length - 1]?.sortOrder ?? 0) + 10)
  )
  const [deleteStage, setDeleteStage] = useState<CRMStage | null>(null)
  const [reassignStageId, setReassignStageId] = useState("")

  const cardsByStage = useMemo(() => {
    const map = new Map<string, CRMCard[]>()
    for (const stage of stages) map.set(stage.id, [])
    for (const card of cards) {
      const list = map.get(card.stageId)
      if (list) list.push(card)
      else {
        const orphan = map.get("__orphan__") ?? []
        orphan.push(card)
        map.set("__orphan__", orphan)
      }
    }
    return map
  }, [cards, stages])

  const editingCardCreatedAt = cardForm.id
    ? formatDateTime(cards.find((item) => item.id === cardForm.id)?.createdAt)
    : ""

  function openCreateCard(stageId?: string) {
    setCardForm(emptyCardForm(stageId || defaultStageId))
    setCardOpen(true)
  }

  function openEditCard(card: CRMCard) {
    setCardForm({
      id: card.id,
      personId: card.personId || "__manual__",
      personName: card.personName,
      personPhone: card.personPhone,
      personEmail: card.personEmail || "",
      stageId: card.stageId,
      source: card.source,
      assignedToName: card.assignedToName,
      lastContact: card.lastContact || "",
      notes: card.notes || "",
    })
    setCardOpen(true)
  }

  function openCreateStage() {
    setStageForm(emptyStageForm((stages[stages.length - 1]?.sortOrder ?? 0) + 10))
    setStageOpen(true)
  }

  function openEditStage(stage: CRMStage) {
    setStageForm({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      sortOrder: String(stage.sortOrder),
      isDefault: stage.isDefault,
    })
    setStageOpen(true)
  }

  function submitCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData()
    if (cardForm.id) formData.set("id", cardForm.id)
    if (cardForm.personId !== "__manual__") formData.set("personId", cardForm.personId)
    formData.set("personName", cardForm.personName)
    formData.set("personPhone", cardForm.personPhone)
    formData.set("personEmail", cardForm.personEmail)
    formData.set("stageId", cardForm.stageId)
    formData.set("source", cardForm.source)
    formData.set("assignedToName", cardForm.assignedToName)
    formData.set("lastContact", cardForm.lastContact)
    formData.set("notes", cardForm.notes)

    startTransition(async () => {
      const result = await saveCrmCard(formData)
      if (!result.ok) {
        toast.error(result.error || "Não foi possível salvar o card")
        return
      }
      toast.success(cardForm.id ? "Card atualizado" : "Card criado")
      setCardOpen(false)
      router.refresh()
    })
  }

  function submitStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData()
    if (stageForm.id) formData.set("id", stageForm.id)
    formData.set("name", stageForm.name)
    formData.set("color", stageForm.color)
    formData.set("sortOrder", stageForm.sortOrder)
    formData.set("isDefault", stageForm.isDefault ? "true" : "false")

    startTransition(async () => {
      const result = await saveCrmStage(formData)
      if (!result.ok) {
        toast.error(result.error || "Não foi possível salvar a coluna")
        return
      }
      toast.success(stageForm.id ? "Coluna atualizada" : "Coluna criada")
      setStageOpen(false)
      router.refresh()
    })
  }

  function handleDeleteCard(cardId: string) {
    const formData = new FormData()
    formData.set("id", cardId)
    startTransition(async () => {
      const result = await deleteCrmCard(formData)
      if (!result.ok) {
        toast.error(result.error || "Não foi possível excluir")
        return
      }
      toast.success("Card excluído")
      router.refresh()
    })
  }

  function confirmDeleteStage() {
    if (!deleteStage) return
    const formData = new FormData()
    formData.set("id", deleteStage.id)
    if (reassignStageId) formData.set("reassignStageId", reassignStageId)

    startTransition(async () => {
      const result = await deleteCrmStage(formData)
      if (!result.ok) {
        toast.error(result.error || "Não foi possível excluir a coluna")
        return
      }
      toast.success("Coluna excluída")
      setDeleteStage(null)
      setReassignStageId("")
      router.refresh()
    })
  }

  const otherStages = stages.filter((stage) => stage.id !== deleteStage?.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM / Kanban"
        description="Acompanhe o relacionamento e personalize as colunas do funil."
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {cards.length} cards
          </Badge>
          <Button type="button" variant="outline" onClick={openCreateStage}>
            <Columns3 className="mr-2 h-4 w-4" />
            Nova coluna
          </Button>
          <Button type="button" className="gradient-primary" onClick={() => openCreateCard()}>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo card
          </Button>
        </div>
      </PageHeader>

      {stages.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="Nenhuma coluna configurada"
          description="Crie a primeira coluna do Kanban para começar a organizar os contatos."
          action={
            <Button type="button" onClick={openCreateStage}>
              <Plus className="mr-2 h-4 w-4" />
              Criar coluna
            </Button>
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const stageCards = cardsByStage.get(stage.id) ?? []
            return (
              <div
                key={stage.id}
                className="glass flex w-72 shrink-0 flex-col rounded-xl p-3"
                style={{ borderTop: `3px solid ${stage.color}` }}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="truncate font-medium text-sm">{stage.name}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{stageCards.length} cards</span>
                      {stage.isDefault ? (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                          padrão
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" />
                      }
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditStage(stage)}>
                        <Edit className="mr-2 h-3.5 w-3.5" />
                        Editar coluna
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openCreateCard(stage.id)}>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Novo card
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setDeleteStage(stage)
                          setReassignStageId(otherStages[0]?.id ?? "")
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Excluir coluna
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex min-h-48 flex-1 flex-col gap-2">
                  {stageCards.map((card) => (
                    <div key={card.id} className="glass-strong rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => openEditCard(card)}
                        >
                          <span className="font-medium text-sm">{card.personName}</span>
                          {card.personId ? (
                            <p className="text-[11px] text-muted-foreground">cadastro vinculado</p>
                          ) : null}
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" />
                            }
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditCard(card)}>
                              <Edit className="mr-2 h-3.5 w-3.5" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteCard(card.id)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {card.personPhone ? (
                        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {card.personPhone}
                        </div>
                      ) : null}
                      {card.source ? (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" />
                          {card.source}
                        </div>
                      ) : null}
                      {card.createdAt ? (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3 w-3 shrink-0" />
                          {formatDateTime(card.createdAt)}
                        </div>
                      ) : null}
                      {card.assignedToName ? (
                        <p className="mt-1 text-xs text-muted-foreground">{card.assignedToName}</p>
                      ) : null}
                      {card.lastContact ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Último contato: {formatDate(card.lastContact)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                  {stageCards.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">Nenhum card nesta coluna</p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 justify-start text-muted-foreground"
                  onClick={() => openCreateCard(stage.id)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{cardForm.id ? "Editar card" : "Novo card"}</DialogTitle>
            <DialogDescription>
              Vincule a uma pessoa do cadastro ou preencha manualmente.
              {editingCardCreatedAt ? ` Preenchido em ${editingCardCreatedAt}.` : null}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCard} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Pessoa do cadastro</Label>
              <Select
                value={cardForm.personId}
                onValueChange={(value) => {
                  const person = people.find((item) => item.id === value)
                  setCardForm((current) => ({
                    ...current,
                    personId: value || "__manual__",
                    personName: person?.fullName || current.personName,
                    personPhone: person?.phone || current.personPhone,
                    personEmail: person?.email || current.personEmail,
                  }))
                }}
              >
                <SelectTrigger>
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
            <div className="grid gap-2">
              <Label htmlFor="personName">Nome</Label>
              <Input
                id="personName"
                value={cardForm.personName}
                onChange={(event) => setCardForm((current) => ({ ...current, personName: event.target.value }))}
                required={cardForm.personId === "__manual__"}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="personPhone">Telefone</Label>
                <Input
                  id="personPhone"
                  value={cardForm.personPhone}
                  onChange={(event) => setCardForm((current) => ({ ...current, personPhone: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="personEmail">Email</Label>
                <Input
                  id="personEmail"
                  type="email"
                  value={cardForm.personEmail}
                  onChange={(event) => setCardForm((current) => ({ ...current, personEmail: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Coluna</Label>
              <Select
                value={cardForm.stageId}
                onValueChange={(value) => setCardForm((current) => ({ ...current, stageId: value || defaultStageId }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a coluna" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="source">Origem</Label>
                <Input
                  id="source"
                  value={cardForm.source}
                  onChange={(event) => setCardForm((current) => ({ ...current, source: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assignedToName">Responsável</Label>
                <Input
                  id="assignedToName"
                  value={cardForm.assignedToName}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, assignedToName: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastContact">Último contato</Label>
              <Input
                id="lastContact"
                type="date"
                value={cardForm.lastContact}
                onChange={(event) => setCardForm((current) => ({ ...current, lastContact: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                rows={3}
                value={cardForm.notes}
                onChange={(event) => setCardForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCardOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gradient-primary" disabled={pending}>
                {cardForm.id ? "Salvar" : "Criar card"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stageOpen} onOpenChange={setStageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{stageForm.id ? "Editar coluna" : "Nova coluna"}</DialogTitle>
            <DialogDescription>Personalize o funil de relacionamento da sua igreja.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitStage} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="stageName">Nome</Label>
              <Input
                id="stageName"
                value={stageForm.name}
                onChange={(event) => setStageForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex: Visitante"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="stageColor">Cor</Label>
                <div className="flex gap-2">
                  <Input
                    id="stageColor"
                    type="color"
                    className="h-9 w-12 p-1"
                    value={stageForm.color}
                    onChange={(event) => setStageForm((current) => ({ ...current, color: event.target.value }))}
                  />
                  <Input
                    value={stageForm.color}
                    onChange={(event) => setStageForm((current) => ({ ...current, color: event.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">Ordem</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={stageForm.sortOrder}
                  onChange={(event) => setStageForm((current) => ({ ...current, sortOrder: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Coluna padrão</p>
                <p className="text-xs text-muted-foreground">Usada quando nenhum destino é definido.</p>
              </div>
              <Switch
                checked={stageForm.isDefault}
                onCheckedChange={(checked) => setStageForm((current) => ({ ...current, isDefault: checked }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStageOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gradient-primary" disabled={pending}>
                Salvar coluna
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteStage)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteStage(null)
            setReassignStageId("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna “{deleteStage?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {(deleteStage?.cardCount ?? 0) > 0
                ? `Há ${deleteStage?.cardCount} card(s) nesta coluna. Escolha para onde movê-los.`
                : "Esta ação remove a coluna do Kanban."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(deleteStage?.cardCount ?? 0) > 0 ? (
            <div className="grid gap-2">
              <Label>Mover cards para</Label>
              <Select value={reassignStageId} onValueChange={(value) => setReassignStageId(value || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a coluna" />
                </SelectTrigger>
                <SelectContent>
                  {otherStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteStage}
              disabled={pending || ((deleteStage?.cardCount ?? 0) > 0 && !reassignStageId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
