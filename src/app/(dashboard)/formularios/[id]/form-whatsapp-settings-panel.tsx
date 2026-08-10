"use client"

/* A local/signed preview URL, when present, is rendered directly in this small preview. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, useTransition } from "react"
import { Copy, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { saveFormWhatsAppSettings, uploadFormWhatsappMedia } from "@/lib/forms/actions"
import { emptyDirectMessage } from "@/lib/forms/direct-message"
import type {
  ChurchForm,
  FormButtonAction,
  FormDirectButton,
  FormDirectMessage,
  FormField,
  FormUazapiInstanceOption,
  FormWhatsappMedia,
} from "@/lib/forms/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const mediaAccept = "image/jpeg,image/png,image/webp,video/mp4,application/pdf"

const typeLabels: Record<FormDirectMessage["type"], string> = {
  text: "Texto",
  button: "BotÃµes",
  list: "Lista",
  carousel: "Carrossel",
}

const actionLabels: Record<FormButtonAction, string> = {
  reply: "Resposta",
  url: "Abrir URL",
  call: "Ligar",
  copy: "Copiar",
}

function instanceLabel(instance: FormUazapiInstanceOption) {
  const phone = instance.phone?.replace(/\D/g, "")
  const suffix = phone ? ` · final ${phone.slice(-4)}` : ""
  const state = instance.status === "connected" ? "Conectada" : instance.status === "connecting" ? "Conectando" : "Desconectada"
  return `${instance.name}${suffix} · ${state}`
}

function mediaTypeFromMime(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType === "application/pdf") return "document"
  return "image"
}

function buttonEditor(
  buttons: FormDirectButton[],
  onChange: (buttons: FormDirectButton[]) => void,
  addLabel = "Adicionar botÃ£o",
) {
  return (
    <div className="space-y-2">
      {buttons.map((button, index) => (
        <div key={`${index}-${button.label}`} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_1fr_auto]">
          <Input
            value={button.label}
            onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
            placeholder="Texto do botÃ£o"
          />
          <Select
            value={button.action}
            onValueChange={(value) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, action: (value ?? "reply") as FormButtonAction } : item))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(actionLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={button.value}
            onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
            placeholder={button.action === "url" ? "https://..." : button.action === "call" ? "+5511999999999" : "Identificador ou texto"}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={buttons.length <= 1}
            onClick={() => onChange(buttons.filter((_item, itemIndex) => itemIndex !== index))}
            aria-label="Remover botÃ£o"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {buttons.length < 3 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...buttons, { label: "", action: "reply", value: "" }])}
        >
          <Plus className="mr-1 h-4 w-4" />{addLabel}
        </Button>
      )}
    </div>
  )
}

export function FormWhatsappSettingsPanel({
  companyId,
  formId,
  form,
  fields,
  instances,
  mediaFiles: initialMediaFiles,
}: {
  companyId: string
  formId: string
  form: ChurchForm
  fields: FormField[]
  instances: FormUazapiInstanceOption[]
  mediaFiles: FormWhatsappMedia[]
}) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState(form.afterSubmitMode)
  const [instanceId, setInstanceId] = useState(form.whatsappInstanceId ?? "")
  const [message, setMessage] = useState<FormDirectMessage>(form.directMessage ?? emptyDirectMessage())
  const [mediaFiles, setMediaFiles] = useState(initialMediaFiles)

  const variables = useMemo(() => {
    const fieldKeys = fields.map((field) => field.fieldKey).filter(Boolean)
    return [...new Set([...fieldKeys, "nome", "telefone", "email", "form_title", "form_slug", "source"])]
  }, [fields])

  function save() {
    startTransition(async () => {
      const result = await saveFormWhatsAppSettings({
        companyId,
        formId,
        mode,
        instanceId: instanceId || null,
        message,
      })
      if (!result.ok) {
        toast.error(result.error ?? "NÃ£o foi possÃ­vel salvar o envio")
        return
      }
      toast.success("AÃ§Ã£o pÃ³s-preenchimento salva")
    })
  }

  function changeType(type: FormDirectMessage["type"]) {
    setMessage((current) => {
      if (current.type === type) return current
      const next = emptyDirectMessage(type)
      return "text" in current && "text" in next ? { ...next, text: current.text } as FormDirectMessage : next
    })
  }

  function updateButtonMessage(buttons: FormDirectButton[], cardIndex?: number) {
    setMessage((current) => {
      if (current.type === "button" && cardIndex == null) return { ...current, buttons }
      if (current.type === "carousel" && cardIndex != null) {
        return { ...current, cards: current.cards.map((card, index) => index === cardIndex ? { ...card, buttons } : card) }
      }
      return current
    })
  }

  function uploadCardMedia(cardIndex: number, file: File) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("companyId", companyId)
      formData.set("formId", formId)
      formData.set("file", file)
      const result = await uploadFormWhatsappMedia(formData)
      if (!result.ok || !result.id || !result.mimeType) {
        toast.error(result.error ?? "NÃ£o foi possÃ­vel enviar a mÃ­dia")
        return
      }
      const media = {
        id: result.id,
        originalName: result.originalName ?? file.name,
        mimeType: result.mimeType,
        sizeBytes: result.sizeBytes ?? file.size,
        signedUrl: result.signedUrl ?? null,
      }
      setMediaFiles((current) => [...current.filter((item) => item.id !== media.id), media])
      setMessage((current) => current.type === "carousel"
        ? { ...current, cards: current.cards.map((card, index) => index === cardIndex ? { ...card, mediaFileId: media.id, mediaType: mediaTypeFromMime(media.mimeType), filename: media.originalName } : card) }
        : current)
      toast.success("MÃ­dia adicionada ao cartÃ£o")
    })
  }

  function copyVariable(variable: string) {
    navigator.clipboard.writeText(`{{${variable}}}`).then(
      () => toast.success(`{{${variable}}} copiado`),
      () => toast.error("NÃ£o foi possÃ­vel copiar"),
    )
  }

  const selectedInstance = instances.find((instance) => instance.id === instanceId)

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="text-base">ApÃ³s preencher o formulÃ¡rio</CardTitle>
        <CardDescription>
          Escolha entre a automaÃ§Ã£o por webhook ou uma mensagem enviada diretamente pelo nÃºmero conectado no Altar Church.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <Label>AÃ§Ã£o apÃ³s preenchimento</Label>
          <Select value={mode} onValueChange={(value) => setMode((value ?? "webhook") as typeof mode)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="webhook">Usar integraÃ§Ã£o via webhook</SelectItem>
              <SelectItem value="direct_message">Enviar mensagem direta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "webhook" ? (
          <p className="rounded-lg border border-muted-foreground/20 bg-muted/20 p-3 text-sm text-muted-foreground">
            O preenchimento continuarÃ¡ enviando os eventos para os webhooks configurados na aba Webhooks. A mensagem e as automaÃ§Ãµes ficam sob responsabilidade da integraÃ§Ã£o.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label>NÃºmero que enviarÃ¡</Label>
              {instances.length > 0 ? (
                <Select value={instanceId} onValueChange={(value) => setInstanceId(value ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma instÃ¢ncia" /></SelectTrigger>
                  <SelectContent>
                    {instances.map((instance) => <SelectItem key={instance.id} value={instance.id}>{instanceLabel(instance)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Nenhuma instÃ¢ncia UAZAPI ativa disponÃ­vel.</p>
              )}
              {selectedInstance && selectedInstance.status !== "connected" && (
                <p className="text-xs text-warning">Esta instÃ¢ncia estÃ¡ {selectedInstance.status === "connecting" ? "conectando" : "desconectada"}. Novos envios serÃ£o registrados para retry.</p>
              )}
              {!selectedInstance && instanceId && <p className="text-xs text-destructive">A instÃ¢ncia salva foi removida. Selecione outra para voltar a enviar.</p>}
            </div>

            <div className="grid gap-2">
              <Label>Tipo da mensagem</Label>
              <Select value={message.type} onValueChange={(value) => changeType((value ?? "text") as FormDirectMessage["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium">VariÃ¡veis disponÃ­veis</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((variable) => (
                  <Button key={variable} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => copyVariable(variable)}>
                    <Copy className="mr-1 h-3 w-3" />{`{{${variable}}}`}
                  </Button>
                ))}
              </div>
            </div>

            {message.type === "text" && (
              <div className="grid gap-2">
                <Label>Mensagem</Label>
                <Textarea rows={6} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} placeholder="OlÃ¡ {{nome}}! Recebemos seu cadastro." />
              </div>
            )}

            {message.type === "button" && (
              <div className="space-y-4">
                <div className="grid gap-2"><Label>Texto principal</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                <div className="grid gap-2"><Label>RodapÃ© (opcional)</Label><Input value={message.footer} onChange={(event) => setMessage({ ...message, footer: event.target.value })} /></div>
                <div className="grid gap-2"><Label>BotÃµes</Label>{buttonEditor(message.buttons, (buttons) => updateButtonMessage(buttons))}</div>
              </div>
            )}

            {message.type === "list" && (
              <div className="space-y-4">
                <div className="grid gap-2"><Label>Texto principal</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                <div className="grid gap-2"><Label>Texto do botÃ£o da lista</Label><Input value={message.listButton} onChange={(event) => setMessage({ ...message, listButton: event.target.value })} /></div>
                <div className="grid gap-2"><Label>RodapÃ© (opcional)</Label><Input value={message.footer} onChange={(event) => setMessage({ ...message, footer: event.target.value })} /></div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><Label>SeÃ§Ãµes e itens</Label><Button type="button" size="sm" variant="outline" onClick={() => setMessage({ ...message, sections: [...message.sections, { title: "Nova seÃ§Ã£o", items: [{ label: "", id: "", description: "" }] }] })}><Plus className="mr-1 h-4 w-4" />SeÃ§Ã£o</Button></div>
                  {message.sections.map((section, sectionIndex) => (
                    <div key={`${sectionIndex}-${section.title}`} className="space-y-2 rounded-lg border p-3">
                      <div className="flex gap-2"><Input value={section.title} onChange={(event) => setMessage({ ...message, sections: message.sections.map((item, index) => index === sectionIndex ? { ...item, title: event.target.value } : item) })} placeholder="Nome da seÃ§Ã£o" /><Button type="button" size="icon" variant="ghost" disabled={message.sections.length <= 1} onClick={() => setMessage({ ...message, sections: message.sections.filter((_item, index) => index !== sectionIndex) })}><Trash2 className="h-4 w-4" /></Button></div>
                      {section.items.map((item, itemIndex) => (
                        <div key={`${itemIndex}-${item.label}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><Input value={item.label} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, label: event.target.value } : currentItem) } : currentSection) })} placeholder="Item" /><Input value={item.id} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, id: event.target.value } : currentItem) } : currentSection) })} placeholder="ID da resposta" /><Input value={item.description} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, description: event.target.value } : currentItem) } : currentSection) })} placeholder="DescriÃ§Ã£o" /><Button type="button" size="icon" variant="ghost" disabled={section.items.length <= 1} onClick={() => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.filter((_item, position) => position !== itemIndex) } : currentSection) })}><Trash2 className="h-4 w-4" /></Button></div>
                      ))}
                      <Button type="button" size="sm" variant="outline" onClick={() => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: [...currentSection.items, { label: "", id: "", description: "" }] } : currentSection) })}><Plus className="mr-1 h-4 w-4" />Item</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {message.type === "carousel" && (
              <div className="space-y-4">
                <div className="grid gap-2"><Label>Texto introdutÃ³rio</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                <div className="flex items-center justify-between"><Label>CartÃµes</Label><Button type="button" size="sm" variant="outline" disabled={message.cards.length >= 10} onClick={() => setMessage({ ...message, cards: [...message.cards, { text: "", mediaFileId: null, mediaType: "image", filename: "", buttons: [{ label: "", action: "reply", value: "" }] }] })}><Plus className="mr-1 h-4 w-4" />CartÃ£o</Button></div>
                {message.cards.map((card, cardIndex) => {
                  const media = card.mediaFileId ? mediaFiles.find((file) => file.id === card.mediaFileId) : null
                  return (
                    <div key={`${cardIndex}-${card.text}`} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between"><p className="text-sm font-medium">CartÃ£o {cardIndex + 1}</p><Button type="button" size="icon" variant="ghost" disabled={message.cards.length <= 1} onClick={() => setMessage({ ...message, cards: message.cards.filter((_item, index) => index !== cardIndex) })}><Trash2 className="h-4 w-4" /></Button></div>
                      <Textarea value={card.text} onChange={(event) => setMessage({ ...message, cards: message.cards.map((item, index) => index === cardIndex ? { ...item, text: event.target.value } : item) })} placeholder="Texto do cartÃ£o" />
                      <div className="grid gap-2"><Label>MÃ­dia</Label><div className="flex flex-wrap items-center gap-2"><Input type="file" accept={mediaAccept} disabled={pending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCardMedia(cardIndex, file) }} /><Badge variant="outline">atÃ© 10 MB</Badge></div>{media && <p className="text-xs text-muted-foreground">{media.originalName} · {media.mimeType}{media.signedUrl && media.mimeType.startsWith("image/") ? <img src={media.signedUrl} alt="PrÃ©via do cartÃ£o" className="mt-2 h-24 w-32 rounded object-cover" /> : null}</p>}</div>
                      <div className="grid gap-2"><Label>BotÃµes do cartÃ£o</Label>{buttonEditor(card.buttons, (buttons) => updateButtonMessage(buttons, cardIndex), "Adicionar botÃ£o ao cartÃ£o")}</div>
                    </div>
                  )
                })}
              </div>
            )}

            <Card className="border-dashed bg-muted/20">
              <CardHeader className="pb-3"><CardTitle className="text-sm">PrÃ©via</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{message.text || "A mensagem aparecerÃ¡ aqui."}</p>{message.type === "button" && <div className="flex flex-wrap gap-2">{message.buttons.map((button, index) => <Badge key={index} variant="outline">{button.label || "BotÃ£o"}</Badge>)}</div>}{message.type === "list" && <Badge variant="outline">{message.listButton || "Abrir lista"}</Badge>}{message.type === "carousel" && <p className="text-xs text-muted-foreground">{message.cards.length} cartÃ£o(Ãµes) configurado(s).</p>}</CardContent>
            </Card>

            <Button type="button" className="gradient-primary" disabled={pending} onClick={save}><Save className="mr-2 h-4 w-4" />{pending ? "Salvando..." : "Salvar envio direto"}</Button>
          </div>
        )}

        {mode === "webhook" && (
          <Button type="button" className="gradient-primary" disabled={pending} onClick={save}><Save className="mr-2 h-4 w-4" />Salvar escolha</Button>
        )}
      </CardContent>
    </Card>
  )
}
