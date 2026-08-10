"use client"

import { useMemo, useState, useTransition } from "react"
import { CheckCheck, Copy, ExternalLink, FileText, Image as ImageIcon, List as ListIcon, MoreVertical, Paperclip, Phone, Plus, Save, Send, Smile, Trash2, Video } from "lucide-react"
import { toast } from "sonner"
import { saveFormWhatsAppSettings, uploadFormWhatsappMedia } from "@/lib/forms/actions"
import { emptyDirectMessage, renderDirectMessage } from "@/lib/forms/direct-message"
import type {
  ChurchForm,
  FormButtonAction,
  FormDirectButton,
  FormDirectCarouselCard,
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
  button: "Botões",
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
  const state = instance.status === "connected"
    ? "Conectada"
    : instance.status === "connecting"
      ? "Conectando"
      : "Desconectada"
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
  addLabel = "Adicionar botão",
) {
  return (
    <div className="space-y-3">
      {buttons.map((button, index) => (
        <div
          key={`button-${index}`}
          className="grid gap-3 rounded-xl border bg-background/60 p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto]"
        >
          <Input
            value={button.label}
            onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
            placeholder="Texto do botão"
            aria-label={`Texto do botão ${index + 1}`}
          />
          <Select
            value={button.action}
            onValueChange={(value) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, action: (value ?? "reply") as FormButtonAction } : item))}
          >
            <SelectTrigger aria-label={`Ação do botão ${index + 1}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(actionLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={button.value}
            onChange={(event) => onChange(buttons.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
            placeholder={button.action === "url" ? "https://..." : button.action === "call" ? "+5511999999999" : "Identificador ou texto"}
            aria-label={`Valor do botão ${index + 1}`}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={buttons.length <= 1}
            onClick={() => onChange(buttons.filter((_item, itemIndex) => itemIndex !== index))}
            aria-label={`Remover botão ${index + 1}`}
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

function PreviewActionButton({ button }: { button: FormDirectButton }) {
  const Icon = button.action === "url"
    ? ExternalLink
    : button.action === "call"
      ? Phone
      : button.action === "copy"
        ? Copy
        : CheckCheck

  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#128c7e]">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{button.label || actionLabels[button.action]}</span>
    </div>
  )
}

function PreviewMedia({ mediaType, filename }: { mediaType: FormDirectCarouselCard["mediaType"]; filename: string }) {
  const Icon = mediaType === "video" ? Video : mediaType === "document" ? FileText : ImageIcon
  const label = mediaType === "video" ? "Vídeo" : mediaType === "document" ? "Documento PDF" : "Imagem"

  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 text-white">
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative flex flex-col items-center gap-1 text-center">
        <Icon className="h-7 w-7" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">{label}</span>
        {filename ? <span className="max-w-[12rem] truncate text-[10px] text-white/80">{filename}</span> : null}
      </div>
    </div>
  )
}

function FormWhatsappMobilePreview({ message, mediaFiles }: { message: FormDirectMessage; mediaFiles: FormWhatsappMedia[] }) {
  const messageText = message.text.trim() || "A mensagem aparecerá aqui."
  const optionCount = message.type === "list"
    ? message.sections.reduce((total, section) => total + section.items.length, 0)
    : 0

  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-4">
        <div>
          <Badge className="mb-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200">Prévia em tempo real</Badge>
          <p className="max-w-xl text-sm text-muted-foreground">
            Esta simulação usa dados de exemplo para mostrar como a mensagem ficará no WhatsApp. As variáveis serão substituídas pelos dados reais do formulário.
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border bg-background/70 p-4 text-sm shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Formato</span>
            <span className="font-medium">{typeLabels[message.type]}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Variáveis</span>
            <span className="font-medium">Dados de exemplo</span>
          </div>
          {message.type === "carousel" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cartões</span>
              <span className="font-medium">{message.cards.length}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[21rem]">
        <div className="rounded-[2.75rem] border-[9px] border-slate-950 bg-slate-950 p-1 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.75)] ring-1 ring-slate-900/10 dark:border-slate-800 dark:bg-slate-800">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#efeae2]">
            <div className="absolute left-1/2 top-0 z-20 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-950 dark:bg-slate-800" />
            <div className="flex items-center gap-3 bg-[#075e54] px-4 pb-3 pt-8 text-white">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">AC</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Altar Church</p>
                <p className="text-[10px] text-white/75">online</p>
              </div>
              <MoreVertical className="h-4 w-4" />
            </div>

            <div className="min-h-[31rem] bg-[#efeae2] px-3 py-4">
              <div className="mb-3 flex justify-center">
                <span className="rounded-md bg-white/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-sm">Hoje</span>
              </div>
              <div className="ml-auto max-w-[94%] rounded-xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[12px] leading-relaxed text-slate-800 shadow-sm">
                <p className="whitespace-pre-wrap break-words">{messageText}</p>

                {message.type === "button" ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-emerald-900/10 bg-white/80">
                    {message.buttons.map((button, index) => (
                      <div key={`preview-button-${index}`} className={index > 0 ? "border-t border-emerald-900/10" : undefined}>
                        <PreviewActionButton button={button} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {message.type === "list" ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-emerald-900/10 bg-white/80">
                    <div className="flex items-center justify-center gap-1.5 bg-white px-3 py-2 text-xs font-semibold text-[#128c7e]">
                      <ListIcon className="h-3.5 w-3.5" />
                      <span>{message.listButton || "Abrir lista"}</span>
                    </div>
                    <div className="space-y-2 border-t border-emerald-900/10 px-3 py-2">
                      {message.sections.slice(0, 1).map((section, sectionIndex) => (
                        <div key={`preview-section-${sectionIndex}`}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{section.title || "Opções"}</p>
                          {section.items.slice(0, 3).map((item, itemIndex) => (
                            <div key={`preview-item-${itemIndex}`} className="mt-1 border-t border-slate-200/70 pt-1 text-[11px]">
                              <p className="font-medium">{item.label || "Item da lista"}</p>
                              {item.description ? <p className="truncate text-[10px] text-slate-500">{item.description}</p> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                      <p className="text-center text-[10px] text-slate-500">{optionCount || 1} opção(ões) configurada(s)</p>
                    </div>
                  </div>
                ) : null}

                {message.type === "carousel" ? (
                  <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                    {message.cards.map((card, cardIndex) => {
                      const media = card.mediaFileId ? mediaFiles.find((file) => file.id === card.mediaFileId) : null
                      return (
                        <div key={`preview-card-${cardIndex}`} className="w-[13.5rem] shrink-0 snap-start overflow-hidden rounded-lg border border-emerald-900/10 bg-white/85">
                          <PreviewMedia mediaType={card.mediaType} filename={media?.originalName || card.filename} />
                          <div className="space-y-2 p-2.5">
                            <p className="whitespace-pre-wrap break-words text-[11px] font-medium">{card.text || "Texto do cartão"}</p>
                            <div className="overflow-hidden rounded-md border border-emerald-900/10">
                              {card.buttons.map((button, index) => (
                                <div key={`preview-card-button-${index}`} className={index > 0 ? "border-t border-emerald-900/10" : undefined}>
                                  <PreviewActionButton button={button} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-slate-500">
                  <span>agora</span>
                  <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#f0f2f5] p-2">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[10px] text-slate-400">
                <Smile className="h-4 w-4" />
                <span>Digite uma mensagem</span>
                <Paperclip className="ml-auto h-4 w-4" />
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#128c7e] text-white">
                <Send className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>
      </div>
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
        toast.error(result.error ?? "Não foi possível salvar o envio")
        return
      }
      toast.success("Ação pós-preenchimento salva")
    })
  }

  function changeType(type: FormDirectMessage["type"]) {
    setMessage((current) => {
      if (current.type === type) return current
      const next = emptyDirectMessage(type)
      return "text" in current && "text" in next
        ? { ...next, text: current.text } as FormDirectMessage
        : next
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
        toast.error(result.error ?? "Não foi possível enviar a mídia")
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
      toast.success("Mídia adicionada ao cartão")
    })
  }

  function copyVariable(variable: string) {
    navigator.clipboard.writeText(`{{${variable}}}`).then(
      () => toast.success(`{{${variable}}} copiado`),
      () => toast.error("Não foi possível copiar"),
    )
  }

  const selectedInstance = instances.find((instance) => instance.id === instanceId)
  const previewMessage = useMemo(() => {
    const sampleValues: Record<string, unknown> = {
      nome: "Ana",
      telefone: "(11) 99999-9999",
      email: "ana@exemplo.com",
      form_title: form.title,
      form_slug: form.slug,
      source: "Site",
    }
    for (const variable of variables) {
      if (!(variable in sampleValues)) sampleValues[variable] = "Exemplo"
    }

    try {
      return renderDirectMessage(message, sampleValues)
    } catch {
      return message
    }
  }, [form.slug, form.title, message, variables])

  return (
    <Card className="glass overflow-hidden">
      <CardHeader className="border-b bg-muted/10 pb-5">
        <CardTitle className="text-base">Após preencher o formulário</CardTitle>
        <CardDescription>
          Escolha entre a automação por webhook ou uma mensagem enviada diretamente pelo número conectado no Altar Church.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <section className="space-y-4 rounded-xl border bg-background/40 p-4">
          <div className="grid gap-2">
            <Label>Ação após preenchimento</Label>
            <Select value={mode} onValueChange={(value) => setMode((value ?? "webhook") as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="webhook">Usar integração via webhook</SelectItem>
                <SelectItem value="direct_message">Enviar mensagem direta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {mode === "webhook" ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Webhook ativo</p>
            <p className="mt-1">
              O preenchimento continuará enviando os eventos para os webhooks configurados na aba Webhooks. A mensagem e as automações ficam sob responsabilidade da integração.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="space-y-4 rounded-xl border bg-background/40 p-4">
              <div>
                <h3 className="text-sm font-semibold">Destino e formato</h3>
                <p className="mt-1 text-xs text-muted-foreground">Defina qual número enviará a mensagem e o formato que o visitante receberá.</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Número que enviará</Label>
                  {instances.length > 0 ? (
                    <Select value={instanceId} onValueChange={(value) => setInstanceId(value ?? "")}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
                      <SelectContent>
                        {instances.map((instance) => <SelectItem key={instance.id} value={instance.id}>{instanceLabel(instance)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">Nenhuma instância UAZAPI ativa disponível.</p>
                  )}
                  {selectedInstance && selectedInstance.status !== "connected" && (
                    <p className="text-xs text-warning">Esta instância está {selectedInstance.status === "connecting" ? "conectando" : "desconectada"}. Novos envios serão registrados para retry.</p>
                  )}
                  {!selectedInstance && instanceId && <p className="text-xs text-destructive">A instância salva foi removida. Selecione outra para voltar a enviar.</p>}
                </div>

                <div className="grid gap-2">
                  <Label>Tipo da mensagem</Label>
                  <Select value={message.type} onValueChange={(value) => changeType((value ?? "text") as FormDirectMessage["type"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <h3 className="text-sm font-semibold">Variáveis disponíveis</h3>
                <p className="mt-1 text-xs text-muted-foreground">Clique em uma variável para copiá-la e use-a em qualquer texto da mensagem.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <Button key={variable} type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => copyVariable(variable)}>
                    <Copy className="mr-1.5 h-3 w-3" />{`{{${variable}}}`}
                  </Button>
                ))}
              </div>
            </section>

            {message.type === "text" && (
              <section className="space-y-3 rounded-xl border bg-background/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Mensagem</h3>
                  <p className="mt-1 text-xs text-muted-foreground">O texto será personalizado com os dados do formulário no momento do envio.</p>
                </div>
                <Textarea rows={6} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} placeholder="Olá {{nome}}! Recebemos seu cadastro." />
              </section>
            )}

            {message.type === "button" && (
              <section className="space-y-5 rounded-xl border bg-background/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Mensagem com botões</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Combine respostas rápidas, links, ligações ou cópia de código.</p>
                </div>
                <div className="grid gap-2"><Label>Texto principal</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                <div className="grid gap-2"><Label>Rodapé <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input value={message.footer} onChange={(event) => setMessage({ ...message, footer: event.target.value })} /></div>
                <div className="grid gap-3"><Label>Botões</Label>{buttonEditor(message.buttons, (buttons) => updateButtonMessage(buttons))}</div>
              </section>
            )}

            {message.type === "list" && (
              <section className="space-y-5 rounded-xl border bg-background/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Mensagem em lista</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Organize as opções em seções para facilitar a escolha.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2"><Label>Texto principal</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                  <div className="space-y-4">
                    <div className="grid gap-2"><Label>Texto do botão da lista</Label><Input value={message.listButton} onChange={(event) => setMessage({ ...message, listButton: event.target.value })} /></div>
                    <div className="grid gap-2"><Label>Rodapé <span className="font-normal text-muted-foreground">(opcional)</span></Label><Input value={message.footer} onChange={(event) => setMessage({ ...message, footer: event.target.value })} /></div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><Label>Seções e itens</Label><p className="mt-1 text-xs text-muted-foreground">Cada seção pode ter até 10 itens no total da lista.</p></div>
                    <Button type="button" size="sm" variant="outline" onClick={() => setMessage({ ...message, sections: [...message.sections, { title: "Nova seção", items: [{ label: "", id: "", description: "" }] }] })}><Plus className="mr-1 h-4 w-4" />Seção</Button>
                  </div>
                  <div className="space-y-4">
                    {message.sections.map((section, sectionIndex) => (
                      <div key={`section-${sectionIndex}`} className="space-y-4 rounded-xl border bg-background/60 p-4 shadow-sm">
                        <div className="flex gap-2">
                          <Input value={section.title} onChange={(event) => setMessage({ ...message, sections: message.sections.map((item, index) => index === sectionIndex ? { ...item, title: event.target.value } : item) })} placeholder="Nome da seção" aria-label={`Nome da seção ${sectionIndex + 1}`} />
                          <Button type="button" size="icon" variant="ghost" disabled={message.sections.length <= 1} onClick={() => setMessage({ ...message, sections: message.sections.filter((_item, index) => index !== sectionIndex) })} aria-label={`Remover seção ${sectionIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="space-y-3">
                          {section.items.map((item, itemIndex) => (
                            <div key={`item-${itemIndex}`} className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <Input value={item.label} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, label: event.target.value } : currentItem) } : currentSection) })} placeholder="Item" aria-label={`Item ${itemIndex + 1}`} />
                              <Input value={item.id} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, id: event.target.value } : currentItem) } : currentSection) })} placeholder="ID da resposta" aria-label={`ID do item ${itemIndex + 1}`} />
                              <Input value={item.description} onChange={(event) => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.map((currentItem, itemPosition) => itemPosition === itemIndex ? { ...currentItem, description: event.target.value } : currentItem) } : currentSection) })} placeholder="Descrição" aria-label={`Descrição do item ${itemIndex + 1}`} />
                              <Button type="button" size="icon" variant="ghost" disabled={section.items.length <= 1} onClick={() => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: currentSection.items.filter((_item, position) => position !== itemIndex) } : currentSection) })} aria-label={`Remover item ${itemIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => setMessage({ ...message, sections: message.sections.map((currentSection, index) => index === sectionIndex ? { ...currentSection, items: [...currentSection.items, { label: "", id: "", description: "" }] } : currentSection) })}><Plus className="mr-1 h-4 w-4" />Item</Button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {message.type === "carousel" && (
              <section className="space-y-5 rounded-xl border bg-background/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Mensagem em carrossel</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Adicione cartões com texto, mídia e até três botões por cartão.</p>
                </div>
                <div className="grid gap-2"><Label>Texto introdutório</Label><Textarea rows={4} value={message.text} onChange={(event) => setMessage({ ...message, text: event.target.value })} /></div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><Label>Cartões</Label><p className="mt-1 text-xs text-muted-foreground">Use JPEG, PNG, WebP, MP4 ou PDF, com até 10 MB.</p></div>
                  <Button type="button" size="sm" variant="outline" disabled={message.cards.length >= 10} onClick={() => setMessage({ ...message, cards: [...message.cards, { text: "", mediaFileId: null, mediaType: "image", filename: "", buttons: [{ label: "", action: "reply", value: "" }] }] })}><Plus className="mr-1 h-4 w-4" />Cartão</Button>
                </div>
                <div className="space-y-4">
                  {message.cards.map((card, cardIndex) => {
                    const media = card.mediaFileId ? mediaFiles.find((file) => file.id === card.mediaFileId) : null
                    return (
                      <div key={`card-${cardIndex}`} className="space-y-4 rounded-xl border bg-background/60 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Cartão {cardIndex + 1}</p>
                          <Button type="button" size="icon" variant="ghost" disabled={message.cards.length <= 1} onClick={() => setMessage({ ...message, cards: message.cards.filter((_item, index) => index !== cardIndex) })} aria-label={`Remover cartão ${cardIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <Textarea value={card.text} onChange={(event) => setMessage({ ...message, cards: message.cards.map((item, index) => index === cardIndex ? { ...item, text: event.target.value } : item) })} placeholder="Texto do cartão" />
                        <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 p-3">
                          <div><Label>Mídia</Label><p className="mt-1 text-xs text-muted-foreground">A URL privada será assinada apenas no momento do envio.</p></div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input type="file" accept={mediaAccept} disabled={pending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadCardMedia(cardIndex, file); event.currentTarget.value = "" }} aria-label={`Enviar mídia para o cartão ${cardIndex + 1}`} />
                            <Badge variant="outline">Até 10 MB</Badge>
                          </div>
                          {media ? <p className="text-xs text-muted-foreground">{media.originalName} · {media.mimeType}</p> : <p className="text-xs text-muted-foreground">Nenhuma mídia adicionada.</p>}
                        </div>
                        <div className="space-y-3 rounded-lg bg-muted/20 p-3"><Label>Botões do cartão</Label>{buttonEditor(card.buttons, (buttons) => updateButtonMessage(buttons, cardIndex), "Adicionar botão ao cartão")}</div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <Card className="overflow-hidden border-dashed bg-gradient-to-br from-muted/30 via-background to-primary/5 shadow-none">
              <CardHeader className="border-b bg-muted/10 pb-4">
                <CardTitle className="text-sm">Prévia da mensagem</CardTitle>
                <CardDescription>Veja como o contato receberá o conteúdo configurado.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <FormWhatsappMobilePreview message={previewMessage} mediaFiles={mediaFiles} />
              </CardContent>
            </Card>

            <div className="flex justify-end border-t pt-5">
              <Button type="button" className="gradient-primary" disabled={pending} onClick={save}><Save className="mr-2 h-4 w-4" />{pending ? "Salvando..." : "Salvar envio direto"}</Button>
            </div>
          </div>
        )}

        {mode === "webhook" && (
          <div className="flex justify-end border-t pt-5">
            <Button type="button" className="gradient-primary" disabled={pending} onClick={save}><Save className="mr-2 h-4 w-4" />Salvar escolha</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
