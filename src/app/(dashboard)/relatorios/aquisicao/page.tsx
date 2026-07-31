import Link from "next/link"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listPublicAcquisitionMetrics } from "@/lib/public/acquisition"

const sourceLabels: Record<string, string> = {
  qr: "QR code",
  instagram: "Instagram",
  site: "Site",
  referral: "Indicação",
  event: "Evento",
  campaign: "Campanha",
  direct: "Direto",
  other: "Outro",
}

const eventLabels: Record<string, string> = {
  page_view: "Visitas públicas",
  form_submission: "Cadastros enviados",
  conversion: "Conversões",
  event_registration: "Inscrições em eventos",
}

export default async function AcquisitionReportPage() {
  const data = await listPublicAcquisitionMetrics()
  const byKind = new Map(data.summary.map((item) => [item.event_kind, item]))
  const pageViews = byKind.get("page_view")?.total ?? 0
  const submissions = byKind.get("form_submission")?.total ?? 0
  const conversions = byKind.get("conversion")?.total ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button render={<Link href="/relatorios" />} nativeButton={false} variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Relatórios</Button>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><BarChart3 className="h-6 w-6 text-primary" /> Aquisição pública</h1>
          <p className="text-muted-foreground">Últimos {data.days} dias; origem, visitas, cadastros e conversões isolados por igreja.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(["page_view", "form_submission", "conversion"] as const).map((kind) => (
          <Card key={kind} className="glass"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{eventLabels[kind]}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{kind === "page_view" ? pageViews : kind === "form_submission" ? submissions : conversions}</p></CardContent></Card>
        ))}
      </div>

      <Card className="glass">
        <CardHeader><CardTitle className="text-base">Por origem</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Origem</th><th className="p-3">Visitas</th><th className="p-3">Cadastros</th><th className="p-3">Conversões</th></tr></thead><tbody>{data.bySource.map((row) => <tr key={row.source_kind} className="border-b border-border/40"><td className="p-3"><Badge variant="secondary">{sourceLabels[row.source_kind] ?? row.source_kind}</Badge></td><td className="p-3">{row.page_views}</td><td className="p-3">{row.submissions}</td><td className="p-3">{row.conversions}</td></tr>)}{data.bySource.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Ainda não há eventos públicos.</td></tr>}</tbody></table>
        </CardContent>
      </Card>

      <Card className="glass"><CardHeader><CardTitle className="text-base">Resumo diário</CardTitle></CardHeader><CardContent className="space-y-2">{data.daily.map((row) => <div key={row.day} className="flex items-center justify-between rounded-lg border border-border/40 p-3 text-sm"><span>{row.day}</span><span className="text-muted-foreground">{row.page_views} visitas · {row.submissions} cadastros</span></div>)}{data.daily.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}</CardContent></Card>
    </div>
  )
}
