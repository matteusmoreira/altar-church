"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Building2, Lock, Mail, User } from "lucide-react"
import { toast } from "sonner"
import { registerSelfServiceUser } from "@/lib/auth/register"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"

const inputClasses =
  "h-11 md:h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 md:pl-10 text-[15px] md:text-[15px] text-white placeholder:text-slate-500 hover:border-white/20 focus-visible:border-sky-400/50 focus-visible:ring-sky-400/20"

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [companySlug, setCompanySlug] = useState("")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await registerSelfServiceUser({
        name,
        email,
        password,
        companySlug,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível criar a conta")
        return
      }
      toast.success("Conta criada. Faça login para continuar.")
      router.push("/login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Cadastre-se com o slug da sua igreja. O perfil inicia como leitor até um administrador ampliar o acesso."
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
          <Label htmlFor="password" className="text-[13px] font-medium text-slate-300">
            Senha
          </Label>
          <div className="group relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              className={inputClasses}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="companySlug" className="text-[13px] font-medium text-slate-300">
            Slug da igreja
          </Label>
          <div className="group relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-sky-400" />
            <Input
              id="companySlug"
              className={inputClasses}
              value={companySlug}
              onChange={(event) => setCompanySlug(event.target.value.toLowerCase())}
              placeholder="batista-central"
              required
            />
          </div>
          <p className="text-xs text-slate-500">Ex.: batista-central, graca-viva</p>
        </div>
        <Button
          type="submit"
          className="btn-shine relative h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-[15px] font-semibold text-white shadow-[0_10px_36px_-10px_rgba(59,130,246,0.65)] transition-all duration-300 hover:shadow-[0_14px_44px_-8px_rgba(59,130,246,0.8)] hover:brightness-110 active:scale-[0.99]"
          disabled={loading}
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
