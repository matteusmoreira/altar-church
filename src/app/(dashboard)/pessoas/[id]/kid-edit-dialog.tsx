"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Save, Trash2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CustomFieldInputs } from "@/components/kids/custom-field-inputs"
import { fetchKidForEdit, saveKid, searchGuardianPeople } from "@/lib/kids/actions"
import type { KidConsentType, KidEditData } from "@/lib/kids/types"
import type { PersonLinkedChild } from "@/lib/people/types"

const CONSENT_LABELS: Record<KidConsentType, string> = {
  data_processing: "Tratamento de dados",
  image_use: "Uso de imagem",
  emergency_care: "Atendimento emergencial",
  communication: "Comunicação",
}

const RELATIONSHIP_OPTIONS = [
  { value: "father", label: "Pai" },
  { value: "mother", label: "Mãe" },
  { value: "guardian", label: "Responsável" },
  { value: "grandparent", label: "Avô/Avó" },
  { value: "relative", label: "Parente" },
  { value: "other", label: "Outro" },
] as const

type DialogGuardian = KidEditData["guardians"][number] & { customValues: KidEditData["childCustomValues"] }

export function KidEditDialog({
  child,
  open,
  onOpenChange,
}: {
  child: PersonLinkedChild
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<KidEditData | null>(null)
  const [childCustomValues, setChildCustomValues] = useState<KidEditData["childCustomValues"]>([])
  const [guardians, setGuardians] = useState<DialogGuardian[]>([])
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await fetchKidForEdit(child.kidId)
      if (!result.ok || !result.kid) {
        toast.error(result.error ?? "Não foi possível carregar os dados da criança")
        onOpenChange(false)
        return
      }
      setData(result.kid)
      setChildCustomValues(result.kid.childCustomValues)
      setGuardians(
        result.kid.guardians.map((guardian) => ({
          ...guardian,
          customValues: result.kid!.guardianCustomValues[guardian.personId] ?? [],
        })),
      )
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (next && !data) void load()
    if (!next) setData(null)
    onOpenChange(next)
  }

  async function handleSearch() {
    const query = search.trim()
    if (query.length < 2) return
    setSearching(true)
    try {
      const result = await searchGuardianPeople({ query })
      if (!result.ok || !result.people) {
        toast.error(result.error ?? "Busca falhou")
        return
      }
      const existing = new Set(guardians.map((guardian) => guardian.personId))
      const candidates = result.people.filter((person) => !existing.has(person.id))
      if (candidates.length === 0) {
        toast.info("Nenhuma pessoa nova encontrada com esse termo")
        return
      }
      setGuardians((current) => [
        ...current,
        ...candidates.map((person) => ({
          guardianLinkId: "",
          personId: person.id,
          fullName: person.fullName,
          phone: person.phone,
          email: person.email,
          relationship: "guardian" as const,
          isPrimary: current.length === 0,
          canCheckin: true,
          canCheckout: true,
          isEmergencyContact: true,
          whatsappEnabled: true,
          emailEnabled: true,
          address: { postalCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", country: "" },
          customValues: data?.guardianCustomValues[person.id] ?? [],
        })),
      ])
      setSearch("")
      toast.success(`${candidates.length} responsável(is) vinculado(s) — revise os dados antes de salvar`)
    } finally {
      setSearching(false)
    }
  }

  async function submit() {
    if (!data) return
    if (guardians.length === 0) {
      toast.error("Informe ao menos um responsável")
      return
    }
    setSaving(true)
    try {
      const result = await saveKid({
        id: data.kidId,
        personId: data.personId,
        confirmNewPerson: false,
        fullName: data.fullName,
        birthDate: data.birthDate,
        congregationId: data.congregationId,
        isVisitor: data.isVisitor,
        notes: data.notes,
        health: data.health,
        consents: data.consents,
        customValues: childCustomValues,
        guardians: guardians.map((guardian) => ({
          id: guardian.guardianLinkId || null,
          personId: guardian.personId,
          confirmNewPerson: false,
          fullName: guardian.fullName,
          email: guardian.email,
          phone: guardian.phone,
          relationship: guardian.relationship,
          isPrimary: guardian.isPrimary,
          canCheckin: guardian.canCheckin,
          canCheckout: guardian.canCheckout,
          isEmergencyContact: guardian.isEmergencyContact,
          whatsappEnabled: guardian.whatsappEnabled,
          emailEnabled: guardian.emailEnabled,
          address: guardian.address,
          customValues: guardian.customValues,
        })),
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar")
        return
      }
      toast.success("Criança atualizada com sucesso")
      onOpenChange(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar {child.fullName}</DialogTitle>
          <DialogDescription>
            Dados, saúde, consentimentos e responsáveis — mesma validação do módulo Altar Kids.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados da criança</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-fullName">Nome completo</Label>
                  <Input
                    id="kid-edit-fullName"
                    value={data.fullName}
                    onChange={(event) => setData({ ...data, fullName: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-birthDate">Data de nascimento</Label>
                  <Input
                    id="kid-edit-birthDate"
                    type="date"
                    value={data.birthDate ?? ""}
                    onChange={(event) => setData({ ...data, birthDate: event.target.value || null })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-congregation">Congregação</Label>
                  <select
                    id="kid-edit-congregation"
                    defaultValue={data.congregationId ?? ""}
                    onChange={(event) => setData({ ...data, congregationId: event.target.value || null })}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Sem congregação</option>
                    {data.congregations.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="kid-edit-visitor"
                    type="checkbox"
                    checked={data.isVisitor}
                    onChange={(event) => setData({ ...data, isVisitor: event.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <Label htmlFor="kid-edit-visitor">Visitante</Label>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="kid-edit-notes">Observações</Label>
                <textarea
                  id="kid-edit-notes"
                  rows={2}
                  value={data.notes}
                  onChange={(event) => setData({ ...data, notes: event.target.value })}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <CustomFieldInputs
                definitions={data.customFields}
                target="child"
                surface="internal"
                values={childCustomValues}
                onChange={setChildCustomValues}
                disabled={saving}
              />
            </section>

            <section className="space-y-3 border-t border-border/40 pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saúde</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["hasAllergy", "Alergias"],
                    ["hasDietaryRestriction", "Restrição alimentar"],
                    ["hasMedication", "Medicação"],
                    ["hasSpecialNeeds", "Necessidades especiais"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={data.health[key]}
                      onChange={(event) => setData({ ...data, health: { ...data.health, [key]: event.target.checked } })}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-allergies">Detalhe: alergias</Label>
                  <Input
                    id="kid-edit-allergies"
                    defaultValue={data.health.allergies}
                    onChange={(event) => setData({ ...data, health: { ...data.health, allergies: event.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-diet">Detalhe: restrições alimentares</Label>
                  <Input
                    id="kid-edit-diet"
                    defaultValue={data.health.dietaryRestrictions}
                    onChange={(event) => setData({ ...data, health: { ...data.health, dietaryRestrictions: event.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-medication">Detalhe: medicação</Label>
                  <Input
                    id="kid-edit-medication"
                    defaultValue={data.health.medication}
                    onChange={(event) => setData({ ...data, health: { ...data.health, medication: event.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="kid-edit-special">Detalhe: necessidades especiais</Label>
                  <Input
                    id="kid-edit-special"
                    defaultValue={data.health.specialNeeds}
                    onChange={(event) => setData({ ...data, health: { ...data.health, specialNeeds: event.target.value } })}
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="kid-edit-instructions">Instruções gerais de cuidado</Label>
                  <Input
                    id="kid-edit-instructions"
                    defaultValue={data.health.instructions}
                    onChange={(event) => setData({ ...data, health: { ...data.health, instructions: event.target.value } })}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consentimentos</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(CONSENT_LABELS) as KidConsentType[]).map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={data.consents.includes(type)}
                      onChange={(event) =>
                        setData({
                          ...data,
                          consents: event.target.checked
                            ? [...data.consents, type]
                            : data.consents.filter((item) => item !== type),
                        })
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {CONSENT_LABELS[type]}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t border-border/40 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Responsáveis ({guardians.length})
                </h4>
                <div className="flex gap-2">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void handleSearch()
                      }
                    }}
                    placeholder="Buscar pessoa pelo nome para vincular"
                    className="h-9 w-56"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void handleSearch()} disabled={searching}>
                    {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                    Vincular
                  </Button>
                </div>
              </div>
              {guardians.length === 0 && (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum responsável — salve apenas com ao menos um.
                </p>
              )}
              <div className="space-y-3">
                {guardians.map((guardian, index) => (
                  <div key={guardian.personId} className="rounded-xl border border-border/40 bg-background/50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        value={guardian.fullName}
                        onChange={(event) =>
                          setGuardians((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, fullName: event.target.value } : item)))
                        }
                        className="h-9 font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        title="Remover responsável"
                        onClick={() => setGuardians((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1">
                        <Label className="text-xs">WhatsApp</Label>
                        <Input
                          value={guardian.phone}
                          onChange={(event) =>
                            setGuardians((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, phone: event.target.value } : item)))
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">E-mail</Label>
                        <Input
                          value={guardian.email ?? ""}
                          onChange={(event) =>
                            setGuardians((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, email: event.target.value } : item)))
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Parentesco</Label>
                        <select
                          value={guardian.relationship}
                          onChange={(event) =>
                            setGuardians((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, relationship: event.target.value as DialogGuardian["relationship"] } : item)))
                          }
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {RELATIONSHIP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {(
                          [
                            ["isPrimary", "Principal"],
                            ["canCheckin", "Check-in"],
                            ["canCheckout", "Retirada"],
                            ["isEmergencyContact", "Emergência"],
                            ["whatsappEnabled", "WhatsApp"],
                            ["emailEnabled", "E-mail"],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={guardian[key]}
                              onChange={(event) =>
                                setGuardians((current) =>
                                  current.map((item, itemIndex) => {
                                    if (itemIndex !== index) {
                                      return key === "isPrimary" && event.target.checked ? { ...item, isPrimary: false } : item
                                    }
                                    return { ...item, [key]: event.target.checked }
                                  }),
                                )
                              }
                              className="h-3.5 w-3.5 accent-primary"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <CustomFieldInputs
                      definitions={data.customFields}
                      target="guardian"
                      surface="internal"
                      values={guardian.customValues}
                      onChange={(customValues) =>
                        setGuardians((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, customValues } : item)))
                      }
                      disabled={saving}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={loading || saving || !data}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
