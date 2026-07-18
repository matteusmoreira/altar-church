"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Mail, MessageSquare, Megaphone, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared"
import { sendKidCampaign } from "@/lib/kids/actions"
import type { KidsCommunicationData } from "@/lib/kids/types"

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function formatDateTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

type SegmentKind = "all" | "congregation" | "classroom" | "age" | "kid"

export function KidsCommunicationTab({ data }: { data: KidsCommunicationData }) {
  const router = useRouter()
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [segmentKind, setSegmentKind] = useState<SegmentKind>("all")
  const [congregationId, setCongregationId] = useState("")
  const [classroomId, setClassroomId] = useState("")
  const [minAge, setMinAge] = useState("")
  const [maxAge, setMaxAge] = useState("")
  const [kidId, setKidId] = useState("")
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    try {
      const result = await sendKidCampaign({
        channel,
        subject,
        body,
        congregationId: segmentKind === "congregation" ? congregationId || null : null,
        classroomId: segmentKind === "classroom" ? classroomId || null : null,
        minAgeMonths: segmentKind === "age" && minAge !== "" ? Number(minAge) : null,
        maxAgeMonths: segmentKind === "age" && maxAge !== "" ? Number(maxAge) : null,
        kidId: segmentKind === "kid" ? kidId || null : null,
      })
      if (showResult(result)) {
        toast.success("Campanha enfileirada. Entregas seguem preferências e consentimentos.")
        setBody("")
        setSubject("")
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="glass h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Nova campanha</CardTitle>
          <CardDescription>
            Segmentada por congregação, sala, idade ou família. Campanhas exigem consentimento de comunicação e respeitam os canais de cada responsável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Canal</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={channel} onChange={(event) => setChannel(event.target.value as "whatsapp" | "email")}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Segmento</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={segmentKind} onChange={(event) => setSegmentKind(event.target.value as SegmentKind)}>
                <option value="all">Todos os responsáveis</option>
                <option value="congregation">Congregação</option>
                <option value="classroom">Sala (presença recente)</option>
                <option value="age">Faixa etária</option>
                <option value="kid">Família (uma criança)</option>
              </select>
            </div>
          </div>

          {segmentKind === "congregation" && (
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={congregationId} onChange={(event) => setCongregationId(event.target.value)}>
              <option value="">Escolha a congregação…</option>
              {data.congregations.map((congregation) => (
                <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
              ))}
            </select>
          )}
          {segmentKind === "classroom" && (
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
              <option value="">Escolha a sala…</option>
              {data.classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
              ))}
            </select>
          )}
          {segmentKind === "age" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Idade mín. (meses)</Label>
                <Input type="number" min={0} value={minAge} onChange={(event) => setMinAge(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Idade máx. (meses)</Label>
                <Input type="number" min={0} value={maxAge} onChange={(event) => setMaxAge(event.target.value)} />
              </div>
            </div>
          )}
          {segmentKind === "kid" && (
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={kidId} onChange={(event) => setKidId(event.target.value)}>
              <option value="">Escolha a criança…</option>
              {data.children.map((child) => (
                <option key={child.id} value={child.id}>{child.fullName}</option>
              ))}
            </select>
          )}

          {channel === "email" && (
            <div className="space-y-1">
              <Label>Assunto *</Label>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Mensagem *</Label>
            <Textarea rows={4} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva a mensagem para os responsáveis…" />
            <p className="text-xs text-muted-foreground">{body.length}/2000 · Sem dados clínicos ou códigos de retirada.</p>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={pending || body.trim().length < 2 || (channel === "email" && subject.trim().length === 0) || (segmentKind === "congregation" && !congregationId) || (segmentKind === "classroom" && !classroomId) || (segmentKind === "kid" && !kidId)}
            onClick={() => void submit()}
          >
            <Send className="mr-2 h-4 w-4" />Enviar campanha
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.messages.length === 0 && (
          <Card className="glass">
            <CardContent className="p-0">
              <EmptyState icon={MessageSquare} title="Nenhuma mensagem" description="Mensagens operacionais e campanhas aparecem aqui com o status de entrega." />
            </CardContent>
          </Card>
        )}
        {data.messages.map((message) => (
          <Card key={message.id} className="glass">
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{message.subject || "(sem assunto)"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(message.createdAt)}
                    {message.createdByName ? ` · ${message.createdByName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {message.channel === "email" ? <Mail className="h-4 w-4 text-muted-foreground" /> : message.channel === "whatsapp" ? <MessageSquare className="h-4 w-4 text-muted-foreground" /> : null}
                  <Badge variant={message.status === "cancelled" ? "destructive" : "secondary"}>{message.status}</Badge>
                </div>
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
              <div className="flex flex-wrap gap-1 text-xs">
                {message.deliveredCount > 0 && <Badge variant="default">{message.deliveredCount} entregue(s)</Badge>}
                {message.sentCount > 0 && <Badge variant="secondary">{message.sentCount} enviada(s)</Badge>}
                {message.queuedCount > 0 && <Badge variant="secondary">{message.queuedCount} na fila</Badge>}
                {message.pendingCount > 0 && <Badge variant="outline">{message.pendingCount} pendente(s)</Badge>}
                {message.failedCount > 0 && <Badge variant="destructive">{message.failedCount} falha(s)</Badge>}
                {message.pendingCount + message.queuedCount + message.sentCount + message.deliveredCount + message.failedCount === 0 && (
                  <Badge variant="outline">sem destinatários elegíveis</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
