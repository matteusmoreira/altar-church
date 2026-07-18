"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Baby, DoorOpen, Eye, Grid2X2, HeartPulse, List, Pencil, Plus, Settings2, Trash2, UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoCapture } from "@/components/kids/photo-capture"
import { AddressFields } from "@/components/kids/address-fields"
import { CustomFieldInputs } from "@/components/kids/custom-field-inputs"
import { CustomFieldBuilder } from "@/components/kids/custom-field-builder"
import { EMPTY_KID_ADDRESS } from "@/lib/kids/form-model"
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState, MetricCard, PageHeader } from "@/components/shared"
import {
  deleteKid,
  deleteKidClassroom,
  deleteKidClassroomRule,
  fetchKidHealthDetails,
  loadKidsCommunicationData,
  loadKidsFamiliesPage,
  loadKidsReportsData,
  loadKidsSessionsData,
  saveKid,
  saveKidClassroom,
  saveKidClassroomRule,
  saveKidSettings,
  searchKidsPeople,
  unlinkKidGuardian,
} from "@/lib/kids/actions"
import { saveKidsPersonPhoto } from "@/lib/kids/photo-actions"
import type {
  KidConsentType,
  KidLabelPaper,
  KidListItem,
  KidPersonSuggestion,
  KidRelationship,
  KidsCommunicationData,
  KidsCapabilities,
  KidsDashboardData,
  KidsReportsData,
  KidsSessionsData,
} from "@/lib/kids/types"
import { KidsSessionsTab } from "./kids-sessions-tab"
import { KidsCommunicationTab } from "./kids-communication-tab"
import { KidsReportsTab } from "./kids-reports-tab"
import { KidsLabelBuilder } from "./kids-label-builder"

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

function formatPhoneMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

interface GuardianForm {
  id: string | null
  personId: string | null
  confirmNewPerson: boolean
  fullName: string
  email: string
  phone: string
  relationship: KidRelationship
  isPrimary: boolean
  canCheckin: boolean
  canCheckout: boolean
  isEmergencyContact: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
  photoUrl: string | null
  photoFile: File | null
  photoRemoved: boolean
  address: import("@/lib/kids/types").KidAddress
  customValues: import("@/lib/kids/types").KidCustomFieldValue[]
}

interface ChildForm {
  id: string | null
  personId: string | null
  confirmNewPerson: boolean
  fullName: string
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
  photoUrl: string | null
  photoFile: File | null
  photoRemoved: boolean
  customValues: import("@/lib/kids/types").KidCustomFieldValue[]
}

const emptyGuardian: GuardianForm = {
  id: null,
  personId: null,
  confirmNewPerson: false,
  fullName: "",
  email: "",
  phone: "",
  relationship: "guardian",
  isPrimary: true,
  canCheckin: true,
  canCheckout: true,
  isEmergencyContact: true,
  whatsappEnabled: true,
  emailEnabled: true,
  photoUrl: null,
  photoFile: null,
  photoRemoved: false,
  address: { ...EMPTY_KID_ADDRESS },
  customValues: [],
}

