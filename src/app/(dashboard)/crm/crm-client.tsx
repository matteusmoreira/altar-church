"use client"

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarClock,
  Columns3,
  Edit,
  GripVertical,
  MessageCircle,
  MoreVertical,
  MoveRight,
  Phone,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteCrmCard,
  deleteCrmStage,
  moveCrmCardStage,
  saveCrmCard,
  saveCrmStage,
} from "@/lib/operational/actions"
import type { CRMCard, CRMStage, PersonDirectoryOption } from "@/lib/types"
import { cn } from "@/lib/utils"
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
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const [pending, startTransition] = useTransition()
  const defaultStageId =
    stages.find((stage) => stage.isDefault)?.id ?? stages[0]?.id ?? ""

  const [cardsList, setCardsList] = useState<CRMCard[]>(cards)
  const [searchTerm, setSearchTerm] = useState("")
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null)
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null)

  useEffect(() => {
    setCardsList(cards)
  }, [cards])

  const [cardOpen, setCardOpen] = useState(false)
  const [cardForm, setCardForm] = useState<CardFormState>(() => emptyCardForm(defaultStageId))
  const [stageOpen, setStageOpen] = useState(false)
  const [stageForm, setStageForm] = useState<StageFormState>(() =>
    emptyStageForm((stages[stages.length - 1]?.sortOrder ?? 0) + 10)
  )
  const [deleteStage, setDeleteStage] = useState<CRMStage | null>(null)
  const [reassignStageId, setReassignStageId] = useState("")

  const filteredCards = useMemo(() => {
    if (!searchTerm.trim()) return cardsList
    const term = searchTerm.toLowerCase().trim()
    return cardsList.filter((card) => {
      return (
        card.personName.toLowerCase().includes(term) ||
        (card.personPhone && card.personPhone.includes(term)) ||
        (card.personEmail && card.personEmail.toLowerCase().includes(term)) ||
        (card.assignedToName && card.assignedToName.toLowerCase().includes(term)) ||
        (card.source && card.source.toLowerCase().includes(term)) ||
        (card.notes && card.notes.toLowerCase().includes(term))
      )
    })
  }, [cardsList, searchTerm])

  const cardsByStage = useMemo(() => {
    const map = new Map<string, CRMCard[]>()
    for (const stage of stages) map.set(stage.id, [])
    for (const card of filteredCards) {
      const list = map.get(card.stageId)
      if (list) list.push(card)
      else {
        const orphan = map.get("__orphan__") ?? []
        orphan.push(card)
        map.set("__orphan__", orphan)
      }
    }
    return map
  }, [filteredCards, stages])

  const editingCardCreatedAt = cardForm.id
    ? formatDateTime(cardsList.find((item) => item.id === cardForm.id)?.createdAt)
    : ""

  function handleMoveCard(cardId: string, targetStageId: string) {
    const card = cardsList.find((c) => c.id === cardId)
    if (!card || card.stageId === targetStageId) return

    const previousStageId = card.stageId
    const targetStage = stages.find((s) => s.id === targetStageId)

    // Atualização otimista imediata
    setCardsList((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, stageId: targetStageId } : c))
    )

    startTransition(async () => {
      const result = await moveCrmCardStage({ cardId, stageId: targetStageId })
      if (!result.ok) {
        // Rollback se falhar
        setCardsList((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, stageId: previousStageId } : c))
        )
        toast.error(result.error || "Não foi possível mover o card")
        return
      }
      toast.success(`Card movido para "${targetStage?.name ?? "nova coluna"}"`, {
        action: {
          label: "Desfazer",
          onClick: () => handleMoveCard(cardId, previousStageId),
        },
      })
    })
  }

  function handleDragStart(event: React.DragEvent<HTMLDivElement>, cardId: string) {
    event.dataTransfer.setData("text/plain", cardId)
    event.dataTransfer.effectAllowed = "move"
    setDraggedCardId(cardId)
  }

  function handleDragEnd() {
    setDraggedCardId(null)
    setDragOverStageId(null)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, stageId: string) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId)
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>, stageId: string) {
    const related = event.relatedTarget as Node | null
    if (!event.currentTarget.contains(related)) {
      if (dragOverStageId === stageId) {
        setDragOverStageId(null)
      }
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, targetStageId: string) {
    event.preventDefault()
    setDragOverStageId(null)
    const cardId = event.dataTransfer.getData("text/plain") || draggedCardId
    if (cardId) {
      handleMoveCard(cardId, targetStageId)
    }
    setDraggedCardId(null)
  }

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
    })
  }

  function handleDeleteCard(cardId: string) {
    const previous = [...cardsList]
    setCardsList((prev) => prev.filter((c) => c.id !== cardId))

    const formData = new FormData()
    formData.set("id", cardId)
    startTransition(async () => {
      const result = await deleteCrmCard(formData)
      if (!result.ok) {
        setCardsList(previous)
        toast.error(result.error || "Não foi possível excluir")
        return
      }
      toast.success("Card excluído")
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
    })
  }

  const otherStages = stages.filter((stage) => stage.id !== deleteStage?.id)
  const draggedCard = cardsList.find((c) => c.id === draggedCardId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM / Kanban"
        description="Acompanhe o relacionamento e personalize as colunas do funil."
      >
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3" />
            {cardsList.length} cards
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

      {stages.length > 0 ? (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nome, telefone, responsável..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-9 h-9"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted"
                title="Limpar busca"
              >
                ✕
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {searchTerm ? (
              <span>
                {filteredCards.length} de {cardsList.length} card(s) encontrado(s)
              </span>
            ) : (
              <span>Clique e arraste os cards para trocar de coluna</span>
            )}
          </div>
        </div>
      ) : null}

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
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
          {stages.map((stage) => {
            const stageCards = cardsByStage.get(stage.id) ?? []
            const isDragOver =
              dragOverStageId === stage.id && draggedCard?.stageId !== stage.id

            return (
              <div
                key={stage.id}
                onDragOver={(event) => handleDragOver(event, stage.id)}
                onDragLeave={(event) => handleDragLeave(event, stage.id)}
                onDrop={(event) => handleDrop(event, stage.id)}
                className={cn(
                  "glass flex w-76 shrink-0 flex-col rounded-xl p-3 transition-all duration-200 border-t-[3px]",
                  isDragOver
                    ? "ring-2 ring-primary/60 bg-primary/5 shadow-md scale-[1.01]"
                    : "border-border/60"
                )}
                style={{ borderTopColor: stage.color }}
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

                <div className="flex min-h-52 flex-1 flex-col gap-2">
                  {stageCards.map((card) => {
                    const isDragging = draggedCardId === card.id
                    const digits = card.personPhone?.replace(/\D/g, "") ?? ""
                    const cleanWhatsapp = digits.startsWith("55")
                      ? digits
                      : digits.length >= 10
                      ? `55${digits}`
                      : ""

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, card.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "glass-strong group relative rounded-lg p-3 transition-all duration-150 cursor-grab active:cursor-grabbing select-none border border-border/70 hover:border-primary/50 hover:shadow-sm",
                          isDragging &&
                            "opacity-35 scale-95 border-dashed border-primary ring-2 ring-primary/30 bg-muted/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/70 shrink-0 mt-0.5" />
                            <button
                              type="button"
                              className="min-w-0 text-left flex-1"
                              onClick={() => openEditCard(card)}
                            >
                              <span className="font-medium text-sm hover:underline block truncate">
                                {card.personName}
                              </span>
                              {card.personId ? (
                                <p className="text-[11px] text-muted-foreground">cadastro vinculado</p>
                              ) : null}
                            </button>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-70 group-hover:opacity-100"
                                  onClick={(event) => event.stopPropagation()}
                                />
                              }
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditCard(card)}>
                                <Edit className="mr-2 h-3.5 w-3.5" />
                                Editar
                              </DropdownMenuItem>
                              {stages.length > 1 ? (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <MoveRight className="mr-2 h-3.5 w-3.5" />
                                    Mover para
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="w-48">
                                    {stages.map((stg) => {
                                      const isCurrent = stg.id === card.stageId
                                      return (
                                        <DropdownMenuItem
                                          key={stg.id}
                                          disabled={isCurrent}
                                          onClick={() => handleMoveCard(card.id, stg.id)}
                                          className="flex items-center justify-between"
                                        >
                                          <span className="flex items-center gap-2 truncate">
                                            <span
                                              className="h-2 w-2 rounded-full shrink-0"
                                              style={{ backgroundColor: stg.color }}
                                            />
                                            <span className="truncate">{stg.name}</span>
                                          </span>
                                          {isCurrent && (
                                            <span className="text-[10px] text-muted-foreground ml-2">
                                              (atual)
                                            </span>
                                          )}
                                        </DropdownMenuItem>
                                      )
                                    })}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              ) : null}
                              <DropdownMenuSeparator />
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
                          <div className="mt-2 flex items-center justify-between gap-1 text-xs text-muted-foreground">
                            <a
                              href={`tel:${card.personPhone}`}
                              className="flex items-center gap-1 hover:text-foreground transition-colors truncate"
                              onClick={(event) => event.stopPropagation()}
                              title="Ligar"
                            >
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{card.personPhone}</span>
                            </a>
                            {cleanWhatsapp ? (
                              <a
                                href={`https://wa.me/${cleanWhatsapp}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 shrink-0 transition-colors"
                                title="Conversar no WhatsApp"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MessageCircle className="h-3 w-3" />
                                <span>WhatsApp</span>
                              </a>
                            ) : null}
                          </div>
                        ) : null}

                        {card.source ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span className="truncate">{card.source}</span>
                          </div>
                        ) : null}

                        {card.createdAt ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            <span>{formatDateTime(card.createdAt)}</span>
                          </div>
                        ) : null}

                        {card.assignedToName ? (
                          <p className="mt-1 text-xs text-muted-foreground truncate">{card.assignedToName}</p>
                        ) : null}

                        {card.lastContact ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Último contato: {formatDate(card.lastContact)}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}

                  {stageCards.length === 0 ? (
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 px-3 text-center transition-all duration-200",
                        isDragOver
                          ? "border-primary bg-primary/10 text-primary scale-102"
                          : "border-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      <ArrowDownToLine
                        className={cn(
                          "h-5 w-5 mb-1.5 transition-transform",
                          isDragOver ? "animate-bounce text-primary" : "opacity-40"
                        )}
                      />
                      <p className="text-xs font-medium">
                        {isDragOver ? "Solte o card aqui" : "Nenhum card nesta coluna"}
                      </p>
                    </div>
                  ) : null}

                  {isDragOver && stageCards.length > 0 ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/60 bg-primary/10 py-2.5 text-xs font-medium text-primary animate-pulse">
                      <ArrowDownToLine className="h-4 w-4" />
                      Solte aqui para mover
                    </div>
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
