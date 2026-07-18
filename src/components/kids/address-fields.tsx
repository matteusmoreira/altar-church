"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { KidAddress } from "@/lib/kids/types"

function cepMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function AddressFields({ value, onChange, disabled = false }: { value: KidAddress; onChange: (value: KidAddress) => void; disabled?: boolean }) {
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle")
  const lastLookup = useRef("")
  const digits = value.postalCode.replace(/\D/g, "")

  useEffect(() => {
    if (digits.length !== 8 || digits === lastLookup.current) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastLookup.current = digits
      setLookup("loading")
      try {
        const response = await fetch(`/api/cep/${digits}`, { signal: controller.signal })
        const data = await response.json() as Partial<KidAddress> & { error?: string }
        if (!response.ok) throw new Error(data.error)
        onChange({
          ...value,
          postalCode: data.postalCode ?? value.postalCode,
          street: data.street ?? value.street,
          neighborhood: data.neighborhood ?? value.neighborhood,
          city: data.city ?? value.city,
          state: data.state ?? value.state,
        })
        setLookup("idle")
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLookup("error")
      }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
    // Lookup must run only when normalized CEP changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const field = (key: keyof KidAddress, next: string) => onChange({ ...value, [key]: next })

  return (
    <div className="space-y-3 rounded-md border border-border/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">Endereço (opcional)</p>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label>CEP</Label>
          <Input inputMode="numeric" maxLength={9} value={value.postalCode} disabled={disabled} onChange={(event) => { lastLookup.current = ""; setLookup("idle"); field("postalCode", cepMask(event.target.value)) }} placeholder="00000-000" />
          {lookup === "loading" && <p className="text-xs text-muted-foreground">Buscando endereço…</p>}
          {lookup === "error" && <p className="text-xs text-warning">CEP não encontrado. Preencha manualmente.</p>}
        </div>
        <div className="space-y-1 sm:col-span-4"><Label>Logradouro</Label><Input value={value.street} disabled={disabled} onChange={(event) => field("street", event.target.value)} placeholder="Rua, avenida…" /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Número</Label><Input value={value.number} disabled={disabled} onChange={(event) => field("number", event.target.value)} /></div>
        <div className="space-y-1 sm:col-span-4"><Label>Complemento</Label><Input value={value.complement} disabled={disabled} onChange={(event) => field("complement", event.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Bairro</Label><Input value={value.neighborhood} disabled={disabled} onChange={(event) => field("neighborhood", event.target.value)} /></div>
        <div className="space-y-1 sm:col-span-3"><Label>Cidade</Label><Input value={value.city} disabled={disabled} onChange={(event) => field("city", event.target.value)} /></div>
        <div className="space-y-1 sm:col-span-1"><Label>UF</Label><Input maxLength={2} value={value.state} disabled={disabled} onChange={(event) => field("state", event.target.value.toUpperCase())} /></div>
      </div>
    </div>
  )
}

