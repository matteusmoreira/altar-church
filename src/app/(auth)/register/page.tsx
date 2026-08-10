"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Building2, Eye, EyeOff, Lock, Mail, MessageCircle, User } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { getPublicChurches, registerSelfServiceUser, type PublicChurch } from "@/lib/auth/register"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AuthCard } from "@/components/auth/auth-card"
import { formatBrazilianWhatsapp } from "@/lib/auth/phone"

const inputClasses =
  "h-11 md:h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 md:pl-10 text-[15px] md:text-[15px] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:border-sky-400/50 focus-visible:ring-sky-400/20"

export default function RegisterPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [password, setPassword] = useState("")
  const [companyId, setCompanyId] = useState("")
  const [churches, setChurches] = useState<PublicChurch[]>([])
  const [churchesLoading, setChurchesLoading] = useState(true)
  const [churchesError, setChurchesError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    let cancelled = false

    void getPublicChurches()
      .then((loadedChurches) => {
        if (cancelled) return
        setChurches(loadedChurches)
        if (loadedChurches.length === 0) {
          setChurchesError("Nenhuma igreja disponível para cadastro no momento.")
        }
      })
      .catch(() => {
        if (!cancelled) setChurchesError("Não foi possível carregar as igrejas. Atualize a página e tente novamente.")
      })
      .finally(() => {
        if (!cancelled) setChurchesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await registerSelfServiceUser({
        name,
        email,
        whatsapp,
        password,
        companyId,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível criar a conta")
        return
      }
      const loggedIn = await login(email.trim().toLowerCase(), password)
      if (!loggedIn) {
        toast.error("Conta criada, mas não foi possível iniciar sua sessão. Faça login para continuar.")
        router.replace("/login")
        return
      }

      toast.success("Conta criada! Redirecionando...")
      router.replace("/dashboard")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Selecione sua igreja para acessar seu Portal do Membro."
    >
      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <Label htmlFor="name" className="text-[13px] font-medium text-slate-300">
            Nome
          </Label>
          <div className="group relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="name"
              autoComplete="name"
              placeholder="Seu nome completo"
              className={inputClasses}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[13px] font-medium text-slate-300">
            E-mail
          </Label>
          <div className="group relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              className={inputClasses}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp" className="text-[13px] font-medium text-slate-300">
            WhatsApp
          </Label>
          <div className="group relative">
            <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-emerald-400" />
            <Input
              id="whatsapp"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={15}
              placeholder="(11) 99999-9999"
              className={inputClasses}
              value={whatsapp}
              onChange={(event) => setWhatsapp(formatBrazilianWhatsapp(event.target.value))}
              aria-describedby="whatsapp-help"
              required
            />
          </div>
          <p id="whatsapp-help" className="text-xs text-slate-500">
            Será usado para entrar e recuperar sua senha com segurança.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-[13px] font-medium text-slate-300">
            Senha
          </Label>
          <div className="group relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              className={`${inputClasses} pr-11`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={showPassword}
              title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyId" className="text-[13px] font-medium text-slate-300">
            Igreja
          </Label>
          <div className="group relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Select
              value={companyId}
              onValueChange={(value) => setCompanyId(value ?? "")}
              disabled={churchesLoading || churches.length === 0}
            >
              <SelectTrigger
                id="companyId"
                data-testid="register-church-select"
                className={`${inputClasses} pr-9 data-placeholder:text-slate-500`}
                aria-invalid={Boolean(churchesError && !companyId)}
              >
                <SelectValue placeholder={churchesLoading ? "Carregando igrejas..." : "Selecione sua igreja"} />
              </SelectTrigger>
              <SelectContent>
                {churches.map((church) => (
                  <SelectItem key={church.id} value={church.id}>
                    {church.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {churchesError ? <p className="text-xs text-amber-300" role="status">{churchesError}</p> : null}
        </div>
        <Button
          type="submit"
          className="btn-shine relative h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-[15px] font-semibold text-white shadow-[0_10px_36px_-10px_rgba(59,130,246,0.65)] transition-all duration-300 hover:shadow-[0_14px_44px_-8px_rgba(59,130,246,0.8)] hover:brightness-110 active:scale-[0.99]"
          disabled={loading || churchesLoading || !companyId || churches.length === 0}
        >
          {loading ? "Criando..." : "Criar conta"}
        </Button>
        <p className="pt-1 text-center text-sm text-slate-400">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-sky-400 transition-colors hover:text-sky-300">
            Entrar
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
