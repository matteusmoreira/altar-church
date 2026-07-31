"use client"

import { FormEvent, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"
import { toast } from "sonner"
import { createMemberPrayerRequest } from "@/lib/member/portal-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

export function MemberPrayerForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState("")
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await createMemberPrayerRequest(formData)
      if (!result.ok) { toast.error(result.error ?? "Não foi possível registrar"); return }
      toast.success("Pedido de oração enviado à equipe pastoral")
      setMessage("")
      router.refresh()
    })
  }
  return <Card className="rounded-3xl bg-card/85"><CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /> Pedido de oração</CardTitle><CardDescription>Seu pedido será tratado pela equipe autorizada da igreja.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="space-y-3"><Textarea name="message" value={message} onChange={(event) => setMessage(event.target.value)} required minLength={3} maxLength={5000} rows={7} placeholder="Escreva seu pedido..." /><Button type="submit" disabled={pending || message.trim().length < 3}>Enviar pedido</Button></form></CardContent></Card>
}
