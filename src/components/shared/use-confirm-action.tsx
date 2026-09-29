"use client"

import { useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * Substituto acessível do `window.confirm` para ações destrutivas.
 * Uso: `const confirm = useConfirmAction()` e `confirm({ title, message,
 * confirmLabel, action })`. O diálogo é controlado por estado local,
 * funciona com teclado/Escape e mantém o mesmo idioma da interface.
 */
interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  action: () => void
}

export function useConfirmAction() {
  const [pending, setPending] = useState<(ConfirmOptions & { key: number }) | null>(null)

  function confirm(options: ConfirmOptions) {
    setPending({ ...options, key: Date.now() })
  }

  function dialog() {
    return (
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title ?? "Confirmar"}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { pending?.action(); setPending(null) }}
            >
              {pending?.confirmLabel ?? "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return { confirm, dialog }
}
