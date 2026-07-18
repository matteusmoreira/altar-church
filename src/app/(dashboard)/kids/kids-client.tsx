"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Baby, DoorOpen, HeartPulse, Pencil, Plus, Settings2, Trash2, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { EmptyState, MetricCard, PageHeader } from "@/components/shared"
import { usePermission } from "@/lib/permissions"
import {
  deleteKid,
  deleteKidClassroom,
  deleteKidClassroomRule,
  fetchKidHealthDetails,
  saveKid,
  saveKidClassroom,
  saveKidClassroomRule,
  saveKidSettings,
} from "@/lib/kids/actions"
import type {
  KidConsentType,
  KidLabelPaper,
  KidListItem,
  KidRelationship,
  KidsCommunicationData,
  KidsDashboardData,
  KidsReportsData,
  KidsSessionsData,
} from "@/lib/kids/types"
import { KidsSessionsTab } from "./kids-sessions-tab"
import { KidsCommunicationTab } from "./kids-communication-tab"
import { KidsReportsTab } from "./kids-reports-tab"

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

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

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

interface GuardianForm {
  id: string | null
  personId: string | null
  firstName: string
  lastName: string
  email: string
  phone: string
  relationship: KidRelationship
  isPrimary: boolean
  canCheckin: boolean
  canCheckout: boolean
  isEmergencyContact: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
}

interface ChildForm {
  id: string | null
  personId: string | null
  firstName: string
  lastName: string
  birthDate: string
  congregationId: string
  isVisitor: boolean
  notes: string
  consents: KidConsentType[]
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
  guardians: GuardianForm[]
}

const emptyGuardian: GuardianForm = {
  id: null,
  personId: null,
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  relationship: "guardian",
  isPrimary: true,
  canCheckin: true,
  canCheckout: true,
  isEmergencyContact: true,
  whatsappEnabled: true,
  emailEnabled: true,
}

const emptyChildForm: ChildForm = {
  id: null,
  personId: null,
  firstName: "",
  lastName: "",
  birthDate: "",
  congregationId: "",
  isVisitor: false,
  notes: "",
  consents: ["data_processing", "emergency_care"],
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
  guardians: [{ ...emptyGuardian }],
}

interface ClassroomForm {
  id: string | null
  congregationId: string
  name: string
  minAgeMonths: number
  maxAgeMonths: number
  capacity: number
  location: string
  isActive: boolean
}

const emptyClassroomForm: ClassroomForm = {
  id: null,
  congregationId: "",
  name: "",
  minAgeMonths: 0,
  maxAgeMonths: 216,
  capacity: 12,
  location: "",
  isActive: true,
}

interface RuleForm {
  id: string | null
  classroomId: string
  congregationId: string
  weekday: string
  startTime: string
  endTime: string
  minAgeMonths: number
  maxAgeMonths: number
  priority: number
  isActive: boolean
}

interface SettingsForm {
  congregationId: string
  requireCheckoutPin: boolean
  pinRotationMinutes: number
  allowCapacityOverride: boolean
  labelPaper: KidLabelPaper
  labelShowQr: boolean
  autoPrint: boolean
  visitorFormEnabled: boolean
  requiredConsentTypes: KidConsentType[]
}

const defaultSettingsForm: SettingsForm = {
  congregationId: "",
  requireCheckoutPin: true,
  pinRotationMinutes: 30,
  allowCapacityOverride: true,
  labelPaper: "thermal_62x40",
  labelShowQr: true,
  autoPrint: true,
  visitorFormEnabled: true,
  requiredConsentTypes: ["data_processing", "emergency_care"],
}

