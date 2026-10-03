"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Calendar, CheckCircle2, Church, Loader2, Mail, MapPin, Phone, User } from "lucide-react"
import { updateMemberProfile } from "@/lib/member/portal-actions"
import type { MemberProfile } from "@/lib/member/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatBrazilianWhatsapp } from "@/lib/auth/phone"

export function MemberProfileForm({
  profile,
  congregationOptions,
}: {
  profile: MemberProfile
  congregationOptions: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [phoneValue, setPhoneValue] = useState(formatBrazilianWhatsapp(profile.phone))
  const [postalCode, setPostalCode] = useState(profile.postalCode ?? "")
  const [address, setAddress] = useState(profile.address ?? "")
  const [neighborhood, setNeighborhood] = useState(profile.neighborhood ?? "")
  const [city, setCity] = useState(profile.city ?? "")
  const [state, setState] = useState(profile.state ?? "")
  const [fetchingCep, setFetchingCep] = useState(false)

  async function handleCepBlur() {
    const cleaned = postalCode.replace(/\D/g, "")
    if (cleaned.length !== 8) return
    setFetchingCep(true)
    try {
      const res = await fetch(`/api/cep/${cleaned}`)
      if (res.ok) {
        const data = (await res.json()) as {
          street?: string
          neighborhood?: string
          city?: string
          state?: string
        }
        if (data.street) setAddress(data.street)
        if (data.neighborhood) setNeighborhood(data.neighborhood)
        if (data.city) setCity(data.city)
        if (data.state) setState(data.state)
        toast.success("Endereço preenchido pelo CEP")
      }
    } catch {
      // ignore error
    } finally {
      setFetchingCep(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updateMemberProfile(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível atualizar o cadastro")
        return
      }
      toast.success("Cadastro atualizado com sucesso!")
      router.refresh()
    })
  }

  return (
    <Card className="rounded-3xl border-border/50 bg-card/85 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Dados cadastrais e contato</CardTitle>
        <CardDescription>
          Mantenha seus dados e informações de contato atualizados para a igreja.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="h-4 w-4 text-primary" /> Informações pessoais
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="profile-fullName">Nome completo</Label>
                <Input
                  id="profile-fullName"
                  value={profile.fullName}
                  disabled
                  className="bg-muted/40 font-medium"
                />
                <p className="text-[11px] text-muted-foreground">Para alterar seu nome, solicite à secretaria.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-birthDate" className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Data de nascimento
                </Label>
                <Input
                  id="profile-birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={profile.birthDate ?? ""}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-congregation" className="flex items-center gap-1.5">
                  <Church className="h-3.5 w-3.5 text-primary" /> Congregação
                </Label>
                <select
                  id="profile-congregation"
                  name="congregationId"
                  defaultValue={profile.congregationId ?? ""}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem congregação</option>
                  {congregationOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-primary" /> WhatsApp *
                </Label>
                <Input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(formatBrazilianWhatsapp(e.target.value))}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" /> E-mail
                </Label>
                <Input
                  id="profile-email"
                  name="email"
                  type="email"
                  defaultValue={profile.email ?? ""}
                  placeholder="seuemail@exemplo.com"
                />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4 border-t border-border/40 pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" /> Endereço residencial
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="profile-postalCode">CEP</Label>
                  {fetchingCep && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                    </span>
                  )}
                </div>
                <Input
                  id="profile-postalCode"
                  name="postalCode"
                  maxLength={9}
                  placeholder="00000-000"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  onBlur={handleCepBlur}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-address">Endereço (Rua / Avenida)</Label>
                <Input
                  id="profile-address"
                  name="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, Avenida..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-addressNumber">Número</Label>
                <Input
                  id="profile-addressNumber"
                  name="addressNumber"
                  defaultValue={profile.addressNumber}
                  placeholder="123"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-addressComplement">Complemento</Label>
                <Input
                  id="profile-addressComplement"
                  name="addressComplement"
                  defaultValue={profile.addressComplement}
                  placeholder="Apto, Casa 2, Bloco B..."
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="profile-neighborhood">Bairro</Label>
                <Input
                  id="profile-neighborhood"
                  name="neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  placeholder="Seu bairro"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="profile-city">Cidade</Label>
                  <Input
                    id="profile-city"
                    name="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="profile-state">UF</Label>
                  <Input
                    id="profile-state"
                    name="state"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    placeholder="RJ"
                  />
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={pending} className="w-full sm:w-auto min-w-[180px]">
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Salvar alterações
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
