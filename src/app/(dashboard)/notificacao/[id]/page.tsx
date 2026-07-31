import Link from "next/link"
import { ArrowLeft, RefreshCw, Send, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getNotificationDetails } from "@/lib/notifications/data"
import { retryNotificationDeliveryAction } from "@/lib/notifications/actions"

const statusLabels: Record<string, string> = {
  pending: "Pendente", processing: "Processando", sent: "Enviado", failed: "Falhou", canceled: "Cancelado", dead: "Dead letter",
}

function maskRecipient(value: string, channel: string) {
  if (channel === "push") return "Endpoint push"
  if (channel === "email") {
    const [name, domain] = value.split("@")
    return name && domain ? `${name.slice(0, 2)}***@${domain}` : value
  }
  return value.length > 4 ? `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : value
}

async function retryDeliveryForm(formData: FormData) {
  "use server"
  await retryNotificationDeliveryAction(formData)
}

export default async function NotificationDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getNotificationDetails(id)
  const sent = data.deliveries.filter((delivery) => delivery.status === "sent").length
  const failed = data.deliveries.filter((delivery) => delivery.status === "failed" || delivery.status === "dead").length
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/notificacao" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Notificações</Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><Send className="h-6 w-6 text-primary" /> {data.title}</h1>
          <p className="mt-1 text-muted-foreground">Detalhe por destinatário. Contatos são mascarados na tela.</p>
        </div>
        <Badge>{statusLabels[data.status] ?? data.status}</Badge>
      </div>
      <Card className="glass"><CardContent className="space-y-3 p-5"><p className="whitespace-pre-wrap">{data.content}</p><div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>Canal: {data.method}</span><span>Público: {data.audienceKind}</span><span>Snapshot: {data.snapshotCount}</span><span>Enviados: {sent}</span><span>Falhas/dead: {failed}</span></div></CardContent></Card>
      <Card className="glass overflow-hidden"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TriangleAlert className="h-4 w-4 text-primary" /> Entregas</CardTitle></CardHeader>
        <Table><TableHeader><TableRow><TableHead>Destinatário</TableHead><TableHead>Canal</TableHead><TableHead>Status</TableHead><TableHead>Tentativas</TableHead><TableHead>Erro</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>
          {data.deliveries.map((delivery) => <TableRow key={delivery.id}><TableCell><span className="font-medium">{delivery.recipientName}</span><span className="block text-xs text-muted-foreground">{maskRecipient(delivery.recipient, delivery.channel)}</span></TableCell><TableCell>{delivery.channel}</TableCell><TableCell><Badge variant={delivery.status === "sent" ? "default" : delivery.status === "dead" || delivery.status === "failed" ? "destructive" : "secondary"}>{statusLabels[delivery.status]}</Badge></TableCell><TableCell>{delivery.attempts}</TableCell><TableCell className="max-w-sm truncate text-xs text-muted-foreground">{delivery.lastError ?? "-"}</TableCell><TableCell>{(delivery.status === "failed" || delivery.status === "dead") && <form action={retryDeliveryForm}><input type="hidden" name="deliveryId" value={delivery.id} /><Button type="submit" size="sm" variant="outline"><RefreshCw className="h-3.5 w-3.5" /> Reenviar</Button></form>}</TableCell></TableRow>)}
        </TableBody></Table>
        {data.deliveries.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma entrega criada.</p>}
      </Card>
    </div>
  )
}
