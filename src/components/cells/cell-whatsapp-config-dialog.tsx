"use client"

import { useMemo, useState, useTransition } from "react"
import {
  CheckCheck,
  Copy,
  ExternalLink,
  Info,
  List as ListIcon,
  Loader2,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Save,
  Send,
  Smartphone,
  Smile,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { emptyDirectMessage, renderDirectMessage } from "@/lib/forms/direct-message"
import type {
  FormButtonAction,
  FormDirectButton,
  FormDirectMessage,
  FormUazapiInstanceOption,
} from "@/lib/forms/types"
import { saveCellWhatsAppSettingsAction, sendCellWhatsAppTestAction } from "@/lib/cells/requests-actions"
import type { CellWhatsAppSettings } from "@/lib/cells/requests-types"

export interface CellWhatsAppConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: CellWhatsAppSettings
  instances: FormUazapiInstanceOption[]
  onSaved?: (newSettings: CellWhatsAppSettings) => void
}

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

const availableVariables = [
  { key: "visitante_nome", label: "Nome do Visitante" },
  { key: "visitante_telefone", label: "WhatsApp do Visitante" },
  { key: "visitante_bairro", label: "Bairro do Visitante" },
  { key: "visitante_mensagem", label: "Mensagem / Pedido" },
  { key: "celula_nome", label: "Nome da Célula" },
  { key: "lider_nome", label: "Nome do Líder" },
  { key: "encontro_dia", label: "Dia do Encontro" },
  { key: "encontro_horario", label: "Horário" },
  { key: "encontro_local", label: "Local do Encontro" },
  { key: "igreja_nome", label: "Nome da Igreja" },
]

function PreviewActionButton({ button }: { button: FormDirectButton }) {
  const Icon =
    button.action === "url"
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
          className="grid gap-2 rounded-xl border bg-background/60 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto]"
        >
          <Input
            value={button.label}
            onChange={(e) =>
              onChange(
                buttons.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)),
              )
            }
            placeholder="Texto do botão"
            className="h-9 text-xs"
          />
          <Select
            value={button.action}
            onValueChange={(val) =>
              onChange(
                buttons.map((item, i) =>
                  i === index ? { ...item, action: (val ?? "reply") as FormButtonAction } : item,
                ),
              )
            }
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(actionLabels).map(([val, label]) => (
                <SelectItem key={val} value={val} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={button.value}
            onChange={(e) =>
              onChange(
                buttons.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)),
              )
            }
            placeholder={
              button.action === "url"
                ? "https://..."
                : button.action === "call"
                ? "+5511999999999"
                : "Identificador ou texto"
            }
            className="h-9 text-xs"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-muted-foreground hover:text-destructive"
            disabled={buttons.length <= 1}
            onClick={() => onChange(buttons.filter((_, i) => i !== index))}
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
          className="h-8 text-xs"
          onClick={() => onChange([...buttons, { label: "", action: "reply", value: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      )}
    </div>
  )
}

