"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export interface CellFormValues {
  categoryId?: string
  congregationId?: string
  name: string
  description: string
  leaderPersonId?: string
  coordinatorPersonId?: string
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
  isActive?: boolean
}

export interface CellFormOptions {
  categories: { id: string; name: string }[]
  congregations: { id: string; name: string }[]
  people: { id: string; fullName: string }[]
}

export interface SupervisorSearchState {
  query: string
  results: { id: string; name: string; phone: string }[]
  selectedName: string
  onQueryChange: (query: string) => void
  onSearch: () => void
  onSelect: (person: { id: string; name: string; phone: string }) => void
  onClear: () => void
}

interface CellFormFieldsProps {
  form: CellFormValues
  onChange: (patch: Partial<CellFormValues>) => void
  formOptions: CellFormOptions
  leaderMode: boolean
  pending?: boolean
  onCreateCategory?: () => void
  supervisorSearch?: SupervisorSearchState
}

const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

function cepMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function CellFormFields({
  form,
  onChange,
  formOptions,
  leaderMode,
  pending = false,
  onCreateCategory,
  supervisorSearch,
}: CellFormFieldsProps) {
  const [cepLookup, setCepLookup] = useState<"idle" | "loading" | "error">("idle")
  const lastCepLookup = useRef("")
  const cepDigits = form.postalCode.replace(/\D/g, "")

  useEffect(() => {
    if (cepDigits.length !== 8 || cepDigits === lastCepLookup.current) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastCepLookup.current = cepDigits
      setCepLookup("loading")
      try {
        const response = await fetch(`/api/cep/${cepDigits}`, { signal: controller.signal })
        const data = await response.json() as { postalCode?: string; street?: string; neighborhood?: string; city?: string; state?: string; error?: string }
        if (!response.ok) throw new Error(data.error)
        onChange({
          postalCode: data.postalCode ?? form.postalCode,
          meetingLocation: data.street ?? form.meetingLocation,
          neighborhood: data.neighborhood ?? form.neighborhood,
          city: data.city ?? form.city,
          state: data.state ?? form.state,
        })
        setCepLookup("idle")
      } catch (error) {
        if ((error as Error).name !== "AbortError") setCepLookup("error")
      }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [cepDigits, form, onChange])

  const categoryId = form.categoryId ?? "none"
  const congregationId = form.congregationId ?? "none"
  const leaderPersonId = form.leaderPersonId ?? "none"
  const coordinatorPersonId = form.coordinatorPersonId ?? "none"
  const categoryLabel = categoryId === "none"
    ? "Sem categoria"
    : formOptions.categories.find((category) => category.id === categoryId)?.name ?? "Sem categoria"
  const congregationLabel = congregationId === "none"
    ? "Sem congregação"
    : formOptions.congregations.find((congregation) => congregation.id === congregationId)?.name ?? "Sem congregação"
  const leaderLabel = leaderPersonId === "none"
    ? "Sem líder"
    : formOptions.people.find((person) => person.id === leaderPersonId)?.fullName ?? "Sem líder"
  const supervisorLabel = coordinatorPersonId === "none"
    ? "Sem supervisor"
    : formOptions.people.find((person) => person.id === coordinatorPersonId)?.fullName ?? "Sem supervisor"

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-2 md:col-span-2">
        <Label>Nome *</Label>
        <Input data-testid="group-name-input" value={form.name} onChange={(event) => onChange({ name: event.target.value })} required />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>Descrição</Label>
        <Textarea data-testid="group-description-input" value={form.description} onChange={(event) => onChange({ description: event.target.value })} rows={3} />
      </div>
      <div className="grid gap-2">
        <Label>Categoria</Label>
        <div className="flex gap-2">
          <Select value={categoryId} onValueChange={(value) => onChange({ categoryId: value ?? "none" })}>
            <SelectTrigger data-testid="group-category-select" className="w-full">
              <SelectValue>{categoryLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem categoria</SelectItem>
              {formOptions.categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {onCreateCategory && <Button type="button" variant="outline" data-testid="group-category-create-button" onClick={onCreateCategory}><Plus className="mr-1 h-4 w-4" />Criar</Button>}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Congregação</Label>
        <Select value={congregationId} onValueChange={(value) => onChange({ congregationId: value ?? "none" })}>
          <SelectTrigger data-testid="group-congregation-select" className="w-full">
            <SelectValue>{congregationLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem congregação</SelectItem>
            {formOptions.congregations.map((congregation) => <SelectItem key={congregation.id} value={congregation.id}>{congregation.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!leaderMode && (
        <div className="grid gap-2">
          <Label>Líder</Label>
          <Select value={leaderPersonId} onValueChange={(value) => onChange({ leaderPersonId: value ?? "none" })}>
            <SelectTrigger data-testid="group-leader-select" className="w-full">
              <SelectValue>{leaderLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem líder</SelectItem>
              {formOptions.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-2">
        <Label>Supervisor</Label>
        {leaderMode && supervisorSearch ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Pesquisar pessoa por nome ou telefone" value={supervisorSearch.query} onChange={(event) => supervisorSearch.onQueryChange(event.target.value)} />
              <Button type="button" variant="outline" disabled={pending} onClick={supervisorSearch.onSearch}><Search className="mr-2 h-4 w-4" />Buscar</Button>
            </div>
            {supervisorSearch.selectedName && (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>{supervisorSearch.selectedName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={supervisorSearch.onClear}><X className="mr-1 h-4 w-4" />Remover</Button>
              </div>
            )}
            {supervisorSearch.results.map((person) => (
              <button type="button" key={person.id} className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => supervisorSearch.onSelect(person)}>
                <span className="font-medium">{person.name}</span>
                <span className="text-muted-foreground">{person.phone || "Sem telefone"}</span>
              </button>
            ))}
          </div>
        ) : (
          <Select value={coordinatorPersonId} onValueChange={(value) => onChange({ coordinatorPersonId: value ?? "none" })}>
            <SelectTrigger data-testid="cell-supervisor-select" className="w-full">
              <SelectValue>{supervisorLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem supervisor</SelectItem>
              {formOptions.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid gap-2">
        <Label>Dia</Label>
        <Select value={form.meetingDay || "none"} onValueChange={(value) => onChange({ meetingDay: value === "none" ? "" : value ?? "" })}>
          <SelectTrigger data-testid="group-day-select" className="w-full">
            <SelectValue>{form.meetingDay || "Sem dia"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem dia</SelectItem>
            {weekDays.map((day) => <SelectItem key={day} value={day}>{day}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Horário</Label>
        <Input data-testid="group-time-input" type="time" value={form.meetingTime} onChange={(event) => onChange({ meetingTime: event.target.value })} />
      </div>
      <div className="grid gap-4 rounded-lg border p-4 md:col-span-2">
        <div>
          <p className="font-medium">Endereço do encontro</p>
          <p className="text-sm text-muted-foreground">Digite o CEP primeiro para preencher o endereço automaticamente.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-6">
          <div className="grid gap-2 md:col-span-2">
            <Label>CEP</Label>
            <Input data-testid="group-postal-code-input" inputMode="numeric" maxLength={9} value={form.postalCode} onChange={(event) => { lastCepLookup.current = ""; setCepLookup("idle"); onChange({ postalCode: cepMask(event.target.value) }) }} placeholder="00000-000" />
            {cepLookup === "loading" && <p className="text-xs text-muted-foreground">Buscando endereço…</p>}
            {cepLookup === "error" && <p className="text-xs text-warning">CEP não encontrado. Preencha manualmente.</p>}
          </div>
          <div className="grid gap-2 md:col-span-4"><Label>Logradouro</Label><Input data-testid="group-location-input" value={form.meetingLocation} onChange={(event) => onChange({ meetingLocation: event.target.value })} placeholder="Rua, avenida…" /></div>
          <div className="grid gap-2 md:col-span-2"><Label>Número</Label><Input data-testid="group-address-number-input" value={form.addressNumber} onChange={(event) => onChange({ addressNumber: event.target.value })} /></div>
          <div className="grid gap-2 md:col-span-4"><Label>Complemento</Label><Input data-testid="group-address-complement-input" value={form.addressComplement} onChange={(event) => onChange({ addressComplement: event.target.value })} /></div>
          <div className="grid gap-2 md:col-span-2"><Label>Bairro</Label><Input data-testid="group-neighborhood-input" value={form.neighborhood} onChange={(event) => onChange({ neighborhood: event.target.value })} /></div>
          <div className="grid gap-2 md:col-span-3"><Label>Cidade</Label><Input data-testid="group-city-input" value={form.city} onChange={(event) => onChange({ city: event.target.value })} /></div>
          <div className="grid gap-2 md:col-span-1"><Label>UF</Label><Input data-testid="group-state-input" maxLength={2} value={form.state} onChange={(event) => onChange({ state: event.target.value.toUpperCase() })} /></div>
        </div>
      </div>
      <div className="grid gap-2"><Label>Capacidade</Label><Input data-testid="group-capacity-input" type="number" min={0} value={form.maxCapacity} onChange={(event) => onChange({ maxCapacity: Number(event.target.value) })} /></div>
      <div className="grid gap-2"><Label>Idade mínima</Label><Input data-testid="group-min-age-input" type="number" min={0} value={form.minAge ?? ""} onChange={(event) => onChange({ minAge: event.target.value ? Number(event.target.value) : null })} /></div>
      <div className="grid gap-2"><Label>Idade máxima</Label><Input data-testid="group-max-age-input" type="number" min={0} value={form.maxAge ?? ""} onChange={(event) => onChange({ maxAge: event.target.value ? Number(event.target.value) : null })} /></div>
      <div className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Aceita solicitações</span><Switch checked={form.acceptsRequests} onCheckedChange={(checked) => onChange({ acceptsRequests: checked })} /></label>
        {!leaderMode && <label className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Ativo</span><Switch checked={form.isActive ?? true} onCheckedChange={(checked) => onChange({ isActive: checked })} /></label>}
      </div>
    </div>
  )
}
