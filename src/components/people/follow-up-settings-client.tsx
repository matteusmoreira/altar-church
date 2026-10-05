"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { runFollowUpTriggersDirect } from "@/lib/people/follow-up-actions"
import type { PersonFollowUpTrigger } from "@/lib/people/types"
import { TriggerConfigDialog, triggerLabels } from "./trigger-config-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/shared"

export function FollowUpSettingsClient({ triggers, responsibleOptions }: {
  triggers: PersonFollowUpTrigger[]
  responsibleOptions: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [selectedKind, setSelectedKind] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)
  const activeCount = triggers.filter((trigger) => trigger.isActive).length

  function run() {
    startTransition(async () => {
      try {
        const response = await runFollowUpTriggersDirect()
        if (!response.ok || !("created" in response)) {
          toast.error(response.error ?? "Não foi possível verificar as regras")
          return
        }
        setResult(response.created
          ? `${response.created} nova(s) tarefa(s) criada(s). Abra o follow-up para acompanhar.`
          : "Verificação concluída. Nenhuma nova tarefa: as pessoas já têm tarefas para essas situações ou não atendem às regras ativas.")
        toast.success("Verificação concluída")
        router.refresh()
      } catch {
        toast.error("Não foi possível verificar as regras. Tente novamente.")
      }
    })
  }

  return (
    <div className="space-y-6">
      <Button render={<Link href="/pessoas/follow-up" />} nativeButton={false} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Voltar às tarefas</Button>
      <PageHeader title="Regras de follow-up" description="Crie tarefas de acompanhamento para acolher e cuidar das pessoas da igreja." actions={<Button onClick={run} disabled={pending || activeCount === 0} variant="outline">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}{pending ? "Verificando..." : "Verificar pessoas agora"}</Button>} />
      <Card><CardHeader><CardTitle className="text-base">Como começar</CardTitle><CardDescription>Follow-up é uma tarefa com responsável, prazo e status. Uma trilha organiza várias etapas de crescimento.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">
        <ol className="list-decimal space-y-2 pl-5"><li>Escolha uma situação abaixo e configure a tarefa, o prazo e quem vai acompanhar.</li><li>Ative a regra e salve. A regra também pode encontrar pessoas já cadastradas.</li><li>Use “Verificar pessoas agora” e acompanhe as tarefas no follow-up ou na ficha da pessoa, em Linha do tempo.</li></ol>
        <p className="text-muted-foreground">As regras criam tarefas internas; não enviam mensagens. Pausar uma regra impede novas tarefas e mantém as existentes. A mesma situação não gera tarefas duplicadas; a ausência pode gerar uma nova tarefa a cada mês.</p>
        <div className="flex flex-wrap gap-2"><Button render={<Link href="/pessoas/follow-up" />} nativeButton={false} variant="outline" size="sm">Ver tarefas</Button><Button render={<Link href="/pessoas?tab=config#trilhas" />} nativeButton={false} variant="ghost" size="sm">Configurar trilhas</Button></div>
      </CardContent></Card>
      {result && <p role="status" className="rounded-lg border bg-muted/30 p-4 text-sm">{result}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(triggerLabels).map(([kind, meta]) => {
          const trigger = triggers.find((item) => item.triggerKind === kind)
          const responsible = responsibleOptions.find((item) => item.id === trigger?.config.responsibleProfileId)
          return <Card key={kind}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{meta.label}</CardTitle><Badge variant={trigger?.isActive ? "default" : "secondary"}>{trigger ? trigger.isActive ? "Ativa" : "Pausada" : "Não configurada"}</Badge></div><CardDescription>{meta.description}</CardDescription></CardHeader><CardContent className="space-y-3">
            {trigger && <div className="space-y-1 text-sm"><p className="font-medium">{trigger.name}</p><p className="text-muted-foreground">Prazo: {Number(trigger.config.dueDays ?? 2)} dia(s) após criar a tarefa · {responsible?.name ?? "Sem responsável definido"}</p></div>}
            <Button onClick={() => setSelectedKind(kind)} variant={trigger ? "outline" : "default"}>{trigger ? "Editar regra / pausar" : "Configurar regra"}</Button>
          </CardContent></Card>
        })}
      </div>
      <TriggerConfigDialog trigger={triggers.find((item) => item.triggerKind === selectedKind) ?? null} triggerKind={selectedKind ?? "new_visitor"} open={selectedKind !== null} onOpenChange={(open) => { if (!open) setSelectedKind(null) }} responsibleOptions={responsibleOptions} onSaved={() => { setResult(null); router.refresh() }} />
    </div>
  )
}