export function KidsClient({
  data,
  sessionsData,
  communicationData,
  reportsData,
}: {
  data: KidsDashboardData
  sessionsData: KidsSessionsData
  communicationData: KidsCommunicationData | null
  reportsData: KidsReportsData | null
}) {
  const router = useRouter()
  const canManageSettings = usePermission("kids.settings.manage")
  const canManageChildren = usePermission("kids.children.manage")
  const canManageClasses = usePermission("kids.classes.manage")
  const canViewHealth = usePermission("kids.health.view")
  const canCommunicate = usePermission("kids.communicate")
  const canViewReports = usePermission("kids.reports.view")

  const [childForm, setChildForm] = useState<ChildForm>(emptyChildForm)
  const [classroomForm, setClassroomForm] = useState<ClassroomForm>(emptyClassroomForm)
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null)
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(defaultSettingsForm)
  const [deleteChildId, setDeleteChildId] = useState<string | null>(null)
  const [deleteClassroomId, setDeleteClassroomId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        toast.success(success)
        after?.()
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  // -------------------------------------------------------------- crianças
  function startEditChild(child: KidListItem) {
    setChildForm({
      id: child.id,
      personId: child.personId,
      firstName: child.firstName,
      lastName: child.lastName,
      birthDate: child.birthDate ?? "",
      congregationId: child.congregationId ?? "",
      isVisitor: child.isVisitor,
      notes: child.notes,
      consents: child.grantedConsents,
      health: {
        hasAllergy: child.health.hasAllergy,
        hasDietaryRestriction: child.health.hasDietaryRestriction,
        hasMedication: child.health.hasMedication,
        hasSpecialNeeds: child.health.hasSpecialNeeds,
        allergies: "",
        dietaryRestrictions: "",
        medication: "",
        specialNeeds: "",
        instructions: "",
      },
      guardians: child.guardians.map((guardian) => ({
        id: guardian.id,
        personId: guardian.personId,
        firstName: guardian.name.split(" ")[0] ?? guardian.name,
        lastName: guardian.name.split(" ").slice(1).join(" "),
        email: guardian.email ?? "",
        phone: guardian.phone,
        relationship: guardian.relationship,
        isPrimary: guardian.isPrimary,
        canCheckin: guardian.canCheckin,
        canCheckout: guardian.canCheckout,
        isEmergencyContact: guardian.isEmergencyContact,
        whatsappEnabled: guardian.whatsappEnabled,
        emailEnabled: guardian.emailEnabled,
      })),
    })
    if (canViewHealth) {
      void fetchKidHealthDetails(child.id).then((result) => {
        if (!result.ok || !result.details) return
        setChildForm((current) =>
          current.id === child.id
            ? {
                ...current,
                health: {
                  hasAllergy: result.details!.hasAllergy,
                  hasDietaryRestriction: result.details!.hasDietaryRestriction,
                  hasMedication: result.details!.hasMedication,
                  hasSpecialNeeds: result.details!.hasSpecialNeeds,
                  allergies: result.details!.allergies,
                  dietaryRestrictions: result.details!.dietaryRestrictions,
                  medication: result.details!.medication,
                  specialNeeds: result.details!.specialNeeds,
                  instructions: result.details!.instructions,
                },
              }
            : current,
        )
      })
    }
  }

  async function submitChild() {
    await run(
      () =>
        saveKid({
          id: childForm.id,
          personId: childForm.personId,
          firstName: childForm.firstName,
          lastName: childForm.lastName,
          birthDate: childForm.birthDate || null,
          congregationId: childForm.congregationId || null,
          isVisitor: childForm.isVisitor,
          notes: childForm.notes,
          consents: childForm.consents,
          health: childForm.health,
          guardians: childForm.guardians,
        }),
      childForm.id ? "Criança atualizada" : "Criança cadastrada",
      () => setChildForm(emptyChildForm),
    )
  }

  // -------------------------------------------------------------- salas
  async function submitClassroom() {
    await run(
      () =>
        saveKidClassroom({
          id: classroomForm.id,
          congregationId: classroomForm.congregationId || null,
          name: classroomForm.name,
          minAgeMonths: classroomForm.minAgeMonths,
          maxAgeMonths: classroomForm.maxAgeMonths,
          capacity: classroomForm.capacity,
          location: classroomForm.location,
          isActive: classroomForm.isActive,
        }),
      "Sala salva",
      () => setClassroomForm(emptyClassroomForm),
    )
  }

  async function submitRule() {
    if (!ruleForm) return
    await run(
      () =>
        saveKidClassroomRule({
          id: ruleForm.id,
          classroomId: ruleForm.classroomId,
          congregationId: ruleForm.congregationId || null,
          weekday: ruleForm.weekday === "" ? null : Number(ruleForm.weekday),
          startTime: ruleForm.startTime || null,
          endTime: ruleForm.endTime || null,
          minAgeMonths: ruleForm.minAgeMonths,
          maxAgeMonths: ruleForm.maxAgeMonths,
          priority: ruleForm.priority,
          isActive: ruleForm.isActive,
        }),
      "Regra salva",
      () => setRuleForm(null),
    )
  }

  // -------------------------------------------------------------- configurações
  function selectSettingsScope(congregationId: string) {
    const existing = data.settings.find((item) => (item.congregationId ?? "") === congregationId)
    setSettingsForm(
      existing
        ? {
            congregationId,
            requireCheckoutPin: existing.requireCheckoutPin,
            pinRotationMinutes: existing.pinRotationMinutes,
            allowCapacityOverride: existing.allowCapacityOverride,
            labelPaper: existing.labelPaper,
            labelShowQr: existing.labelShowQr,
            autoPrint: existing.autoPrint,
            visitorFormEnabled: existing.visitorFormEnabled,
            requiredConsentTypes: existing.requiredConsentTypes,
          }
        : { ...defaultSettingsForm, congregationId },
    )
  }

  async function submitSettings() {
    await run(
      () =>
        saveKidSettings({
          congregationId: settingsForm.congregationId || null,
          requireCheckoutPin: settingsForm.requireCheckoutPin,
          pinRotationMinutes: settingsForm.pinRotationMinutes,
          allowCapacityOverride: settingsForm.allowCapacityOverride,
          labelPaper: settingsForm.labelPaper,
          labelShowQr: settingsForm.labelShowQr,
          autoPrint: settingsForm.autoPrint,
          visitorFormEnabled: settingsForm.visitorFormEnabled,
          requiredConsentTypes: settingsForm.requiredConsentTypes,
        }),
      "Configurações salvas",
    )
  }

  const deleteChildName = data.children.find((child) => child.id === deleteChildId)?.fullName ?? ""
  const deleteClassroomName = data.classrooms.find((classroom) => classroom.id === deleteClassroomId)?.name ?? ""

  return (
    <div className="space-y-6">
      <PageHeader title="Kids" description="Cadastro infantil, famílias, salas e configurações do ministério." />

      <Tabs defaultValue="visao-geral">
        <TabsList>
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="familias">Famílias</TabsTrigger>
          <TabsTrigger value="salas">Salas</TabsTrigger>
          <TabsTrigger value="sessoes">Sessões</TabsTrigger>
          {canCommunicate && <TabsTrigger value="comunicacao">Comunicação</TabsTrigger>}
          {canViewReports && <TabsTrigger value="relatorios">Relatórios</TabsTrigger>}
          {canManageSettings && <TabsTrigger value="configuracoes">Configurações</TabsTrigger>}
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Crianças" value={data.metrics.totalChildren} icon={Baby} />
            <MetricCard title="Responsáveis" value={data.metrics.totalGuardians} icon={Users} color="bg-info" />
            <MetricCard title="Salas ativas" value={data.metrics.activeClassrooms} icon={DoorOpen} color="bg-success" />
            <MetricCard title="Visitantes" value={data.metrics.visitors} icon={UserPlus} color="bg-warning" />
            <MetricCard title="Alertas de saúde" value={data.metrics.childrenWithHealthAlerts} icon={HeartPulse} color="bg-destructive" />
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle>Crianças cadastradas</CardTitle>
              <CardDescription>Cadastros mais recentes do ministério infantil.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.children.length === 0 && (
                <EmptyState
                  icon={Baby}
                  title="Nenhuma criança cadastrada"
                  description="Comece pela aba Famílias para cadastrar a primeira criança e seus responsáveis."
                />
              )}
              {data.children.slice(0, 8).map((child) => (
                <div key={child.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="font-medium">{child.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ageLabel(child.ageMonths)} · {child.guardians[0]?.name ?? "sem responsável"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {child.isVisitor && <Badge variant="secondary">Visitante</Badge>}
                    {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                    {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                    {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="familias" className="grid gap-6 lg:grid-cols-2">
          {canManageChildren && (
            <Card className="glass h-fit">
              <CardHeader>
                <CardTitle>{childForm.id ? "Editar criança" : "Nova criança"}</CardTitle>
                <CardDescription>Dados essenciais, saúde, consentimentos e responsáveis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="kid-first-name">Nome *</Label>
                    <Input id="kid-first-name" value={childForm.firstName} onChange={(event) => setChildForm({ ...childForm, firstName: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kid-last-name">Sobrenome</Label>
                    <Input id="kid-last-name" value={childForm.lastName} onChange={(event) => setChildForm({ ...childForm, lastName: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kid-birth">Nascimento</Label>
                    <Input id="kid-birth" type="date" value={childForm.birthDate} onChange={(event) => setChildForm({ ...childForm, birthDate: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="kid-congregation">Congregação</Label>
                    <select
                      id="kid-congregation"
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
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={childForm.isVisitor} onChange={(event) => setChildForm({ ...childForm, isVisitor: event.target.checked })} />
                  Criança visitante
                </label>
                <div className="space-y-1">
                  <Label htmlFor="kid-notes">Observações gerais</Label>
                  <Textarea id="kid-notes" rows={2} value={childForm.notes} onChange={(event) => setChildForm({ ...childForm, notes: event.target.value })} />
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
                      {childForm.health.hasAllergy && (
                        <Textarea placeholder="Quais alergias?" rows={1} value={childForm.health.allergies} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, allergies: event.target.value } })} />
                      )}
                      {childForm.health.hasDietaryRestriction && (
                        <Textarea placeholder="Quais restrições alimentares?" rows={1} value={childForm.health.dietaryRestrictions} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, dietaryRestrictions: event.target.value } })} />
                      )}
                      {childForm.health.hasMedication && (
                        <Textarea placeholder="Medicação e instruções de uso" rows={1} value={childForm.health.medication} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, medication: event.target.value } })} />
                      )}
                      {childForm.health.hasSpecialNeeds && (
                        <Textarea placeholder="Necessidades específicas" rows={1} value={childForm.health.specialNeeds} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, specialNeeds: event.target.value } })} />
                      )}
                      <Textarea placeholder="Instruções gerais de cuidado" rows={1} value={childForm.health.instructions} onChange={(event) => setChildForm({ ...childForm, health: { ...childForm.health, instructions: event.target.value } })} />
                      <p className="text-xs text-muted-foreground">Detalhes são cifrados e visíveis apenas para perfis autorizados.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <p className="text-sm font-medium">Consentimentos (versão 1.0)</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CONSENT_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={childForm.consents.includes(type)}
                          onChange={(event) =>
                            setChildForm({
                              ...childForm,
                              consents: event.target.checked
                                ? [...childForm.consents, type]
                                : childForm.consents.filter((item) => item !== type),
                            })
                          }
                        />
                        {CONSENT_LABELS[type]}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Responsáveis</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setChildForm({ ...childForm, guardians: [...childForm.guardians, { ...emptyGuardian, isPrimary: false }] })}
                    >
                      <Plus className="mr-1 h-4 w-4" />Adicionar
                    </Button>
                  </div>
                  {childForm.guardians.map((guardian, index) => (
                    <div key={index} className="space-y-2 rounded-md border border-border/40 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Responsável {index + 1}</p>
                        {childForm.guardians.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setChildForm({ ...childForm, guardians: childForm.guardians.filter((_, i) => i !== index) })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input placeholder="Nome *" value={guardian.firstName} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, firstName: event.target.value } : g)) })} />
                        <Input placeholder="Sobrenome" value={guardian.lastName} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, lastName: event.target.value } : g)) })} />
                        <Input placeholder="Telefone *" value={guardian.phone} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, phone: event.target.value } : g)) })} />
                        <Input placeholder="E-mail" value={guardian.email} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, email: event.target.value } : g)) })} />
                        <select
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          value={guardian.relationship}
                          onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, relationship: event.target.value as KidRelationship } : g)) })}
                        >
                          {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.isPrimary} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, isPrimary: event.target.checked } : g)) })} />
                          Principal
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.canCheckin} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, canCheckin: event.target.checked } : g)) })} />
                          Pode entregar
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.canCheckout} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, canCheckout: event.target.checked } : g)) })} />
                          Pode retirar
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.isEmergencyContact} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, isEmergencyContact: event.target.checked } : g)) })} />
                          Emergência
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.whatsappEnabled} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, whatsappEnabled: event.target.checked } : g)) })} />
                          WhatsApp
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="checkbox" checked={guardian.emailEnabled} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, emailEnabled: event.target.checked } : g)) })} />
                          E-mail
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={submitChild} disabled={pending}>
                    {childForm.id ? "Salvar alterações" : "Cadastrar criança"}
                  </Button>
                  {childForm.id && (
                    <Button type="button" variant="outline" onClick={() => setChildForm(emptyChildForm)}>
                      Cancelar edição
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="glass h-fit">
            <CardHeader>
              <CardTitle>Famílias</CardTitle>
              <CardDescription>{data.children.length} criança(s) cadastrada(s).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.children.length === 0 && (
                <EmptyState icon={Users} title="Nenhuma família" description="Cadastre a primeira criança ao lado." />
              )}
              {data.children.map((child) => (
                <div key={child.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{child.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {ageLabel(child.ageMonths)}
                        {child.congregationName ? ` · ${child.congregationName}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {child.isVisitor && <Badge variant="secondary">Visitante</Badge>}
                      {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                      {child.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                      {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                      {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                      {canManageChildren && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEditChild(child)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteChildId(child.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {child.guardians.map((guardian) => (
                      <Badge key={guardian.id} variant="outline">
                        {guardian.name} · {RELATIONSHIP_LABELS[guardian.relationship]}
                        {guardian.isPrimary ? " · principal" : ""}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Consentimentos: {child.grantedConsents.length > 0 ? child.grantedConsents.map((type) => CONSENT_LABELS[type]).join(", ") : "nenhum"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salas" className="grid gap-6 lg:grid-cols-2">
          {canManageClasses && (
            <Card className="glass h-fit">
              <CardHeader>
                <CardTitle>{classroomForm.id ? "Editar sala" : "Nova sala"}</CardTitle>
                <CardDescription>Faixa etária em meses, capacidade e localização.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="classroom-name">Nome *</Label>
                    <Input id="classroom-name" value={classroomForm.name} onChange={(event) => setClassroomForm({ ...classroomForm, name: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-congregation">Congregação</Label>
                    <select
                      id="classroom-congregation"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={classroomForm.congregationId}
                      onChange={(event) => setClassroomForm({ ...classroomForm, congregationId: event.target.value })}
                    >
                      <option value="">Todas / sede</option>
                      {data.congregations.map((congregation) => (
                        <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-location">Localização</Label>
                    <Input id="classroom-location" value={classroomForm.location} onChange={(event) => setClassroomForm({ ...classroomForm, location: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-min-age">Idade mín. (meses)</Label>
                    <Input id="classroom-min-age" type="number" min={0} value={classroomForm.minAgeMonths} onChange={(event) => setClassroomForm({ ...classroomForm, minAgeMonths: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-max-age">Idade máx. (meses)</Label>
                    <Input id="classroom-max-age" type="number" min={0} value={classroomForm.maxAgeMonths} onChange={(event) => setClassroomForm({ ...classroomForm, maxAgeMonths: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-capacity">Capacidade</Label>
                    <Input id="classroom-capacity" type="number" min={1} value={classroomForm.capacity} onChange={(event) => setClassroomForm({ ...classroomForm, capacity: Number(event.target.value) })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={classroomForm.isActive} onChange={(event) => setClassroomForm({ ...classroomForm, isActive: event.target.checked })} />
                  Sala ativa
                </label>
                <div className="flex gap-2">
                  <Button type="button" onClick={submitClassroom} disabled={pending}>
                    {classroomForm.id ? "Salvar alterações" : "Criar sala"}
                  </Button>
                  {classroomForm.id && (
                    <Button type="button" variant="outline" onClick={() => setClassroomForm(emptyClassroomForm)}>
                      Cancelar edição
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {data.classrooms.length === 0 && (
              <Card className="glass">
                <CardContent className="p-0">
                  <EmptyState icon={DoorOpen} title="Nenhuma sala" description="Crie salas com faixa etária e capacidade para organizar o atendimento." />
                </CardContent>
              </Card>
            )}
            {data.classrooms.map((classroom) => (
              <Card key={classroom.id} className="glass">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{classroom.name}</CardTitle>
                      <CardDescription>
                        {ageLabel(classroom.minAgeMonths)}–{ageLabel(classroom.maxAgeMonths)} · capacidade {classroom.capacity}
                        {classroom.congregationName ? ` · ${classroom.congregationName}` : ""}
                        {classroom.location ? ` · ${classroom.location}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      {!classroom.isActive && <Badge variant="secondary">Inativa</Badge>}
                      {canManageClasses && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setClassroomForm({
                                id: classroom.id,
                                congregationId: classroom.congregationId ?? "",
                                name: classroom.name,
                                minAgeMonths: classroom.minAgeMonths,
                                maxAgeMonths: classroom.maxAgeMonths,
                                capacity: classroom.capacity,
                                location: classroom.location,
                                isActive: classroom.isActive,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteClassroomId(classroom.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Regras de sugestão ({classroom.rules.length})</p>
                    {canManageClasses && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setRuleForm({
                            id: null,
                            classroomId: classroom.id,
                            congregationId: "",
                            weekday: "",
                            startTime: "",
                            endTime: "",
                            minAgeMonths: classroom.minAgeMonths,
                            maxAgeMonths: classroom.maxAgeMonths,
                            priority: 100,
                            isActive: true,
                          })
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />Regra
                      </Button>
                    )}
                  </div>
                  {classroom.rules.map((rule) => (
                    <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 p-2 text-xs">
                      <span>
                        {rule.congregationName ?? "Todas"} · {rule.weekday == null ? "todos os dias" : WEEKDAY_LABELS[rule.weekday]}
                        {rule.startTime ? ` · ${rule.startTime}` : ""}{rule.endTime ? `–${rule.endTime}` : ""}
                        {` · ${ageLabel(rule.minAgeMonths)}–${ageLabel(rule.maxAgeMonths)} · prioridade ${rule.priority}`}
                        {!rule.isActive ? " · inativa" : ""}
                      </span>
                      {canManageClasses && (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setRuleForm({
                                id: rule.id,
                                classroomId: classroom.id,
                                congregationId: rule.congregationId ?? "",
                                weekday: rule.weekday == null ? "" : String(rule.weekday),
                                startTime: rule.startTime ?? "",
                                endTime: rule.endTime ?? "",
                                minAgeMonths: rule.minAgeMonths,
                                maxAgeMonths: rule.maxAgeMonths,
                                priority: rule.priority,
                                isActive: rule.isActive,
                              })
                            }
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => void run(() => deleteKidClassroomRule(rule.id), "Regra removida")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {ruleForm && ruleForm.classroomId === classroom.id && (
                    <div className="space-y-2 rounded-md border border-primary/30 p-3">
                      <p className="text-xs font-medium">{ruleForm.id ? "Editar regra" : "Nova regra"}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={ruleForm.congregationId} onChange={(event) => setRuleForm({ ...ruleForm, congregationId: event.target.value })}>
                          <option value="">Todas as congregações</option>
                          {data.congregations.map((congregation) => (
                            <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
                          ))}
                        </select>
                        <select className="h-8 rounded-md border bg-background px-2 text-xs" value={ruleForm.weekday} onChange={(event) => setRuleForm({ ...ruleForm, weekday: event.target.value })}>
                          <option value="">Todos os dias</option>
                          {WEEKDAY_LABELS.map((label, index) => (
                            <option key={label} value={index}>{label}</option>
                          ))}
                        </select>
                        <Input type="time" className="h-8 text-xs" value={ruleForm.startTime} onChange={(event) => setRuleForm({ ...ruleForm, startTime: event.target.value })} />
                        <Input type="time" className="h-8 text-xs" value={ruleForm.endTime} onChange={(event) => setRuleForm({ ...ruleForm, endTime: event.target.value })} />
                        <Input type="number" className="h-8 text-xs" placeholder="Idade mín. (meses)" value={ruleForm.minAgeMonths} onChange={(event) => setRuleForm({ ...ruleForm, minAgeMonths: Number(event.target.value) })} />
                        <Input type="number" className="h-8 text-xs" placeholder="Idade máx. (meses)" value={ruleForm.maxAgeMonths} onChange={(event) => setRuleForm({ ...ruleForm, maxAgeMonths: Number(event.target.value) })} />
                        <Input type="number" className="h-8 text-xs" placeholder="Prioridade" value={ruleForm.priority} onChange={(event) => setRuleForm({ ...ruleForm, priority: Number(event.target.value) })} />
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={ruleForm.isActive} onChange={(event) => setRuleForm({ ...ruleForm, isActive: event.target.checked })} />
                          Ativa
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={submitRule} disabled={pending}>Salvar regra</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setRuleForm(null)}>Cancelar</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sessoes">
          <KidsSessionsTab data={sessionsData} />
        </TabsContent>

        {canCommunicate && communicationData && (
          <TabsContent value="comunicacao">
            <KidsCommunicationTab data={communicationData} />
          </TabsContent>
        )}

        {canViewReports && reportsData && (
          <TabsContent value="relatorios">
            <KidsReportsTab data={reportsData} />
          </TabsContent>
        )}

        {canManageSettings && (
          <TabsContent value="configuracoes">
            <Card className="glass max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Configurações do Kids</CardTitle>
                <CardDescription>Defina o padrão da empresa ou personalize por congregação.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="settings-scope">Aplicar em</Label>
                  <select
                    id="settings-scope"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={settingsForm.congregationId}
                    onChange={(event) => selectSettingsScope(event.target.value)}
                  >
                    <option value="">Padrão da empresa</option>
                    {data.congregations.map((congregation) => (
                      <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.requireCheckoutPin} onChange={(event) => setSettingsForm({ ...settingsForm, requireCheckoutPin: event.target.checked })} />
                    Exigir PIN no checkout
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.allowCapacityOverride} onChange={(event) => setSettingsForm({ ...settingsForm, allowCapacityOverride: event.target.checked })} />
                    Permitir exceção de capacidade (auditada)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.labelShowQr} onChange={(event) => setSettingsForm({ ...settingsForm, labelShowQr: event.target.checked })} />
                    QR na etiqueta
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.autoPrint} onChange={(event) => setSettingsForm({ ...settingsForm, autoPrint: event.target.checked })} />
                    Impressão automática no check-in
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settingsForm.visitorFormEnabled} onChange={(event) => setSettingsForm({ ...settingsForm, visitorFormEnabled: event.target.checked })} />
                    Cadastro rápido de visitante (link/QR)
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="settings-pin-rotation">Rotação do PIN (minutos)</Label>
                    <Input id="settings-pin-rotation" type="number" min={5} max={240} value={settingsForm.pinRotationMinutes} onChange={(event) => setSettingsForm({ ...settingsForm, pinRotationMinutes: Number(event.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="settings-label-paper">Etiqueta</Label>
                    <select
                      id="settings-label-paper"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={settingsForm.labelPaper}
                      onChange={(event) => setSettingsForm({ ...settingsForm, labelPaper: event.target.value as KidLabelPaper })}
                    >
                      <option value="thermal_62x40">Térmica 62×40 mm</option>
                      <option value="a4">A4 (fallback)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Consentimentos obrigatórios para check-in</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CONSENT_TYPES.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={settingsForm.requiredConsentTypes.includes(type)}
                          onChange={(event) =>
                            setSettingsForm({
                              ...settingsForm,
                              requiredConsentTypes: event.target.checked
                                ? [...settingsForm.requiredConsentTypes, type]
                                : settingsForm.requiredConsentTypes.filter((item) => item !== type),
                            })
                          }
                        />
                        {CONSENT_LABELS[type]}
                      </label>
                    ))}
                  </div>
                </div>

                <Button type="button" onClick={submitSettings} disabled={pending}>Salvar configurações</Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <AlertDialog open={deleteChildId !== null} onOpenChange={(open) => !open && setDeleteChildId(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteChildName}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro da criança e os vínculos de responsáveis serão removidos (exclusão lógica, auditada).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                const id = deleteChildId
                setDeleteChildId(null)
                if (id) void run(() => deleteKid(id), "Criança removida")
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteClassroomId !== null} onOpenChange={(open) => !open && setDeleteClassroomId(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a sala {deleteClassroomName}?</AlertDialogTitle>
            <AlertDialogDescription>
              A sala será removida (exclusão lógica, auditada). O histórico de presenças é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                const id = deleteClassroomId
                setDeleteClassroomId(null)
                if (id) void run(() => deleteKidClassroom(id), "Sala removida")
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
