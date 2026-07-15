"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { Church, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
    <div className="flex min-h-screen items-center justify-center p-4 gradient-hero">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md glass-strong shadow-glow">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow">
            <Church className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Altar Church</CardTitle>
          <CardDescription>Gestão inteligente para sua igreja</CardDescription>
        </CardHeader>
        <CardContent>
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
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              data-testid="login-submit"
              className="w-full gradient-primary"
              disabled={loading || !ready}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Criar conta
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
