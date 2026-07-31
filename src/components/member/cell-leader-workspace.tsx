"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { BookOpen, Download, Edit, Link2, Plus, Search, Trash2, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { deleteCellStudy } from "@/lib/cells/actions"
import { createCellLeaderPerson, linkCellLeaderPerson, saveLeaderCell, searchCellLeaderPeople } from "@/lib/cells/leader-actions"
import type { CellFormValues, SupervisorSearchState } from "@/components/cells/cell-form-fields"
import { CellFormFields } from "@/components/cells/cell-form-fields"
import type { CellLeaderCell, CellLeaderWorkspaceData, SaveLeaderCellInput } from "@/lib/cells/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

type CellForm = CellFormValues & {
  id: string | null
}

type SearchPerson = { id: string; name: string; phone: string }

const emptyCellForm: CellForm = {
  id: null,
  categoryId: "none",
  congregationId: "none",
  name: "",
  description: "",
  leaderPersonId: "none",
  coordinatorPersonId: "none",
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
  isActive: true,
}

function toCellForm(cell: CellLeaderCell): CellForm {
  return {
    id: cell.id,
    categoryId: cell.categoryId ?? "none",
    congregationId: cell.congregationId ?? "none",
    name: cell.name,
    description: cell.description,
    leaderPersonId: "none",
    coordinatorPersonId: cell.coordinatorPersonId ?? "none",
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
    isActive: true,
  }
}

function cellInput(form: CellForm): SaveLeaderCellInput {
  return {
    id: form.id,
    categoryId: form.categoryId === "none" ? null : form.categoryId,
    congregationId: form.congregationId === "none" ? null : form.congregationId,
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
    coordinatorPersonId: form.coordinatorPersonId === "none" ? null : form.coordinatorPersonId,
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
  const [supervisorSearchQuery, setSupervisorSearchQuery] = useState("")
  const [supervisorSearchResults, setSupervisorSearchResults] = useState<SearchPerson[]>([])
  const [supervisorName, setSupervisorName] = useState("")
  const selectedCell = data.cells.find((cell) => cell.id === selectedCellId) ?? data.cells[0] ?? null
  const selectedParticipants = useMemo(
    () => data.participants.filter((participant) => participant.cellId === selectedCell?.id),
    [data.participants, selectedCell],
  )

  function openCreate() {
    setCellForm(emptyCellForm)
    setSupervisorSearchQuery("")
    setSupervisorSearchResults([])
    setSupervisorName("")
    setCellDialogOpen(true)
  }

  function openEdit(cell: CellLeaderCell) {
    setCellForm(toCellForm(cell))
    setSupervisorSearchQuery("")
    setSupervisorSearchResults([])
    setSupervisorName(cell.coordinatorName ?? "")
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

  function searchSupervisor() {
    if (supervisorSearchQuery.trim().length < 2) {
      toast.error("Digite pelo menos 2 caracteres")
      return
    }
    startTransition(async () => {
      try {
        setSupervisorSearchResults(await searchCellLeaderPeople({ query: supervisorSearchQuery, cellId: cellForm.id }))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível pesquisar supervisores")
      }
    })
  }

  function selectSupervisor(person: SearchPerson) {
    setCellForm((current) => ({ ...current, coordinatorPersonId: person.id }))
    setSupervisorName(person.name)
    setSupervisorSearchResults([])
    setSupervisorSearchQuery("")
  }

  function clearSupervisor() {
    setCellForm((current) => ({ ...current, coordinatorPersonId: "none" }))
    setSupervisorName("")
  }

  const supervisorSearch: SupervisorSearchState = {
    query: supervisorSearchQuery,
    results: supervisorSearchResults,
    selectedName: supervisorName,
    onQueryChange: setSupervisorSearchQuery,
    onSearch: searchSupervisor,
    onSelect: selectSupervisor,
    onClear: clearSupervisor,
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

  function removeStudy(studyId: string, title: string) {
    if (!window.confirm(`Excluir o estudo "${title}"? Ele será removido das células vinculadas.`)) return
    startTransition(async () => {
      const result = await deleteCellStudy(studyId)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir o estudo")
        return
      }
      toast.success("Estudo excluído")
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Estudos</CardTitle>
          <CardDescription>Estudos publicados para as suas células.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.studies.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum estudo publicado para suas células.</p> : data.studies.map((study) => (
            <div key={study.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{study.title}</p>
                  {study.description && <p className="text-sm text-muted-foreground">{study.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button render={<a href={study.fileUrl} target="_blank" rel="noopener noreferrer" />} variant="outline" size="sm"><Download />{study.fileName}</Button>
                  {study.canDelete ? <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => removeStudy(study.id, study.title)}><Trash2 />Excluir</Button> : <span className="self-center text-xs text-muted-foreground">Exclusão somente pela administração</span>}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={submitCell} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{cellForm.id ? "Editar célula" : "Nova célula"}</DialogTitle>
              <DialogDescription>O líder da célula permanece vinculado automaticamente à sua conta.</DialogDescription>
            </DialogHeader>
            <CellFormFields
              form={cellForm}
              onChange={(patch) => setCellForm((current) => ({ ...current, ...patch }))}
              formOptions={{ categories: data.formOptions.categories, congregations: data.formOptions.congregations, people: [] }}
              leaderMode
              pending={isPending}
              supervisorSearch={supervisorSearch}
            />
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
