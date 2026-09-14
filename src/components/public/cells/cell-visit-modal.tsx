"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, MessageCircle, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PublicCellItem } from "@/lib/cells/public-cells"
import { toast } from "sonner"

export interface CellVisitModalProps {
  cell: PublicCellItem | null
  isOpen: boolean
  onClose: () => void
  churchSlug: string
  churchName: string
}

function phoneMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export function CellVisitModal({
  cell,
  isOpen,
  onClose,
  churchSlug,
  churchName,
}: CellVisitModalProps) {
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [leaderPhone, setLeaderPhone] = useState<string | null>(null)

  if (!isOpen || !cell) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Por favor, digite seu nome completo.")
      return
    }

    const cleanPhone = phone.replace(/\D/g, "")
    if (cleanPhone.length < 10) {
      toast.error("Por favor, digite um WhatsApp válido com DDD.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/v1/public/cells/visit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          churchSlug,
          cellId: cell.id,
          fullName: fullName.trim(),
          phone: cleanPhone,
          neighborhood: neighborhood.trim(),
          notes: notes.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao registrar solicitação")

      setIsSuccess(true)
      if (data.leaderPhone) {
        setLeaderPhone(data.leaderPhone)
      }
      toast.success("Solicitação enviada com sucesso!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar solicitação")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setIsSuccess(false)
    setFullName("")
    setPhone("")
    setNeighborhood("")
    setNotes("")
    onClose()
  }

  const leaderWhatsappUrl = leaderPhone
    ? `https://wa.me/55${leaderPhone}?text=${encodeURIComponent(
        `Olá! Sou o(a) ${fullName}. Deixei meu contato na página da célula "${cell.name}" para participar do próximo encontro!`
      )}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {isSuccess ? (
          <div className="text-center py-4 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">Visita Confirmada!</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O líder da célula <strong className="text-foreground">{cell.name}</strong> recebeu seu contato e entrará em contato com você.
              </p>
            </div>

            {leaderWhatsappUrl && (
              <a
                href={leaderWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-emerald-700 transition active:scale-95"
              >
                <MessageCircle className="h-4 w-4" />
                Conversar com o Líder Agora
              </a>
            )}

            <Button variant="outline" className="w-full" onClick={handleClose}>
              Voltar ao Mapa
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Quero Participar</span>
              </div>
              <h3 className="text-lg font-bold text-foreground mt-0.5">Visitar a célula {cell.name} • {churchName}</h3>
              <p className="text-xs text-muted-foreground">
                Deixe seus dados para o líder te receber e enviar a localização exata do encontro.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Seu Nome Completo *</Label>
                <Input
                  required
                  placeholder="Ex: Maria da Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">WhatsApp com DDD *</Label>
                <Input
                  required
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(phoneMask(e.target.value))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Seu Bairro (opcional)</Label>
                <Input
                  placeholder="Ex: Centro"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Mensagem ou pedido de oração (opcional)</Label>
                <Textarea
                  placeholder="Conte um pouco sobre você ou se levará alguém junto..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isSubmitting} className="w-full font-semibold shadow-md">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar para o Líder
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
