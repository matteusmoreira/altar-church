"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import {
  Baby,
  BellRing,
  Calendar,
  ChevronDown,
  ChevronUp,
  LogOut,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react"
import { triggerKidsAlert } from "@/lib/kids/notifications"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoCapture } from "@/components/kids/photo-capture"
import { PhotoLightbox } from "@/components/ui/photo-lightbox"
import { AddressFields } from "@/components/kids/address-fields"
import { CustomFieldInputs } from "@/components/kids/custom-field-inputs"
import { PwaInstallBanner, PwaInstallButton } from "@/components/pwa-install"
import { useConfirmAction } from "@/components/shared/use-confirm-action"
import {
  deleteGuardianContact,
  generateGuardianPickupCode,
  requestGuardianCheckout,
  saveGuardianKidsProfile,
  signOutFamily,
  updateGuardianConsents,
} from "@/lib/kids/portal-actions"
import { saveGuardianChildWithPhotos, saveGuardianContactWithPhoto, saveGuardianSelfPhoto } from "@/lib/kids/photo-actions"
import { markKidConversationRead, sendKidInternalMessage } from "@/lib/kids/actions"
import { createClient } from "@/lib/supabase/client"
import type {
  GuardianChildItem,
  GuardianPickupCode,
  GuardianPortalData,
  KidConsentType,
  KidGuardianItem,
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
  fullName: string
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
  customValues: import("@/lib/kids/types").KidCustomFieldValue[]
  photoUrl?: string | null
}

const emptyChildForm: ChildFormState = {
  kidId: null,
  personId: null,
  fullName: "",
  birthDate: "",
  congregationId: "",
  notes: "",
  photoUrl: null,
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
  customValues: [],
}

interface ContactFormState {
  fullName: string
  phone: string
  email: string
  relationship: KidRelationship
  canCheckin: boolean
  canCheckout: boolean
  isEmergencyContact: boolean
}

const emptyContactForm: ContactFormState = {
  fullName: "",
  phone: "",
  email: "",
  relationship: "relative",
  canCheckin: true,
  canCheckout: false,
  isEmergencyContact: true,
}

