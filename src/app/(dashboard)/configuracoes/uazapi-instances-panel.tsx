"use client"

import Image from "next/image"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import {
  connectExistingUazapiInstance,
  createUazapiInstance,
  refreshUazapiInstance,
  removeUazapiInstance,
  requestUazapiPairCode,
  requestUazapiQr,
  setDefaultUazapiInstance,
} from "@/lib/uazapi/actions"
import type { UazapiActionResult, UazapiInstanceStatus, UazapiInstancesData } from "@/lib/uazapi/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ConnectionMode = "qr" | "pair"

type ActiveConnection = {
  instanceId: string
  instanceName: string
  status: UazapiInstanceStatus
  qrCode: string | null
  pairCode: string | null
  profileName: string | null
  phone: string | null
  mode: ConnectionMode
  startedAt: number
  error?: string
}

function statusLabel(status: string) {
  if (status === "connected") return "Conectada"
  if (status === "connecting") return "Conectando"
  if (status === "error") return "Erro na conexão"
  return "Não conectada"
}

function maskedPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "")
  return digits ? `final ${digits.slice(-4)}` : null
}

function connectionFromResult(
  current: ActiveConnection | null,
  fallbackInstanceId: string,
  fallbackInstanceName: string,
  result: UazapiActionResult,
  mode: ConnectionMode,
  resetTimer: boolean,
): ActiveConnection {
  const resultData = result.data
  const instanceId = resultData?.instanceId ?? fallbackInstanceId
  const status = resultData?.status ?? (result.ok ? "connecting" : "error")
  const sameInstance = current?.instanceId === instanceId
  const connected = status === "connected"
  const instanceName = sameInstance
    ? current.instanceName
    : fallbackInstanceName === "Instância existente"
      ? resultData?.instanceName ?? fallbackInstanceName
      : fallbackInstanceName

  return {
    instanceId,
    instanceName,
    status,
    qrCode: connected ? null : resultData?.qrCode ?? (sameInstance ? current.qrCode : null),
    pairCode: connected ? null : resultData?.pairCode ?? (sameInstance ? current.pairCode : null),
    profileName: resultData?.profileName ?? (sameInstance ? current.profileName : null),
    phone: resultData?.phone ?? (sameInstance ? current.phone : null),
    mode: resetTimer || !sameInstance ? mode : current.mode,
    startedAt: resetTimer || !sameInstance ? Date.now() : current.startedAt,
    error: result.ok ? undefined : result.error ?? "Não foi possível iniciar a conexão",
  }
}

