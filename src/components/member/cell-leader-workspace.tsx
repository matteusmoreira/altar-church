"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { Edit, Link2, Plus, Search, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { createCellLeaderPerson, linkCellLeaderPerson, saveLeaderCell, searchCellLeaderPeople } from "@/lib/cells/leader-actions"
import type { CellLeaderCell, CellLeaderWorkspaceData, SaveLeaderCellInput } from "@/lib/cells/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type CellForm = {
  id: string | null
  name: string
  description: string
  meetingDay: string
  meetingTime: string
  meetingLocation: string
  postalCode: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  maxCapacity: number
  minAge: number | null
  maxAge: number | null
  acceptsRequests: boolean
}

type SearchPerson = { id: string; name: string; phone: string }

const emptyCellForm: CellForm = {
  id: null,
  name: "",
  description: "",
  meetingDay: "",
  meetingTime: "",
  meetingLocation: "",
  postalCode: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  maxCapacity: 0,
  minAge: null,
  maxAge: null,
  acceptsRequests: true,
}

function toCellForm(cell: CellLeaderCell): CellForm {
  return {
    id: cell.id,
    name: cell.name,
    description: cell.description,
    meetingDay: cell.meetingDay,
    meetingTime: cell.meetingTime?.slice(0, 5) ?? "",
    meetingLocation: cell.meetingLocation,
    postalCode: cell.postalCode,
    addressNumber: cell.addressNumber,
    addressComplement: cell.addressComplement,
    neighborhood: cell.neighborhood,
    city: cell.city,
    state: cell.state,
    maxCapacity: cell.maxCapacity,
    minAge: cell.minAge,
    maxAge: cell.maxAge,
    acceptsRequests: cell.acceptsRequests,
  }
}

function cellInput(form: CellForm): SaveLeaderCellInput {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    meetingDay: form.meetingDay,
    meetingTime: form.meetingTime || null,
    meetingLocation: form.meetingLocation,
    postalCode: form.postalCode,
    addressNumber: form.addressNumber,
    addressComplement: form.addressComplement,
    neighborhood: form.neighborhood,
    city: form.city,
    state: form.state,
    maxCapacity: form.maxCapacity,
    minAge: form.minAge,
    maxAge: form.maxAge,
    acceptsRequests: form.acceptsRequests,
  }
}

