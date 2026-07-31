"use client"

import { FormEvent, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { updateMemberProfile } from "@/lib/member/portal-actions"
import type { MemberProfile } from "@/lib/member/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function MemberProfileForm({ profile }: { profile: MemberProfile }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updateMemberProfile(formData)
      if (!result.ok) { toast.error(result.error ?? "Não foi possível atualizar"); return }
      toast.success("Perfil atualizado")
      router.refresh()
    })
  }
  const fields = [
    ["email", "E-mail", profile.email ?? ""], ["phone", "Telefone", profile.phone],
    ["address", "Endereço", profile.address], ["addressNumber", "Número", profile.addressNumber],
    ["addressComplement", "Complemento", profile.addressComplement], ["neighborhood", "Bairro", profile.neighborhood],
    ["city", "Cidade", profile.city], ["state", "Estado", profile.state], ["postalCode", "CEP", profile.postalCode],
  ] as const
  return <Card className="rounded-3xl bg-card/85"><CardHeader><CardTitle>Dados de contato</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">{fields.map(([name, label, value]) => <div key={name} className="grid gap-2"><Label htmlFor={`profile-${name}`}>{label}</Label><Input id={`profile-${name}`} name={name} defaultValue={value} /></div>)}<Button type="submit" disabled={pending} className="sm:col-span-2">Salvar alterações</Button></form></CardContent></Card>
}
