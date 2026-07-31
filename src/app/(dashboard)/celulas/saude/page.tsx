import Link from "next/link"
import { Activity, AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Download, Heart, Settings2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { listCellHealth, saveCellHealthSettings } from "@/lib/cells/health"

type SearchParams = Record<string, string | string[] | undefined>
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

async function saveCellHealthSettingsForm(formData: FormData) {
  "use server"
  const groupId = String(formData.get("groupId") ?? "")
  const absenceDays = Math.max(7, Math.min(Number(formData.get("absenceDays") ?? 30) || 30, 365))
  const growthTarget = Math.max(0, Math.min(Number(formData.get("growthTarget") ?? 0) || 0, 100000))
  await saveCellHealthSettings({ groupId, absenceDays, growthTarget, alertsEnabled: formData.get("alertsEnabled") === "on" })
}

export default async function CellHealthPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const cells = await listCellHealth(first(params.cellId))
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Button render={<Link href="/celulas" />} nativeButton={false} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Células</Button><h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><Activity className="h-6 w-6 text-primary" /> Saúde das células</h1><p className="text-muted-foreground">Presença real, cuidado pastoral, comunicação e relatórios por escopo autorizado.</p></div><Button render={<Link href="/api/v1/cells/health/export" />} nativeButton={false} variant="outline"><Download className="h-4 w-4" /> Exportar relatório</Button></div>
      <Card className="glass"><CardContent className="flex flex-wrap gap-3 p-4"><form method="get" className="flex flex-wrap items-end gap-2"><div className="grid gap-1"><Label htmlFor="cellHealthFilter">Célula</Label><select id="cellHealthFilter" name="cellId" defaultValue={first(params.cellId) ?? ""} className="h-10 min-w-48 rounded-md border bg-background px-3 text-sm"><option value="">Todas</option>{cells.map((cell) => <option key={cell.id} value={cell.id}>{cell.name}</option>)}</select></div><Button type="submit" variant="outline">Filtrar</Button></form></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-3"><Card className="glass"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Células exibidas</p><p className="mt-1 text-3xl font-bold">{cells.length}</p></CardContent></Card><Card className="glass"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Com atenção</p><p className="mt-1 text-3xl font-bold text-warning">{cells.filter((cell) => cell.health === "attention").length}</p></CardContent></Card><Card className="glass"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Críticas</p><p className="mt-1 text-3xl font-bold text-destructive">{cells.filter((cell) => cell.health === "critical").length}</p></CardContent></Card></div>
      <div className="grid gap-4 xl:grid-cols-2">{cells.map((cell) => <Card key={cell.id} className="glass"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{cell.name}</CardTitle><Badge variant={cell.health === "healthy" ? "default" : cell.health === "attention" ? "outline" : "destructive"}>{cell.health === "healthy" ? "Saudável" : cell.health === "attention" ? "Atenção" : "Crítica"}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-muted-foreground">Membros</p><p className="font-semibold">{cell.activeMemberCount}/{cell.capacity || "∞"}</p></div><div><p className="text-muted-foreground">Presença 7d</p><p className="font-semibold">{cell.attendance7}</p></div><div><p className="text-muted-foreground">Novos 30d</p><p className="font-semibold">{cell.newParticipants30}</p></div><div><p className="text-muted-foreground">Orações abertas</p><p className="font-semibold">{cell.openPrayerCount}</p></div></div><div className="grid gap-2 text-xs text-muted-foreground"><p><BarChart3 className="mr-1 inline h-3.5 w-3.5" />Presenças 30d: {cell.attendance30} · Relatórios pendentes: {cell.pendingReports30}</p><p><Heart className="mr-1 inline h-3.5 w-3.5" />Última comunicação: {cell.lastCommunicationAt ? new Intl.DateTimeFormat("pt-BR").format(new Date(cell.lastCommunicationAt)) : "não registrada"}</p></div><div className="border-t border-border/40 pt-3"><form action={saveCellHealthSettingsForm} className="grid gap-3 sm:grid-cols-4"><input type="hidden" name="groupId" value={cell.id} /><div className="grid gap-1"><Label htmlFor={`absence-${cell.id}`} className="text-xs">Ausência (dias)</Label><Input id={`absence-${cell.id}`} name="absenceDays" type="number" min={7} max={365} defaultValue={cell.absenceDays} className="h-9" /></div><div className="grid gap-1"><Label htmlFor={`growth-${cell.id}`} className="text-xs">Meta novos/mês</Label><Input id={`growth-${cell.id}`} name="growthTarget" type="number" min={0} defaultValue={cell.growthTarget} className="h-9" /></div><label className="flex items-center gap-2 self-end text-xs"><input type="checkbox" name="alertsEnabled" defaultChecked={cell.alertsEnabled} /> Alertas</label><Button type="submit" size="sm" variant="outline" className="self-end"><Settings2 className="h-3.5 w-3.5" /> Salvar</Button></form></div></CardContent></Card>)}</div>
      {cells.length === 0 && <Card className="glass"><CardContent className="p-6 text-sm text-muted-foreground"><AlertTriangle className="mr-2 inline h-4 w-4" />Nenhuma célula no escopo deste usuário.</CardContent></Card>}
      {cells.length > 0 && <p className="text-xs text-muted-foreground"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Indicadores derivados de presença, reuniões, membros, pedidos de oração e avisos persistidos.</p>}
    </div>
  )
}
