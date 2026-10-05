"use client"

import { useRef, useTransition, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export function DonationForm({ action, children }: {
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>
  children: ReactNode
}) {
  const [pending, startTransition] = useTransition()
  const requestId = useRef<string | null>(null)
  const router = useRouter()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const data = new FormData(form)
    requestId.current ??= crypto.randomUUID()
    data.set("requestId", requestId.current)
    startTransition(async () => {
      try {
        const result = await action(data)
        if (!result.ok) { toast.error(result.error ?? "Não foi possível salvar"); return }
        requestId.current = null
        form.reset()
        toast.success("Registro salvo com sucesso")
        router.refresh()
      } catch {
        toast.error("Não foi possível confirmar o resultado. Tente novamente para conferir o registro.")
      }
    })
  }
  return <form onSubmit={submit} aria-busy={pending}>
    <fieldset disabled={pending} className="grid gap-4 lg:grid-cols-6">{children}</fieldset>
  </form>
}
