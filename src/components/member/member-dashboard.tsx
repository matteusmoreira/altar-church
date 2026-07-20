import Link from "next/link"
import { ArrowRight, Baby, Bell, CalendarDays, HeartHandshake, Network, Sparkles } from "lucide-react"
import type { MemberPortalSummary } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value))

export function MemberDashboard({ data }: { data: MemberPortalSummary }) {
  const firstName = data.memberName.trim().split(/\s+/)[0] || data.memberName
  const metrics = [
    { href: "/membro/celulas", label: "Células", value: data.cellCount, icon: Network, color: "bg-blue-500/12 text-blue-600 dark:text-blue-300" },
    { href: "/membro/ministerios", label: "Ministérios", value: data.ministryCount, icon: HeartHandshake, color: "bg-violet-500/12 text-violet-600 dark:text-violet-300" },
    { href: "/membro/kids", label: "Crianças", value: data.childrenCount, icon: Baby, color: "bg-amber-500/14 text-amber-700 dark:text-amber-300" },
  ]

  return (
    <div className="space-y-6 lg:pt-12">
      <section className="overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 text-white shadow-[0_24px_70px_-28px_rgba(37,99,235,0.7)] sm:p-8">
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

      <section className="grid grid-cols-3 gap-3">
        {metrics.map((metric) => (
          <Link key={metric.href} href={metric.href} className="group">
            <Card className="h-full rounded-2xl border-border/60 bg-card/85 py-0 shadow-sm transition-transform group-active:scale-[0.98]">
              <CardContent className="flex min-h-28 flex-col justify-between p-3 sm:p-5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${metric.color}`}>
                  <metric.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">{metric.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Próximo encontro</h2>
          <Link href="/membro/celulas" className="flex items-center gap-1 text-sm font-semibold text-primary">Ver células <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {data.nextMeeting ? (
          <Card className="rounded-3xl border-primary/15 bg-card/85 py-0 shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
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
          <Card className="rounded-3xl border-dashed py-0">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
              <CalendarDays className="h-5 w-5" /> Nenhum encontro futuro publicado.
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Bell className="h-5 w-5 text-primary" />Avisos recentes</h2>
        {data.notices.length ? data.notices.map((notice) => (
          <Card key={notice.id} className="rounded-2xl bg-card/85 py-0">
            <CardContent className="p-4">
              <p className="font-semibold">{notice.title}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{notice.content}</p>
            </CardContent>
          </Card>
        )) : (
          <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Nenhum aviso novo para suas células.</p>
        )}
      </section>
    </div>
  )
}
