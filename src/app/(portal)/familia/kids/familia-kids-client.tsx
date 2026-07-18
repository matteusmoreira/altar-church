"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { Baby, Church, LogOut, Pencil, Plus, QrCode, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deleteGuardianContact,
  generateGuardianPickupCode,
  requestGuardianCheckout,
  saveGuardianChild,
  saveGuardianContact,
  signOutFamily,
  updateGuardianConsents,
} from "@/lib/kids/portal-actions"
import type {
  GuardianChildItem,
  GuardianPickupCode,
  GuardianPortalData,
  KidConsentType,
  KidRelationship,
} from "@/lib/kids/types"

const CONSENT_LABELS: Record<KidConsentType, string> = {
  data_processing: "Tratamento de dados",
  image_use: "Uso de imagem",
  emergency_care: "Atendimento emergencial",
  communication: "Comunicação",
}

const CONSENT_TYPES = Object.keys(CONSENT_LABELS) as KidConsentType[]

const RELATIONSHIP_LABELS: Record<KidRelationship, string> = {
  father: "Pai",
  mother: "Mãe",
  guardian: "Responsável",
  grandparent: "Avô/Avó",
  relative: "Parente",
  other: "Outro",
}

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function ageLabel(ageMonths: number | null) {
  if (ageMonths == null) return "—"
  const years = Math.floor(ageMonths / 12)
  const months = ageMonths % 12
  if (years === 0) return `${months}m`
  if (months === 0) return `${years}a`
  return `${years}a ${months}m`
}

function formatTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

interface ChildFormState {
  kidId: string | null
  personId: string | null
  firstName: string
  lastName: string
  birthDate: string
  congregationId: string
  notes: string
  health: {
    hasAllergy: boolean
    hasDietaryRestriction: boolean
    hasMedication: boolean
    hasSpecialNeeds: boolean
    allergies: string
    dietaryRestrictions: string
    medication: string
    specialNeeds: string
    instructions: string
  }
}

const emptyChildForm: ChildFormState = {
  kidId: null,
  personId: null,
  firstName: "",
  lastName: "",
  birthDate: "",
  congregationId: "",
  notes: "",
  health: {
    hasAllergy: false,
    hasDietaryRestriction: false,
    hasMedication: false,
    hasSpecialNeeds: false,
    allergies: "",
    dietaryRestrictions: "",
    medication: "",
    specialNeeds: "",
    instructions: "",
  },
}

interface ContactFormState {
  firstName: string
  lastName: string
  phone: string
  email: string
  relationship: KidRelationship
  canCheckin: boolean
  canCheckout: boolean
  isEmergencyContact: boolean
}

const emptyContactForm: ContactFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  relationship: "relative",
  canCheckin: true,
  canCheckout: false,
  isEmergencyContact: true,
}