export function CellWhatsAppConfigDialog({
  open,
  onOpenChange,
  settings,
  instances,
  onSaved,
}: CellWhatsAppConfigDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [isEnabled, setIsEnabled] = useState(settings.isEnabled)
  const [instanceId, setInstanceId] = useState(settings.whatsappInstanceId ?? "")
  const [sendToLeader, setSendToLeader] = useState(settings.sendToLeader)
  const [sendToVisitor, setSendToVisitor] = useState(settings.sendToVisitor)

  const [activeTab, setActiveTab] = useState<"leader" | "visitor">("leader")
  const [leaderMsg, setLeaderMsg] = useState<FormDirectMessage>(settings.leaderMessage)
  const [visitorMsg, setVisitorMsg] = useState<FormDirectMessage>(settings.visitorMessage)

  // Test send state
  const [testPhone, setTestPhone] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)

  const currentMsg = activeTab === "leader" ? leaderMsg : visitorMsg
  const setCurrentMsg = (updater: (prev: FormDirectMessage) => FormDirectMessage) => {
    if (activeTab === "leader") setLeaderMsg(updater)
    else setVisitorMsg(updater)
  }

  function changeType(type: FormDirectMessage["type"]) {
    setCurrentMsg((current) => {
      if (current.type === type) return current
      const next = emptyDirectMessage(type)
      return "text" in current && "text" in next ? ({ ...next, text: current.text } as FormDirectMessage) : next
    })
  }

  function insertVariable(variableKey: string) {
    const placeholder = `{{${variableKey}}}`
    setCurrentMsg((current) => ({
      ...current,
      text: (current.text ? current.text + " " : "") + placeholder,
    }))
    navigator.clipboard.writeText(placeholder).then(
      () => toast.info(`${placeholder} copiado e inserido`),
      () => {},
    )
  }

  // Mobile preview simulation
  const previewMessage = useMemo(() => {
    const sampleValues: Record<string, unknown> = {
      visitante_nome: "Maria da Silva",
      nome: "Maria da Silva",
      visitante_telefone: "(11) 98888-7777",
      telefone: "(11) 98888-7777",
      visitante_bairro: "Jardins",
      bairro: "Jardins",
      visitante_mensagem: "Gostaria de conhecer o grupo e saber o endereço!",
      mensagem: "Gostaria de conhecer o grupo e saber o endereço!",
      celula_nome: "Célula Betel",
      celula: "Célula Betel",
      lider_nome: "Pr. Marcos",
      lider: "Pr. Marcos",
      encontro_dia: "Quinta-feira",
      encontro_horario: "20:00",
      encontro_local: "Rua das Palmeiras, 140",
      igreja_nome: "Altar Church",
    }
    try {
      return renderDirectMessage(currentMsg, sampleValues)
    } catch {
      return currentMsg
    }
  }, [currentMsg])

  const handleSave = () => {
    if (isEnabled && !instanceId) {
      toast.error("Por favor, selecione uma instância de WhatsApp conectada.")
      return
    }

    startTransition(async () => {
      const res = await saveCellWhatsAppSettingsAction({
        isEnabled,
        whatsappInstanceId: instanceId || null,
        sendToLeader,
        sendToVisitor,
        leaderMessage: leaderMsg,
        visitorMessage: visitorMsg,
      })

      if (!res.ok) {
        toast.error(res.error || "Erro ao salvar configurações")
        return
      }

      toast.success("Configurações de WhatsApp salvas com sucesso!")
      onSaved?.({
        isEnabled,
        whatsappInstanceId: instanceId || null,
        sendToLeader,
        sendToVisitor,
        leaderMessage: leaderMsg,
        visitorMessage: visitorMsg,
      })
      onOpenChange(false)
    })
  }

  const handleSendTest = async () => {
    if (!instanceId) {
      toast.error("Selecione uma instância de WhatsApp conectada para testar.")
      return
    }
    const cleanPhone = testPhone.replace(/\D/g, "")
    if (cleanPhone.length < 10) {
      toast.error("Digite um telefone válido com DDD para o teste.")
      return
    }

    setIsSendingTest(true)
    try {
      const res = await sendCellWhatsAppTestAction({
        instanceId,
        recipientPhone: cleanPhone,
        message: currentMsg,
      })
      if (!res.ok) throw new Error(res.error)
      toast.success("Mensagem de teste enviada para seu WhatsApp!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar teste")
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b bg-muted/20 shrink-0 pr-12">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <MessageSquare className="h-5 w-5" />
            <DialogTitle className="text-xl">Automação de WhatsApp das Células</DialogTitle>
          </div>
          <DialogDescription className="text-xs sm:text-sm">
            Dispare automaticamente mensagens via WhatsApp quando alguém solicitar participação numa célula pelo mapa 3D ou página pública.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
          {/* Status Geral e Instância */}
          <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border p-4 bg-muted/10">
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl border bg-background/70">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">Ativar Automação</Label>
                <p className="text-xs text-muted-foreground">Dispara mensagens assim que o formulário for enviado.</p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} className="shrink-0" />
            </div>

            <div className="space-y-1.5 p-3 rounded-xl border bg-background/70">
              <Label className="text-xs font-semibold">Instância UAZAPI Conectada</Label>
              {instances.length > 0 ? (
                <Select value={instanceId} onValueChange={(val) => setInstanceId(val ?? "")}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a instância que enviará" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id} className="text-xs">
                        {inst.name} {inst.phone ? `(${inst.phone})` : ""} - {inst.status === "connected" ? "🟢 Conectada" : "🔴 Desconectada"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-destructive font-medium">Nenhuma instância UAZAPI ativa cadastrada.</p>
              )}
            </div>
          </div>

          {/* Quem deve receber */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destinatários da Notificação</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 p-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors">
                <Switch id="toggle-leader" checked={sendToLeader} onCheckedChange={setSendToLeader} className="mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <Label htmlFor="toggle-leader" className="text-sm font-medium cursor-pointer">
                    Avisar o Líder da Célula
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Envia para o WhatsApp do líder com o nome, telefone, bairro e mensagem do novo interessado.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors">
                <Switch id="toggle-visitor" checked={sendToVisitor} onCheckedChange={setSendToVisitor} className="mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <Label htmlFor="toggle-visitor" className="text-sm font-medium cursor-pointer">
                    Confirmar para o Visitante
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Envia uma mensagem automática de boas-vindas para a pessoa que preencheu o formulário.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Editor de Mensagem e Pré-visualização lado a lado */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* Lado Esquerdo: Abas de edição */}
            <div className="space-y-4 min-w-0">
              <div className="flex items-center justify-between border-b pb-2">
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as "leader" | "visitor")} className="w-full">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList>
                      <TabsTrigger value="leader" className="text-xs gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        Msg para o Líder {sendToLeader ? "🟢" : "⚪"}
                      </TabsTrigger>
                      <TabsTrigger value="visitor" className="text-xs gap-1.5">
                        <Smile className="h-3.5 w-3.5" />
                        Msg para o Visitante {sendToVisitor ? "🟢" : "⚪"}
                      </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Formato:</Label>
                      <Select value={currentMsg.type} onValueChange={(val) => changeType((val ?? "text") as FormDirectMessage["type"])}>
                        <SelectTrigger className="h-8 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(typeLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val} className="text-xs">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Tabs>
              </div>

              {/* Variáveis Rápidas */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Info className="h-3.5 w-3.5" />
                  <span>Clique nas variáveis para inserir no texto:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-primary/20 hover:text-primary transition-colors active:scale-95"
                    >
                      <Copy className="h-2.5 w-2.5 opacity-60" />
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corpo da mensagem */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold">Texto Principal da Mensagem</Label>
                <Textarea
                  rows={6}
                  value={currentMsg.text}
                  onChange={(e) => setCurrentMsg((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder="Digite sua mensagem aqui..."
                  className="font-mono text-xs leading-relaxed"
                />
              </div>

              {/* Rodapé se botão ou lista */}
              {("footer" in currentMsg) && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Texto do Rodapé (opcional)</Label>
                  <Input
                    value={currentMsg.footer ?? ""}
                    onChange={(e) => setCurrentMsg((prev) => ("footer" in prev ? { ...prev, footer: e.target.value } : prev))}
                    placeholder="Ex: Altar Church • Ministério de Células"
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {/* Botões interativos se tipo = button */}
              {currentMsg.type === "button" && (
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-semibold">Botões de Ação (até 3)</Label>
                  {buttonEditor(currentMsg.buttons, (buttons) =>
                    setCurrentMsg((prev) => (prev.type === "button" ? { ...prev, buttons } : prev)),
                  )}
                </div>
              )}

              {/* Lista interativa se tipo = list */}
              {currentMsg.type === "list" && (
                <div className="space-y-3 pt-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Texto do Botão da Lista</Label>
                      <Input
                        value={currentMsg.listButton}
                        onChange={(e) => setCurrentMsg((prev) => (prev.type === "list" ? { ...prev, listButton: e.target.value } : prev))}
                        placeholder="Ex: Ver opções"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Itens da Lista</Label>
                    {currentMsg.sections.map((section, sIdx) => (
                      <div key={sIdx} className="rounded-xl border p-3 bg-muted/20 space-y-2">
                        <Input
                          value={section.title}
                          onChange={(e) =>
                            setCurrentMsg((prev) =>
                              prev.type === "list"
                                ? {
                                    ...prev,
                                    sections: prev.sections.map((s, idx) => (idx === sIdx ? { ...s, title: e.target.value } : s)),
                                  }
                                : prev,
                            )
                          }
                          placeholder="Título da Seção"
                          className="h-8 text-xs font-medium"
                        />
                        <div className="space-y-1.5">
                          {section.items.map((item, iIdx) => (
                            <div key={iIdx} className="grid grid-cols-2 gap-2">
                              <Input
                                value={item.label}
                                onChange={(e) =>
                                  setCurrentMsg((prev) =>
                                    prev.type === "list"
                                      ? {
                                          ...prev,
                                          sections: prev.sections.map((s, idx) =>
                                            idx === sIdx
                                              ? {
                                                  ...s,
                                                  items: s.items.map((it, pIdx) => (pIdx === iIdx ? { ...it, label: e.target.value } : it)),
                                                }
                                              : s,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                placeholder="Título do Item"
                                className="h-8 text-xs"
                              />
                              <Input
                                value={item.description ?? ""}
                                onChange={(e) =>
                                  setCurrentMsg((prev) =>
                                    prev.type === "list"
                                      ? {
                                          ...prev,
                                          sections: prev.sections.map((s, idx) =>
                                            idx === sIdx
                                              ? {
                                                  ...s,
                                                  items: s.items.map((it, pIdx) => (pIdx === iIdx ? { ...it, description: e.target.value } : it)),
                                                }
                                              : s,
                                          ),
                                        }
                                      : prev,
                                  )
                                }
                                placeholder="Descrição (opcional)"
                                className="h-8 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Carrossel se tipo = carousel */}
              {currentMsg.type === "carousel" && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Cartões do Carrossel ({currentMsg.cards.length}/10)</Label>
                    {currentMsg.cards.length < 10 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() =>
                          setCurrentMsg((prev) =>
                            prev.type === "carousel"
                              ? {
                                  ...prev,
                                  cards: [
                                    ...prev.cards,
                                    {
                                      text: "",
                                      mediaFileId: "",
                                      mediaType: "image",
                                      filename: "",
                                      buttons: [{ label: "Acessar", action: "reply", value: "ok" }],
                                    },
                                  ],
                                }
                              : prev,
                          )
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" /> Adicionar Cartão
                      </Button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {currentMsg.cards.map((card, cIdx) => (
                      <div key={cIdx} className="rounded-xl border p-3 bg-muted/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">Cartão {cIdx + 1}</span>
                          {currentMsg.cards.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setCurrentMsg((prev) =>
                                  prev.type === "carousel"
                                    ? { ...prev, cards: prev.cards.filter((_, idx) => idx !== cIdx) }
                                    : prev,
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <Textarea
                          rows={2}
                          value={card.text}
                          onChange={(e) =>
                            setCurrentMsg((prev) =>
                              prev.type === "carousel"
                                ? {
                                    ...prev,
                                    cards: prev.cards.map((c, idx) => (idx === cIdx ? { ...c, text: e.target.value } : c)),
                                  }
                                : prev,
                            )
                          }
                          placeholder="Texto do cartão..."
                          className="h-16 text-xs"
                        />
                        <div className="pt-1">
                          <Label className="text-[11px] text-muted-foreground">Botões do Cartão</Label>
                          {buttonEditor(card.buttons, (buttons) =>
                            setCurrentMsg((prev) =>
                              prev.type === "carousel"
                                ? {
                                    ...prev,
                                    cards: prev.cards.map((c, idx) => (idx === cIdx ? { ...c, buttons } : c)),
                                  }
                                : prev,
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Teste de Disparo ao Vivo */}
              <div className="rounded-xl border p-3 bg-muted/20 space-y-2 pt-3">
                <Label className="text-xs font-semibold">Testar Envio no seu WhatsApp</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="(11) 99999-9999"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isSendingTest || !instanceId}
                    onClick={handleSendTest}
                    className="h-9 text-xs whitespace-nowrap"
                  >
                    {isSendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    Enviar Teste
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Envia a mensagem atual formatada para o número digitado usando a instância selecionada.
                </p>
              </div>
            </div>

            {/* Lado Direito: Celular com Mockup WhatsApp em Tempo Real */}
            <div className="flex flex-col items-center shrink-0 w-full lg:w-[22rem]">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground">
                <Smartphone className="h-4 w-4" />
                <span>Prévia em Tempo Real</span>
              </div>

              <div className="w-full max-w-[20.5rem] rounded-[2.5rem] border-[8px] border-slate-950 bg-slate-950 p-1 shadow-2xl">
                <div className="relative overflow-hidden rounded-[2rem] bg-[#efeae2]">
                  {/* Top notch */}
                  <div className="absolute left-1/2 top-0 z-20 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-950" />

                  {/* Header WhatsApp */}
                  <div className="flex items-center gap-2.5 bg-[#075e54] px-3 pb-2.5 pt-7 text-white">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold">
                      AC
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">Altar Church</p>
                      <p className="text-[9px] text-white/75">online</p>
                    </div>
                    <MoreVertical className="h-3.5 w-3.5 opacity-80" />
                  </div>

                  {/* Chat Area */}
                  <div className="min-h-[26rem] max-h-[30rem] overflow-y-auto bg-[#efeae2] px-2.5 py-3 space-y-2">
                    <div className="flex justify-center">
                      <span className="rounded-md bg-white/70 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-slate-500 shadow-xs">
                        Hoje
                      </span>
                    </div>

                    <div className="ml-auto max-w-[94%] rounded-xl rounded-tr-sm bg-[#d9fdd3] p-2.5 text-[11px] leading-relaxed text-slate-800 shadow-sm">
                      <p className="whitespace-pre-wrap break-words">{previewMessage.text || "Sua mensagem aparecerá aqui..."}</p>

                      {/* Botões */}
                      {previewMessage.type === "button" && previewMessage.buttons.length > 0 && (
                        <div className="mt-2.5 overflow-hidden rounded-lg border border-emerald-900/10 bg-white/80 divide-y divide-emerald-900/10">
                          {previewMessage.buttons.map((btn, i) => (
                            <PreviewActionButton key={i} button={btn} />
                          ))}
                        </div>
                      )}

                      {/* Lista */}
                      {previewMessage.type === "list" && (
                        <div className="mt-2.5 overflow-hidden rounded-lg border border-emerald-900/10 bg-white/80">
                          <div className="flex items-center justify-center gap-1.5 bg-white px-2 py-1.5 text-xs font-semibold text-[#128c7e]">
                            <ListIcon className="h-3.5 w-3.5" />
                            <span>{previewMessage.listButton || "Abrir lista"}</span>
                          </div>
                          <div className="border-t border-emerald-900/10 p-2 text-[10px] text-muted-foreground text-center">
                            {previewMessage.sections.reduce((tot, s) => tot + s.items.length, 0)} opções configuradas
                          </div>
                        </div>
                      )}

                      {/* Carrossel */}
                      {previewMessage.type === "carousel" && previewMessage.cards.length > 0 && (
                        <div className="mt-2.5 -mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
                          {previewMessage.cards.map((card, idx) => (
                            <div key={idx} className="w-44 shrink-0 snap-start overflow-hidden rounded-lg border border-emerald-900/10 bg-white/90 p-2 space-y-1.5 text-[10px]">
                              <p className="whitespace-pre-wrap font-medium">{card.text || `Cartão ${idx + 1}`}</p>
                              {card.buttons.map((b, bIdx) => (
                                <PreviewActionButton key={bIdx} button={b} />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-1.5 flex items-center justify-end gap-1 text-[8px] text-slate-500">
                        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                      </div>
                    </div>
                  </div>

                  {/* Input bar */}
                  <div className="flex items-center gap-1.5 bg-[#f0f2f5] p-2">
                    <div className="flex h-7 flex-1 items-center gap-1.5 rounded-full bg-white px-2.5 text-[9px] text-slate-400">
                      <Smile className="h-3.5 w-3.5" />
                      <span>Mensagem</span>
                      <Paperclip className="ml-auto h-3 w-3" />
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#128c7e] text-white">
                      <Send className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 shrink-0 sm:justify-between m-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending} className="gradient-primary text-xs font-semibold gap-1.5">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
