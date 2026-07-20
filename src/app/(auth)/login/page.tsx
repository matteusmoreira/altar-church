"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"
import { PwaInstallButton } from "@/components/pwa-install"

const inputClasses =
  "h-11 md:h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 md:pl-10 text-[15px] md:text-[15px] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:border-sky-400/50 focus-visible:ring-sky-400/20"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const { login, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const nextPath = () => {
    if (typeof window === "undefined") return "/dashboard"
    const value = new URLSearchParams(window.location.search).get("next")
    return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(nextPath())
    }
  }, [isAuthenticated, isLoading, router])

  const handleSubmit = async () => {
    setLoading(true)

    try {
      const success = await login(email, password)
      if (success) {
        toast.success("Bem-vindo de volta!")
        router.push(nextPath())
      } else {
        toast.error("Credenciais invalidas ou perfil sem acesso")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Altar Church"
      subtitle="Gestão inteligente para sua igreja"
      below={
        <PwaInstallButton className="h-10 w-full rounded-xl border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white" />
      }
    >
      <form
        data-testid="login-form"
        data-ready={ready ? "true" : "false"}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!ready || loading) return
          void handleSubmit()
        }}
      >
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
          <Label htmlFor="password" className="text-[13px] font-medium text-slate-300">
            Senha
          </Label>
          <div className="group relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              className={`${inputClasses} pr-11 md:pr-11`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-400 hover:bg-white/5 hover:text-white"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <Button
          type="submit"
          data-testid="login-submit"
          className="btn-shine relative h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-[15px] font-semibold text-white shadow-[0_10px_36px_-10px_rgba(59,130,246,0.65)] transition-all duration-300 hover:shadow-[0_14px_44px_-8px_rgba(59,130,246,0.8)] hover:brightness-110 active:scale-[0.99]"
          disabled={loading || !ready}
        >
          {loading ? "Entrando..." : "Entrar"}
        </Button>
        <p className="pt-1 text-center text-sm text-slate-400">
          Não tem conta?{" "}
          <Link href="/register" className="font-medium text-sky-400 transition-colors hover:text-sky-300">
            Criar conta
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
