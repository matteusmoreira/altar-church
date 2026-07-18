"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { QRCodeSVG } from "qrcode.react"
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser"
import { Baby, CheckCircle2, LogOut, Megaphone, Printer, QrCode, RefreshCw, Search, Settings2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { EmptyState } from "@/components/shared"
import { usePermission } from "@/lib/permissions"
import {
  callKidGuardian,
  checkinKid,
  checkoutKid,
  requestKidCheckout,
  rotateKidCredential,
  searchKidsForCheckin,
} from "@/lib/kids/actions"
import type { KidLabelModel } from "@/lib/kids/printing"
import type { KidCheckinCandidate, KidPrintableLabel, KidPrinterPreference, KidsReceptionData } from "@/lib/kids/types"
import { getKidPrinterPreference, listKidPrinters, printKidLabelsDirect, saveKidPrinterPreference, testKidPrinter } from "@/lib/kids/printer-client"
import { PrintableLabels } from "./printable-labels"
import { auditKidLabelPrint } from "@/lib/kids/label-actions"

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function formatTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function ageLabel(ageMonths: number | null) {
  if (ageMonths == null) return "—"
  const years = Math.floor(ageMonths / 12)
  const months = ageMonths % 12
  if (years === 0) return `${months}m`
  if (months === 0) return `${years}a`
  return `${years}a ${months}m`
}

const CONSENT_SHORT: Record<string, string> = {
  data_processing: "dados",
  image_use: "imagem",
  emergency_care: "emergência",
  communication: "comunicação",
}

function QrScannerButton({ onRead }: { onRead: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controls = useRef<IScannerControls | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => () => controls.current?.stop(), [])

  async function start() {
    try {
      const reader = new BrowserQRCodeReader()
      controls.current = await reader.decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (!result) return
        onRead(result.getText())
        controls.current?.stop()
        controls.current = null
        setActive(false)
      })
      setActive(true)
    } catch {
      toast.error("Câmera indisponível. Cole o código do QR manualmente.")
    }
  }

  return (
    <div className="space-y-2">
      {!active ? (
        <Button type="button" variant="outline" size="sm" onClick={start}>
          <QrCode className="mr-2 h-4 w-4" />Ler QR
        </Button>
      ) : (
        <video ref={videoRef} className="max-h-40 w-full rounded-lg bg-black" muted playsInline />
      )}
    </div>
  )
}