export function FamiliaKidsClient({ data, embedded = false }: { data: GuardianPortalData; embedded?: boolean }) {
  const router = useRouter()
  const [childForm, setChildForm] = useState<ChildFormState | null>(null)
  const [contactForm, setContactForm] = useState<{
    kidId: string
    guardianLinkId: string | null
    personId: string | null
    photoUrl: string | null
    photoFile: File | null
    form: ContactFormState
  } | null>(null)
  const [pickupCode, setPickupCode] = useState<(GuardianPickupCode & { childName: string }) | null>(null)
  const [pending, setPending] = useState(false)
  const confirmDelete = useConfirmAction()
  const [childPhoto, setChildPhoto] = useState<File | null>(null)
  const [childPhotoRemoved, setChildPhotoRemoved] = useState(false)
  const [guardianPhoto, setGuardianPhoto] = useState<File | null>(null)
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; title: string; subtitle?: string } | null>(null)
  const [guardianAddress, setGuardianAddress] = useState({ ...data.guardianAddress })
  const [guardianBirthDate, setGuardianBirthDate] = useState(data.guardianBirthDate ?? "")
  const hasGuardianAddress = Boolean(
    guardianAddress.street?.trim() ||
    guardianAddress.postalCode?.trim() ||
    guardianAddress.city?.trim() ||
    guardianBirthDate?.trim()
  )
  const [isAddressExpanded, setIsAddressExpanded] = useState(!hasGuardianAddress)
  const [guardianCustomValues, setGuardianCustomValues] = useState(data.guardianCustomValues.filter((value) => data.customFields.some((field) => field.id === value.fieldId && field.targets.includes("guardian"))))
  const [expandedChildren, setExpandedChildren] = useState<Record<string, boolean>>({})
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [chatReplies, setChatReplies] = useState<Record<string, string>>({})
  const [newChatBody, setNewChatBody] = useState("")
  const [newChatKidId, setNewChatKidId] = useState(data.children[0]?.kidId ?? "")
  const [recentAlert, setRecentAlert] = useState<{ body: string; receivedAt: string } | null>(null)
  const chatBottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("family-kids-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kid_conversation_messages" },
        (payload) => {
          const newMsg = payload.new as {
            id?: string
            sender_kind?: string
            body?: string
            conversation_id?: string
          } | null

          if (newMsg && newMsg.sender_kind === "staff") {
            // Dispara som audível no culto e vibração no celular
            triggerKidsAlert(newMsg.body ?? "Mensagem da equipe do Kids")

            setRecentAlert({
              body: newMsg.body ?? "Nova mensagem da equipe",
              receivedAt: new Date().toISOString(),
            })

            toast.warning("🚨 Mensagem do Ministério Kids!", {
              description: newMsg.body ?? "A equipe enviou uma mensagem para você.",
              duration: 12000,
              action: {
                label: "Ver no Chat",
                onClick: () => {
                  setIsChatExpanded(true)
                document.getElementById("chat-kids-section")?.scrollIntoView({ behavior: "smooth" })
                },
              },
            })
          }
          router.refresh()
        },
      )
      .subscribe()

    for (const conversation of data.conversations) {
      if (conversation.unreadCount > 0) void markKidConversationRead(conversation.id)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [data.conversations, router])

  useEffect(() => {
    if (isChatExpanded) chatBottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [data.conversations, isChatExpanded])

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
    setChildPhoto(null)
    setChildPhotoRemoved(false)
    setChildForm({
      kidId: child.kidId,
      personId: child.personId,
      fullName: child.fullName,
      birthDate: child.birthDate ?? "",
      congregationId: child.congregationId ?? "",
      notes: child.notes,
      photoUrl: child.photoUrl,
      health: { ...child.health, ...child.healthDetails },
      customValues: child.customValues.filter((value) => data.customFields.some((field) => field.id === value.fieldId && field.targets.includes("child"))),
    })
  }

  async function handleSaveSelfPhoto(file: File | null) {
    const formData = new FormData()
    if (!file) {
      formData.set("remove", "true")
    } else {
      formData.set("file", file)
    }
    await run(
      () => saveGuardianSelfPhoto(formData),
      file ? "Foto do perfil atualizada" : "Foto removida",
    )
  }

  async function submitChild() {
    if (!childForm) return
    const payload = {
      id: childForm.kidId,
      personId: childForm.personId,
      fullName: childForm.fullName,
      birthDate: childForm.birthDate || null,
      congregationId: childForm.congregationId || null,
      isVisitor: false,
      notes: childForm.notes,
      health: childForm.health,
      customValues: childForm.customValues,
    }
    const request = new FormData()
    request.set("payload", JSON.stringify(payload))
    if (childPhotoRemoved) {
      request.set("childPhotoRemoved", "true")
    } else if (childPhoto) {
      request.set("childPhoto", childPhoto)
    }
    if (guardianPhoto) request.set("guardianPhoto", guardianPhoto)
    await run(
      () => saveGuardianChildWithPhotos(request),
      childForm.kidId ? "Cadastro atualizado" : "Criança cadastrada",
      (result) => {
        if (result.warning) toast.warning(result.warning)
        setChildPhoto(null)
        setChildPhotoRemoved(false)
        setGuardianPhoto(null)
        setChildForm(null)
      },
    )
  }

  async function toggleConsent(child: GuardianChildItem, type: KidConsentType, granted: boolean) {
    if (!granted || child.consents.includes(type)) return
    const consents = [...child.consents, type]
    await run(() => updateGuardianConsents({ kidId: child.kidId, consents }), "Consentimentos atualizados")
  }

  async function submitContact() {
    if (!contactForm) return
    const request = new FormData()
    request.set("payload", JSON.stringify({
      kidId: contactForm.kidId,
      contact: {
        id: contactForm.guardianLinkId,
        personId: contactForm.personId,
        ...contactForm.form,
        isPrimary: false,
        whatsappEnabled: true,
        emailEnabled: true,
      },
    }))
    if (contactForm.photoFile) request.set("photo", contactForm.photoFile)
    await run(
      () => saveGuardianContactWithPhoto(request),
      contactForm.guardianLinkId ? "Contato atualizado" : "Contato salvo",
      (result) => {
        if (result.warning) toast.warning(result.warning)
        setContactForm(null)
      },
    )
  }

  function startEditContact(kidId: string, guardian: KidGuardianItem) {
    setContactForm({
      kidId,
      guardianLinkId: guardian.id,
      personId: guardian.personId,
      photoUrl: guardian.photoUrl,
      photoFile: null,
      form: {
        fullName: guardian.name,
        phone: guardian.phone,
        email: guardian.email ?? "",
        relationship: guardian.relationship,
        canCheckin: guardian.canCheckin,
        canCheckout: guardian.canCheckout,
        isEmergencyContact: guardian.isEmergencyContact,
      },
    })
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

  async function handleSaveGuardianAddress() {
    await run(
      () =>
        saveGuardianKidsProfile({
          birthDate: guardianBirthDate || null,
          address: guardianAddress,
          customValues: guardianCustomValues,
        }),
      "Dados atualizados com sucesso",
      () => {
        setIsAddressExpanded(false)
      },
    )
  }

  async function sendFirstChatMessage() {
    const body = newChatBody.trim()
    if (!body) return
    await run(
      () =>
        sendKidInternalMessage({
          conversationId: null,
          guardianPersonId: null,
          kidId: newChatKidId || data.children[0]?.kidId || null,
          body,
        }),
      "Mensagem enviada para a equipe",
      () => setNewChatBody(""),
    )
  }

  async function sendChatReply(conversationId: string) {
    const body = chatReplies[conversationId]?.trim()
    if (!body) return
    await run(
      () => sendKidInternalMessage({ conversationId, guardianPersonId: null, kidId: null, body }),
      "Mensagem enviada",
      () => setChatReplies((current) => ({ ...current, [conversationId]: "" })),
    )
  }

  return (
    <main className={embedded ? "mx-auto w-full max-w-3xl space-y-6 lg:pt-12" : "mx-auto min-h-screen w-full max-w-3xl space-y-6 p-4 pb-16"}>
      {!embedded && <header className="flex items-center justify-between gap-3 pt-4">
        <div className="flex items-center gap-3">
          <Avatar
            className={`h-10 w-10 border border-border/60 ${data.guardianPhotoUrl ? "cursor-zoom-in hover:opacity-90 transition-opacity" : ""}`}
            onClick={() => {
              if (data.guardianPhotoUrl) {
                setLightboxPhoto({
                  url: data.guardianPhotoUrl,
                  title: data.guardianName,
                  subtitle: "Responsável",
                })
              }
            }}
          >
            {data.guardianPhotoUrl && <AvatarImage src={data.guardianPhotoUrl} alt={data.guardianName} />}
            <AvatarFallback className="font-semibold text-xs">{data.guardianName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Portal da Família</h1>
            <p className="text-xs text-muted-foreground">{data.companyName} · {data.guardianName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <PwaInstallButton iconOnly variant="ghost" />
          <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} title="Sair">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>}

      {!embedded && <PwaInstallBanner />}

      {recentAlert && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-destructive flex items-center justify-between gap-3 shadow-md animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <BellRing className="h-5 w-5 text-destructive shrink-0 animate-bounce" />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider">Aviso da Equipe do Kids</p>
              <p className="text-sm font-semibold truncate">{recentAlert.body}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setIsChatExpanded(true)
                document.getElementById("chat-kids-section")?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              Ver chat
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:bg-destructive/20"
              onClick={() => setRecentAlert(null)}
            >
              ✕
            </Button>
          </div>
        </div>
      )}

      <Card className="glass overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsAddressExpanded((prev) => !prev)}
          className="w-full p-4 sm:p-6 text-left flex items-start justify-between gap-4 hover:bg-muted/20 transition-colors"
          aria-expanded={isAddressExpanded}
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <CardTitle className="text-base">Meu endereço e dados adicionais</CardTitle>
              {hasGuardianAddress && (
                <Badge variant="outline" className="text-[10px] font-normal border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                  Preenchido
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              {hasGuardianAddress ? (
                <span>
                  {[
                    guardianAddress.street ? `${guardianAddress.street}${guardianAddress.number ? `, ${guardianAddress.number}` : ""}` : "",
                    guardianAddress.complement,
                    guardianAddress.neighborhood,
                    guardianAddress.city ? (guardianAddress.state ? `${guardianAddress.city} - ${guardianAddress.state}` : guardianAddress.city) : "",
                    guardianAddress.postalCode ? `CEP ${guardianAddress.postalCode}` : "",
                  ].filter(Boolean).join(" · ")}
                </span>
              ) : (
                "Endereço familiar opcional, compartilhado pelos cadastros vinculados."
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
              {isAddressExpanded ? "Recolher" : "Editar"}
            </span>
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/60 text-muted-foreground hover:text-foreground">
              {isAddressExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </div>
        </button>

        {isAddressExpanded && (
          <CardContent className="space-y-4 pt-0 border-t border-border/40 mt-1">
            <div className="pt-4 space-y-4">
              <div className="rounded-lg border border-border/60 p-3 bg-muted/10 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Minha foto de perfil</p>
                <PhotoCapture
                  label="do meu perfil"
                  currentUrl={data.guardianPhotoUrl}
                  disabled={pending}
                  onChange={(file) => void handleSaveSelfPhoto(file)}
                  onError={(message) => toast.error(message)}
                />
              </div>
              <div className="rounded-lg border border-border/60 p-3 bg-muted/10 space-y-2">
                <Label htmlFor="guardian-birth" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Minha data de nascimento
                </Label>
                <Input
                  id="guardian-birth"
                  type="date"
                  value={guardianBirthDate}
                  onChange={(e) => setGuardianBirthDate(e.target.value)}
                  disabled={pending}
                  className="max-w-xs"
                />
              </div>
              <AddressFields value={guardianAddress} onChange={setGuardianAddress} disabled={pending} />
              <CustomFieldInputs
                definitions={data.customFields}
                target="guardian"
                surface="portal"
                values={guardianCustomValues}
                onChange={setGuardianCustomValues}
                disabled={pending}
              />
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button type="button" disabled={pending} onClick={() => void handleSaveGuardianAddress()}>
                  Salvar meus dados
                </Button>
                {hasGuardianAddress && (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => setIsAddressExpanded(false)}>
                    Recolher
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {data.children.length === 0 && !childForm && (
        <Card className="glass">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Baby className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Nenhuma criança vinculada à sua conta ainda. Cadastre abaixo ou fale com a recepção do Kids.
            </p>
            <Button type="button" onClick={() => { setChildPhoto(null); setChildForm({ ...emptyChildForm }) }}>
              <Plus className="mr-2 h-4 w-4" />Cadastrar primeira criança
            </Button>
          </CardContent>
        </Card>
      )}

      {data.children.map((child) => (
        <Card key={child.kidId} className="glass">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <Avatar
                  size="lg"
                  className={child.photoUrl ? "cursor-zoom-in hover:opacity-90 transition-opacity" : ""}
                  onClick={() => {
                    if (child.photoUrl) {
                      setLightboxPhoto({
                        url: child.photoUrl,
                        title: child.fullName,
                        subtitle: `${ageLabel(child.ageMonths)}${child.congregationName ? ` · ${child.congregationName}` : ""}`,
                      })
                    }
                  }}
                >
                  {child.photoUrl && <AvatarImage src={child.photoUrl} alt={child.fullName} />}
                  <AvatarFallback>{child.firstName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                <CardTitle>{child.fullName}</CardTitle>
                <CardDescription>
                  {ageLabel(child.ageMonths)}
                  {child.congregationName ? ` · ${child.congregationName}` : ""}
                  {child.isVisitor ? " · visitante" : ""}
                </CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {child.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                {child.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                {child.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                {child.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${child.fullName}`} onClick={() => startEditChild(child)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                  aria-label={`${expandedChildren[child.kidId] ? "Recolher" : "Expandir"} ${child.fullName}`}
                  aria-expanded={Boolean(expandedChildren[child.kidId])}
                  aria-controls={`child-details-${child.kidId}`}
                  onClick={() => setExpandedChildren((current) => ({ ...current, [child.kidId]: !current[child.kidId] }))}
                >
                  {expandedChildren[child.kidId] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent id={`child-details-${child.kidId}`} hidden={!expandedChildren[child.kidId]}>
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
                    <span>
                      {CONSENT_LABELS[type]} <span className="text-xs text-muted-foreground">(v1.0)</span>
                      {child.consents.includes(type) && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Confirmado{child.consentGrantedAt?.[type] ? ` em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(child.consentGrantedAt[type]!))}` : ""}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={child.consents.includes(type)}
                      disabled={pending || child.consents.includes(type)}
                      onChange={(event) => void toggleConsent(child, type, event.target.checked)}
                    />
                  </label>
                ))}
              </TabsContent>
              <TabsContent value="autorizadas" className="space-y-2 pt-3">
                {child.guardians.map((guardian) => (
                  <div key={guardian.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Avatar
                        className={guardian.photoUrl ? "cursor-zoom-in hover:opacity-90 transition-opacity" : ""}
                        onClick={() => {
                          if (guardian.photoUrl) {
                            setLightboxPhoto({
                              url: guardian.photoUrl,
                              title: guardian.name,
                              subtitle: RELATIONSHIP_LABELS[guardian.relationship],
                            })
                          }
                        }}
                      >
                        {guardian.photoUrl && <AvatarImage src={guardian.photoUrl} alt={guardian.name} />}
                        <AvatarFallback>{guardian.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                      <p className="font-medium">{guardian.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {RELATIONSHIP_LABELS[guardian.relationship]}
                        {guardian.isPrimary ? " · principal" : ""}
                        {guardian.canCheckout ? " · pode retirar" : " · não retira"}
                        {guardian.isEmergencyContact ? " · emergência" : ""}
                      </p>
                      </div>
                    </div>
                    {guardian.canManage && (
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${guardian.name}`} onClick={() => startEditContact(child.kidId, guardian)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={`Excluir ${guardian.name}`}
                          onClick={() => confirmDelete.confirm({ title: "Remover contato", message: `Excluir ${guardian.name} das pessoas autorizadas de ${child.firstName}?`, action: () => void run(() => deleteGuardianContact({ kidId: child.kidId, guardianLinkId: guardian.id }), "Contato removido") })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {contactForm?.kidId === child.kidId ? (
                  <div className="space-y-2 rounded-md border border-primary/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input className="sm:col-span-2" placeholder="Nome completo *" value={contactForm.form.fullName} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, fullName: event.target.value } })} />
                      <Input placeholder="Telefone *" value={contactForm.form.phone} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, phone: event.target.value } })} />
                      <Input placeholder="E-mail" value={contactForm.form.email} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, email: event.target.value } })} />
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={contactForm.form.relationship}
                        onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, relationship: event.target.value as KidRelationship } })}
                      >
                        {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.canCheckin} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, canCheckin: event.target.checked } })} />
                        Pode entregar
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.canCheckout} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, canCheckout: event.target.checked } })} />
                        Pode retirar
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={contactForm.form.isEmergencyContact} onChange={(event) => setContactForm({ ...contactForm, form: { ...contactForm.form, isEmergencyContact: event.target.checked } })} />
                        Contato de emergência
                      </label>
                    </div>
                    <PhotoCapture
                      label="da pessoa autorizada"
                      currentUrl={contactForm.photoUrl}
                      value={contactForm.photoFile}
                      allowRemove={false}
                      disabled={pending}
                      onChange={(file) => setContactForm({ ...contactForm, photoFile: file })}
                      onError={(message) => toast.error(message)}
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => void submitContact()} disabled={pending}>
                        {contactForm.guardianLinkId ? "Salvar alterações" : "Salvar contato"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setContactForm(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setContactForm({ kidId: child.kidId, guardianLinkId: null, personId: null, photoUrl: null, photoFile: null, form: { ...emptyContactForm } })}>
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
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="familia-kid-name">Nome completo *</Label>
                <Input id="familia-kid-name" value={childForm.fullName} onChange={(event) => setChildForm({ ...childForm, fullName: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="familia-kid-birth">Nascimento</Label>
                <Input id="familia-kid-birth" type="date" value={childForm.birthDate} onChange={(event) => setChildForm({ ...childForm, birthDate: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="familia-kid-congregation">Congregação</Label>
                <select id="familia-kid-congregation"
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
            <CustomFieldInputs definitions={data.customFields} target="child" surface="portal" values={childForm.customValues} onChange={(customValues) => setChildForm({ ...childForm, customValues })} disabled={pending} />
            <div className="space-y-1">
              <Label htmlFor="familia-kid-notes">Observações gerais</Label>
              <Textarea id="familia-kid-notes" rows={2} value={childForm.notes} onChange={(event) => setChildForm({ ...childForm, notes: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhotoCapture
                label="da criança"
                currentUrl={childForm.photoUrl}
                value={childPhoto}
                removed={childPhotoRemoved}
                disabled={pending}
                onChange={(file, removed) => {
                  setChildPhoto(file)
                  setChildPhotoRemoved(Boolean(removed))
                }}
                onError={(message) => toast.error(message)}
              />
              {!childForm.kidId && (
                <PhotoCapture
                  label="do responsável"
                  currentUrl={data.guardianPhotoUrl}
                  value={guardianPhoto}
                  allowRemove={false}
                  disabled={pending}
                  onChange={(file) => setGuardianPhoto(file)}
                  onError={(message) => toast.error(message)}
                />
              )}
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
              <Button type="button" onClick={() => void submitChild()} disabled={pending || childForm.fullName.trim().length < 2}>
                {childForm.kidId ? "Salvar alterações" : "Cadastrar"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setChildPhoto(null); setChildPhotoRemoved(false); setChildForm(null) }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : data.children.length === 0 ? (
        <Button type="button" className="w-full" onClick={() => { setChildPhoto(null); setChildPhotoRemoved(false); setChildForm({ ...emptyChildForm }) }}>
          <Plus className="mr-2 h-4 w-4" />Cadastrar criança
        </Button>
      ) : (
        <Button type="button" variant="outline" className="w-full" onClick={() => { setChildPhoto(null); setChildPhotoRemoved(false); setChildForm({ ...emptyChildForm }) }}>
          <UserPlus className="mr-2 h-4 w-4" />Cadastrar outra criança
        </Button>
      )}

      <Card id="chat-kids-section" className="glass scroll-mt-20">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-primary" />
              Chat com o Kids
            </CardTitle>
            <CardDescription>
              Canal direto com os voluntários e liderança das salas durante o culto.
            </CardDescription>
          </div>
          <Button
            type="button" variant="ghost" size="icon" className="shrink-0"
            aria-label={isChatExpanded ? "Recolher chat com o Kids" : "Expandir chat com o Kids"}
            aria-expanded={isChatExpanded} aria-controls="chat-kids-content"
            onClick={() => setIsChatExpanded((current) => !current)}
          >
            {isChatExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent id="chat-kids-content" hidden={!isChatExpanded} className="space-y-4">
          {data.conversations.length === 0 ? (
            <div className="rounded-lg border border-border/60 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem aberta no momento. Se precisar falar com os voluntários da sala do seu filho durante o culto, envie uma mensagem abaixo:
              </p>
              <div className="space-y-2">
                {data.children.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Mensagem referente a:</Label>
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-xs"
                      value={newChatKidId}
                      onChange={(event) => setNewChatKidId(event.target.value)}
                    >
                      <option value="">Geral / Todas as crianças</option>
                      {data.children.map((child) => (
                        <option key={child.kidId} value={child.kidId}>
                          {child.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Textarea
                  rows={2}
                  placeholder="Ex: Deixei uma blusa de frio na mochila do meu filho..."
                  value={newChatBody}
                  disabled={pending}
                  onChange={(event) => setNewChatBody(event.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !newChatBody.trim()}
                  onClick={() => void sendFirstChatMessage()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Enviar mensagem para o Kids
                </Button>
              </div>
            </div>
          ) : (
            data.conversations.map((conversation) => (
              <div key={conversation.id} className="space-y-3 rounded-lg border border-border/60 p-3">
                {conversation.childName && (
                  <p className="text-xs font-semibold text-primary">
                    Conversa sobre: {conversation.childName}
                  </p>
                )}
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {conversation.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderKind === "guardian" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          message.senderKind === "guardian"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted border border-border/40"
                        }`}
                      >
                        {message.senderKind !== "guardian" && message.senderName && (
                          <p className="text-[11px] font-semibold text-primary mb-0.5">
                            {message.senderName} (Equipe Kids)
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className="mt-1 text-[10px] opacity-70 text-right">
                          {formatTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
                <div className="flex gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Digite sua resposta..."
                    value={chatReplies[conversation.id] ?? ""}
                    disabled={pending}
                    onChange={(event) =>
                      setChatReplies((current) => ({
                        ...current,
                        [conversation.id]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        void sendChatReply(conversation.id)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-auto"
                    disabled={pending || !chatReplies[conversation.id]?.trim()}
                    onClick={() => void sendChatReply(conversation.id)}
                    title="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
      <PhotoLightbox
        isOpen={Boolean(lightboxPhoto)}
        photoUrl={lightboxPhoto?.url ?? ""}
        title={lightboxPhoto?.title ?? ""}
        subtitle={lightboxPhoto?.subtitle}
        onClose={() => setLightboxPhoto(null)}
      />
    {confirmDelete.dialog()}
    </main>
  )
}
