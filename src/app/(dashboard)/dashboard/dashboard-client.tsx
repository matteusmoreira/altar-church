"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Church,
  ClipboardList,
  Compass,
  DollarSign,
  HandHeart,
  Heart,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard, MetricGrid, PageHeader, ShortcutCard } from "@/components/shared"
import type { GroupDashboardData } from "@/lib/groups/types"
import type { PeopleDashboardData } from "@/lib/people/types"

interface ChartPoint {
  label: string
  value: number
}

export interface DashboardClientData {
  people: PeopleDashboardData
  groups: GroupDashboardData
  content: {
    categories: number
    posts: number
    publishedPosts: number
    activeBanners: number
  }
  charts: {
    people: ChartPoint[]
    groups: ChartPoint[]
  }
}

interface ShortcutItem {
  href: string
  icon: React.ElementType
  title: string
  description: string
  target?: string
  badge?: string
}

const shortcuts: ShortcutItem[] = [
  { href: "/pessoas", icon: Users, title: "Pessoas", description: "Gerencie membros, visitantes e cadastros" },
  { href: "/celulas", icon: UsersRound, title: "Células", description: "Participantes, encontros, estudos e check-in" },
  { href: "/conteudo", icon: BookOpen, title: "Conteúdo", description: "Devocionais, notícias e publicações" },
  { href: "/visitantes", icon: UserPlus, title: "Visitantes", description: "Acompanhamento de visitantes reais" },
  { href: "/ministerios", icon: Church, title: "Ministérios", description: "Gerencie ministérios persistidos" },
  { href: "/eventos", icon: CalendarDays, title: "Eventos", description: "Agenda e inscrições persistidas" },
  { href: "/financeiro", icon: DollarSign, title: "Financeiro", description: "Receitas, despesas e comprovantes" },
  { href: "/doacao", icon: HandHeart, title: "Doações", description: "Doações manuais e recorrências" },
  { href: "/comunicacao", icon: Bell, title: "Comunicação", description: "Notificações e avisos persistidos" },
  { href: "/intercessao", icon: Heart, title: "Intercessão", description: "Pedidos de oração persistidos" },
  { href: "/relatorios", icon: BarChart3, title: "Relatórios", description: "Relatórios reais por módulo" },
]

export function DashboardClient({
  data,
  churchSlug,
}: {
  data: DashboardClientData
  churchSlug?: string | null
}) {
  const activeRate = data.people.total > 0 ? Math.round((data.people.active / data.people.total) * 100) : 0

  const allShortcuts = [
    ...(churchSlug
      ? [
          {
            href: `/church/${churchSlug}/celulas`,
            icon: Compass,
            title: "Mapa 3D Células",
            description: "Visualização pública inovadora das células no mapa 3D da cidade",
            target: "_blank",
            badge: "Novo 3D",
          },
        ]
      : []),
    ...shortcuts,
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Visão real da operação já persistida." />

      <MetricGrid columns={3}>
        <MetricCard
          title="Pessoas Ativas"
          value={data.people.active}
          icon={Users}
          trend={activeRate > 0 ? "up" : undefined}
          trendValue={`${activeRate}% do total`}
          tone="primary"
        />
        <MetricCard
          title="Visitantes"
          value={data.people.visitors}
          icon={UserPlus}
          tone="info"
        />
        <MetricCard
          title="Grupos Ativos"
          value={data.groups.active}
          icon={UsersRound}
          trendValue={`${data.groups.members} participantes`}
          tone="success"
        />
        <MetricCard
          title="Conteúdos Publicados"
          value={data.content.publishedPosts}
          icon={BookOpen}
          trendValue={`${data.content.posts} posts totais`}
          tone="primary"
        />
        <MetricCard
          title="Banners Ativos"
          value={data.content.activeBanners}
          icon={ClipboardList}
          tone="warning"
        />
        <MetricCard
          title="Possíveis Duplicidades"
          value={data.people.possibleDuplicates}
          icon={Heart}
          tone="destructive"
        />
      </MetricGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Pessoas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.charts.people}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.02 260)",
                    border: "1px solid oklch(1 0 0 / 10%)",
                    borderRadius: "8px",
                    color: "oklch(0.93 0.01 260)",
                  }}
                />
                <Bar dataKey="value" fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-4 w-4 text-success" />
              Grupos e Células
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.charts.groups}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "oklch(0.17 0.02 260)",
                    border: "1px solid oklch(1 0 0 / 10%)",
                    borderRadius: "8px",
                    color: "oklch(0.93 0.01 260)",
                  }}
                />
                <Bar dataKey="value" fill="oklch(0.7 0.17 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Atalhos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {allShortcuts.map((shortcut) => (
            <ShortcutCard
              key={shortcut.href}
              href={shortcut.href}
              icon={shortcut.icon}
              title={shortcut.title}
              description={shortcut.description}
              target={shortcut.target}
              badge={shortcut.badge}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
