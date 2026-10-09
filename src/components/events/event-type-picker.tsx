"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { changeEventType } from "@/lib/events/actions"
import { eventTypeLabel } from "@/lib/events/presentation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function EventTypePicker({ options: initial, initialValue, editing, disabled }: { options: string[]; initialValue?: string; editing: boolean; disabled: boolean }) {
  const [options, setOptions] = useState(initial)
  const [value, setValue] = useState(initialValue || initial[0] || "service")
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()
  function change(operation: "add" | "delete", item: string) {
    startTransition(async () => {
      const result = await changeEventType(operation, item, editing)
      if (!result.ok) { toast.error(result.error); return }
      setOptions(result.options)
      if (operation === "add") { setValue(item.trim()); setName("") }
      else if (value === item && item !== initialValue) setValue(result.options[0])
      toast.success(operation === "add" ? "Tipo adicionado" : "Tipo removido das opções. Eventos existentes foram preservados.")
    })
  }
  const choices = options.includes(value) ? options : [value, ...options]
  return <div className="min-w-0 space-y-2">
    <input type="hidden" name="type" value={value} />
    <Select value={value} onValueChange={item => item && setValue(item)} disabled={disabled || pending}><SelectTrigger id="type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{choices.map(item => <SelectItem key={item} value={item}>{eventTypeLabel(item)}{!options.includes(item) ? " (tipo anterior)" : ""}</SelectItem>)}</SelectContent></Select>
    <details className="rounded-lg border bg-muted/20 p-3 text-sm"><summary className="cursor-pointer font-medium">Gerenciar tipos</summary><div className="mt-3 space-y-3">
      <div className="flex gap-2"><Input aria-label="Novo tipo de evento" placeholder="Ex.: Conferência" maxLength={100} value={name} onChange={e => setName(e.target.value)} disabled={pending || disabled} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) change("add", name) } }} /><Button type="button" size="icon" aria-label="Adicionar tipo" disabled={pending || disabled || !name.trim()} onClick={() => change("add", name)}><Plus className="h-4 w-4" /></Button></div>
      <ul className="max-h-48 space-y-1 overflow-y-auto">{options.map(item => <li key={item} className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{eventTypeLabel(item)}</span><Button type="button" variant="ghost" size="icon" aria-label={`Excluir tipo ${eventTypeLabel(item)}`} disabled={pending || disabled || options.length === 1} onClick={() => change("delete", item)}><Trash2 className="h-4 w-4" /></Button></li>)}</ul>
      <p className="text-xs text-muted-foreground">Opções compartilhadas pela igreja. Excluir um tipo preserva os eventos já criados.</p>
    </div></details>
  </div>
}
