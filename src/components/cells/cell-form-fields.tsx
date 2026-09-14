"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, ImageIcon, Link2, Loader2, MapPin, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { removeCellPhoto, uploadCellPhoto } from "@/lib/cells/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export interface CellFormValues {
  id?: string | null
  companyId?: string | null
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
  latitude?: number | null
  longitude?: number | null
  isAddressPublic?: boolean
  isLeaderWhatsappPublic?: boolean
  cellPhotoUrl?: string | null
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
  const [geoLoading, setGeoLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [showManualUrl, setShowManualUrl] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastCepLookup = useRef("")
  const cepDigits = form.postalCode.replace(/\D/g, "")

  const handlePhotoFile = async (file: File | null) => {
    if (!file) return
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    if (!allowedTypes.includes(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      toast.error("Formato inválido. Use JPEG, PNG ou WebP.")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("A foto deve ter até 15 MB.")
      return
    }

    setPhotoUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (form.id) formData.append("cellId", form.id)
      if (form.companyId) formData.append("companyId", form.companyId)

      const result = await uploadCellPhoto(formData)
      if (result.ok && result.url) {
        onChange({ cellPhotoUrl: result.url })
        toast.success("Foto da célula enviada com sucesso!")
      } else {
        toast.error(result.error || "Erro ao fazer upload da foto")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar foto")
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemovePhoto = async () => {
    if (form.id && form.cellPhotoUrl?.includes("/api/v1/files/")) {
      try {
        await removeCellPhoto(form.id)
      } catch {
        // ignora se falhar remoção remota
      }
    }
    onChange({ cellPhotoUrl: null })
    toast.info("Foto removida")
  }

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

        const patch: Partial<CellFormValues> = {
          postalCode: data.postalCode ?? form.postalCode,
          meetingLocation: data.street ?? form.meetingLocation,
          neighborhood: data.neighborhood ?? form.neighborhood,
          city: data.city ?? form.city,
          state: data.state ?? form.state,
        }

        try {
          const geoQuery = new URLSearchParams({
            street: data.street ?? form.meetingLocation,
            neighborhood: data.neighborhood ?? form.neighborhood,
            city: data.city ?? form.city,
            state: data.state ?? form.state,
            postalCode: data.postalCode ?? form.postalCode,
          })
          const geoRes = await fetch(`/api/geocode?${geoQuery.toString()}`)
          if (geoRes.ok) {
            const geo = await geoRes.json()
            if (geo?.latitude && geo?.longitude) {
              patch.latitude = geo.latitude
              patch.longitude = geo.longitude
            }
          }
        } catch {
          // ignore geocode error
        }

        onChange(patch)
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

  const handleGeocodeManual = async () => {
    setGeoLoading(true)
    try {
      const geoQuery = new URLSearchParams({
        street: form.meetingLocation || "",
        number: form.addressNumber || "",
        neighborhood: form.neighborhood || "",
        city: form.city || "",
        state: form.state || "",
        postalCode: form.postalCode || "",
      })
      const res = await fetch(`/api/geocode?${geoQuery.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (data?.latitude && data?.longitude) {
          onChange({
            latitude: data.latitude,
            longitude: data.longitude,
          })
        }
      }
    } catch {
      // ignore
    } finally {
      setGeoLoading(false)
    }
  }

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
        <Input data-testid="group-time-input" type="time" value={form.meetingTime ? form.meetingTime.slice(0, 5) : ""} onChange={(event) => onChange({ meetingTime: event.target.value })} />
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
      <div className="grid gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 md:col-span-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Localização no Mapa 3D
            </p>
            <p className="text-sm text-muted-foreground">
              Coordenadas geográficas para renderizar a casinha 3D e traçar rotas públicas.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || geoLoading}
            onClick={handleGeocodeManual}
            className="mt-2 sm:mt-0"
          >
            {geoLoading ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Localizando…
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-3.5 w-3.5 text-primary" />
                Detectar Coordenadas
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Latitude</Label>
            <Input
              type="number"
              step="any"
              placeholder="-23.5505"
              value={form.latitude ?? ""}
              onChange={(e) => onChange({ latitude: e.target.value ? parseFloat(e.target.value) : null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Longitude</Label>
            <Input
              type="number"
              step="any"
              placeholder="-46.6333"
              value={form.longitude ?? ""}
              onChange={(e) => onChange({ longitude: e.target.value ? parseFloat(e.target.value) : null })}
            />
          </div>
        </div>

        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Exibir endereço público</span>
              <p className="text-xs text-muted-foreground">
                Se desativado, o número residencial fica oculto no modal público.
              </p>
            </div>
            <Switch
              checked={form.isAddressPublic ?? true}
              onCheckedChange={(checked) => onChange({ isAddressPublic: checked })}
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">Mostrar WhatsApp do líder</span>
              <p className="text-xs text-muted-foreground">Permite contato direto na página pública. Ao ocultar, visitantes ainda podem solicitar uma visita.</p>
            </div>
            <Switch aria-label="Mostrar WhatsApp do líder" checked={form.isLeaderWhatsappPublic ?? true} onCheckedChange={(checked) => onChange({ isLeaderWhatsappPublic: checked })} />
          </label>
        </div>
      </div>

      {/* Bloco de Foto da Célula / Grupo */}
      <div className="grid gap-3 rounded-lg border p-4 md:col-span-2 bg-card/40">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <ImageIcon className="h-4 w-4 text-primary" />
              Foto da Célula / Grupo
            </p>
            <p className="text-sm text-muted-foreground">
              Foto de capa exibida no aplicativo dos membros, na listagem pública e no mapa interativo.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground h-8"
            onClick={() => setShowManualUrl((prev) => !prev)}
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            {showManualUrl ? "Ocultar URL manual" : "Informar URL manual"}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={pending || photoUploading}
          onChange={(e) => void handlePhotoFile(e.target.files?.[0] ?? null)}
        />

        {form.cellPhotoUrl ? (
          <div className="space-y-3">
            <div className="relative group overflow-hidden rounded-xl border bg-muted/30 aspect-video max-h-56 w-full flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.cellPhotoUrl}
                alt="Foto da Célula"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-4">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || photoUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="shadow-md"
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Trocar Foto
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending || photoUploading}
                  onClick={handleRemovePhoto}
                  className="shadow-md"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Remover
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate max-w-md">Foto selecionada para a célula</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || photoUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 text-xs"
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Trocar Foto
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending || photoUploading}
                  onClick={handleRemovePhoto}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remover
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void handlePhotoFile(file)
            }}
            onClick={() => {
              if (!photoUploading && !pending) fileInputRef.current?.click()
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {photoUploading ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-foreground">Enviando foto da célula…</p>
                <p className="text-xs text-muted-foreground">Salvando imagem no servidor com otimização</p>
              </div>
            ) : (
              <>
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Clique para selecionar ou arraste a foto aqui
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Formatos aceitos: JPG, PNG ou WebP (até 15 MB)
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || photoUploading}
                  className="mt-1"
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Escolher arquivo
                </Button>
              </>
            )}
          </div>
        )}

        {showManualUrl && (
          <div className="grid gap-1.5 pt-2 border-t mt-1">
            <Label className="text-xs font-medium text-muted-foreground">URL Externa da Imagem</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://exemplo.com/foto-celula.jpg"
                value={form.cellPhotoUrl ?? ""}
                onChange={(e) => onChange({ cellPhotoUrl: e.target.value || null })}
                className="text-xs"
              />
              {form.cellPhotoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange({ cellPhotoUrl: null })}
                  className="text-xs text-muted-foreground"
                >
                  Limpar
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Você pode colar o link direto de uma imagem hospedada na web se preferir não fazer upload.
            </p>
          </div>
        )}
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
