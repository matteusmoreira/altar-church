"use client"

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface PersonAddressFieldsValue {
  postalCode: string
  address: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
}

interface CepResponse {
  postalCode?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
  error?: string
}

function cepMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function PersonAddressFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PersonAddressFieldsValue
  onChange: (value: PersonAddressFieldsValue) => void
  disabled?: boolean
}) {
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle")
  const lastLookup = useRef("")
  const valueRef = useRef(value)
  const digits = value.postalCode.replace(/\D/g, "")

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (digits.length !== 8 || digits === lastLookup.current) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastLookup.current = digits
      setLookup("loading")
      try {
        const response = await fetch(`/api/cep/${digits}`, { signal: controller.signal })
        const data = await response.json() as CepResponse
        if (!response.ok) throw new Error(data.error)

        const current = valueRef.current
        onChange({
          ...current,
          postalCode: cepMask(data.postalCode ?? current.postalCode),
          address: data.street ?? current.address,
          neighborhood: data.neighborhood ?? current.neighborhood,
          city: data.city ?? current.city,
          state: data.state ?? current.state,
        })
        setLookup("idle")
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLookup("error")
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
    // Lookup runs only when normalized CEP changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits])

  const field = (key: keyof PersonAddressFieldsValue, next: string) => onChange({ ...value, [key]: next })

  return (
    <div className="space-y-3 rounded-lg border border-border/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">Endereço</p>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="space-y-1 sm:col-span-2">
          <Label>CEP</Label>
          <Input
            inputMode="numeric"
            maxLength={9}
            value={value.postalCode}
            disabled={disabled}
            onChange={(event) => {
              lastLookup.current = ""
              setLookup("idle")
              field("postalCode", cepMask(event.target.value))
            }}
            placeholder="00000-000"
          />
          {lookup === "loading" && <p className="text-xs text-muted-foreground">Buscando endereço…</p>}
          {lookup === "error" && <p className="text-xs text-warning">Não foi possível buscar o CEP. Preencha manualmente.</p>}
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label>Logradouro</Label>
          <Input value={value.address} disabled={disabled} onChange={(event) => field("address", event.target.value)} placeholder="Rua, avenida…" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Número</Label>
          <Input value={value.addressNumber} disabled={disabled} onChange={(event) => field("addressNumber", event.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label>Complemento</Label>
          <Input value={value.addressComplement} disabled={disabled} onChange={(event) => field("addressComplement", event.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Bairro</Label>
          <Input value={value.neighborhood} disabled={disabled} onChange={(event) => field("neighborhood", event.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label>Cidade</Label>
          <Input value={value.city} disabled={disabled} onChange={(event) => field("city", event.target.value)} placeholder="Cidade" />
        </div>
        <div className="space-y-1 sm:col-span-1">
          <Label>UF</Label>
          <Input maxLength={2} value={value.state} disabled={disabled} onChange={(event) => field("state", event.target.value.toUpperCase())} placeholder="SP" />
        </div>
      </div>
    </div>
  )
}