export function CellLeaderWorkspace({ data }: { data: CellLeaderWorkspaceData }) {
  const [isPending, startTransition] = useTransition()
  const [cellDialogOpen, setCellDialogOpen] = useState(false)
  const [cellForm, setCellForm] = useState<CellForm>(emptyCellForm)
  const [selectedCellId, setSelectedCellId] = useState(data.cells[0]?.id ?? "")
  const [personName, setPersonName] = useState("")
  const [personPhone, setPersonPhone] = useState("")
  const [personEmail, setPersonEmail] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchPerson[]>([])
  const selectedCell = data.cells.find((cell) => cell.id === selectedCellId) ?? data.cells[0] ?? null
  const selectedParticipants = useMemo(
    () => data.participants.filter((participant) => participant.cellId === selectedCell?.id),
    [data.participants, selectedCell],
  )

  function openCreate() {
    setCellForm(emptyCellForm)
    setCellDialogOpen(true)
  }

  function openEdit(cell: CellLeaderCell) {
    setCellForm(toCellForm(cell))
    setCellDialogOpen(true)
  }

  function submitCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveLeaderCell(cellInput(cellForm))
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar a célula")
        return
      }
      toast.success(cellForm.id ? "Célula atualizada" : "Célula criada")
      setCellDialogOpen(false)
      window.location.reload()
    })
  }

  function submitNewPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCell) return toast.error("Selecione uma célula")
    startTransition(async () => {
      const result = await createCellLeaderPerson({
        cellId: selectedCell.id,
        fullName: personName,
        phone: personPhone,
        email: personEmail || null,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível cadastrar pessoa")
        return
      }
      toast.success("Pessoa cadastrada na célula")
      setPersonName("")
      setPersonPhone("")
      setPersonEmail("")
      window.location.reload()
    })
  }

  function searchPeople() {
    if (!selectedCell || searchQuery.trim().length < 2) {
      toast.error("Digite pelo menos 2 caracteres")
      return
    }
    startTransition(async () => {
      try {
        setSearchResults(await searchCellLeaderPeople({ query: searchQuery, cellId: selectedCell.id }))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível pesquisar pessoas")
      }
    })
  }

  function linkPerson(person: SearchPerson) {
    if (!selectedCell) return
    startTransition(async () => {
      const result = await linkCellLeaderPerson({ cellId: selectedCell.id, personId: person.id })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível vincular pessoa")
        return
      }
      toast.success("Pessoa vinculada à célula")
      setSearchResults((current) => current.filter((item) => item.id !== person.id))
      window.location.reload()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Minhas células</h1>
          <p className="text-muted-foreground">Gerencie somente células onde você é líder.</p>
        </div>
        <Button onClick={openCreate} className="gradient-primary"><Plus className="mr-2 h-4 w-4" />Nova célula</Button>
      </div>

      {data.cells.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma célula vinculada. Crie sua primeira célula.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.cells.map((cell) => (
              <Card key={cell.id} className={cell.id === selectedCell?.id ? "border-primary/40" : undefined}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>{cell.name}</CardTitle>
                    <CardDescription>{cell.meetingDay || "Dia não informado"}{cell.meetingTime ? ` · ${cell.meetingTime.slice(0, 5)}` : ""}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(cell)}><Edit className="mr-2 h-4 w-4" />Editar</Button>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Participantes</span>
                  <Badge variant="secondary">{cell.memberCount}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Adicionar pessoas</CardTitle>
              <CardDescription>Crie uma pessoa ou vincule cadastro existente à célula selecionada.</CardDescription>
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={selectedCell?.id ?? ""} onChange={(event) => { setSelectedCellId(event.target.value); setSearchResults([]) }}>
                {data.cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.name}</option>)}
              </select>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={submitNewPerson} className="grid gap-3 md:grid-cols-4">
                <Input placeholder="Nome completo" value={personName} onChange={(event) => setPersonName(event.target.value)} required />
                <Input placeholder="Telefone" value={personPhone} onChange={(event) => setPersonPhone(event.target.value)} />
                <Input type="email" placeholder="E-mail (opcional)" value={personEmail} onChange={(event) => setPersonEmail(event.target.value)} />
                <Button type="submit" disabled={isPending}><Plus className="mr-2 h-4 w-4" />Cadastrar</Button>
              </form>

              <div className="space-y-3">
                <form onSubmit={(event) => { event.preventDefault(); searchPeople() }} className="flex gap-2">
                  <Input placeholder="Buscar pessoa por nome ou telefone" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                  <Button type="submit" variant="outline" disabled={isPending}><Search className="mr-2 h-4 w-4" />Buscar</Button>
                </form>
                {searchResults.map((person) => (
                  <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <div><p className="font-medium">{person.name}</p><p className="text-muted-foreground">{person.phone || "Sem telefone"}</p></div>
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => linkPerson(person)}><Link2 className="mr-2 h-4 w-4" />Vincular</Button>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-semibold"><UsersRound className="h-4 w-4 text-primary" />Pessoas em {selectedCell?.name}</h3>
                {selectedParticipants.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pessoa vinculada.</p> : selectedParticipants.map((person) => (
                  <div key={person.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span className="font-medium">{person.name}</span><span className="text-muted-foreground">{person.phone || "Sem telefone"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={cellDialogOpen} onOpenChange={setCellDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={submitCell} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{cellForm.id ? "Editar célula" : "Nova célula"}</DialogTitle>
              <DialogDescription>O líder da célula permanece vinculado automaticamente à sua conta.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2"><Label>Nome *</Label><Input value={cellForm.name} onChange={(event) => setCellForm({ ...cellForm, name: event.target.value })} required /></div>
              <div className="grid gap-2 sm:col-span-2"><Label>Descrição</Label><Textarea value={cellForm.description} onChange={(event) => setCellForm({ ...cellForm, description: event.target.value })} /></div>
              <div className="grid gap-2"><Label>Dia</Label><Input value={cellForm.meetingDay} onChange={(event) => setCellForm({ ...cellForm, meetingDay: event.target.value })} /></div>
              <div className="grid gap-2"><Label>Horário</Label><Input type="time" value={cellForm.meetingTime} onChange={(event) => setCellForm({ ...cellForm, meetingTime: event.target.value })} /></div>
              <div className="grid gap-2 sm:col-span-2"><Label>Local</Label><Input value={cellForm.meetingLocation} onChange={(event) => setCellForm({ ...cellForm, meetingLocation: event.target.value })} /></div>
              <div className="grid gap-2"><Label>CEP</Label><Input value={cellForm.postalCode} onChange={(event) => setCellForm({ ...cellForm, postalCode: event.target.value })} /></div>
              <div className="grid gap-2"><Label>Número</Label><Input value={cellForm.addressNumber} onChange={(event) => setCellForm({ ...cellForm, addressNumber: event.target.value })} /></div>
              <div className="grid gap-2 sm:col-span-2"><Label>Complemento</Label><Input value={cellForm.addressComplement} onChange={(event) => setCellForm({ ...cellForm, addressComplement: event.target.value })} /></div>
              <div className="grid gap-2"><Label>Bairro</Label><Input value={cellForm.neighborhood} onChange={(event) => setCellForm({ ...cellForm, neighborhood: event.target.value })} /></div>
              <div className="grid gap-2"><Label>Cidade</Label><Input value={cellForm.city} onChange={(event) => setCellForm({ ...cellForm, city: event.target.value })} /></div>
              <div className="grid gap-2"><Label>UF</Label><Input maxLength={2} value={cellForm.state} onChange={(event) => setCellForm({ ...cellForm, state: event.target.value.toUpperCase() })} /></div>
              <div className="grid gap-2"><Label>Capacidade</Label><Input type="number" min={0} value={cellForm.maxCapacity} onChange={(event) => setCellForm({ ...cellForm, maxCapacity: Number(event.target.value) })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCellDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