function LabelPreview({ label, showQr }: { label: KidLabelModel; showQr: boolean }) {
  return (
    <div className="mx-auto w-[62mm] rounded-md border-2 border-foreground/80 bg-white p-2 text-black print:border-black">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold leading-tight">{label.childName}</p>
          <p className="text-xs font-medium">{label.classroomName}</p>
          <p className="text-[10px] text-neutral-600">{label.sessionTitle} · {formatTime(label.checkedInAt)}</p>
        </div>
        {showQr && (
          <div className="shrink-0">
            <QRCodeSVG value={label.qrPayload} size={56} level="M" />
          </div>
        )}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-neutral-600">Retirada</p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em]">{label.pickupCode}</p>
        </div>
        {label.alertFlags.length > 0 && (
          <div className="flex flex-col items-end gap-0.5">
            {label.alertFlags.map((flag) => (
              <span key={flag} className="rounded-sm bg-black px-1.5 py-0.5 text-[9px] font-bold text-white">{flag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RecepcaoClient({
  openSessions,
  selectedSessionId,
  initialData,
  securityStatus,
}: {
  openSessions: { id: string; title: string; startsAt: string }[]
  selectedSessionId: string
  initialData: KidsReceptionData | null
  securityStatus: { pinConfigured: boolean; healthConfigured: boolean }
}) {
  const router = useRouter()
  const canOverride = usePermission("kids.checkout.override")
  const canManageSessions = usePermission("kids.sessions.manage")

  const [query, setQuery] = useState("")
  const [candidates, setCandidates] = useState<KidCheckinCandidate[]>([])
  const [roomPick, setRoomPick] = useState<Record<string, string>>({})
  const [overrideReason, setOverrideReason] = useState<Record<string, string>>({})
  const [label, setLabel] = useState<KidLabelModel | null>(null)
  const [printableLabels, setPrintableLabels] = useState<KidPrintableLabel[]>([])
  const [printAttendanceId, setPrintAttendanceId] = useState<string | null>(null)
  const [isReprint, setIsReprint] = useState(false)
  const [printerPreference, setPrinterPreference] = useState<KidPrinterPreference>(() => getKidPrinterPreference())
  const [printers, setPrinters] = useState<string[]>([])
  const [checkoutAttendanceId, setCheckoutAttendanceId] = useState<string | null>(null)
  const [checkoutPin, setCheckoutPin] = useState("")
  const [checkoutQr, setCheckoutQr] = useState("")
  const [checkoutOverride, setCheckoutOverride] = useState(false)
  const [checkoutOverrideReason, setCheckoutOverrideReason] = useState("")
  const [callReason, setCallReason] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  const data = initialData
  const settings = data?.settings

  function updatePrinterPreference(next: KidPrinterPreference) {
    setPrinterPreference(next)
    saveKidPrinterPreference(next)
  }

  async function discoverPrinters() {
    try { const found = await listKidPrinters(); setPrinters(found); if (!printerPreference.printerName && found[0]) updatePrinterPreference({ ...printerPreference, printerName: found[0] }); toast.success(`${found.length} impressora(s) encontrada(s)`) }
    catch { toast.error("QZ Tray indisponível. Instale/abra o QZ ou use impressão do navegador.") }
  }

  async function printLabels(labels: KidPrintableLabel[], forceBrowser = false, attendanceId?: string, reprint = false) {
    if (!forceBrowser && printerPreference.directEnabled && printerPreference.printerName) {
      try { await printKidLabelsDirect(labels, printerPreference.printerName); if (attendanceId) void auditKidLabelPrint({ attendanceId, revisionIds: labels.map((item) => item.revisionId).filter(Boolean), mode: "qz", reprint }); toast.success("Etiquetas enviadas à impressora"); return }
      catch { toast.error("Impressão direta falhou. Abrindo impressão do navegador.") }
    }
    if (attendanceId) void auditKidLabelPrint({ attendanceId, revisionIds: labels.map((item) => item.revisionId).filter(Boolean), mode: "browser", reprint })
    window.setTimeout(() => window.print(), 900)
  }

  async function run<T extends { ok: boolean; error?: string }>(action: () => Promise<T>, success: string, after?: (result: T) => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        if (success) toast.success(success)
        after?.(result)
        router.refresh()
      }
      return result
    } finally {
      setPending(false)
    }
  }

  async function search() {
    if (!data || query.trim().length < 2) {
      setCandidates([])
      return
    }
    const result = await searchKidsForCheckin({ sessionId: data.session.id, query: query.trim() })
    if (!result.ok) {
      toast.error(result.error ?? "Busca falhou")
      return
    }
    setCandidates(result.candidates ?? [])
  }

  async function doCheckin(candidate: KidCheckinCandidate) {
    if (!data) return
    if (!securityStatus.pinConfigured) {
      toast.error("Check-in indisponível: configure KIDS_PIN_PEPPER no servidor")
      return
    }
    const picked = roomPick[candidate.kidId] ?? ""
    await run(
      () =>
        checkinKid({
          sessionId: data.session.id,
          kidId: candidate.kidId,
          sessionClassroomId: picked || null,
          overrideReason: overrideReason[candidate.kidId] ?? "",
        }),
      "Check-in realizado",
      (result) => {
        if (result.label) {
          setLabel(result.label)
          setPrintableLabels(result.labels ?? [])
          setPrintAttendanceId(result.attendanceId ?? null)
          setIsReprint(false)
          setCandidates((current) => current.filter((item) => item.kidId !== candidate.kidId))
          if (settings?.autoPrint) {
            if (result.labels?.length) void printLabels(result.labels, false, result.attendanceId, false)
            else window.setTimeout(() => window.print(), 400)
          }
        }
      },
    )
  }

  async function reprint(attendanceId: string) {
    await run(() => rotateKidCredential({ attendanceId }), "Nova credencial gerada", (result) => {
      if (result.label) {
        setLabel(result.label)
        setPrintableLabels(result.labels ?? [])
        setPrintAttendanceId(result.attendanceId ?? attendanceId)
        setIsReprint(true)
        if (result.labels?.length) void printLabels(result.labels, false, result.attendanceId, true)
        else window.setTimeout(() => window.print(), 400)
      }
    })
  }

  async function doCheckout() {
    if (!data) return
    await run(
      () =>
        checkoutKid({
          sessionId: data.session.id,
          qrPayload: checkoutQr,
          attendanceId: checkoutAttendanceId,
          pin: checkoutPin,
          overrideReason: checkoutOverride ? checkoutOverrideReason : "",
        }),
      "Checkout confirmado",
      () => {
        setCheckoutAttendanceId(null)
        setCheckoutPin("")
        setCheckoutQr("")
        setCheckoutOverride(false)
        setCheckoutOverrideReason("")
      },
    )
  }

  async function doCall(attendanceId: string) {
    const reason = (callReason[attendanceId] ?? "").trim() || "Chamado da sala"
    await run(() => callKidGuardian({ attendanceId, reason }), "Responsável chamado")
  }

  if (openSessions.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Recepção Kids</h1>
        <EmptyState
          icon={Baby}
          title="Nenhuma sessão aberta"
          description="Abra uma sessão na aba Sessões do módulo Kids para iniciar o check-in."
        />
      </div>
    )
  }

  const presentAttendances = (data?.attendances ?? []).filter((attendance) => attendance.status !== "checked_out")
  const selectedAttendance = presentAttendances.find((attendance) => attendance.id === checkoutAttendanceId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Recepção Kids</h1>
          <p className="text-muted-foreground">Check-in, etiquetas, chamados e checkout seguro.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-10 min-w-56 rounded-md border bg-background px-3 text-sm"
            value={selectedSessionId}
            onChange={(event) => router.push(`/kids/recepcao?session=${event.target.value}`)}
          >
            {openSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {formatTime(session.startsAt)}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" size="icon" onClick={() => router.refresh()} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Check-in</CardTitle>
                <CardDescription>Busque por nome da criança, nome ou telefone do responsável.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!securityStatus.pinConfigured && (
                  <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    Check-in bloqueado: administrador deve configurar KIDS_PIN_PEPPER no ambiente do servidor.
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nome da criança ou telefone do responsável"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && void search()}
                    className="h-11"
                  />
                  <Button type="button" onClick={() => void search()} disabled={pending} className="h-11">Buscar</Button>
                </div>

                {candidates.map((candidate) => {
                  const fullRooms = data.session.classrooms.filter(
                    (classroom) => classroom.isOpen && classroom.occupied >= classroom.effectiveCapacity,
                  )
                  const pickedRoom = roomPick[candidate.kidId] ?? ""
                  const pickedFull = fullRooms.some((classroom) => classroom.id === pickedRoom)
                  const blocked = candidate.missingConsents.length > 0 || candidate.activeAttendanceId !== null
                  return (
                    <div key={candidate.kidId} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar size="lg">
                            {candidate.photoUrl && <AvatarImage src={candidate.photoUrl} alt={candidate.fullName} />}
                            <AvatarFallback>{candidate.fullName.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div><p className="font-medium">{candidate.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {ageLabel(candidate.ageMonths)}
                            {candidate.congregationName ? ` · ${candidate.congregationName}` : ""}
                            {candidate.guardiansSummary ? ` · ${candidate.guardiansSummary}` : ""}
                          </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {candidate.isVisitor && <Badge variant="secondary">Visitante</Badge>}
                          {candidate.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                          {candidate.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                          {candidate.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                          {candidate.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                        </div>
                      </div>

                      {candidate.missingConsents.length > 0 && (
                        <p className="text-xs text-destructive">
                          Consentimentos pendentes: {candidate.missingConsents.map((type) => CONSENT_SHORT[type] ?? type).join(", ")}.
                          Regularize no cadastro da família.
                        </p>
                      )}

                      {candidate.activeAttendanceId ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="default">Já presente{candidate.activeClassroomName ? ` · ${candidate.activeClassroomName}` : ""}</Badge>
                          <Button type="button" size="sm" variant="outline" onClick={() => void reprint(candidate.activeAttendanceId!)}>
                            <Printer className="mr-1 h-4 w-4" />Reimprimir etiqueta
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <select
                              className="h-10 min-w-52 rounded-md border bg-background px-2 text-sm"
                              value={pickedRoom}
                              onChange={(event) => setRoomPick({ ...roomPick, [candidate.kidId]: event.target.value })}
                              disabled={blocked}
                            >
                              <option value="">Sala sugerida automaticamente</option>
                              {data.session.classrooms.map((classroom) => (
                                <option key={classroom.id} value={classroom.id} disabled={!classroom.isOpen}>
                                  {classroom.name} · {classroom.occupied}/{classroom.effectiveCapacity}
                                  {!classroom.isOpen ? " · fechada" : classroom.occupied >= classroom.effectiveCapacity ? " · lotada" : ""}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              className="h-10"
                              disabled={pending || !securityStatus.pinConfigured || blocked || (pickedFull && !canManageSessions)}
                              onClick={() => void doCheckin(candidate)}
                            >
                              <UserPlus className="mr-1 h-4 w-4" />Check-in
                            </Button>
                          </div>
                          {pickedFull && canManageSessions && (
                            <Input
                              placeholder="Motivo da exceção de capacidade (obrigatório)"
                              value={overrideReason[candidate.kidId] ?? ""}
                              onChange={(event) => setOverrideReason({ ...overrideReason, [candidate.kidId]: event.target.value })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {label && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />Etiqueta</CardTitle>
                  <CardDescription>
                    {settings?.labelPaper === "a4" ? "Impressão A4 (fallback)." : "Etiqueta térmica 62×40 mm."} O QR é opaco e não contém dados pessoais.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {printableLabels.length ? <PrintableLabels labels={printableLabels} /> : <LabelPreview label={label} showQr={settings?.labelShowQr ?? true} />}
                  <div className="flex justify-center gap-2 print:hidden">
                    <Button type="button" variant="outline" onClick={() => printableLabels.length ? void printLabels(printableLabels, false, printAttendanceId ?? undefined, isReprint) : window.print()}>
                      <Printer className="mr-1 h-4 w-4" />Imprimir
                    </Button>
                    {printableLabels.length > 0 && <Button type="button" variant="ghost" onClick={() => void printLabels(printableLabels, true, printAttendanceId ?? undefined, isReprint)}>Navegador/PDF</Button>}
                    <Button type="button" variant="ghost" onClick={() => { setLabel(null); setPrintableLabels([]); setPrintAttendanceId(null); setIsReprint(false) }}>Fechar</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="glass print:hidden">
              <CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Impressora desta estação</CardTitle><CardDescription>QZ Tray no Windows; navegador/PDF continua disponível em qualquer dispositivo.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={printerPreference.directEnabled} onChange={(event) => updatePrinterPreference({ ...printerPreference, directEnabled: event.target.checked })} />Impressão direta</label>
                <div className="flex gap-2"><select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={printerPreference.printerName} onChange={(event) => updatePrinterPreference({ ...printerPreference, printerName: event.target.value })}><option value="">Selecione impressora</option>{printers.map((printer) => <option key={printer}>{printer}</option>)}</select><Button type="button" size="sm" variant="outline" onClick={() => void discoverPrinters()}>Detectar</Button></div>
                <Button type="button" size="sm" variant="outline" disabled={!printerPreference.printerName} onClick={() => void testKidPrinter(printerPreference.printerName).then(() => toast.success("Teste enviado")).catch(() => toast.error("Teste falhou"))}>Testar impressão</Button>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><LogOut className="h-5 w-5" />Checkout</CardTitle>
                <CardDescription>QR da etiqueta + PIN de seis dígitos. Exceção exige motivo e é auditada.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <QrScannerButton onRead={(text) => { setCheckoutQr(text); setCheckoutAttendanceId(null) }} />
                <Input
                  placeholder="Ou cole o código do QR"
                  value={checkoutQr}
                  onChange={(event) => { setCheckoutQr(event.target.value); setCheckoutAttendanceId(null) }}
                />
                {!checkoutQr && (
                  <select
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                    value={checkoutAttendanceId ?? ""}
                    onChange={(event) => setCheckoutAttendanceId(event.target.value || null)}
                  >
                    <option value="">Ou selecione a criança presente…</option>
                    {presentAttendances.map((attendance) => (
                      <option key={attendance.id} value={attendance.id}>
                        {attendance.childName} · {attendance.classroomName}
                      </option>
                    ))}
                  </select>
                )}
                <Input
                  placeholder="PIN de 6 dígitos"
                  inputMode="numeric"
                  maxLength={6}
                  value={checkoutPin}
                  onChange={(event) => setCheckoutPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={checkoutOverride}
                />
                {canOverride && (
                  <div className="space-y-2 rounded-md border border-warning/40 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={checkoutOverride} onChange={(event) => setCheckoutOverride(event.target.checked)} />
                      Exceção sem PIN/QR (auditada)
                    </label>
                    {checkoutOverride && (
                      <Input
                        placeholder="Motivo da exceção (obrigatório)"
                        value={checkoutOverrideReason}
                        onChange={(event) => setCheckoutOverrideReason(event.target.value)}
                      />
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  className="h-11 w-full"
                  disabled={pending || (!checkoutQr && !checkoutAttendanceId) || (!checkoutOverride && checkoutPin.length !== 6 && (settings?.requireCheckoutPin ?? true)) || (checkoutOverride && checkoutOverrideReason.trim().length < 5)}
                  onClick={() => void doCheckout()}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />Confirmar checkout
                  {selectedAttendance ? ` · ${selectedAttendance.childName}` : ""}
                </Button>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle>Presentes ({presentAttendances.length})</CardTitle>
                <CardDescription>{data.session.title} · capacidade {data.session.totalCapacity}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {presentAttendances.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma criança presente no momento.</p>
                )}
                {presentAttendances.map((attendance) => (
                  <div key={attendance.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Avatar size="lg">
                          {attendance.childPhotoUrl && <AvatarImage src={attendance.childPhotoUrl} alt={attendance.childName} />}
                          <AvatarFallback>{attendance.childName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <Avatar size="lg">
                          {attendance.primaryGuardianPhotoUrl && <AvatarImage src={attendance.primaryGuardianPhotoUrl} alt={attendance.primaryGuardianName ?? "Responsável"} />}
                          <AvatarFallback>{(attendance.primaryGuardianName ?? "RP").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                        <p className="font-medium">
                          {attendance.childName}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{attendance.classroomName} · {formatTime(attendance.checkedInAt)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{attendance.primaryGuardianName ?? ""}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {attendance.status === "checkout_requested" && <Badge variant="default">Retirada solicitada</Badge>}
                        {attendance.health.hasAllergy && <Badge variant="destructive">ALERGIA</Badge>}
                        {attendance.health.hasDietaryRestriction && <Badge variant="destructive">RESTRIÇÃO</Badge>}
                        {attendance.health.hasMedication && <Badge variant="destructive">MEDICAÇÃO</Badge>}
                        {attendance.health.hasSpecialNeeds && <Badge variant="destructive">ATENÇÃO</Badge>}
                        {attendance.roomOverrideReason && <Badge variant="outline">Exceção</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void reprint(attendance.id)}>
                        <Printer className="mr-1 h-3.5 w-3.5" />Etiqueta
                      </Button>
                      <div className="flex flex-1 gap-1">
                        <Input
                          placeholder="Motivo do chamado"
                          className="h-8 text-xs"
                          value={callReason[attendance.id] ?? ""}
                          onChange={(event) => setCallReason({ ...callReason, [attendance.id]: event.target.value })}
                        />
                        <Button type="button" size="sm" variant="outline" onClick={() => void doCall(attendance.id)}>
                          <Megaphone className="mr-1 h-3.5 w-3.5" />Chamar
                        </Button>
                      </div>
                      {attendance.status === "checked_in" && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => void run(() => requestKidCheckout({ attendanceId: attendance.id }), "Retirada solicitada")}>
                          Solicitar retirada
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {data.calls.length > 0 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Chamados recentes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.calls.slice(0, 10).map((call) => (
                    <div key={call.id} className="flex items-center justify-between gap-2 rounded-md border border-border/40 p-2 text-sm">
                      <span>{call.childName} · {call.classroomName} — {call.reason}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(call.calledAt)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {label && (
        <div className="hidden print:block">
          <style>{`@page { margin: 0; } body * { visibility: hidden; } .kids-label-print, .kids-label-print * { visibility: visible; } .kids-label-print { position: absolute; inset: 0; display: block; background: white; } .kids-label-page { page-break-inside: avoid; overflow: hidden; }`}</style>
          {printableLabels.length ? <PrintableLabels labels={printableLabels} print /> : <div className="kids-label-print"><LabelPreview label={label} showQr={settings?.labelShowQr ?? true} /></div>}
        </div>
      )}
    </div>
  )
}
