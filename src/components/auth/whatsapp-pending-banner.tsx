"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, MessageCircle, X } from "lucide-react"
import { toast } from "sonner"
import { saveOwnWhatsapp } from "@/lib/auth/whatsapp-actions"
import { formatBrazilianWhatsapp } from "@/lib/auth/phone"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function WhatsappPendingBanner({ pending: initialPending }: { pending: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [visible, setVisible] = useState(initialPending)
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState("")

  if (!visible) return null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveOwnWhatsapp(phone)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar o WhatsApp")
        return
      }
      toast.success("WhatsApp cadastrado para login e recuperação de senha")
      setVisible(false)
      router.refresh()
    })
  }

  return (
    <section className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 shadow-sm" aria-label="WhatsApp pendente">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-300">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Cadastre seu WhatsApp</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use seu número para entrar no Altar Church e recuperar a senha. Este aviso não bloqueia seu acesso.
          </p>
          {editing ? (
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
              <div className="relative flex-1">
                <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={15}
                  value={phone}
                  onChange={(event) => setPhone(formatBrazilianWhatsapp(event.target.value))}
                  placeholder="(11) 99999-9999"
                  className="pl-10"
                  aria-label="Seu WhatsApp"
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" disabled={pending}>{pending ? "Salvando..." : "Salvar WhatsApp"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancelar</Button>
            </form>
          ) : (
            <Button type="button" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              <MessageCircle className="h-4 w-4" />
              Cadastrar agora
            </Button>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setVisible(false)} aria-label="Fechar aviso">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}
