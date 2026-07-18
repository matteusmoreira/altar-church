"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { deleteKidCustomField, reorderKidCustomFields, saveKidCustomField } from "@/lib/kids/custom-field-actions"
import type { KidCustomFieldDefinition, KidCustomFieldSurface, KidCustomFieldTarget, KidCustomFieldType } from "@/lib/kids/types"

type Form = Omit<KidCustomFieldDefinition, "id" | "sortOrder"> & { id: string | null; optionsText: string }
const empty: Form = { id: null, name: "", fieldType: "text", options: [], optionsText: "", targets: ["child"], surfaces: ["internal"], required: false, isActive: true }
const typeLabels: Record<KidCustomFieldType, string> = { text: "Texto curto", textarea: "Texto longo", number: "Número", date: "Data", single: "Seleção única", multiple: "Seleção múltipla", boolean: "Sim/Não" }

export function CustomFieldBuilder({ fields }: { fields: KidCustomFieldDefinition[] }) {
  const router = useRouter()
  const [form, setForm] = useState<Form | null>(null)
  const [pending, setPending] = useState(false)
  const edit = (field: KidCustomFieldDefinition) => setForm({ ...field, id: field.id, optionsText: field.options.join("\n") })
  const toggle = <T extends string>(items: T[], item: T) => items.includes(item) ? items.filter((value) => value !== item) : [...items, item]

  async function save() {
    if (!form) return
    setPending(true)
    const result = await saveKidCustomField({ ...form, options: form.optionsText.split("\n").map((item) => item.trim()).filter(Boolean) })
    setPending(false)
    if (!result.ok) return toast.error(result.error)
    toast.success("Campo salvo")
    setForm(null)
    router.refresh()
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este campo? Valores existentes serão preservados para auditoria.")) return
    const result = await deleteKidCustomField(id)
    if (result.ok) {
      toast.success("Campo removido")
      router.refresh()
    } else toast.error(result.error)
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...fields]
    const target = index + direction
    if (!next[target]) return
    ;[next[index], next[target]] = [next[target], next[index]]
    const result = await reorderKidCustomFields(next.map((item) => item.id))
    if (result.ok) router.refresh()
    else toast.error(result.error)
  }

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle>Campos adicionais</CardTitle><CardDescription>Dados extras de crianças e responsáveis.</CardDescription></div>
        <Button type="button" size="sm" onClick={() => setForm({ ...empty })}><Plus className="mr-1 h-4 w-4" />Novo</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {fields.length === 0 && <p className="text-sm text-muted-foreground">Nenhum campo configurado.</p>}
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div><p className="font-medium">{field.name}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant="outline">{typeLabels[field.fieldType]}</Badge>{field.targets.map((target) => <Badge key={target} variant="secondary">{target === "child" ? "Criança" : "Responsável"}</Badge>)}{field.required && <Badge>Obrigatório</Badge>}{!field.isActive && <Badge variant="destructive">Inativo</Badge>}</div></div>
            <div className="flex gap-1"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void move(index, -1)} disabled={index === 0}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => void move(index, 1)} disabled={index === fields.length - 1}><ArrowDown /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => edit(field)}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => void remove(field.id)}><Trash2 /></Button></div>
          </div>
        ))}
      </CardContent>
      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{form?.id ? "Editar campo" : "Novo campo"}</DialogTitle><DialogDescription>Escolha alvo, tipo e telas do cadastro Kids.</DialogDescription></DialogHeader>
          {form && <div className="space-y-4">
            <div className="space-y-1"><Label>Nome *</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className="space-y-1"><Label>Tipo</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.fieldType} onChange={(event) => setForm({ ...form, fieldType: event.target.value as KidCustomFieldType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            {["single", "multiple"].includes(form.fieldType) && <div className="space-y-1"><Label>Opções (uma por linha)</Label><textarea className="min-h-28 w-full rounded-md border bg-background p-2 text-sm" value={form.optionsText} onChange={(event) => setForm({ ...form, optionsText: event.target.value })} /></div>}
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Alvo</legend><div className="flex gap-4">{(["child", "guardian"] as KidCustomFieldTarget[]).map((target) => <label key={target} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.targets.includes(target)} onChange={() => setForm({ ...form, targets: toggle(form.targets, target) })} />{target === "child" ? "Criança" : "Responsável"}</label>)}</div></fieldset>
            <fieldset className="space-y-2"><legend className="text-sm font-medium">Exibir em</legend><div className="flex flex-wrap gap-4">{(["internal", "public", "portal"] as KidCustomFieldSurface[]).map((surface) => <label key={surface} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.surfaces.includes(surface)} onChange={() => setForm({ ...form, surfaces: toggle(form.surfaces, surface) })} />{{ internal: "Painel interno", public: "Link público", portal: "Portal Família" }[surface]}</label>)}</div></fieldset>
            <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} />Obrigatório</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Ativo</label></div>
          </div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button type="button" disabled={pending} onClick={() => void save()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
