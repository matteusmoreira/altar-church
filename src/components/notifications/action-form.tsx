"use client"

import { useActionState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

type Result = { ok: boolean; error?: string; id?: string; message?: string }

export function NotificationActionForm({ action, children, submitLabel, testId, pendingLabel = "Salvando…" }: {
  action: (formData: FormData) => Promise<Result>
  children: ReactNode
  submitLabel: string
  testId?: string
  pendingLabel?: string
}) {
  const router = useRouter()
  const [result, submit, pending] = useActionState(async (_previous: Result | null, data: FormData) => {
    const next = await action(data)
    router.refresh()
    return next
  }, null)
  return <form action={submit} className="grid gap-4" data-testid={testId}>
    {children}
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{result.message ?? (result.ok ? "Salvo com sucesso." : result.error ?? "Não foi possível salvar.")}</p>}
    <Button type="submit" variant="brand" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
  </form>
}
