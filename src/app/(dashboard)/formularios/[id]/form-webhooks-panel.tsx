"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
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
} from "@/lib/integrations/webhooks"
import type { WebhookEndpoint } from "@/lib/integrations/types"

export function FormWebhooksPanel({
  companyId,
  formId,
  endpoints,
}: {
  companyId: string
  formId: string
  endpoints: WebhookEndpoint[]
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
        events: ["form.submitted"],
        isActive: true,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao criar")
        return
      }
      toast.success("Webhook do formulário criado")
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
      toast.success("Teste enviado")
      router.refresh()
    })
  }

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Webhooks deste formulário</CardTitle>
          <CardDescription>
            Além dos webhooks globais da igreja (Configurações → Integrações). Evento:{" "}
            <code className="text-xs">form.submitted</code>.
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
                  <Badge variant="outline">{hook.isActive ? "Ativo" : "Inativo"}</Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => test(hook.id)}>
                    Testar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => remove(hook.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {endpoints.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum webhook específico. Os globais da igreja ainda disparam se estiverem inscritos em{" "}
            form.submitted.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook do formulário</DialogTitle>
            <DialogDescription>URL da sua automação (WhatsApp, n8n, Make, etc.).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="WhatsApp este form" />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
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
  )
}
