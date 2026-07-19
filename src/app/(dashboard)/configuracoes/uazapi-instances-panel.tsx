"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, MessageCircle, Plus, RefreshCw, Star, Trash2 } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"
import {
  connectExistingUazapiInstance,
  createUazapiInstance,
  refreshUazapiInstance,
  removeUazapiInstance,
  requestUazapiQr,
  setDefaultUazapiInstance,
} from "@/lib/uazapi/actions"
import type { UazapiInstancesData } from "@/lib/uazapi/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function statusLabel(status: string) {
  if (status === "connected") return "Conectada"
  if (status === "connecting") return "Aguardando conexão"
  if (status === "error") return "Erro"
  return "Desconectada"
}

export function UazapiInstancesPanel({ data }: { data: UazapiInstancesData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [token, setToken] = useState("")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairCode, setPairCode] = useState<string | null>(null)

  const run = (
    operation: () => Promise<{ ok: boolean; error?: string; data?: { qrCode?: string; pairCode?: string } }>,
    success: string,
  ) => {
    startTransition(async () => {
      const result = await operation()
      if (!result.ok) {
        toast.error(result.error ?? "Operação falhou")
        return
      }
      if (result.data?.qrCode) setQrCode(result.data.qrCode)
      if (result.data?.pairCode) setPairCode(result.data.pairCode)
      toast.success(success)
      router.refresh()
    })
  }

  const hasQuota = data.used < data.limit

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
                Cria na Uazapi e depois exibe o QR para conectar o WhatsApp.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="uazapi-instance-name">Nome da instância</Label>
              <Input
                id="uazapi-instance-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Secretaria da igreja"
              />
            </div>
            <Button
              disabled={pending || !hasQuota || name.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const result = await createUazapiInstance(name)
                  if (result.ok) setName("")
                  return result
                }, "Instância criada. Gere o QR para conectar.")
              }
            >
              <Plus className="h-4 w-4" />
              Criar instância
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
              />
            </div>
            <Button
              variant="outline"
              disabled={pending || !hasQuota || token.trim().length < 20}
              onClick={() =>
                run(async () => {
                  const result = await connectExistingUazapiInstance(token)
                  if (result.ok) setToken("")
                  return result
                }, "Instância vinculada à igreja.")
              }
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
          {data.instances.map((instance) => (
            <div
              key={instance.id}
              className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{instance.name}</p>
                  <Badge variant={instance.status === "connected" ? "default" : "outline"}>
                    {statusLabel(instance.status)}
                  </Badge>
                  {instance.isDefault && <Badge variant="secondary">Padrão de envio</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {instance.profileName || "Sem perfil conectado"}
                  {instance.phone ? ` · final ${instance.phone.slice(-4)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => refreshUazapiInstance(instance.id), "Status atualizado.")}
                >
                  <RefreshCw className="h-4 w-4" />
                  Atualizar
                </Button>
                {instance.status !== "connected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => requestUazapiQr(instance.id), "QR gerado.")}
                  >
                    Gerar QR
                  </Button>
                )}
                {!instance.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || instance.status !== "connected"}
                    onClick={() => run(() => setDefaultUazapiInstance(instance.id), "Instância padrão atualizada.")}
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
                      run(() => removeUazapiInstance(instance.id), "Instância removida.")
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remover
                </Button>
              </div>
            </div>
          ))}
          {data.instances.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma instância WhatsApp conectada nesta igreja.
            </p>
          )}
        </div>

        {(qrCode || pairCode) && (
          <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-lg border p-5 text-center">
            <p className="font-medium">Conecte no WhatsApp</p>
            {qrCode ? (
              qrCode.startsWith("data:image") ? (
                <Image src={qrCode} alt="QR Code do WhatsApp" width={240} height={240} unoptimized />
              ) : (
                <QRCodeSVG value={qrCode} size={240} />
              )
            ) : null}
            {pairCode && <code className="rounded bg-muted px-3 py-2 text-lg">{pairCode}</code>}
            <p className="text-xs text-muted-foreground">
              No celular: Aparelhos conectados → Conectar aparelho. O QR expira em cerca de 2 minutos.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