export function UazapiInstancesPanel({ data }: { data: UazapiInstancesData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [token, setToken] = useState("")
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingMode, setPairingMode] = useState(false)
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null)
  const connectionRequestInFlight = useRef(false)

  const hasQuota = data.used < data.limit
  const activePairCode = activeConnection?.pairCode
  const activeConnectionId = activeConnection?.instanceId
  const activeConnectionStatus = activeConnection?.status
  const activeConnectionMode = activeConnection?.mode
  const activeConnectionStartedAt = activeConnection?.startedAt

  useEffect(() => {
    if (!activeConnectionId || activeConnectionStatus !== "connecting") return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let consecutiveFailures = 0
    const instanceId = activeConnectionId
    const mode = activeConnectionMode ?? "qr"
    const startedAt = activeConnectionStartedAt ?? Date.now()
    const timeout = mode === "pair" ? 5 * 60 * 1000 : 2 * 60 * 1000

    const poll = async () => {
      if (cancelled) return

      if (Date.now() - startedAt >= timeout) {
        setActiveConnection((current) =>
          current?.instanceId === instanceId
            ? {
                ...current,
                status: "disconnected",
                qrCode: null,
                pairCode: null,
                error: mode === "pair" ? "O código de pareamento expirou." : "O QR Code expirou.",
              }
            : current,
        )
        return
      }

      if (connectionRequestInFlight.current) {
        timer = setTimeout(poll, 4000)
        return
      }

      const result = await refreshUazapiInstance(instanceId)
      if (cancelled) return

      if (!result.ok) {
        consecutiveFailures += 1
        if (consecutiveFailures >= 3) {
          setActiveConnection((current) =>
            current?.instanceId === instanceId
              ? { ...current, status: "error", error: result.error ?? "Falha ao verificar a conexão." }
              : current,
          )
          toast.error(result.error ?? "Falha ao verificar a conexão.")
          return
        }
        timer = setTimeout(poll, 4000)
        return
      }

      consecutiveFailures = 0
      const nextStatus = result.data?.status ?? "connecting"
      setActiveConnection((current) => {
        if (!current || current.instanceId !== instanceId) return current
        const connected = nextStatus === "connected"
        return {
          ...current,
          status: nextStatus,
          qrCode: connected ? null : result.data?.qrCode ?? current.qrCode,
          pairCode: connected ? null : result.data?.pairCode ?? current.pairCode,
          profileName: result.data?.profileName ?? current.profileName,
          phone: result.data?.phone ?? current.phone,
          error:
            nextStatus === "disconnected"
              ? mode === "pair"
                ? "O código de pareamento expirou ou foi cancelado."
                : "O QR Code expirou ou foi cancelado."
              : nextStatus === "error"
                ? "A Uazapi informou um erro na conexão."
                : undefined,
        }
      })

      if (nextStatus === "connected") {
        toast.success("WhatsApp conectado com sucesso.")
        router.refresh()
        return
      }

      if (nextStatus === "disconnected" || nextStatus === "error") {
        router.refresh()
        return
      }

      timer = setTimeout(poll, 4000)
    }

    timer = setTimeout(poll, 4000)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeConnectionId, activeConnectionMode, activeConnectionStartedAt, activeConnectionStatus, router])

  const applyConnectionResult = (
    fallbackInstanceId: string,
    fallbackInstanceName: string,
    result: UazapiActionResult,
    mode: ConnectionMode,
    resetTimer: boolean,
  ) => {
    if (result.data?.instanceId || result.ok) {
      setActiveConnection((current) =>
        connectionFromResult(current, fallbackInstanceId, fallbackInstanceName, result, mode, resetTimer),
      )
    }
  }

  const runConnectionAction = (
    operation: () => Promise<UazapiActionResult>,
    fallbackInstanceId: string,
    fallbackInstanceName: string,
    mode: ConnectionMode,
    success: string,
  ) => {
    connectionRequestInFlight.current = true
    startTransition(async () => {
      try {
        const result = await operation()
        applyConnectionResult(fallbackInstanceId, fallbackInstanceName, result, mode, true)
        if (!result.ok) toast.error(result.error ?? "Não foi possível iniciar a conexão.")
        else toast.success(success)
        router.refresh()
      } finally {
        connectionRequestInFlight.current = false
      }
    })
  }

  const createInstance = () => {
    const requestedName = name.trim()
    setPairingMode(false)
    setPairingPhone("")
    connectionRequestInFlight.current = true
    startTransition(async () => {
      try {
        const result = await createUazapiInstance(requestedName)
        if (result.ok) setName("")
        if (result.data?.instanceId) {
          applyConnectionResult(
            result.data.instanceId,
            result.data.instanceName ?? requestedName,
            result,
            "qr",
            true,
          )
        }
        if (!result.ok) toast.error(result.error ?? "Não foi possível criar a instância.")
        else toast.success("Instância criada. O QR Code está pronto.")
        router.refresh()
      } finally {
        connectionRequestInFlight.current = false
      }
    })
  }

  const connectExisting = () => {
    const currentToken = token
    setToken("")
    setPairingMode(false)
    setPairingPhone("")
    connectionRequestInFlight.current = true
    startTransition(async () => {
      try {
        const result = await connectExistingUazapiInstance(currentToken)
        if (result.data?.instanceId) {
          applyConnectionResult(
            result.data.instanceId,
            result.data.instanceName ?? "Instância existente",
            result,
            "qr",
            result.data.status === "connecting",
          )
        }
        if (!result.ok) toast.error(result.error ?? "Não foi possível vincular a instância.")
        else toast.success(result.data?.status === "connected" ? "Instância conectada." : "Instância vinculada. Conexão iniciada.")
        router.refresh()
      } finally {
        connectionRequestInFlight.current = false
      }
    })
  }

  const refreshInstance = (instanceId: string, instanceName: string) => {
    const mode = activeConnection?.instanceId === instanceId ? activeConnection.mode : "qr"
    if (activeConnection?.instanceId !== instanceId) {
      setPairingMode(false)
      setPairingPhone("")
    }
    startTransition(async () => {
      const result = await refreshUazapiInstance(instanceId)
      applyConnectionResult(instanceId, instanceName, result, mode, false)
      if (!result.ok) toast.error(result.error ?? "Não foi possível atualizar o status.")
      else toast.success(result.data?.status === "connected" ? "WhatsApp conectado." : "Status atualizado.")
      router.refresh()
    })
  }

  const requestQr = (instanceId: string, instanceName: string) => {
    setPairingMode(false)
    setPairingPhone("")
    runConnectionAction(
      () => requestUazapiQr(instanceId),
      instanceId,
      instanceName,
      "qr",
      "QR Code gerado. Aponte a câmera do WhatsApp.",
    )
  }

  const requestPairCodeForActiveInstance = () => {
    if (!activeConnection || pairingPhone.trim().length < 10) return
    runConnectionAction(
      () => requestUazapiPairCode(activeConnection.instanceId, pairingPhone),
      activeConnection.instanceId,
      activeConnection.instanceName,
      "pair",
      "Código de pareamento gerado.",
    )
  }

  const copyPairCode = async () => {
    if (!activePairCode) return
    try {
      await navigator.clipboard.writeText(activePairCode)
      toast.success("Código copiado.")
    } catch {
      toast.error("Não foi possível copiar o código.")
    }
  }

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4" />
              WhatsApp — Uazapi
            </CardTitle>
            <CardDescription>
              Instâncias isoladas desta igreja. Tokens ficam criptografados no Supabase Vault.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {data.used}/{data.limit} do plano
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">Criar nova instância</p>
              <p className="text-xs text-muted-foreground">
                Ao criar, o QR Code aparece automaticamente para conectar o WhatsApp.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="uazapi-instance-name">Nome da instância</Label>
              <Input
                id="uazapi-instance-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Secretaria da igreja"
                disabled={pending}
              />
            </div>
            <Button disabled={pending || !hasQuota || name.trim().length < 2} onClick={createInstance}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {pending ? "Criando e preparando conexão..." : "Criar instância"}
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">Conectar instância existente</p>
              <p className="text-xs text-muted-foreground">
                Cole o token de uma instância já existente. O token não volta a ser exibido.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="uazapi-existing-token">Token da instância</Label>
              <Input
                id="uazapi-existing-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Token Uazapi"
                disabled={pending}
              />
            </div>
            <Button
              variant="outline"
              disabled={pending || !hasQuota || token.trim().length < 20}
              onClick={connectExisting}
            >
              <CheckCircle2 className="h-4 w-4" />
              Validar e conectar
            </Button>
          </div>
        </div>

        {!hasQuota && (
          <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            Limite do plano atingido. O SuperAdmin precisa aumentar a franquia para adicionar outra instância.
          </p>
        )}

        <div className="space-y-3">
          {data.instances.map((instance) => {
            const isActiveConnection = activeConnection?.instanceId === instance.id
            const displayStatus = isActiveConnection ? activeConnection.status : instance.status
            const phone = isActiveConnection ? activeConnection.phone : instance.phone
            const profileName = isActiveConnection ? activeConnection.profileName : instance.profileName

            return (
              <div key={instance.id} className="space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{instance.name}</p>
                      <Badge variant={displayStatus === "connected" ? "default" : displayStatus === "error" ? "destructive" : "outline"}>
                        {statusLabel(displayStatus)}
                      </Badge>
                      {instance.isDefault && <Badge variant="secondary">Padrão de envio</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {profileName || (displayStatus === "connected" ? "WhatsApp conectado" : "Aguardando conexão")}
                      {maskedPhone(phone) ? ` · ${maskedPhone(phone)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => refreshInstance(instance.id, instance.name)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Atualizar
                    </Button>
                    {instance.status !== "connected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => requestQr(instance.id, instance.name)}
                      >
                        <QrCode className="h-4 w-4" />
                        Gerar novo QR
                      </Button>
                    )}
                    {!instance.isDefault && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || displayStatus !== "connected"}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await setDefaultUazapiInstance(instance.id)
                            if (result.ok) {
                              toast.success("Instância padrão atualizada.")
                              router.refresh()
                            } else toast.error(result.error ?? "Não foi possível atualizar a instância padrão.")
                          })
                        }
                      >
                        <Star className="h-4 w-4" />
                        Usar nos envios
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm("Remover o vínculo desta instância com a igreja?")) {
                          startTransition(async () => {
                            const result = await removeUazapiInstance(instance.id)
                            if (result.ok) {
                              if (activeConnection?.instanceId === instance.id) setActiveConnection(null)
                              toast.success("Instância removida.")
                              router.refresh()
                            } else toast.error(result.error ?? "Não foi possível remover a instância.")
                          })
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>

                {isActiveConnection && (
                  <ConnectionCard
                    connection={activeConnection}
                    pairingMode={pairingMode}
                    pairingPhone={pairingPhone}
                    pending={pending}
                    onPairingModeChange={setPairingMode}
                    onPairingPhoneChange={setPairingPhone}
                    onRequestPairCode={requestPairCodeForActiveInstance}
                    onRequestQr={() => requestQr(instance.id, instance.name)}
                    onCopyPairCode={copyPairCode}
                  />
                )}
              </div>
            )
          })}
          {data.instances.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma instância WhatsApp conectada nesta igreja.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionCard({
  connection,
  pairingMode,
  pairingPhone,
  pending,
  onPairingModeChange,
  onPairingPhoneChange,
  onRequestPairCode,
  onRequestQr,
  onCopyPairCode,
}: {
  connection: ActiveConnection
  pairingMode: boolean
  pairingPhone: string
  pending: boolean
  onPairingModeChange: (value: boolean) => void
  onPairingPhoneChange: (value: string) => void
  onRequestPairCode: () => void
  onRequestQr: () => void
  onCopyPairCode: () => void
}) {
  if (connection.status === "connected") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-5" role="status">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="font-medium text-success">WhatsApp conectado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {connection.profileName || "Número conectado"}
            {maskedPhone(connection.phone) ? ` · ${maskedPhone(connection.phone)}` : ""}
          </p>
        </div>
      </div>
    )
  }

  const expired = connection.status === "disconnected" || connection.status === "error"
  const pairCodeReady = Boolean(connection.pairCode)

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" />
          Conecte o WhatsApp: {connection.instanceName}
        </CardTitle>
        <CardDescription>
          {expired
            ? connection.error ?? "A conexão precisa ser iniciada novamente."
            : connection.mode === "pair"
              ? "Use o código no WhatsApp do celular para concluir a conexão."
              : "Aponte a câmera do WhatsApp para o QR Code. A tela verificará a conexão automaticamente."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection.error && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm" role="alert">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>{connection.error}</span>
          </div>
        )}

        {!expired && connection.mode === "qr" && (
          <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
            <div className="mx-auto rounded-lg border bg-white p-3">
              {connection.qrCode ? (
                connection.qrCode.startsWith("data:image") ? (
                  <Image src={connection.qrCode} alt="QR Code do WhatsApp" width={240} height={240} unoptimized />
                ) : (
                  <QRCodeSVG value={connection.qrCode} size={240} />
                )
              ) : (
                <div className="flex h-[240px] w-[240px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  Preparando QR Code...
                </div>
              )}
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium">No celular</p>
                <p className="text-muted-foreground">Aparelhos conectados → Conectar aparelho → escaneie o QR Code.</p>
              </div>
              <Button type="button" variant="outline" disabled={pending} onClick={() => onPairingModeChange(true)}>
                Usar código de pareamento
              </Button>
              <p className="text-xs text-muted-foreground">O QR Code fica disponível por aproximadamente 2 minutos.</p>
            </div>
          </div>
        )}

        {!expired && (pairingMode || connection.mode === "pair") && (
          <div className="space-y-3 rounded-lg border p-4">
            {!pairCodeReady && (
              <>
                <div>
                  <p className="font-medium">Código de pareamento</p>
                  <p className="text-xs text-muted-foreground">Informe o número com DDI e DDD. Ex.: +55 11 99999-9999.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="uazapi-pairing-phone">Número do WhatsApp</Label>
                    <Input
                      id="uazapi-pairing-phone"
                      type="tel"
                      inputMode="tel"
                      value={pairingPhone}
                      onChange={(event) => onPairingPhoneChange(event.target.value)}
                      placeholder="+55 11 99999-9999"
                      disabled={pending}
                    />
                  </div>
                  <Button type="button" disabled={pending || pairingPhone.trim().length < 10} onClick={onRequestPairCode}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Gerar código
                  </Button>
                </div>
              </>
            )}

            {pairCodeReady && (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium">Digite este código no WhatsApp</p>
                <code className="block rounded-lg bg-muted px-3 py-3 text-2xl font-semibold tracking-[0.3em]">
                  {connection.pairCode}
                </code>
                <Button type="button" variant="outline" onClick={onCopyPairCode}>
                  <Copy className="h-4 w-4" />
                  Copiar código
                </Button>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onPairingModeChange(false)}>
              <QrCode className="h-4 w-4" />
              Voltar para QR Code
            </Button>
          </div>
        )}

        {expired && (
          <Button type="button" disabled={pending} onClick={onRequestQr}>
            <QrCode className="h-4 w-4" />
            Gerar novo QR
          </Button>
        )}

        {!expired && connection.status === "connecting" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Verificando automaticamente se o número já foi conectado...
          </p>
        )}
      </CardContent>
    </Card>
  )
}
