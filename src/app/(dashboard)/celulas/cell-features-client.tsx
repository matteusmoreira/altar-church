"use client"

/* eslint-disable @typescript-eslint/no-unused-expressions */

import Image from "next/image"
import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { BookOpen, Camera, CheckCircle2, ClipboardCheck, Download, Heart, ImageIcon, LinkIcon, Megaphone, QrCode, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  closeCellCheckin,
  deleteCellPhoto,
  manualCellCheckin,
  openCellCheckin,
  saveCellNotice,
  saveCellPrayer,
  saveCellStudy,
  updateCellPrayerStatus,
  uploadCellPhotos,
} from "@/lib/cells/actions"
import type { CellActionResult, CellFeaturesData, CellNotice } from "@/lib/cells/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
const prayerLabels = { open: "Aberto", praying: "Em oração", answered: "Respondido", archived: "Arquivado" }

function NoticeText({ notice }: { notice: CellNotice }) {
  const chunks = notice.content.split(/(https?:\/\/[^\s]+)/g)
  return <p className="whitespace-pre-wrap text-sm text-muted-foreground">{chunks.map((chunk, index) =>
    /^https?:\/\//.test(chunk)
      ? <a key={index} href={chunk} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline"><LinkIcon className="h-3 w-3" />{chunk}</a>
      : chunk
  )}</p>
}

