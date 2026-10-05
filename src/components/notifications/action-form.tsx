"use client"

import { useActionState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type Result = { ok: boolean; error?: string; id?: string }

export function NotificationActionForm({ action, children, submitLabel, testId }: {
  action: (formData: FormData) => Promise<Result>
  children: ReactNode
  submitLabel: string
  testId?: string
}) {
  const [result, submit, pending] = useActionState(async (_previous: Result | null, data: FormData) => action(data), null)
  return <form action={submit} className="grid gap-4" data-testid={testId}>
    {children}
    {result && <p role={result.ok ? "status" : "alert"} className={result.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{result.ok ? "Salvo com sucesso." : result.error ?? "Não foi possível salvar."}</p>}
    <Button type="submit" variant="brand" disabled={pending}>{pending ? "Salvando…" : submitLabel}</Button>
  </form>
}
