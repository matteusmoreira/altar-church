import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Baby,
  Bell,
  CalendarDays,
  Heart,
  HeartHandshake,
  Network,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react"
import type { MemberPortalSummary } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))

export function MemberDashboard({ data }: { data: MemberPortalSummary }) {
  const firstName = data.memberName.trim().split(/\s+/)[0] || data.memberName
  const metrics = [
    {
      href: "/membro/celulas",
      label: "Células",
      value: data.cellCount,
      icon: Network,
      iconBg: "bg-blue-500/10 ring-1 ring-blue-500/20",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      href: "/membro/ministerios",
      label: "Ministérios",
      value: data.ministryCount,
      icon: HeartHandshake,
      iconBg: "bg-indigo-500/10 ring-1 ring-indigo-500/20",
      iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
      href: "/membro/kids",
      label: "Crianças",
      value: data.childrenCount,
      icon: Baby,
      iconBg: "bg-amber-500/10 ring-1 ring-amber-500/20",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ]

  return (
    <div className="space-y-5 sm:space-y-6 lg:pt-12">
      {/* Hero Card */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-5 text-white shadow-lg sm:p-7">
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge className="border-white/20 bg-white/15 text-white backdrop-blur-md">
              <Sparkles className="mr-1 h-3 w-3" />
              Seu espaço
            </Badge>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Olá, {firstName}</h1>
              <p className="mt-1 max-w-lg text-xs text-blue-100/90 sm:text-sm">
                Tudo que conecta você à {data.churchName}, organizado num só lugar.
              </p>
            </div>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md sm:h-14 sm:w-14">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
        </div>
      </section>

      {/* Cards de Métricas Compactos Lado a Lado (Mobile First) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {metrics.map((metric) => (
          <Link
            key={metric.href}
            href={metric.href}
            aria-label={`${metric.label}: ${metric.value}`}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/85 p-3 sm:p-4 backdrop-blur-md shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.97]"
          >
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  "flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
                  metric.iconBg,
                )}
              >
                <metric.icon className={cn("h-4 w-4 sm:h-4.5 sm:w-4.5", metric.iconColor)} />
              </div>
              <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground/30 transition-colors group-hover:text-primary" />
            </div>
            <div className="mt-2.5 sm:mt-3">
              <p className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {metric.value}
              </p>
              <p className="mt-0.5 truncate text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {metric.label}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Próximo Encontro */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Próximo encontro
          </h2>
          <Link
            href="/membro/celulas"
            className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-primary hover:underline"
          >
            Ver células <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.nextMeeting ? (
          <Card className="overflow-hidden border-primary/20 bg-card/85 backdrop-blur-sm py-0 shadow-xs hover:border-primary/40 transition-all">
            <CardContent className="flex items-center gap-3.5 p-4 sm:p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-sm sm:text-base">{data.nextMeeting.title}</p>
                <p className="truncate text-xs sm:text-sm text-muted-foreground">{data.nextMeeting.cellName}</p>
                <p className="mt-1 text-xs font-semibold capitalize text-primary flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  {dateTime(data.nextMeeting.startsAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/60 bg-card/60 py-0 shadow-none">
            <CardContent className="flex items-center gap-3.5 p-4 text-muted-foreground">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                <CalendarDays className="h-5 w-5 opacity-70" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-foreground">Nenhum encontro futuro publicado.</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">Fique atento aos avisos da sua célula.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {data.scaleNotices.length > 0 && (
        <section className="space-y-2.5" aria-label="Avisos de escala">
          <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
            <Bell className="h-4 w-4 text-primary" />
            Você foi escalado
          </h2>
          {data.scaleNotices.map((notice) => (
            <Card key={notice.id} className="border-primary/20 bg-primary/5 py-0">
              <CardContent className="space-y-1.5 p-4">
                <p className="font-semibold">{notice.eventTitle}</p>
                <p className="text-sm">{notice.departmentName} · Sua função: {notice.roleName}</p>
                <p className="text-sm text-muted-foreground">{dateTime(notice.startsAt)}</p>
                {notice.instructions && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{notice.instructions}</p>}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Ações Rápidas Compactas Lado a Lado */}
      <section className="space-y-2">
        <div className="grid grid-cols-3 gap-2 sm:gap-3.5">
          <Link
            href="/membro/oracao"
            aria-label="Fazer pedido de oração"
            className="group flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/85 p-3 text-center backdrop-blur-sm shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card active:scale-[0.97]"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20 transition-transform group-hover:scale-110">
              <Heart className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="mt-2 text-[11px] sm:text-xs font-semibold text-foreground truncate w-full">
              Oração
            </span>
          </Link>
          <Link
            href="/membro/perfil"
            aria-label="Visualizar meu cadastro"
            className="group flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/85 p-3 text-center backdrop-blur-sm shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card active:scale-[0.97]"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform group-hover:scale-110">
              <UserRound className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="mt-2 text-[11px] sm:text-xs font-semibold text-foreground truncate w-full">
              Meu cadastro
            </span>
          </Link>
          <Link
            href="/membro/preferencias"
            aria-label="Configurar preferências de comunicação"
            className="group flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/85 p-3 text-center backdrop-blur-sm shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card active:scale-[0.97]"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/20 transition-transform group-hover:scale-110">
              <Settings2 className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <span className="mt-2 text-[11px] sm:text-xs font-semibold text-foreground truncate w-full">
              Preferências
            </span>
          </Link>
        </div>
      </section>

      {/* Avisos Recentes */}
      <section className="space-y-2.5">
        <h2 className="flex items-center gap-2 text-sm sm:text-base font-bold text-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Avisos recentes
        </h2>
        {data.notices.length ? (
          <div className="space-y-2.5">
            {data.notices.map((notice) => (
              <Card key={notice.id} className="border-border/60 bg-card/85 py-0 shadow-xs">
                <CardContent className="p-4">
                  <p className="font-semibold text-sm sm:text-base">{notice.title}</p>
                  <div
                    className="mt-1.5 line-clamp-3 text-xs sm:text-sm text-muted-foreground [&_a[data-cell-button=true]]:inline-flex [&_a[data-cell-button=true]]:rounded-lg [&_a[data-cell-button=true]]:bg-primary [&_a[data-cell-button=true]]:px-3 [&_a[data-cell-button=true]]:py-1.5 [&_a[data-cell-button=true]]:text-xs [&_a[data-cell-button=true]]:font-semibold [&_a[data-cell-button=true]]:text-primary-foreground"
                    dangerouslySetInnerHTML={{ __html: notice.content }}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border/60 bg-card/60 py-0 shadow-none">
            <CardContent className="flex items-center gap-3.5 p-4 text-muted-foreground">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
                <Bell className="h-5 w-5 opacity-70" />
              </div>
              <p className="text-xs sm:text-sm font-medium text-foreground">Nenhum aviso novo para suas células.</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