function CellCheckboxes({ cells }: { cells: CellFeaturesData["cells"] }) {
  return <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
    {cells.map((cell) => <label key={cell.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="groupIds" value={cell.id} className="h-4 w-4" />{cell.name}</label>)}
  </div>
}

export function CellFeaturesClient({ data }: { data: CellFeaturesData }) {
  const router = useRouter()
  const [pending, rawStartTransition] = useTransition()
  const startTransition = (callback: () => unknown | Promise<unknown>) => rawStartTransition(async () => { await callback() })
  const [selectedMeetingId, setSelectedMeetingId] = useState(data.meetings[0]?.id ?? "")
  const [qrToken, setQrToken] = useState(data.sessions.find((session) => session.active)?.token ?? "")
  const [studyAudience, setStudyAudience] = useState<"all" | "selected">("selected")
  const [noticeAudience, setNoticeAudience] = useState<"all" | "selected">("selected")
  const selectedMeeting = data.meetings.find((meeting) => meeting.id === selectedMeetingId)
  const qrUrl = qrToken && typeof window !== "undefined" ? `${window.location.origin}/celulas/check-in?token=${qrToken}` : ""

  function submitForm(event: FormEvent<HTMLFormElement>, action: (formData: FormData) => Promise<CellActionResult>, success: string) {
    event.preventDefault()
    const form = event.currentTarget
    const payload = new FormData(form)
    startTransition(async () => {
      const result = await action(payload)
      if (!result.ok) return toast.error(result.error ?? "Operação não concluída")
      toast.success(success)
      form.reset()
      router.refresh()
    })
  }

  if (data.mode === "portal") {
    return <div className="space-y-6">
      <div><h1 className="text-2xl font-bold md:text-3xl">Minhas Células</h1><p className="text-muted-foreground">Estudos, avisos, encontros, fotos e pedidos de oração.</p></div>
      {data.cells.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">Seu cadastro ainda não está vinculado a uma célula.</CardContent></Card> : <>
        <Tabs defaultValue="encontros">
          <TabsList className="flex h-auto flex-wrap"><TabsTrigger value="encontros"><BookOpen />Encontros</TabsTrigger><TabsTrigger value="avisos"><Megaphone />Avisos</TabsTrigger><TabsTrigger value="mural"><ImageIcon />Mural</TabsTrigger><TabsTrigger value="oracao"><Heart />Oração</TabsTrigger></TabsList>
          <TabsContent value="encontros" className="grid gap-4 md:grid-cols-2">
            {data.meetings.map((meeting) => <Card key={meeting.id}><CardHeader><CardTitle>{meeting.title}</CardTitle><CardDescription>{meeting.groupName} · {dateTime(meeting.startsAt)}</CardDescription></CardHeader><CardContent>{meeting.study ? <div className="space-y-2"><p className="font-medium">{meeting.study.title}</p><p className="text-sm text-muted-foreground">{meeting.study.description}</p>{meeting.study.scriptureRef && <Badge variant="outline">{meeting.study.scriptureRef}</Badge>}<Button render={<a href={meeting.study.fileUrl} target="_blank" rel="noopener noreferrer" />} variant="outline"><Download />Baixar estudo</Button></div> : <p className="text-sm text-muted-foreground">Estudo ainda não publicado.</p>}</CardContent></Card>)}
          </TabsContent>
          <TabsContent value="avisos" className="grid gap-4 md:grid-cols-2">{data.notices.map((notice) => <Card key={notice.id}><CardHeader><CardTitle>{notice.title}</CardTitle><CardDescription>{notice.authorName} · {dateTime(notice.publishedAt)}</CardDescription></CardHeader><CardContent><NoticeText notice={notice} /></CardContent></Card>)}</TabsContent>
          <TabsContent value="mural" className="space-y-6">{data.meetings.filter((meeting) => meeting.photos.length > 0).map((meeting) => <section key={meeting.id}><h3 className="mb-3 font-semibold">{meeting.groupName} · {dateTime(meeting.startsAt)}</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{meeting.photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="relative aspect-square overflow-hidden rounded-xl border"><Image src={photo.url} alt={photo.fileName} fill unoptimized className="object-cover" /></a>)}</div></section>)}</TabsContent>
          <TabsContent value="oracao" className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Novo pedido</CardTitle><CardDescription>Visível somente para você e liderança da célula.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => submitForm(event, saveCellPrayer, "Pedido enviado")} className="space-y-3"><Select name="groupId" defaultValue={data.cells[0]?.id}><SelectTrigger><SelectValue placeholder="Célula" /></SelectTrigger><SelectContent>{data.cells.map((cell) => <SelectItem key={cell.id} value={cell.id}>{cell.name}</SelectItem>)}</SelectContent></Select><Textarea name="message" maxLength={5000} required rows={5} placeholder="Escreva seu pedido de oração" /><Button disabled={pending}><Heart />Enviar pedido</Button></form></CardContent></Card><div className="space-y-3">{data.prayers.map((prayer) => <Card key={prayer.id}><CardContent className="space-y-2 pt-5"><div className="flex justify-between gap-3"><strong>{prayer.groupName}</strong><Badge>{prayerLabels[prayer.status]}</Badge></div><p className="whitespace-pre-wrap text-sm">{prayer.message}</p><p className="text-xs text-muted-foreground">{dateTime(prayer.createdAt)}</p></CardContent></Card>)}</div></TabsContent>
        </Tabs>
      </>}
    </div>
  }

  return <Card className="glass"><CardHeader><CardTitle>Operação avançada de Células</CardTitle><CardDescription>Estudos, QR, presença, mural, oração e avisos.</CardDescription></CardHeader><CardContent>
    <Tabs defaultValue="estudos">
      <TabsList className="flex h-auto flex-wrap"><TabsTrigger value="estudos"><BookOpen />Estudos</TabsTrigger><TabsTrigger value="checkin"><QrCode />Check-in</TabsTrigger><TabsTrigger value="mural"><Camera />Mural</TabsTrigger><TabsTrigger value="oracao"><Heart />Oração</TabsTrigger><TabsTrigger value="avisos"><Megaphone />Avisos</TabsTrigger></TabsList>

      <TabsContent value="estudos" className="grid gap-6 lg:grid-cols-2"><form onSubmit={(event) => submitForm(event, saveCellStudy, "Estudo publicado")} className="space-y-3"><Label>Título</Label><Input name="title" required minLength={3} maxLength={160} /><Label>Descrição</Label><Textarea name="description" maxLength={3000} /><Label>Referência bíblica</Label><Input name="scriptureRef" maxLength={300} /><Label>Arquivo — PDF, Word, Excel ou TXT; até 30 MB</Label><Input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" /><Label>Destino</Label><Select name="audience" value={studyAudience} onValueChange={(value) => setStudyAudience((value ?? "selected") as "all" | "selected")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selected">Células selecionadas</SelectItem><SelectItem value="all">Todas as células (somente admin)</SelectItem></SelectContent></Select>{studyAudience === "selected" && <CellCheckboxes cells={data.cells} />}<Button disabled={pending}><Upload />Enviar estudo</Button></form><div className="space-y-3">{data.studies.map((study) => <Card key={study.id}><CardContent className="space-y-2 pt-5"><strong>{study.title}</strong><p className="text-sm text-muted-foreground">{study.description}</p><Button render={<a href={study.fileUrl} target="_blank" rel="noopener noreferrer" />} variant="outline"><Download />{study.fileName}</Button></CardContent></Card>)}</div></TabsContent>

      <TabsContent value="checkin" className="space-y-6"><div className="grid gap-3 md:grid-cols-[1fr_auto_auto]"><Select value={selectedMeetingId} onValueChange={(value) => { setSelectedMeetingId(value ?? ""); setQrToken(data.sessions.find((session) => session.meetingId === value && session.active)?.token ?? "") }}><SelectTrigger><SelectValue placeholder="Selecione encontro" /></SelectTrigger><SelectContent>{data.meetings.map((meeting) => <SelectItem key={meeting.id} value={meeting.id}>{meeting.groupName} · {meeting.title} · {dateTime(meeting.startsAt)}</SelectItem>)}</SelectContent></Select><Button disabled={pending || !selectedMeetingId} onClick={() => startTransition(async () => { const result = await openCellCheckin(selectedMeetingId); if (!result.ok) return toast.error(result.error); setQrToken(result.token ?? ""); toast.success("QR aberto"); router.refresh() })}><QrCode />Abrir QR</Button><Button variant="outline" disabled={pending || !selectedMeetingId} onClick={() => startTransition(async () => { const result = await closeCellCheckin(selectedMeetingId); if (!result.ok) return toast.error(result.error); setQrToken(""); toast.success("Encontro encerrado"); router.refresh() })}><CheckCircle2 />Encerrar</Button></div>{qrUrl && <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-white p-5 text-black"><QRCodeSVG value={qrUrl} size={240} /><p className="break-all text-center text-xs">{qrUrl}</p></div>}<Card><CardHeader><CardTitle>Check-in manual</CardTitle></CardHeader><CardContent><form onSubmit={(event) => submitForm(event, manualCellCheckin, "Presença registrada")} className="grid gap-3 md:grid-cols-2"><input type="hidden" name="meetingId" value={selectedMeetingId} /><Select name="personId"><SelectTrigger><SelectValue placeholder="Pessoa cadastrada (opcional)" /></SelectTrigger><SelectContent>{data.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select><div /><Input name="visitorName" placeholder="Nome do visitante" /><Input name="visitorPhone" placeholder="Telefone do visitante" /><Button disabled={pending || !selectedMeetingId}><ClipboardCheck />Registrar</Button></form></CardContent></Card>{selectedMeeting && <div className="space-y-2"><h3 className="font-semibold">Presentes — {selectedMeeting.title}</h3>{data.attendance.filter((item) => item.meetingId === selectedMeeting.id).map((item) => <div key={item.id} className="flex justify-between rounded-lg border p-3 text-sm"><span>{item.personName}{item.visitor ? " · Visitante" : ""}</span><Badge variant="outline">{item.source === "qr" ? "QR" : "Manual"}</Badge></div>)}</div>}</TabsContent>

      <TabsContent value="mural" className="space-y-5"><form onSubmit={(event) => submitForm(event, uploadCellPhotos, "Fotos enviadas")} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Select name="meetingId" value={selectedMeetingId} onValueChange={(value) => setSelectedMeetingId(value ?? "")}><SelectTrigger><SelectValue placeholder="Encontro" /></SelectTrigger><SelectContent>{data.meetings.map((meeting) => <SelectItem key={meeting.id} value={meeting.id}>{meeting.groupName} · {dateTime(meeting.startsAt)}</SelectItem>)}</SelectContent></Select><Input name="photos" type="file" multiple required accept=".jpg,.jpeg,.png,.webp,.heic,.heif" /><Button disabled={pending}><Camera />Enviar fotos</Button></form>{data.meetings.filter((meeting) => meeting.photos.length).map((meeting) => <section key={meeting.id}><h3 className="mb-3 font-semibold">{meeting.groupName} · {dateTime(meeting.startsAt)}</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{meeting.photos.map((photo) => <div key={photo.id} className="space-y-2"><a href={photo.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-square overflow-hidden rounded-xl border"><Image src={photo.url} alt={photo.fileName} fill unoptimized className="object-cover" /></a><Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => { const result = await deleteCellPhoto(photo.id); result.ok ? (toast.success("Foto removida"), router.refresh()) : toast.error(result.error) })}>Remover</Button></div>)}</div></section>)}</TabsContent>

      <TabsContent value="oracao" className="space-y-3">{data.prayers.map((prayer) => <Card key={prayer.id}><CardContent className="grid gap-3 pt-5 md:grid-cols-[1fr_180px]"><div><div className="flex flex-wrap gap-2"><strong>{prayer.authorName}</strong><Badge variant="outline">{prayer.groupName}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm">{prayer.message}</p><p className="mt-2 text-xs text-muted-foreground">{dateTime(prayer.createdAt)}</p></div><Select value={prayer.status} onValueChange={(value) => startTransition(async () => { const result = await updateCellPrayerStatus(prayer.id, value ?? "open"); result.ok ? router.refresh() : toast.error(result.error) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(prayerLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>)}</TabsContent>

      <TabsContent value="avisos" className="grid gap-6 lg:grid-cols-2"><form onSubmit={(event) => submitForm(event, saveCellNotice, "Aviso publicado")} className="space-y-3"><Label>Título</Label><Input name="title" required minLength={3} maxLength={160} /><Label>Instruções</Label><Textarea name="content" required rows={6} maxLength={10000} placeholder="Texto livre. Links http/https ficam clicáveis." /><Select name="audience" value={noticeAudience} onValueChange={(value) => setNoticeAudience((value ?? "selected") as "all" | "selected")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selected">Células selecionadas</SelectItem><SelectItem value="all">Todas as células (somente admin)</SelectItem></SelectContent></Select>{noticeAudience === "selected" && <CellCheckboxes cells={data.cells} />}<Button disabled={pending}><Megaphone />Publicar aviso</Button></form><div className="space-y-3">{data.notices.map((notice) => <Card key={notice.id}><CardHeader><CardTitle>{notice.title}</CardTitle><CardDescription>{notice.authorName} · {dateTime(notice.publishedAt)}</CardDescription></CardHeader><CardContent><NoticeText notice={notice} /></CardContent></Card>)}</div></TabsContent>
    </Tabs>
  </CardContent></Card>
}
