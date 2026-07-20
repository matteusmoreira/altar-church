"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Baby, Mail, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestFamilyLoginCode, verifyFamilyLoginCode } from "@/lib/kids/portal-actions"

export function FamiliaLoginClient({ error }: { error: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [pending, setPending] = useState(false)

  async function sendCode() {
    setPending(true)
    try {
      const result = await requestFamilyLoginCode(email.trim())
      if (!result.ok) return toast.error(result.error ?? "Não foi possível enviar o código")
      toast.success("Se o e-mail estiver cadastrado, você receberá um código")
      setStep("code")
    } finally {
      setPending(false)
    }
  }

  async function verify() {
    setPending(true)
    try {
      const result = await verifyFamilyLoginCode({ email: email.trim(), code: code.trim() })
      if (!result.ok) return toast.error(result.error ?? "Código inválido")
      toast.success("Bem-vindo(a)!")
      router.push("/membro/kids")
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 gradient-hero">
      <Card className="w-full max-w-md glass-strong">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow">
            <Baby className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Portal da Família</CardTitle>
          <CardDescription>
            Acompanhe seus filhos no ministério infantil. Sem senha: enviamos um código para o seu e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error === "sem-cadastro" && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Não encontramos um cadastro de responsável com este e-mail. Faça o cadastro na recepção do Kids ou pelo link de visitante da sua igreja.
            </p>
          )}
          {step === "email" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (!pending) void sendCode()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="familia-email">E-mail cadastrado</Label>
                <Input
                  id="familia-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={pending || !email.includes("@")}>
                <Mail className="mr-2 h-4 w-4" />Enviar código de acesso
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (!pending) void verify()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="familia-code">Código de 6 dígitos</Label>
                <Input
                  id="familia-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={8}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                />
                <p className="text-xs text-muted-foreground">Enviado para {email}. Confira também o spam.</p>
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={pending || code.length < 6}>
                <ShieldCheck className="mr-2 h-4 w-4" />Entrar no portal
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
                Usar outro e-mail
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
