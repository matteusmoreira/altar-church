"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Copy, KeyRound, Plus, RefreshCw, Trash2, Webhook } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createApiKey, revokeApiKey } from "@/lib/integrations/api-keys"
import { EVENT_CATALOG } from "@/lib/integrations/events"
import {
  API_KEY_SCOPES,
  INTEGRATION_EVENTS,
  type ApiKeyRow,
  type ApiKeyScope,
  type DeliveryRow,
  type IntegrationEventType,
  type WebhookEndpoint,
} from "@/lib/integrations/types"
import {
  deleteWebhookEndpoint,
  retryIntegrationDelivery,
  saveWebhookEndpoint,
  testWebhookEndpoint,
} from "@/lib/integrations/webhooks"

function formatDateTime(value: string) {
  try {
    return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: ptBR })
  } catch {
    return value
  }
}

const statusVariant: Record<string, string> = {
  sent: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  processing: "bg-info/10 text-info border-info/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  dead: "bg-destructive/10 text-destructive border-destructive/20",
}

export function IntegrationsPanel({
  companyId,
  webhooks,
  apiKeys,
  deliveries,
}: {
  companyId: string
  webhooks: WebhookEndpoint[]
  apiKeys: ApiKeyRow[]
  deliveries: DeliveryRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [webhookOpen, setWebhookOpen] = useState(false)
  const [webhookName, setWebhookName] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookEvents, setWebhookEvents] = useState<IntegrationEventType[]>(["form.submitted"])
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)

  const [keyOpen, setKeyOpen] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [keyScopes, setKeyScopes] = useState<ApiKeyScope[]>(["forms:read", "webhooks:manage"])
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  const eventOptions = useMemo(
    () => INTEGRATION_EVENTS.filter((e) => e !== "integration.test"),
    [],
  )

  function toggleEvent(event: IntegrationEventType) {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  function toggleScope(scope: ApiKeyScope) {
    if (scope === "*") {
      setKeyScopes(["*"])
      return
    }
    setKeyScopes((prev) => {
      const withoutStar = prev.filter((s) => s !== "*")
      return withoutStar.includes(scope)
        ? withoutStar.filter((s) => s !== scope)
        : [...withoutStar, scope]
    })
  }

  function createWebhook() {
    startTransition(async () => {
      const result = await saveWebhookEndpoint({
        companyId,
        formId: null,
        name: webhookName,
        url: webhookUrl,
        events: webhookEvents,
        isActive: true,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao criar webhook")
        return
      }
      toast.success("Webhook criado")
      setRevealedSecret(result.secret ?? null)
      setWebhookName("")
      setWebhookUrl("")
      setWebhookEvents(["form.submitted"])
      setWebhookOpen(false)
      router.refresh()
    })
  }

  function removeWebhook(id: string) {
    startTransition(async () => {
      const result = await deleteWebhookEndpoint({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao remover")
        return
      }
      toast.success("Webhook removido")
      router.refresh()
    })
  }

  function testWebhook(id: string) {
    startTransition(async () => {
      const result = await testWebhookEndpoint({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Falha no teste")
        return
      }
      toast.success("Teste enfileirado e processado")
      router.refresh()
    })
  }

  function createKey() {
    startTransition(async () => {
      const result = await createApiKey({
        companyId,
        name: keyName,
        scopes: keyScopes.length ? keyScopes : ["forms:read"],
      })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao criar chave")
        return
      }
      toast.success("API key criada — copie agora")
      setRevealedKey(result.secret ?? null)
      setKeyName("")
      setKeyOpen(false)
      router.refresh()
    })
  }

  function revokeKey(id: string) {
    startTransition(async () => {
      const result = await revokeApiKey({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao revogar")
        return
      }
      toast.success("Chave revogada")
      router.refresh()
    })
  }

  function retryDelivery(id: string) {
    startTransition(async () => {
      const result = await retryIntegrationDelivery({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao reenviar")
        return
      }
      toast.success("Reenvio enfileirado")
      router.refresh()
    })
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Copiado")
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  return (
    <div className="space-y-6">
      {(revealedSecret || revealedKey) && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base">Segredo gerado — copie agora</CardTitle>
            <CardDescription>
              Não será exibido novamente. Guarde em local seguro (ex.: automação WhatsApp).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {revealedSecret && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                  {revealedSecret}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(revealedSecret)}>
                  <Copy className="h-4 w-4" />
                  Copiar secret do webhook
                </Button>
              </div>
            )}
            {revealedKey && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                  {revealedKey}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={() => copyText(revealedKey)}>
                  <Copy className="h-4 w-4" />
                  Copiar API key
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRevealedSecret(null)
                setRevealedKey(null)
              }}
            >
              Ocultar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="h-4 w-4" />
              Webhooks (globais)
            </CardTitle>
            <CardDescription>
              POST assinado para o seu sistema (ex.: automação WhatsApp) quando eventos ocorrerem.
              Formulários podem ter endpoints extras no construtor.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setWebhookOpen(true)} disabled={pending}>
            <Plus className="h-4 w-4" />
            Novo webhook
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Eventos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((hook) => (
                <TableRow key={hook.id}>
                  <TableCell className="font-medium text-sm">{hook.name}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {hook.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {hook.events.map((event) => (
                        <Badge key={event} variant="outline" className="text-[10px]">
                          {event}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{hook.isActive ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => testWebhook(hook.id)}
                    >
                      Testar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => removeWebhook(hook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {webhooks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum webhook global. Crie um apontando para sua automação WhatsApp com o evento{" "}
              <code className="text-xs">form.submitted</code>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" />
              API keys
            </CardTitle>
            <CardDescription>
              Acesso REST externo via <code className="text-xs">Authorization: Bearer ack_live_…</code>
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setKeyOpen(true)} disabled={pending}>
            <Plus className="h-4 w-4" />
            Nova chave
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium text-sm">{key.name}</TableCell>
                  <TableCell className="font-mono text-xs">{key.keyPrefix}…</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-[10px]">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{key.revokedAt ? "Revogada" : "Ativa"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!key.revokedAt && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => revokeKey(key.id)}
                      >
                        Revogar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {apiKeys.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma API key.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Entregas recentes</CardTitle>
          <CardDescription>Log do outbox de webhooks (retry automático com backoff).</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm">{row.eventType}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.endpointName ?? row.endpointId.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusVariant[row.status] ?? ""} variant="outline">
                      {row.status}
                    </Badge>
                    {row.lastError && (
                      <p className="mt-1 max-w-[200px] truncate text-[10px] text-destructive">
                        {row.lastError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{row.attempts}</TableCell>
                  <TableCell className="text-right">
                    {(row.status === "failed" || row.status === "dead") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => retryDelivery(row.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reenviar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {deliveries.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrega ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Documentação rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Spec OpenAPI:{" "}
            <a className="text-primary underline" href="/api/v1/openapi">
              /api/v1/openapi
            </a>
          </p>
          <p>
            Headers do webhook: <code className="text-xs">X-Altar-Event</code>,{" "}
            <code className="text-xs">X-Altar-Delivery-Id</code>,{" "}
            <code className="text-xs">X-Altar-Timestamp</code>,{" "}
            <code className="text-xs">X-Altar-Signature</code> (
            <code className="text-xs">HMAC-SHA256(secret, timestamp + &quot;.&quot; + body)</code>).
          </p>
          <div className="flex flex-wrap gap-2">
            {eventOptions.map((event) => (
              <Badge key={event} variant="outline">
                {EVENT_CATALOG[event].label}: {event}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo webhook global</DialogTitle>
            <DialogDescription>
              A URL receberá POST JSON. O secret de assinatura é mostrado uma vez após criar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wh-name">Nome</Label>
              <Input
                id="wh-name"
                value={webhookName}
                onChange={(e) => setWebhookName(e.target.value)}
                placeholder="WhatsApp CRM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wh-url">URL</Label>
              <Input
                id="wh-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://sua-automacao.example/webhook"
              />
            </div>
            <div className="space-y-2">
              <Label>Eventos</Label>
              <div className="flex flex-wrap gap-2">
                {eventOptions.map((event) => {
                  const active = webhookEvents.includes(event)
                  return (
                    <Button
                      key={event}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => toggleEvent(event)}
                    >
                      {event}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWebhookOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !webhookName || !webhookUrl} onClick={createWebhook}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova API key</DialogTitle>
            <DialogDescription>O valor completo aparece só uma vez após criar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Nome</Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Integração WhatsApp"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-2">
                {API_KEY_SCOPES.map((scope) => {
                  const active = keyScopes.includes(scope)
                  return (
                    <Button
                      key={scope}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => toggleScope(scope)}
                    >
                      {scope}
                    </Button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setKeyOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !keyName || keyScopes.length === 0} onClick={createKey}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
