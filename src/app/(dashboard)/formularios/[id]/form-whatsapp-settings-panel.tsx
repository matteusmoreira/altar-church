"use client"

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
          key={`${index}-${button.label}`}
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
                      <div key={`${sectionIndex}-${section.title}`} className="space-y-4 rounded-xl border bg-background/60 p-4 shadow-sm">
                        <div className="flex gap-2">
                          <Input value={section.title} onChange={(event) => setMessage({ ...message, sections: message.sections.map((item, index) => index === sectionIndex ? { ...item, title: event.target.value } : item) })} placeholder="Nome da seção" aria-label={`Nome da seção ${sectionIndex + 1}`} />
                          <Button type="button" size="icon" variant="ghost" disabled={message.sections.length <= 1} onClick={() => setMessage({ ...message, sections: message.sections.filter((_item, index) => index !== sectionIndex) })} aria-label={`Remover seção ${sectionIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="space-y-3">
                          {section.items.map((item, itemIndex) => (
                            <div key={`${itemIndex}-${item.label}`} className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
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
                      <div key={`${cardIndex}-${card.text}`} className="space-y-4 rounded-xl border bg-background/60 p-4 shadow-sm">
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

            <Card className="border-dashed bg-muted/20 shadow-none">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Prévia</CardTitle><CardDescription>Veja a estrutura que será enviada ao contato.</CardDescription></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-xl border bg-background/80 p-4"><p className="whitespace-pre-wrap">{message.text || "A mensagem aparecerá aqui."}</p></div>
                {message.type === "button" && <div className="flex flex-wrap gap-2">{message.buttons.map((button, index) => <Badge key={index} variant="outline">{button.label || "Botão"}</Badge>)}</div>}
                {message.type === "list" && <Badge variant="outline">{message.listButton || "Abrir lista"}</Badge>}
                {message.type === "carousel" && <p className="text-xs text-muted-foreground">{message.cards.length} cartão(ões) configurado(s).</p>}
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
