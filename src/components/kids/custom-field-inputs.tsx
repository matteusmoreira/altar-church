"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { KidCustomFieldDefinition, KidCustomFieldSurface, KidCustomFieldTarget, KidCustomFieldValue } from "@/lib/kids/types"

export function CustomFieldInputs({ definitions, target, surface, values, onChange, disabled = false }: {
  definitions: KidCustomFieldDefinition[]
  target: KidCustomFieldTarget
  surface: KidCustomFieldSurface
  values: KidCustomFieldValue[]
  onChange: (values: KidCustomFieldValue[]) => void
  disabled?: boolean
}) {
  const fields = definitions.filter((item) => item.isActive && item.targets.includes(target) && item.surfaces.includes(surface))
  if (fields.length === 0) return null
  const current = new Map(values.map((item) => [item.fieldId, item.value]))
  const set = (fieldId: string, value: KidCustomFieldValue["value"]) => onChange([...values.filter((item) => item.fieldId !== fieldId), { fieldId, value }])

  return (
    <div className="space-y-3 rounded-md border border-border/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">Campos adicionais</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const value = current.get(field.id) ?? (field.fieldType === "multiple" ? [] : field.fieldType === "boolean" ? false : "")
          return (
            <div key={field.id} className={field.fieldType === "textarea" || field.fieldType === "multiple" ? "space-y-1 sm:col-span-2" : "space-y-1"}>
              <Label>{field.name}{field.required ? " *" : ""}</Label>
              {field.fieldType === "textarea" && <Textarea value={String(value)} disabled={disabled} onChange={(event) => set(field.id, event.target.value)} />}
              {["text", "number", "date"].includes(field.fieldType) && <Input type={field.fieldType === "text" ? "text" : field.fieldType} value={String(value)} disabled={disabled} onChange={(event) => set(field.id, event.target.value)} />}
              {field.fieldType === "single" && <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={String(value)} disabled={disabled} onChange={(event) => set(field.id, event.target.value)}><option value="">Selecione</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
              {field.fieldType === "multiple" && <div className="flex flex-wrap gap-3">{field.options.map((option) => { const selected = Array.isArray(value) ? value : []; return <label key={option} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={selected.includes(option)} disabled={disabled} onChange={(event) => set(field.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />{option}</label> })}</div>}
              {field.fieldType === "boolean" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => set(field.id, event.target.checked)} />Sim</label>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