export function FamiliaKidsClient({ data }: { data: GuardianPortalData }) {
  const router = useRouter()
  const [childForm, setChildForm] = useState<ChildFormState | null>(null)
  const [contactForm, setContactForm] = useState<{ kidId: string; form: ContactFormState } | null>(null)
  const [pickupCode, setPickupCode] = useState<(GuardianPickupCode & { childName: string }) | null>(null)
  const [pending, setPending] = useState(false)

  async function run<T extends { ok: boolean; error?: string }>(action: () => Promise<T>, success: string, after?: (result: T) => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        if (success) toast.success(success)
        after?.(result)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  function startEditChild(child: GuardianChildItem) {
    setChildForm({
      kidId: child.kidId,
      personId: child.personId,
      firstName: child.firstName,
      lastName: child.lastName,
      birthDate: child.birthDate ?? "",
      congregationId: child.congregationId ?? "",
      notes: child.notes,
      health: { ...child.health, ...child.healthDetails },
    })
  }

  async function submitChild() {
    if (!childForm) return
    await run(
      () =>
        saveGuardianChild({
          id: childForm.kidId,
          personId: childForm.personId,
          firstName: childForm.firstName,
          lastName: childForm.lastName,
          birthDate: childForm.birthDate || null,
          congregationId: childForm.congregationId || null,
          isVisitor: false,
          notes: childForm.notes,
          health: childForm.health,
        }),
      childForm.kidId ? "Cadastro atualizado" : "Criança cadastrada",
      () => setChildForm(null),
    )
  }

  async function toggleConsent(child: GuardianChildItem, type: KidConsentType, granted: boolean) {
    const consents = granted ? [...child.consents, type] : child.consents.filter((item) => item !== type)
    await run(() => updateGuardianConsents({ kidId: child.kidId, consents }), "Consentimentos atualizados")
  }

  async function submitContact() {
    if (!contactForm) return
    await run(
      () =>
        saveGuardianContact({
          kidId: contactForm.kidId,
          contact: {
            id: null,
            personId: null,
            ...contactForm.form,
            isPrimary: false,
            whatsappEnabled: true,
            emailEnabled: true,
          },
        }),
      "Contato salvo",
      () => setContactForm(null),
    )
  }

  async function showPickupCode(child: GuardianChildItem) {
    if (!child.activeAttendance) return
    await run(
      () => generateGuardianPickupCode(child.activeAttendance!.attendanceId),
      "",
      (result) => {
        if (result.pickupCode) {
          setPickupCode({ ...result.pickupCode, childName: child.firstName })
        }
      },
    )
  }

  async function logout() {
    await signOutFamily()
    router.push("/familia/login")
    router.refresh()
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl space-y-6 p-4 pb-16">
      <header className="flex items-center justify-between gap-3 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary">
            <Church className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Portal da Família</h1>
            <p className="text-xs text-muted-foreground">{data.companyName} · {data.guardianName}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} title="Sair">
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      {data.children.length === 0 && !childForm && (
        <Card className="glass">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Baby className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Nenhuma criança vinculada à sua conta ainda. Cadastre abaixo ou fale com a recepção do Kids.
            </p>
          </CardContent>
        </Card>
      )}

      {data.children.map((child) => (
        <Card key={child.kidId} className="glass">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>{child.fullName}</CardTitle>
                <CardDescription>
                  {ageLabel(child.ageMonths)}
                  {child.congregationName ? ` · ${child.congregationName}` : ""}
                  {child.isVisitor ? " · visitante" : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                {child.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditChild(child)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {child.activeAttendance && (
              <div className="mb-4 space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Presente agora · {child.activeAttendance.classroomName}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.activeAttendance.sessionTitle} · entrada {formatTime(child.activeAttendance.checkedInAt)}
                    </p>
                  </div>
                  {child.activeAttendance.status === "checkout_requested" && (
                    <Badge variant="default" className="animate-pulse">Retirada solicitada</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void showPickupCode(child)} disabled={pending}>
                    <QrCode className="mr-1 h-4 w-4" />Código de retirada
                  </Button>
                  {child.activeAttendance.status === "checked_in" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void run(() => requestGuardianCheckout(child.activeAttendance!.attendanceId), "Retirada solicitada. Dirija-se à sala.")}
                    >
                      Solicitar retirada
                    </Button>
                  )}
                </div>
              </div>
            )}

            <Tabs defaultValue="consents">
              <TabsList>
                <TabsTrigger value="consents">Consentimentos</TabsTrigger>
                <TabsTrigger value="autorizadas">Pessoas autorizadas</TabsTrigger>
              </TabsList>
              <TabsContent value="consents" className="space-y-2 pt-3">
                {CONSENT_TYPES.map((type) => (
                  <label key={type} className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm">
                    <span>{CONSENT_LABELS[type]} <span className="text-xs text-muted-foreground">(v1.0)</span></span>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={child.consents.includes(type)}
                      disabled={pending}
                      onChange={(event) => void toggleConsent(child, type, event.target.checked)}
                    />
                  </label>
                ))}
              </TabsContent>
              <TabsContent value="autorizadas" className="space-y-2 pt-3">
                {child.guardians.map((guardian) => (
                  <div key={guardian.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm">
                    <div>
                      <p className="font-medium">{guardian.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {RELATIONSHIP_LABELS[guardian.relationship]}
                        {guardian.isPrimary ? " · principal" : ""}
                        {guardian.canCheckout ? " · pode retirar" : " · não retira"}
                        {guardian.isEmergencyContact ? " · emergência" : ""}
                      </p>
                    </div>
                    {!guardian.isPrimary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void run(() => deleteGuardianContact({ kidId: child.kidId, guardianLinkId: guardian.id }), "Contato removido")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {contactForm?.kidId === child.kidId ? (
                  <div className="space-y-2 rounded-md border border-primary/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="Nome *" value={contactForm.form.firstName} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, firstName: event.target.value } })} />
                      <Input placeholder="Sobrenome" value={contactForm.form.lastName} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, lastName: event.target.value } })} />
                      <Input placeholder="Telefone *" value={contactForm.form.phone} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, phone: event.target.value } })} />
                      <Input placeholder="E-mail" value={contactForm.form.email} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, email: event.target.value } })} />
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={contactForm.form.relationship}
                        onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, relationship: event.target.value as KidRelationship } })}
                      >
                        {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.canCheckin} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, canCheckin: event.target.checked } })} />
                        Pode entregar
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.canCheckout} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, canCheckout: event.target.checked } })} />
                        Pode retirar
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.isEmergencyContact} onChange={(event) => setContactForm({ kidId: child.kidId, form: { ...contactForm.form, isEmergencyContact: event.target.checked } })} />
                        Contato de emergência
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void submitContact()} disabled={pending}>Salvar contato</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setContactForm(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setContactForm({ kidId: child.kidId, form: { ...emptyContactForm } })}>
                    <Plus className="mr-1 h-4 w-4" />Adicionar autorizada
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ))}

      {childForm ? (
        <Card className="glass">
          <CardHeader>
            <CardTitle>{childForm.kidId ? "Editar cadastro" : "Cadastrar criança"}</CardTitle>
            <CardDescription>Dados essenciais e de saúde. Detalhes são cifrados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={childForm.firstName} onChange={(event) => setChildForm({ ...childForm, firstName: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Sobrenome</Label>
                <Input value={childForm.lastName} onChange={(event) => setChildForm({ ...childForm, lastName: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Nascimento</Label>
                <Input type="date" value={childForm.birthDate} onChange={(event) => setChildForm({ ...childForm, birthDate: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Congregação</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={childForm.congregationId}
                  onChange={(event) => setChildForm({ ...childForm, congregationId: event.target.value })}
                >
                  <option value="">Sede / não informada</option>
                  {data.congregations.map((congregation) => (
                    <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações gerais</Label>
              <Textarea rows={2} value={childForm.notes} onChange={(event) => setChildForm({ ...childForm, notes: event.target.value })} />
            </div>
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">Saúde essencial</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={childForm.health.hasAllergy} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, hasAllergy: event.target.checked } })} />
                  Alergia
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={childForm.health.hasDietaryRestriction} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, hasDietaryRestriction: event.target.checked } })} />
                  Restrição alimentar
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={childForm.health.hasMedication} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, hasMedication: event.target.checked } })} />
                  Medicação
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={childForm.health.hasSpecialNeeds} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, hasSpecialNeeds: event.target.checked } })} />
                  Necessidades específicas
                </label>
              </div>
              {(childForm.health.hasAllergy || childForm.health.hasDietaryRestriction || childForm.health.hasMedication || childForm.health.hasSpecialNeeds) && (
                <div className="grid gap-2">
                  {childForm.health.hasAllergy && <Textarea placeholder="Quais alergias?" rows={1} value={childForm.health.allergies} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, allergies: event.target.value } })} />}
                  {childForm.health.hasDietaryRestriction && <Textarea placeholder="Quais restrições?" rows={1} value={childForm.health.dietaryRestrictions} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, dietaryRestrictions: event.target.value } })} />}
                  {childForm.health.hasMedication && <Textarea placeholder="Medicação e instruções" rows={1} value={childForm.health.medication} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, medication: event.target.value } })} />}
                  {childForm.health.hasSpecialNeeds && <Textarea placeholder="Necessidades específicas" rows={1} value={childForm.health.specialNeeds} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, specialNeeds: event.target.value } })} />}
                  <Textarea placeholder="Instruções gerais de cuidado" rows={1} value={childForm.health.instructions} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, instructions: event.target.value } })} />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void submitChild()} disabled={pending || childForm.firstName.trim().length < 2}>
                {childForm.kidId ? "Salvar alterações" : "Cadastrar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setChildForm(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => setChildForm({ ...emptyChildForm })}>
          <UserPlus className="mr-2 h-4 w-4" />Cadastrar outra criança
        </Button>
      )}

      {pickupCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPickupCode(null)}>
          <Card className="w-full max-w-sm glass-strong" onClick={(event) => event.stopPropagation()}>
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2"><ShieldCheck className="h-5 w-5" />Código de retirada</CardTitle>
              <CardDescription>
                {pickupCode.childName} · válido até {formatTime(pickupCode.expiresAt)}. Gerar um novo código invalida os anteriores.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="rounded-xl bg-white p-4">
                <QRCodeSVG value={pickupCode.qrPayload} size={180} level="M" />
              </div>
              <p className="font-mono text-4xl font-bold tracking-[0.3em]">{pickupCode.pin}</p>
              <p className="text-center text-xs text-muted-foreground">
                Apresente o QR ou informe o PIN na recepção para retirar a criança.
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => setPickupCode(null)}>Fechar</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}
