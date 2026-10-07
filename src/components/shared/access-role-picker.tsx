"use client"

import type { UserRole } from "@/lib/types"

export function AccessRolePicker<R extends UserRole>({ value, labels, onChange, disabled = false }: {
  value: R[]; labels: Record<R, string>; onChange: (roles: R[]) => void; disabled?: boolean
}) {
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="mb-2 text-sm font-medium">Perfis de acesso</legend>
    <p className="text-xs text-muted-foreground">Marque um ou mais perfis. As permissões dos perfis selecionados serão somadas.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {(Object.keys(labels) as R[]).map((role) => <label key={role} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm has-checked:border-primary has-checked:bg-primary/5">
        <input type="checkbox" checked={value.includes(role)} onChange={(event) => onChange(event.target.checked ? [...value, role] : value.filter((item) => item !== role))} />
        {labels[role]}
      </label>)}
    </div>
  </fieldset>
}
