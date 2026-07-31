import Link from "next/link"
import { ArrowLeft, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { listFollowUpTriggers } from "@/lib/people/follow-up"
import { savePersonFollowUpTrigger, runPersonFollowUpTriggers } from "@/lib/people/follow-up-actions"

const triggerOptions = {
  new_visitor: "Novo visitante",
  visitor_without_contact: "Visitante sem contato",
  recurring_absence: "Ausência recorrente",
  new_prayer_request: "Novo pedido de oração",
  without_cell: "Pessoa sem célula",
  without_portal_access: "Membro sem acesso ao portal",
}

async function saveTriggerForm(formData: FormData) {
  "use server"
  await savePersonFollowUpTrigger(formData)
}

async function runTriggersForm(formData: FormData) {
  "use server"
  await runPersonFollowUpTriggers(formData)
}

export default async function FollowUpSettingsPage() {
  const triggers = await listFollowUpTriggers()
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3"><div><Button render={<Link href="/pessoas/follow-up" />} nativeButton={false} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Follow-up</Button><h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><Settings2 className="h-6 w-6 text-primary" /> Gatilhos de follow-up</h1><p className="text-muted-foreground">Configuração por igreja; cada origem gera no máximo uma tarefa pelo source key.</p></div><form action={runTriggersForm}><Button type="submit" variant="outline">Executar agora</Button></form></div>
      <Card className="glass"><CardHeader><CardTitle className="text-base">Novo gatilho</CardTitle><CardDescription>O worker integrado reavalia os gatilhos ativos e não duplica tarefas.</CardDescription></CardHeader><CardContent><form action={saveTriggerForm} className="grid gap-3 md:grid-cols-4"><div className="grid gap-2"><Label htmlFor="newTriggerKind">Tipo</Label><select id="newTriggerKind" name="triggerKind" defaultValue="new_visitor" className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(triggerOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="grid gap-2 md:col-span-2"><Label htmlFor="newTriggerName">Nome da tarefa</Label><Input id="newTriggerName" name="name" required placeholder="Ex.: Fazer primeiro contato" /></div><input type="hidden" name="isActive" value="true" /><input type="hidden" name="config" value="{}" /><Button type="submit" className="self-end">Salvar gatilho</Button></form></CardContent></Card>
      <Card className="glass"><CardHeader><CardTitle className="text-base">Gatilhos configurados ({triggers.length})</CardTitle></CardHeader><CardContent className="space-y-3">{triggers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum gatilho configurado.</p>}{triggers.map((trigger) => <form key={trigger.id} action={saveTriggerForm} className="grid gap-3 rounded-lg border border-border/40 p-4 md:grid-cols-[1fr_1fr_auto_auto]"><input type="hidden" name="id" value={trigger.id} /><select name="triggerKind" defaultValue={trigger.triggerKind} className="h-10 rounded-md border bg-background px-3 text-sm">{Object.entries(triggerOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Input name="name" defaultValue={trigger.name} required /><input type="hidden" name="isActive" value={trigger.isActive ? "true" : "false"} /><input type="hidden" name="config" value={JSON.stringify(trigger.config)} /><div className="flex items-center gap-2"><Badge variant={trigger.isActive ? "default" : "secondary"}>{trigger.isActive ? "Ativo" : "Pausado"}</Badge><Button type="submit" size="sm" variant="outline">Atualizar</Button></div></form>)}</CardContent></Card>
    </div>
  )
}
