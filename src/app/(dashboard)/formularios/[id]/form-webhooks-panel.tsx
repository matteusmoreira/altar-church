"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Copy, Plus, Trash2 } from "lucide-react"
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
import {
  deleteWebhookEndpoint,
  saveWebhookEndpoint,
  testWebhookEndpoint,
} from "@/lib/integrations/webhooks-actions"
import type { DeliveryRow, WebhookEndpoint } from "@/lib/integrations/types"

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

export function FormWebhooksPanel({
  companyId,
  formId,
  endpoints,
  deliveries = [],
}: {
  companyId: string
  formId: string
  endpoints: WebhookEndpoint[]
  deliveries?: DeliveryRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [secret, setSecret] = useState<string | null>(null)

  function create() {
    startTransition(async () => {
      const result = await saveWebhookEndpoint({
        companyId,
        formId,
        name: name || "Webhook do formulário",
        url,
        // Form webhooks always fire on public submit — no event picker needed.
        events: ["form.submitted"],
        isActive: true,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao criar")
        return
      }
      toast.success("Webhook do formulário criado (evento form.submitted)")
      setSecret(result.secret ?? null)
      setName("")
      setUrl("")
      setOpen(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteWebhookEndpoint({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao remover")
        return
      }
      toast.success("Removido")
      router.refresh()
    })
  }

  function test(id: string) {
    startTransition(async () => {
      const result = await testWebhookEndpoint({ id, companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Falha no teste")
        return
      }
      const data = result.data as { sent?: number; failed?: number; processed?: number } | undefined
      const sent = data?.sent ?? 0
      const failed = data?.failed ?? 0
      if (sent > 0) {
        toast.success(`Teste OK: ${sent} envio(s) com sucesso. Veja o log abaixo.`)
      } else if (failed > 0) {
        toast.error(
          `Teste processado, mas falhou (${failed}). Veja o erro no log abaixo (URL, token ou automação desabilitada).`,
        )
      } else {
        toast.message("Teste enfileirado. Atualize a página e confira o log de webhooks abaixo.")
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Webhooks deste formulário</CardTitle>
            <CardDescription className="space-y-1">
              <span className="block">
                Só precisa de <strong>nome + URL</strong>. O evento{" "}
                <code className="text-xs">form.submitted</code> já é aplicado automaticamente quando
                alguém preenche o form público.
              </span>
              <span className="block text-muted-foreground">
                A aba <strong>Envios</strong> (ao lado) lista pessoas que preencheram o form — não é
                o log do webhook. O log de entrega está nesta aba, abaixo.
              </span>
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={pending}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {secret && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <p className="mb-2 font-medium">Secret (copie agora)</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 break-all text-xs">{secret}</code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(secret)
                    toast.success("Copiado")
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((hook) => (
                <TableRow key={hook.id}>
                  <TableCell className="text-sm font-medium">{hook.name}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {hook.url}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      form.submitted
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{hook.isActive ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => test(hook.id)}
                    >
                      Testar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => remove(hook.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {endpoints.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum webhook. Cole a URL do bloco <strong>Altar Church</strong> do Altar Chat
              (automation-webhook/…).
            </p>
          )}
        </CardContent>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook do formulário</DialogTitle>
              <DialogDescription>
                Cole a URL do Altar Chat (bloco Altar Church). Evento automático: form.submitted.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Altar Chat"
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://….convex.site/automation-webhook/…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Não há seletor de eventos aqui: este webhook do formulário sempre usa{" "}
                <code>form.submitted</code>.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={pending || !url} onClick={create}>
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Log de webhooks (este form)</CardTitle>
          <CardDescription>
            Resultado dos POSTs para a URL configurada (incluindo o botão Testar). Diferente da aba
            Envios, que lista quem preencheu o formulário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Erro</TableHead>
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
                    {row.responseStatus != null && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        HTTP {row.responseStatus}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-[10px] text-destructive">
                    {row.lastError ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {deliveries.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum envio de webhook ainda. Use <strong>Testar</strong> ou preencha o form
              público.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
