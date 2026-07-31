"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, Edit3, MoreHorizontal, Send, Trash2, XCircle } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { deleteEvent, duplicateEvent, setEventStatus } from "@/lib/operational/actions"

export function EventActions({
  eventId,
  eventTitle,
  status,
  canEdit,
  canCreate,
  canDelete,
}: {
  eventId: string
  eventTitle: string
  status: "draft" | "published" | "cancelled"
  canEdit: boolean
  canCreate: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null)

  if (!canEdit && !canCreate && !canDelete) return null

  function run(action: (formData: FormData) => Promise<{ ok: boolean; error?: string; id?: string }>, fields: Record<string, string>, success: string, redirectTo?: string | ((id: string | undefined) => string)) {
    startTransition(async () => {
      const formData = new FormData()
      Object.entries(fields).forEach(([key, value]) => formData.set(key, value))
      const result = await action(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível concluir a ação")
        return
      }
      toast.success(success)
      setConfirm(null)
      if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(result.id) : redirectTo)
      else router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-9 w-9" disabled={pending} />}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações de {eventTitle}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && <DropdownMenuItem onClick={() => router.push(`/eventos/${eventId}`)}><Edit3 /> Abrir e editar</DropdownMenuItem>}
          {canCreate && <DropdownMenuItem onClick={() => run(duplicateEvent, { id: eventId }, "Evento duplicado", (id) => id ? `/eventos/${id}` : "/eventos")}><Copy /> Duplicar</DropdownMenuItem>}
          {canEdit && status !== "published" && status !== "cancelled" && <DropdownMenuItem onClick={() => run(setEventStatus, { id: eventId, status: "published" }, "Evento publicado")}><Send /> Publicar</DropdownMenuItem>}
          {canEdit && status !== "cancelled" && <DropdownMenuItem onClick={() => setConfirm("cancel")}><XCircle /> Cancelar evento</DropdownMenuItem>}
          {canDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}><Trash2 /> Excluir logicamente</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Excluir evento?" : "Cancelar evento?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "O evento sairá das listas, mas RSVP, presença e histórico de auditoria serão preservados."
                : "O evento ficará cancelado e não aceitará novas confirmações. O histórico será preservado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => {
                if (confirm === "delete") run(deleteEvent, { id: eventId }, "Evento excluído")
                if (confirm === "cancel") run(setEventStatus, { id: eventId, status: "cancelled" }, "Evento cancelado")
              }}
            >
              {pending ? "Processando..." : confirm === "delete" ? "Excluir" : "Cancelar evento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
