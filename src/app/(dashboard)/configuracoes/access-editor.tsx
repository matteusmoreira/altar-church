"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { deleteChurchAccess, saveChurchAccess } from "@/lib/settings/access-actions"
import { churchRoles, type SaveAccessInput } from "@/lib/settings/access-schema"
import type { SettingsData, SettingsProfile } from "@/lib/settings/data"

export const accessRoleLabels: Record<string, string> = {
  admin: "Admin", pastor: "Pastor", ministry_leader: "Líder de ministério", cell_supervisor: "Supervisor de células",
  cell_leader: "Líder de célula", communication: "Comunicação", finance: "Financeiro", volunteer: "Voluntário", member: "Membro",
}

export function AccessEditor({ profile, cells, actorId, onClose }: {
  profile: SettingsProfile | null; cells: SettingsData["cells"]; actorId: string; onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [form, setForm] = useState<SaveAccessInput>({ id: profile?.id, name: profile?.name ?? "", email: profile?.email ?? "",
    role: (profile?.role ?? "member") as SaveAccessInput["role"], active: profile?.active ?? true, password: "", cellIds: profile?.cellIds ?? [] })
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
    <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
      <DialogHeader><DialogTitle>{profile ? "Editar acesso" : "Novo acesso"}</DialogTitle>
        <DialogDescription>{profile ? "Atualize os dados, a função e o status deste usuário." : "Crie o login da pessoa para esta igreja. Depois, compartilhe o e-mail e a senha com ela."}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setError(""); startTransition(async () => {
        try {
          const result = await saveChurchAccess(form)
          if (!result.ok) { setError(result.error ?? "Não foi possível salvar"); return }
          toast.success(profile ? "Acesso atualizado" : "Acesso criado")
          router.refresh(); onClose()
        } catch { setError("Não foi possível salvar. Verifique sua conexão e tente novamente") }
      }) }}>
        <fieldset disabled={pending} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="access-name">Nome</Label><Input id="access-name" required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="access-email">E-mail de login</Label><Input id="access-email" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="access-role">Função</Label><select id="access-role" disabled={profile?.id === actorId} className="h-10 w-full rounded-lg border bg-background px-3 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as SaveAccessInput["role"] })}>
            {churchRoles.map((role) => <option key={role} value={role}>{accessRoleLabels[role]}</option>)}
          </select><p className="text-xs text-muted-foreground">A função determina as áreas e ações que a pessoa pode acessar.</p></div>
          {form.role === "cell_leader" && <fieldset className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Células do líder</legend>
            {cells.length ? cells.map((cell) => <label key={cell.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.cellIds?.includes(cell.id)} onChange={(e) => setForm({ ...form, cellIds: e.target.checked ? [...(form.cellIds ?? []), cell.id] : form.cellIds?.filter((id) => id !== cell.id) })} />{cell.name}</label>) : <p className="text-sm text-muted-foreground">Cadastre uma célula ativa antes de criar este acesso.</p>}
          </fieldset>}
          <div className="space-y-2"><Label htmlFor="access-password">{profile ? "Nova senha (opcional)" : "Senha de acesso"}</Label><Input id="access-password" type="password" required={!profile} minLength={8} maxLength={128} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><p className="text-xs text-muted-foreground">{profile ? "Deixe em branco para manter a senha atual. " : ""}Use pelo menos 8 caracteres.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={profile?.id === actorId} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Acesso ativo</label>
          {profile?.id === actorId && <p className="text-xs text-muted-foreground">Seu próprio acesso deve continuar ativo e com a função Admin.</p>}
          <p className="text-xs text-muted-foreground">Desativar bloqueia o login sem excluir o cadastro da pessoa.</p>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Salvando..." : profile ? "Salvar alterações" : "Criar acesso"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

export function AccessDeleteDialog({ profile, onClose }: { profile: SettingsProfile; onClose: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}><DialogContent showCloseButton={!pending}>
    <DialogHeader><DialogTitle>Excluir acesso de {profile.name}?</DialogTitle><DialogDescription>O login {profile.email} será excluído e esta pessoa perderá o acesso. O cadastro da pessoa e os registros históricos da igreja serão preservados.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={() => startTransition(async () => {
      try {
        const result = await deleteChurchAccess(profile.id)
        router.refresh()
        if (!result.ok) { setError(result.error ?? "Não foi possível excluir"); return }
        toast.success("Acesso excluído"); onClose()
      } catch { setError("Não foi possível excluir. Verifique sua conexão e tente novamente") }
    })}>{pending ? "Excluindo..." : "Excluir acesso"}</Button></DialogFooter>
  </DialogContent></Dialog>
}
