"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { declineMyPublishedAssignment } from "@/lib/member/assignment-actions"

export function AssignmentAbsence({ assignmentId, status, reason, canDecline, onSaved }: { assignmentId: string; status: string | null; reason?: string | null; canDecline: boolean; onSaved?: () => void }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [justification, setJustification] = useState("")
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  if (status === "declined" || saved) return <div className="rounded-lg bg-amber-500/10 p-3 text-sm"><p className="font-semibold">Ausência avisada à liderança</p><p className="mt-1 whitespace-pre-wrap">{reason || justification || "Sem justificativa informada."}</p><p className="mt-1 text-xs text-muted-foreground">Se puder voltar, fale com a liderança para verificar sua participação.</p></div>
  if (!canDecline) return null
  async function submit() {
    setBusy(true)
    const result = await declineMyPublishedAssignment({ assignmentId, reason: justification })
    setBusy(false)
    if (!result.ok) { toast.error(result.error || "Não foi possível enviar"); return }
    setSaved(true); setEditing(false); toast.success("Ausência avisada à liderança e à administração"); router.refresh(); onSaved?.()
  }
  return <div className="space-y-2">
    {!editing ? <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>Não conseguirei ir</Button> : <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm">Confirmar que você não conseguirá cumprir esta escala? A liderança será avisada para organizar a substituição.</p>
      <label className="block space-y-1 text-sm"><span>Justificativa (opcional)</span><Textarea value={justification} onChange={event => setJustification(event.target.value)} maxLength={500} disabled={busy} placeholder="Se quiser, conte o motivo" /></label>
      <p className="text-xs text-muted-foreground">{justification.length}/500 caracteres</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>{busy ? "Enviando…" : "Confirmar ausência"}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Voltar</Button></div>
    </div>}
  </div>
}
