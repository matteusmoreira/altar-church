"use client"

import { useState } from "react"
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
  CheckCircle2,
  Church,
  Circle,
  ClipboardList,
  DollarSign,
  HandHeart,
  Heart,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricCard, ShortcutCard } from "@/components/shared"
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

const checklistItems = [
  { id: "church", label: "Cadastrar igreja" },
  { id: "people", label: "Cadastrar pessoas" },
  { id: "content", label: "Criar conteúdo" },
  { id: "groups", label: "Criar células" },
  { id: "users", label: "Convidar usuários" },
  { id: "production", label: "Validar gate de produção" },
]

const shortcuts = [
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

export function DashboardClient({ data }: { data: DashboardClientData }) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const completedCount = Object.values(checkedItems).filter(Boolean).length
  const activeRate = data.people.total > 0 ? Math.round((data.people.active / data.people.total) * 100) : 0

  const toggleCheck = (id: string) => {
    setCheckedItems((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">Visão real da operação já persistida.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Pessoas Ativas"
          value={data.people.active}
          icon={Users}
          trend={activeRate > 0 ? "up" : undefined}
          trendValue={`${activeRate}% do total`}
          color="gradient-primary"
        />
        <MetricCard
          title="Visitantes"
          value={data.people.visitors}
          icon={UserPlus}
          color="bg-info"
        />
        <MetricCard
          title="Grupos Ativos"
          value={data.groups.active}
          icon={UsersRound}
          trendValue={`${data.groups.members} participantes`}
          color="bg-success"
        />
        <MetricCard
          title="Conteúdos Publicados"
          value={data.content.publishedPosts}
          icon={BookOpen}
          trendValue={`${data.content.posts} posts totais`}
          color="bg-primary"
        />
        <MetricCard
          title="Banners Ativos"
          value={data.content.activeBanners}
          icon={ClipboardList}
          color="bg-warning"
        />
        <MetricCard
          title="Possíveis Duplicidades"
          value={data.people.possibleDuplicates}
          icon={Heart}
          color="bg-destructive"
        />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Checklist Inicial
            </span>
            <Badge variant="secondary">
              {completedCount}/{checklistItems.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {checklistItems.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleCheck(item.id)}
                className="flex items-center gap-3 rounded-lg border border-border/30 p-3 text-left transition-colors hover:bg-muted/30"
              >
                {checkedItems[item.id] ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className={`text-sm ${checkedItems[item.id] ? "text-muted-foreground line-through" : "font-medium"}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

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
          {shortcuts.map((shortcut) => (
            <ShortcutCard
              key={shortcut.href}
              href={shortcut.href}
              icon={shortcut.icon}
              title={shortcut.title}
              description={shortcut.description}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
