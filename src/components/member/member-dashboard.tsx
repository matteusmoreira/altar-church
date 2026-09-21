import Link from "next/link"
import { ArrowRight, Baby, Bell, CalendarDays, CheckCircle2, Heart, HeartHandshake, Network, Settings2, Sparkles, UserRound } from "lucide-react"
import type { MemberPortalSummary } from "@/lib/member/types"
import { EmptyState, MetricCard, MetricGrid } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value))

export function MemberDashboard({ data }: { data: MemberPortalSummary }) {
  const firstName = data.memberName.trim().split(/\s+/)[0] || data.memberName
  const metrics = [
    { href: "/membro/celulas", label: "Células", value: data.cellCount, icon: Network, tone: "primary" as const },
    { href: "/membro/ministerios", label: "Ministérios", value: data.ministryCount, icon: HeartHandshake, tone: "primary" as const },
    { href: "/membro/kids", label: "Crianças", value: data.childrenCount, icon: Baby, tone: "warning" as const },
  ]

  return (
    <div className="space-y-6 lg:pt-12">
      <section className="overflow-hidden rounded-hero border border-primary/15 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 text-white shadow-[0_24px_70px_-28px_rgba(37,99,235,0.7)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <Badge className="border-white/20 bg-white/12 text-white"><Sparkles className="mr-1 h-3 w-3" />Seu espaço</Badge>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">Olá, {firstName}</h1>
              <p className="mt-2 max-w-lg text-sm text-blue-100 sm:text-base">Tudo que conecta você à {data.churchName}, organizado num só lugar.</p>
            </div>
          </div>
          <div className="hidden h-16 w-16 items-center justify-center rounded-3xl bg-white/12 sm:flex">
            <Sparkles className="h-7 w-7" />
          </div>
        </div>
      </section>

      <MetricGrid columns={3}>
        {metrics.map((metric) => (
          <MetricCard key={metric.href} title={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} variant="compact" href={metric.href} />
        ))}
      </MetricGrid>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Próximo encontro</h2>
          <Link href="/membro/celulas" className="flex items-center gap-1 text-sm font-semibold text-primary">Ver células <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {data.nextMeeting ? (
          <Card className="border-primary/15 py-0 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold">{data.nextMeeting.title}</p>
                <p className="truncate text-sm text-muted-foreground">{data.nextMeeting.cellName}</p>
                <p className="mt-1 text-xs font-medium capitalize text-primary">{dateTime(data.nextMeeting.startsAt)}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState variant="card" icon={CalendarDays} title="Nenhum encontro futuro publicado." />
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/membro/oracao" className="group"><Card className="transition-transform group-active:scale-[0.98]"><CardContent className="flex items-center gap-3 p-4"><Heart className="h-5 w-5 text-primary" /><span className="text-sm font-semibold">Pedido de oração</span></CardContent></Card></Link>
        <Link href="/membro/perfil" className="group"><Card className="transition-transform group-active:scale-[0.98]"><CardContent className="flex items-center gap-3 p-4"><UserRound className="h-5 w-5 text-primary" /><span className="text-sm font-semibold">Meu cadastro</span></CardContent></Card></Link>
        <Link href="/membro/preferencias" className="group"><Card className="transition-transform group-active:scale-[0.98]"><CardContent className="flex items-center gap-3 p-4"><Settings2 className="h-5 w-5 text-primary" /><span className="text-sm font-semibold">Preferências</span></CardContent></Card></Link>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-primary" />Avisos recentes</h2>
        {data.notices.length ? data.notices.map((notice) => (
          <Card key={notice.id} className="py-0">
            <CardContent className="p-4">
              <p className="font-semibold">{notice.title}</p>
              <div className="mt-1 line-clamp-3 text-sm text-muted-foreground [&_a[data-cell-button=true]]:inline-flex [&_a[data-cell-button=true]]:rounded-lg [&_a[data-cell-button=true]]:bg-primary [&_a[data-cell-button=true]]:px-3 [&_a[data-cell-button=true]]:py-2 [&_a[data-cell-button=true]]:font-semibold [&_a[data-cell-button=true]]:text-primary-foreground" dangerouslySetInnerHTML={{ __html: notice.content }} />
            </CardContent>
          </Card>
        )) : (
          <EmptyState variant="card" icon={Bell} title="Nenhum aviso novo para suas células." />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 className="h-5 w-5 text-success" />Check-ins nas células</h2>
          <span className="text-sm font-semibold text-primary">{data.cellCheckinCount} registrados</span>
        </div>
        {data.recentCellCheckins.length ? data.recentCellCheckins.map((checkin) => (
          <Card key={checkin.id} className="border-success/20 py-0">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-success/10 text-success"><CheckCircle2 className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{checkin.cellName}</p>
                <p className="truncate text-sm text-muted-foreground">{checkin.meetingTitle}</p>
                <p className="mt-1 text-xs font-medium capitalize text-success">Check-in realizado · {dateTime(checkin.checkedInAt)}</p>
              </div>
            </CardContent>
          </Card>
        )) : (
          <EmptyState variant="card" icon={CheckCircle2} title="Seus próximos check-ins aparecerão aqui depois da primeira presença." />
        )}
      </section>
    </div>
  )
}
