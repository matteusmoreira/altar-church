"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState, useTransition } from "react"
import { ArrowLeft, Eye, EyeOff, KeyRound, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { completePasswordReset, requestPasswordReset } from "@/lib/auth/password-recovery"
import { formatBrazilianWhatsapp } from "@/lib/auth/phone"

const inputClasses =
  "h-11 rounded-xl border-white/10 bg-white/[0.04] text-[15px] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:border-sky-400/50 focus-visible:ring-sky-400/20"
const iconInputClasses = `${inputClasses} !pl-11`

export default function PasswordRecoveryPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<"request" | "complete">("request")
  const [whatsapp, setWhatsapp] = useState("")
  const [requestId, setRequestId] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    startTransition(async () => {
      const result = await requestPasswordReset(whatsapp)
      if (!result.ok || !result.requestId) {
        toast.error(result.error ?? "Não foi possível processar a solicitação")
        return
      }
      setRequestId(result.requestId)
      setStep("complete")
      setCooldown(60)
      toast.success("Solicitação processada")
    })
  }

  function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem")
      return
    }
    startTransition(async () => {
      const result = await completePasswordReset({ requestId, code, newPassword })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível redefinir a senha")
        return
      }
      toast.success("Senha atualizada. Entre com sua nova senha.")
      router.replace("/login")
    })
  }

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle={step === "request" ? "Receba um código no WhatsApp cadastrado." : "Informe o código e escolha sua nova senha."}
      below={(
        <Link href="/login" className="flex items-center justify-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Voltar para o login
        </Link>
      )}
    >
      {step === "request" ? (
        <form className="space-y-4" onSubmit={sendCode}>
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-3 text-sm text-slate-300">
            <p className="flex items-center gap-2 font-medium text-emerald-300">
              <MessageCircle className="h-4 w-4" /> Código pelo WhatsApp
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Por segurança, não informamos se o número está cadastrado nem exibimos o número de destino.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery-whatsapp" className="text-[13px] font-medium text-slate-300">Número do WhatsApp</Label>
            <div className="group relative">
              <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-400" />
              <Input
                id="recovery-whatsapp"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={15}
                className={iconInputClasses}
                placeholder="(11) 99999-9999"
                value={whatsapp}
                onChange={(event) => setWhatsapp(formatBrazilianWhatsapp(event.target.value))}
                aria-describedby="recovery-whatsapp-help"
                required
              />
            </div>
            <p id="recovery-whatsapp-help" className="text-xs text-slate-500">
              Use o mesmo WhatsApp cadastrado na igreja.
            </p>
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending}>
            {pending ? "Processando..." : "Enviar código no WhatsApp"}
          </Button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={resetPassword}>
          <div className="rounded-xl border border-sky-400/15 bg-sky-400/[0.06] p-3 text-xs leading-relaxed text-slate-300" role="status">
            Se a conta possuir WhatsApp e a igreja estiver conectada, você receberá uma mensagem com o botão <strong>Copiar código</strong>. O código expira em 10 minutos.
          </div>
          <div className="space-y-2">
            <Label htmlFor="recovery-code" className="text-[13px] font-medium text-slate-300">Código de 6 dígitos</Label>
            <div className="group relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-400" />
              <Input
                id="recovery-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className={`${iconInputClasses} font-mono tracking-[0.35em]`}
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-[13px] font-medium text-slate-300">Nova senha</Label>
            <div className="group relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 group-focus-within:text-sky-400" />
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                className={`${iconInputClasses} !pr-12`}
                placeholder="Mínimo de 8 caracteres"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-[13px] font-medium text-slate-300">Confirmar nova senha</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              className="h-11 rounded-xl border-white/10 bg-white/[0.04] text-[15px] text-white placeholder:text-slate-500"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={pending || code.length !== 6}>
            {pending ? "Atualizando..." : "Criar nova senha"}
          </Button>
          <Button type="button" variant="ghost" className="w-full text-slate-400" onClick={() => sendCode()} disabled={pending || cooldown > 0}>
            {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