const emptyChildForm: ChildForm = {
  id: null,
  personId: null,
  confirmNewPerson: false,
  fullName: "",
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
  photoUrl: null,
  photoFile: null,
  photoRemoved: false,
  customValues: [],
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
  ministryId: string
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
  ministryId: "",
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
  capabilities,
  securityStatus,
}: {
  data: KidsDashboardData
  capabilities: KidsCapabilities
  securityStatus: { pinConfigured: boolean; healthConfigured: boolean }
}) {
  const router = useRouter()
  const canManageSettings = capabilities.manageSettings
  const canManageChildren = capabilities.manageChildren
  const canManageGuardians = capabilities.manageGuardians
  const canManageClasses = capabilities.manageClasses
  const canViewHealth = capabilities.viewHealth
  const canCommunicate = capabilities.communicate
  const canViewReports = capabilities.viewReports

  const [childForm, setChildForm] = useState<ChildForm>(emptyChildForm)
  const [classroomForm, setClassroomForm] = useState<ClassroomForm>(emptyClassroomForm)
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null)
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(defaultSettingsForm)
  const [deleteChildId, setDeleteChildId] = useState<string | null>(null)
  const [deleteClassroomId, setDeleteClassroomId] = useState<string | null>(null)
  const [overviewMode, setOverviewMode] = useState<"list" | "grid">("list")
  const [selectedFamily, setSelectedFamily] = useState<KidListItem | null>(null)
  const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null)
  const [selectedHealth, setSelectedHealth] = useState<ChildForm["health"] | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const healthRequestRef = useRef(0)
  const [classroomAgeUnits, setClassroomAgeUnits] = useState<{ min: "months" | "years"; max: "months" | "years" }>({ min: "months", max: "months" })
  const [pending, setPending] = useState(false)
  const [childSuggestions, setChildSuggestions] = useState<KidPersonSuggestion[]>([])
  const [guardianSuggestions, setGuardianSuggestions] = useState<KidPersonSuggestion[]>([])
  const [activeGuardianIndex, setActiveGuardianIndex] = useState<number | null>(null)
  const [sessionsData, setSessionsData] = useState<KidsSessionsData | null>(null)
  const [communicationData, setCommunicationData] = useState<KidsCommunicationData | null>(null)
  const [reportsData, setReportsData] = useState<KidsReportsData | null>(null)
  const [loadingTab, setLoadingTab] = useState<string | null>(null)
  const [familyPageData, setFamilyPageData] = useState<{ children: KidListItem[]; page: number } | null>(null)
  const children = familyPageData?.children ?? data.children
  const familyPage = familyPageData?.page ?? data.familyPage

  async function changeFamilyPage(nextPage: number) {
    setPending(true)
    try {
      const result = await loadKidsFamiliesPage(nextPage)
      if (result.ok && result.children && result.page != null) setFamilyPageData({ children: result.children, page: result.page })
      else toast.error(result.error ?? "Não foi possível carregar famílias")
    } finally {
      setPending(false)
    }
  }

  async function loadTab(value: string) {
    if ((value === "sessoes" && sessionsData) || (value === "comunicacao" && communicationData) || (value === "relatorios" && reportsData)) return
    if (!(["sessoes", "comunicacao", "relatorios"] as string[]).includes(value)) return
    setLoadingTab(value)
    try {
      if (value === "sessoes") {
        const result = await loadKidsSessionsData()
        if (result.ok && result.data) setSessionsData(result.data)
        else toast.error(result.error ?? "Não foi possível carregar sessões")
      } else if (value === "comunicacao") {
        const result = await loadKidsCommunicationData()
        if (result.ok && result.data) setCommunicationData(result.data)
        else toast.error(result.error ?? "Não foi possível carregar comunicação")
      } else {
        const result = await loadKidsReportsData()
        if (result.ok && result.data) setReportsData(result.data)
        else toast.error(result.error ?? "Não foi possível carregar relatórios")
      }
    } finally {
      setLoadingTab(null)
    }
  }

  useEffect(() => {
    const query = childForm.fullName.trim()
    if (childForm.id || childForm.personId || query.length < 3) {
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      void searchKidsPeople({ target: "child", query }).then((result) => {
        if (active) setChildSuggestions(result.people ?? [])
      })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [childForm.fullName, childForm.id, childForm.personId])

  useEffect(() => {
    if (activeGuardianIndex == null) return
    const guardian = childForm.guardians[activeGuardianIndex]
    const query = guardian?.fullName.trim() ?? ""
    if (!guardian || guardian.personId || query.length < 3) return
    let active = true
    const timer = window.setTimeout(() => {
      void searchKidsPeople({ target: "guardian", query }).then((result) => {
        if (active) setGuardianSuggestions(result.people ?? [])
      })
    }, 300)
    return () => { active = false; window.clearTimeout(timer) }
  }, [activeGuardianIndex, childForm.guardians])

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        toast.success(success)
        after?.()
        setFamilyPageData(null)
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
      confirmNewPerson: false,
      fullName: child.fullName,
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
        confirmNewPerson: false,
        fullName: guardian.name,
        email: guardian.email ?? "",
        phone: formatPhoneMask(guardian.phone),
        relationship: guardian.relationship,
        isPrimary: guardian.isPrimary,
        canCheckin: guardian.canCheckin,
        canCheckout: guardian.canCheckout,
        isEmergencyContact: guardian.isEmergencyContact,
        whatsappEnabled: guardian.whatsappEnabled,
        emailEnabled: guardian.emailEnabled,
        photoUrl: guardian.photoUrl,
        photoFile: null,
        photoRemoved: false,
        address: { ...guardian.address },
        customValues: guardian.customValues.filter((value) => data.customFields.some((field) => field.id === value.fieldId && field.isActive && field.targets.includes("guardian") && field.surfaces.includes("internal"))),
      })),
      photoUrl: child.photoUrl,
      photoFile: null,
      photoRemoved: false,
      customValues: child.customValues.filter((value) => data.customFields.some((field) => field.id === value.fieldId && field.isActive && field.targets.includes("child") && field.surfaces.includes("internal"))),
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
    setPending(true)
    try {
      const result = await saveKid({
          id: childForm.id,
          personId: childForm.personId,
          confirmNewPerson: childForm.confirmNewPerson,
          fullName: childForm.fullName,
          birthDate: childForm.birthDate || null,
          congregationId: childForm.congregationId || null,
          isVisitor: childForm.isVisitor,
          notes: childForm.notes,
          consents: childForm.consents,
          health: childForm.health,
          customValues: childForm.customValues,
          guardians: childForm.guardians,
        })
      if (!showResult(result)) return

      const photoJobs: Promise<{ ok: boolean; error?: string }>[] = []
      if (result.personId && (childForm.photoFile || childForm.photoRemoved)) {
        const payload = new FormData()
        payload.set("personId", result.personId)
        payload.set("subject", "child")
        if (childForm.photoFile) payload.set("file", childForm.photoFile)
        if (childForm.photoRemoved && !childForm.photoFile) payload.set("remove", "true")
        photoJobs.push(saveKidsPersonPhoto(payload))
      }
      childForm.guardians.forEach((guardian, index) => {
        const personId = result.guardianPersonIds?.[index]
        if (!personId || (!guardian.photoFile && !guardian.photoRemoved)) return
        const payload = new FormData()
        payload.set("personId", personId)
        payload.set("subject", "guardian")
        if (guardian.photoFile) payload.set("file", guardian.photoFile)
        if (guardian.photoRemoved && !guardian.photoFile) payload.set("remove", "true")
        photoJobs.push(saveKidsPersonPhoto(payload))
      })
      const photoResults = await Promise.all(photoJobs)
      if (photoResults.some((item) => !item.ok)) {
        toast.warning("Cadastro salvo, mas algumas fotos não foram atualizadas.")
      }
      toast.success(childForm.id ? "Criança atualizada" : "Criança cadastrada")
      setChildForm(emptyChildForm)
      setFamilyPageData(null)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  function openFamilyDetails(child: KidListItem) {
    const requestId = ++healthRequestRef.current
    setSelectedFamily(child)
    setSelectedHealth(null)
    setHealthLoading(canViewHealth)
    if (canViewHealth) {
      void fetchKidHealthDetails(child.id).then((result) => {
        if (healthRequestRef.current !== requestId) return
        if (result.ok && result.details) setSelectedHealth({ ...child.health, ...result.details })
      }).catch(() => undefined).finally(() => {
        if (healthRequestRef.current === requestId) setHealthLoading(false)
      })
    }
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
            ministryId: existing.ministryId ?? "",
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
          ministryId: settingsForm.congregationId ? null : settingsForm.ministryId || null,
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

  const deleteChildName = children.find((child) => child.id === deleteChildId)?.fullName ?? ""
  const deleteClassroomName = data.classrooms.find((classroom) => classroom.id === deleteClassroomId)?.name ?? ""

  return (
    <div className="space-y-6">
      <PageHeader title="Kids" description="Cadastro infantil, famílias, salas e configurações do ministério." />

      <Tabs defaultValue="visao-geral" onValueChange={(value) => void loadTab(value)}>
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
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Crianças cadastradas</CardTitle>
                <CardDescription>Cadastros mais recentes do ministério infantil.</CardDescription>
              </div>
              <div className="flex rounded-md border p-1" aria-label="Modo de visualização">
                <Button type="button" variant={overviewMode === "list" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setOverviewMode("list")} aria-label="Ver em lista" title="Lista">
                  <List className="h-4 w-4" />
                </Button>
                <Button type="button" variant={overviewMode === "grid" ? "secondary" : "ghost"} size="icon-sm" onClick={() => setOverviewMode("grid")} aria-label="Ver em grade" title="Grade">
                  <Grid2X2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className={overviewMode === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
              {children.length === 0 && (
                <EmptyState
                  icon={Baby}
                  title="Nenhuma criança cadastrada"
                  description="Comece pela aba Famílias para cadastrar a primeira criança e seus responsáveis."
                />
              )}
              {children.slice(0, 8).map((child) => (
                <div key={child.id} className={`gap-2 rounded-lg border border-border/60 p-3 ${overviewMode === "grid" ? "flex min-h-28 flex-col justify-between" : "flex flex-wrap items-center justify-between"}`}>
                  <div className="flex items-center gap-3">
                    {child.photoUrl ? (
                      <button
                        type="button"
                        className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => setPhotoPreview({ url: child.photoUrl!, name: child.fullName })}
                        aria-label={`Ampliar foto de ${child.fullName}`}
                        title="Ampliar foto"
                      >
                        <Avatar size="lg" className="cursor-zoom-in">
                          <AvatarImage src={child.photoUrl} alt={child.fullName} />
                          <AvatarFallback>{child.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </button>
                    ) : (
                      <Avatar size="lg">
                        <AvatarFallback>{child.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    )}
                    <div>
                      <p className="font-medium">{child.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {ageLabel(child.ageMonths)} · {child.guardians[0]?.name ?? "sem responsável"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {child.isVisitor && <Badge variant="secondary">Visitante</Badge>}
                    {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                    {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                    {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => openFamilyDetails(child)} aria-label={`Ver família de ${child.fullName}`} title="Ver todas as informações da família">
                      <Eye className="h-4 w-4" />
                    </Button>
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
                <div className="flex flex-wrap gap-2 rounded-lg border p-3">
                  <Badge variant={securityStatus.pinConfigured ? "default" : "destructive"}>PIN {securityStatus.pinConfigured ? "configurado" : "não configurado"}</Badge>
                  <Badge variant={securityStatus.healthConfigured ? "default" : "destructive"}>Saúde {securityStatus.healthConfigured ? "configurada" : "não configurada"}</Badge>
                  {(!securityStatus.pinConfigured || !securityStatus.healthConfigured) && <p className="w-full text-xs text-muted-foreground">Configure os segredos no ambiente do servidor. Valores nunca são exibidos aqui.</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="kid-full-name">Nome completo *</Label>
                    <Input id="kid-full-name" value={childForm.fullName} onChange={(event) => { setChildSuggestions([]); setChildForm({ ...childForm, fullName: event.target.value, personId: null, confirmNewPerson: false }) }} />
                    {childSuggestions.length > 0 && (
                      <div className="rounded-md border bg-popover p-1 shadow-md">
                        <p className="px-2 py-1 text-xs text-muted-foreground">Possíveis cadastros existentes</p>
                        {childSuggestions.map((person) => (
                          <button key={person.personId} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => {
                            const existingKid = person.kidId ? children.find((child) => child.id === person.kidId) : null
                            if (existingKid) startEditChild(existingKid)
                            else setChildForm({ ...childForm, personId: person.personId, confirmNewPerson: false, fullName: person.fullName, birthDate: person.birthDate ?? childForm.birthDate })
                            setChildSuggestions([])
                          }}>
                            <span className="font-medium">{person.fullName}</span>{person.birthDate ? ` · ${person.birthDate.split("-").reverse().join("/")}` : ""}{person.kidId ? " · criança já cadastrada" : " · pessoa existente"}
                          </button>
                        ))}
                        <button type="button" className="w-full rounded px-2 py-2 text-left text-xs font-medium text-primary hover:bg-muted" onClick={() => { setChildForm({ ...childForm, confirmNewPerson: true }); setChildSuggestions([]) }}>
                          É outra pessoa com o mesmo nome — cadastrar novo
                        </button>
                      </div>
                    )}
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
                <PhotoCapture
                  label="da criança"
                  currentUrl={childForm.photoUrl}
                  value={childForm.photoFile}
                  removed={childForm.photoRemoved}
                  disabled={pending}
                  onChange={(file, removed = false) => setChildForm({ ...childForm, photoFile: file, photoRemoved: removed })}
                  onError={(message) => toast.error(message)}
                />
                <CustomFieldInputs definitions={data.customFields} target="child" surface="internal" values={childForm.customValues} onChange={(customValues) => setChildForm({ ...childForm, customValues })} disabled={pending} />
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
                        <div className="space-y-1 sm:col-span-2">
                          <Input placeholder="Nome completo *" value={guardian.fullName} onFocus={() => setActiveGuardianIndex(index)} onChange={(event) => { setGuardianSuggestions([]); setActiveGuardianIndex(index); setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, fullName: event.target.value, personId: null, confirmNewPerson: false } : g)) }) }} />
                          {activeGuardianIndex === index && guardianSuggestions.length > 0 && (
                            <div className="rounded-md border bg-popover p-1 shadow-md">
                              {guardianSuggestions.map((person) => (
                                <button key={person.personId} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => {
                                  setChildForm({ ...childForm, guardians: childForm.guardians.map((item, itemIndex) => itemIndex === index ? { ...item, personId: person.personId, confirmNewPerson: false, fullName: person.fullName, phone: formatPhoneMask(person.phone), email: person.email ?? "" } : item) })
                                  setGuardianSuggestions([])
                                }}>
                                  <span className="font-medium">{person.fullName}</span>{person.phone ? ` · ${formatPhoneMask(person.phone)}` : ""}{person.linkedChildren.length ? ` · responsável por ${person.linkedChildren.map((child) => child.fullName).join(", ")}` : ""}
                                </button>
                              ))}
                              <button type="button" className="w-full rounded px-2 py-2 text-left text-xs font-medium text-primary hover:bg-muted" onClick={() => {
                                setChildForm({ ...childForm, guardians: childForm.guardians.map((item, itemIndex) => itemIndex === index ? { ...item, confirmNewPerson: true } : item) })
                                setGuardianSuggestions([])
                              }}>
                                É outra pessoa com o mesmo nome — cadastrar novo
                              </button>
                            </div>
                          )}
                        </div>
                        <Input type="tel" inputMode="tel" maxLength={15} placeholder="Telefone *" value={guardian.phone} onChange={(event) => setChildForm({ ...childForm, guardians: childForm.guardians.map((g, i) => (i === index ? { ...g, phone: formatPhoneMask(event.target.value) } : g)) })} />
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
                      {canManageGuardians && (
                        <PhotoCapture
                          label={`do responsável ${index + 1}`}
                          currentUrl={guardian.photoUrl}
                          value={guardian.photoFile}
                          removed={guardian.photoRemoved}
                          disabled={pending}
                          onChange={(file, removed = false) => setChildForm({
                            ...childForm,
                            guardians: childForm.guardians.map((item, itemIndex) => itemIndex === index ? { ...item, photoFile: file, photoRemoved: removed } : item),
                          })}
                          onError={(message) => toast.error(message)}
                        />
                      )}
                      <AddressFields value={guardian.address} disabled={pending} onChange={(address) => setChildForm({ ...childForm, guardians: childForm.guardians.map((item, itemIndex) => itemIndex === index ? { ...item, address } : item) })} />
                      <CustomFieldInputs definitions={data.customFields} target="guardian" surface="internal" values={guardian.customValues} onChange={(customValues) => setChildForm({ ...childForm, guardians: childForm.guardians.map((item, itemIndex) => itemIndex === index ? { ...item, customValues } : item) })} disabled={pending} />
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
              <CardDescription>{data.metrics.totalChildren} criança(s) cadastrada(s).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {children.length === 0 && (
                <EmptyState icon={Users} title="Nenhuma família" description="Cadastre a primeira criança ao lado." />
              )}
              {children.map((child) => (
                <div key={child.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Avatar size="lg">
                        {child.photoUrl && <AvatarImage src={child.photoUrl} alt={child.fullName} />}
                        <AvatarFallback>{child.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{child.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {ageLabel(child.ageMonths)}
                          {child.congregationName ? ` · ${child.congregationName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {child.isVisitor && <Badge variant="secondary">Visitante</Badge>}
                      {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                      {child.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                      {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                      {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                      {canManageChildren && (
                        <>
                          <Button type="button" variant="outline" size="sm" onClick={() => startEditChild(child)}>
                            <Pencil className="mr-1 h-4 w-4" />Editar
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setDeleteChildId(child.id)}>
                            <Trash2 className="mr-1 h-4 w-4" />Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {child.guardians.map((guardian) => (
                      <div key={guardian.id} className="flex items-center gap-1 rounded-md border px-2 py-1">
                        <span className="text-xs">{guardian.name} · {RELATIONSHIP_LABELS[guardian.relationship]}{guardian.isPrimary ? " · principal" : ""}</span>
                        {canManageGuardians && <Button type="button" variant="ghost" size="sm" onClick={() => startEditChild(child)}>Editar responsável</Button>}
                        {canManageGuardians && child.guardians.length > 1 && <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => {
                          if (window.confirm(`Desvincular ${guardian.name} somente de ${child.fullName}?`)) void run(() => unlinkKidGuardian({ kidId: child.id, guardianPersonId: guardian.personId }), "Responsável desvinculado")
                        }}>Desvincular</Button>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Consentimentos: {child.grantedConsents.length > 0 ? child.grantedConsents.map((type) => CONSENT_LABELS[type]).join(", ") : "nenhum"}
                  </p>
                </div>
              ))}
              {data.metrics.totalChildren > data.familyPageSize && (
                <div className="flex items-center justify-between pt-2">
                  <Button type="button" variant="outline" size="sm" disabled={pending || familyPage === 0} onClick={() => void changeFamilyPage(familyPage - 1)}>Anterior</Button>
                  <span className="text-xs text-muted-foreground">Página {familyPage + 1}</span>
                  <Button type="button" variant="outline" size="sm" disabled={pending || (familyPage + 1) * data.familyPageSize >= data.metrics.totalChildren} onClick={() => void changeFamilyPage(familyPage + 1)}>Próxima</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salas" className="grid gap-6 lg:grid-cols-2">
          {canManageClasses && (
            <Card className="glass h-fit">
              <CardHeader>
                <CardTitle>{classroomForm.id ? "Editar sala" : "Nova sala"}</CardTitle>
                <CardDescription>Faixa etária em meses ou anos, capacidade e localização.</CardDescription>
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
                    <Label htmlFor="classroom-min-age">Idade mínima</Label>
                    <div className="flex gap-2">
                      <Input id="classroom-min-age" type="number" min={0} value={classroomAgeUnits.min === "years" ? classroomForm.minAgeMonths / 12 : classroomForm.minAgeMonths} onChange={(event) => setClassroomForm({ ...classroomForm, minAgeMonths: Number(event.target.value) * (classroomAgeUnits.min === "years" ? 12 : 1) })} />
                      <select aria-label="Unidade da idade mínima" className="h-9 rounded-md border bg-background px-2 text-sm" value={classroomAgeUnits.min} onChange={(event) => setClassroomAgeUnits({ ...classroomAgeUnits, min: event.target.value as "months" | "years" })}>
                        <option value="months">meses</option>
                        <option value="years">anos</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="classroom-max-age">Idade máxima</Label>
                    <div className="flex gap-2">
                      <Input id="classroom-max-age" type="number" min={0} value={classroomAgeUnits.max === "years" ? classroomForm.maxAgeMonths / 12 : classroomForm.maxAgeMonths} onChange={(event) => setClassroomForm({ ...classroomForm, maxAgeMonths: Number(event.target.value) * (classroomAgeUnits.max === "years" ? 12 : 1) })} />
                      <select aria-label="Unidade da idade máxima" className="h-9 rounded-md border bg-background px-2 text-sm" value={classroomAgeUnits.max} onChange={(event) => setClassroomAgeUnits({ ...classroomAgeUnits, max: event.target.value as "months" | "years" })}>
                        <option value="months">meses</option>
                        <option value="years">anos</option>
                      </select>
                    </div>
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
          {sessionsData ? <KidsSessionsTab data={sessionsData} /> : <p className="py-10 text-center text-sm text-muted-foreground">{loadingTab === "sessoes" ? "Carregando sessões..." : "Abra novamente para carregar."}</p>}
        </TabsContent>

        {canCommunicate && (
          <TabsContent value="comunicacao">
            {communicationData ? <KidsCommunicationTab data={communicationData} /> : <p className="py-10 text-center text-sm text-muted-foreground">{loadingTab === "comunicacao" ? "Carregando comunicação..." : "Abra novamente para carregar."}</p>}
          </TabsContent>
        )}

        {canViewReports && (
          <TabsContent value="relatorios">
            {reportsData ? <KidsReportsTab data={reportsData} /> : <p className="py-10 text-center text-sm text-muted-foreground">{loadingTab === "relatorios" ? "Carregando relatórios..." : "Abra novamente para carregar."}</p>}
          </TabsContent>
        )}

        {canManageSettings && (
          <TabsContent value="configuracoes" className="space-y-6">
            <CustomFieldBuilder fields={data.customFields} />
            <KidsLabelBuilder congregations={data.congregations} customFields={data.customFields} availableChildren={children.map((child) => ({ id: child.id, fullName: child.fullName }))} canViewHealth={canViewHealth} />
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

                {!settingsForm.congregationId && (
                  <div className="space-y-1">
                    <Label htmlFor="settings-ministry">Ministério responsável</Label>
                    <select
                      id="settings-ministry"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={settingsForm.ministryId}
                      onChange={(event) => setSettingsForm({ ...settingsForm, ministryId: event.target.value })}
                    >
                      <option value="">Nenhum líder vinculado</option>
                      {data.ministries.map((ministry) => (
                        <option key={ministry.id} value={ministry.id}>{ministry.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">Somente o líder cadastrado neste ministério recebe gestão operacional do Kids.</p>
                  </div>
                )}

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

      <Dialog open={selectedFamily !== null} onOpenChange={(open) => { if (!open) { healthRequestRef.current += 1; setSelectedFamily(null); setSelectedHealth(null); setHealthLoading(false) } }}>
        <DialogContent className="sm:max-w-2xl">
          {selectedFamily && (
            <>
              <DialogHeader>
                <DialogTitle>Família de {selectedFamily.fullName}</DialogTitle>
                <DialogDescription>Informações da criança, responsáveis, autorizações e saúde.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                <section className="space-y-2 rounded-lg border p-3">
                  <h3 className="font-medium">Criança</h3>
                  {selectedFamily.photoUrl ? (
                    <button
                      type="button"
                      className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setPhotoPreview({ url: selectedFamily.photoUrl!, name: selectedFamily.fullName })}
                      aria-label={`Ampliar foto de ${selectedFamily.fullName}`}
                      title="Ampliar foto"
                    >
                      <Avatar className="size-16 cursor-zoom-in">
                        <AvatarImage src={selectedFamily.photoUrl} alt={selectedFamily.fullName} />
                        <AvatarFallback>{selectedFamily.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </button>
                  ) : (
                    <Avatar className="size-16">
                      <AvatarFallback>{selectedFamily.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                  <p><span className="text-muted-foreground">Nome:</span> {selectedFamily.fullName}</p>
                  <p><span className="text-muted-foreground">Nascimento:</span> {selectedFamily.birthDate ? selectedFamily.birthDate.split("-").reverse().join("/") : "não informado"} ({ageLabel(selectedFamily.ageMonths)})</p>
                  <p><span className="text-muted-foreground">Congregação:</span> {selectedFamily.congregationName ?? "não informada"}</p>
                  <p><span className="text-muted-foreground">Tipo:</span> {selectedFamily.isVisitor ? "Visitante" : "Cadastrada"}</p>
                  <p><span className="text-muted-foreground">Observações:</span> {selectedFamily.notes || "nenhuma"}</p>
                  <p><span className="text-muted-foreground">Cadastro:</span> {new Date(selectedFamily.createdAt).toLocaleDateString("pt-BR")}</p>
                  {selectedFamily.customValues.map((item) => {
                    const field = data.customFields.find((candidate) => candidate.id === item.fieldId)
                    return field ? <p key={item.fieldId}><span className="text-muted-foreground">{field.name}:</span> {Array.isArray(item.value) ? item.value.join(", ") : item.value === true ? "Sim" : item.value === false ? "Não" : item.value || "—"}</p> : null
                  })}
                </section>

                <section className="space-y-2 rounded-lg border p-3">
                  <h3 className="font-medium">Consentimentos</h3>
                  {CONSENT_TYPES.map((type) => (
                    <p key={type}>{selectedFamily.grantedConsents.includes(type) ? "✓" : "—"} {CONSENT_LABELS[type]}</p>
                  ))}
                </section>

                <section className="space-y-3 rounded-lg border p-3 sm:col-span-2">
                  <h3 className="font-medium">Responsáveis</h3>
                  {selectedFamily.guardians.length === 0 && <p className="text-muted-foreground">Nenhum responsável vinculado.</p>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {selectedFamily.guardians.map((guardian) => (
                      <div key={guardian.id} className="rounded-md bg-muted/40 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          {guardian.photoUrl ? (
                            <button
                              type="button"
                              className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              onClick={() => setPhotoPreview({ url: guardian.photoUrl!, name: guardian.name })}
                              aria-label={`Ampliar foto de ${guardian.name}`}
                              title="Ampliar foto"
                            >
                              <Avatar className="cursor-zoom-in">
                                <AvatarImage src={guardian.photoUrl} alt={guardian.name} />
                                <AvatarFallback>{guardian.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                            </button>
                          ) : (
                            <Avatar>
                              <AvatarFallback>{guardian.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          )}
                          <p className="font-medium">{guardian.name} {guardian.isPrimary && <Badge variant="outline">Principal</Badge>}</p>
                        </div>
                        <p>{RELATIONSHIP_LABELS[guardian.relationship]}</p>
                        <p>{guardian.phone || "Telefone não informado"}</p>
                        <p>{guardian.email || "E-mail não informado"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {guardian.canCheckin ? "Check-in" : "Sem check-in"} · {guardian.canCheckout ? "Checkout" : "Sem checkout"} · {guardian.isEmergencyContact ? "Contato de emergência" : "Não emergencial"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Comunicação: {[guardian.whatsappEnabled && "WhatsApp", guardian.emailEnabled && "e-mail"].filter(Boolean).join(" e ") || "desativada"}
                        </p>
                        {(guardian.address.street || guardian.address.city || guardian.address.postalCode) && <p className="mt-2 text-xs text-muted-foreground">Endereço: {[guardian.address.postalCode, guardian.address.street, guardian.address.number, guardian.address.neighborhood, guardian.address.city, guardian.address.state].filter(Boolean).join(" · ")}</p>}
                        {guardian.customValues.map((item) => {
                          const field = data.customFields.find((candidate) => candidate.id === item.fieldId)
                          return field ? <p key={item.fieldId} className="text-xs"><span className="text-muted-foreground">{field.name}:</span> {Array.isArray(item.value) ? item.value.join(", ") : item.value === true ? "Sim" : item.value === false ? "Não" : item.value || "—"}</p> : null
                        })}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2 rounded-lg border p-3 sm:col-span-2">
                  <h3 className="font-medium">Saúde</h3>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={selectedFamily.health.hasAllergy ? "destructive" : "outline"}>Alergia: {selectedFamily.health.hasAllergy ? "sim" : "não"}</Badge>
                    <Badge variant={selectedFamily.health.hasDietaryRestriction ? "destructive" : "outline"}>Restrição alimentar: {selectedFamily.health.hasDietaryRestriction ? "sim" : "não"}</Badge>
                    <Badge variant={selectedFamily.health.hasMedication ? "destructive" : "outline"}>Medicação: {selectedFamily.health.hasMedication ? "sim" : "não"}</Badge>
                    <Badge variant={selectedFamily.health.hasSpecialNeeds ? "destructive" : "outline"}>Necessidades específicas: {selectedFamily.health.hasSpecialNeeds ? "sim" : "não"}</Badge>
                  </div>
                  {healthLoading && <p className="text-muted-foreground">Carregando detalhes de saúde…</p>}
                  {canViewHealth && !healthLoading && !selectedHealth && <p className="text-muted-foreground">Detalhes de saúde indisponíveis.</p>}
                  {selectedHealth && (
                    <div className="grid gap-2 pt-2 sm:grid-cols-2">
                      <p><span className="text-muted-foreground">Alergias:</span> {selectedHealth.allergies || "nenhuma"}</p>
                      <p><span className="text-muted-foreground">Restrições:</span> {selectedHealth.dietaryRestrictions || "nenhuma"}</p>
                      <p><span className="text-muted-foreground">Medicação:</span> {selectedHealth.medication || "nenhuma"}</p>
                      <p><span className="text-muted-foreground">Necessidades:</span> {selectedHealth.specialNeeds || "nenhuma"}</p>
                      <p className="sm:col-span-2"><span className="text-muted-foreground">Instruções:</span> {selectedHealth.instructions || "nenhuma"}</p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={photoPreview !== null} onOpenChange={(open) => { if (!open) setPhotoPreview(null) }}>
        <DialogContent className="w-auto max-w-[calc(100vw-2rem)] bg-black p-2 sm:max-w-4xl">
          {photoPreview && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Foto de {photoPreview.name}</DialogTitle>
                <DialogDescription>Foto ampliada</DialogDescription>
              </DialogHeader>
              {/* A URL assinada pode vir de domínios variáveis do armazenamento privado. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview.url}
                alt={photoPreview.name}
                className="max-h-[calc(100dvh-4rem)] max-w-full rounded-lg object-contain"
              />
            </>
          )}
        </DialogContent>
      </Dialog>

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
