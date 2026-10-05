"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getAdminOpenRouterSettings, getAdminOpenRouterModels, saveAdminOpenRouterKey, saveAdminOpenRouterSettings } from "@/lib/admin/openrouter-actions"
import type { AdminCompany } from "@/lib/admin/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function OpenRouterPanel({ companies }: { companies: AdminCompany[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "")
  const [key, setKey] = useState("")
  const [keySource, setKeySource] = useState<"panel" | "environment" | "missing">("missing")
  const [models, setModels] = useState("")
  const [budget, setBudget] = useState("0")
  const [catalog, setCatalog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    getAdminOpenRouterSettings(companyId || undefined).then((settings) => {
      if (!current) return
      setKeySource(settings.keySource)
      setModels(settings.models.join("\n"))
      setBudget(String(settings.budget))
      setError("")
    }).catch(() => {
      if (current) setError("Não foi possível carregar a configuração. Tente novamente.")
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [companyId, reload])

  async function saveKey() {
    setBusy(true)
    try {
      const result = await saveAdminOpenRouterKey(key)
      if (!result.ok) { toast.error(result.error); return }
      setKey("")
      setKeySource("panel")
      toast.success("Chave central salva. As automações já podem utilizá-la.")
    } catch { toast.error("Não foi possível salvar a chave.") }
    finally { setBusy(false) }
  }

  async function saveSettings() {
    setBusy(true)
    try {
      const result = await saveAdminOpenRouterSettings({ companyId, models: models.split("\n").map((id) => id.trim()).filter(Boolean), budget: Number(budget) })
      if (!result.ok) { toast.error(result.error); return }
      toast.success("Modelos e orçamento da igreja salvos.")
    } catch { toast.error("Não foi possível salvar. Verifique a conexão e tente novamente.") }
    finally { setBusy(false) }
  }

  async function loadModels() {
    setBusy(true)
    try { setCatalog(await getAdminOpenRouterModels()) }
    catch { toast.error("Não foi possível consultar o catálogo do OpenRouter.") }
    finally { setBusy(false) }
  }

  return <div className="grid gap-6 lg:grid-cols-2">
    <Card>
      <CardHeader><CardTitle>OpenRouter · chave central</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Esta chave atende às automações de todas as igrejas e fica protegida no cofre do servidor. Depois de salva, seu conteúdo não é exibido.</p>
        <p role="status" className="text-sm">{loading ? "Carregando configuração…" : error ? "Configuração indisponível" : keySource === "panel" ? "Chave cadastrada pelo painel." : keySource === "environment" ? "Chave configurada no servidor. Ao salvar aqui, a nova chave terá prioridade." : "Nenhuma chave configurada."}</p>
        <div className="space-y-2">
          <Label htmlFor="openrouter-key">{keySource === "missing" ? "Chave de API" : "Nova chave de API"}</Label>
          <Input id="openrouter-key" type="password" autoComplete="new-password" placeholder="sk-or-…" value={key} onChange={(event) => setKey(event.target.value)} disabled={busy || loading || !!error} />
        </div>
        <Button onClick={() => void saveKey()} disabled={busy || loading || !!error || !key.trim()}>{busy ? "Aguarde…" : "Salvar chave central"}</Button>
        {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setLoading(true); setReload((value) => value + 1) }}>Tentar novamente</Button></div>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Modelos e orçamento por igreja</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="openrouter-company">Igreja</Label>
          <select id="openrouter-company" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={companyId} disabled={busy} onChange={(event) => { setLoading(true); setCompanyId(event.target.value) }}>
            {!companies.length && <option value="">Nenhuma igreja cadastrada</option>}
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="openrouter-models">Modelos autorizados (um por linha)</Label>
          <Textarea id="openrouter-models" rows={4} value={models} disabled={busy || loading || !!error || !companyId} onChange={(event) => setModels(event.target.value)} placeholder="Identificador completo do modelo no OpenRouter" />
          <Button variant="outline" onClick={() => void loadModels()} disabled={busy}>Consultar modelos disponíveis</Button>
          {!!catalog.length && <select aria-label="Adicionar modelo autorizado" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" value="" disabled={busy || loading || !!error || !companyId} onChange={(event) => {
            const id = event.target.value
            if (id) setModels((previous) => [...new Set([...previous.split("\n").map((value) => value.trim()).filter(Boolean), id])].join("\n"))
          }}><option value="">Selecione para adicionar…</option>{catalog.map((id) => <option key={id} value={id}>{id}</option>)}</select>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="openrouter-budget">Limite mensal de IA (US$)</Label>
          <Input id="openrouter-budget" type="number" min="0" max="100000" step="0.01" value={budget} disabled={busy || loading || !!error || !companyId} onChange={(event) => setBudget(event.target.value)} />
          <p className="text-xs text-muted-foreground">Defina um valor maior que zero para habilitar a IA. O limite controla o consumo desta igreja; os créditos são gerenciados na sua conta OpenRouter.</p>
        </div>
        <Button onClick={() => void saveSettings()} disabled={busy || loading || !!error || !companyId || !budget.trim()}>{busy ? "Aguarde…" : "Salvar modelos e orçamento"}</Button>
      </CardContent>
    </Card>
  </div>
}
