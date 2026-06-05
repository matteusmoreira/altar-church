"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Church,
  Download,
  FileText,
  Gift,
  Heart,
  Target,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricCard } from "@/components/shared"
import type { GroupDashboardData } from "@/lib/groups/types"
import type { PeopleDashboardData } from "@/lib/people/types"

interface ChartPoint {
  label: string
  value: number
}

interface BirthdayMember {
  id: string
  fullName: string
  birthDate: string
  phone: string
}

interface CellSummary {
  id: string
  name: string
  leaderName: string | null
  meetingDay: string
  memberCount: number
  maxCapacity: number
  isActive: boolean
}

interface MeetingSummary {
  id: string
  title: string
  groupName: string
  startsAt: string
  reportStatus: "scheduled" | "reported" | "cancelled"
  presentCount: number
  visitorCount: number
}

export interface ReportsClientData {
  people: PeopleDashboardData
  visitors: {
    total: number
    converted: number
    inFollowUp: number
  }
  birthdayMembers: BirthdayMember[]
  groups: GroupDashboardData
  cells: CellSummary[]
  meetings: MeetingSummary[]
  meetingSummary: {
    total: number
    reported: number
    totalPresent: number
    totalVisitors: number
    averagePresent: number
  }
  content: {
    categories: number
    posts: number
    publishedPosts: number
    draftPosts: number
    activeBanners: number
    postTypes: ChartPoint[]
  }
}

const pieColors = [
  "oklch(0.65 0.18 250)",
  "oklch(0.7 0.17 155)",
  "oklch(0.7 0.15 230)",
  "oklch(0.8 0.15 85)",
]

const tooltipStyle = {
  backgroundColor: "oklch(0.17 0.02 260)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: "8px",
  color: "oklch(0.93 0.01 260)",
}

function percent(value: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((value / total) * 100)}%`
}

function formatBirthDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date(`${value}T00:00:00`))
}

function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value))
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function ReportCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function ReportsClient({ data }: { data: ReportsClientData }) {
  const activeRate = percent(data.people.active, data.people.total)
  const conversionRate = percent(data.visitors.converted, data.visitors.total)

  const peopleChart = [
    { label: "Ativas", value: data.people.active },
    { label: "Visitantes", value: data.people.visitors },
    { label: "Batizadas", value: data.people.baptized },
    { label: "E-mails validados", value: data.people.emailValidated },
  ].filter((item) => item.value > 0)

  const groupChart = [
    { label: "Ativos", value: data.groups.active },
    { label: "Inativos", value: data.groups.inactive },
    { label: "Participantes", value: data.groups.members },
    { label: "Vagas livres", value: data.groups.openCapacity },
  ].filter((item) => item.value > 0)

  const activeCells = data.cells.filter((cell) => cell.isActive)
  const lowOccupancyCells = activeCells.filter((cell) => cell.maxCapacity > 0 && cell.memberCount / cell.maxCapacity < 0.5)
  const cellChart = activeCells
    .map((cell) => ({ label: cell.name, value: cell.memberCount }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const attendanceChart = data.meetings
    .filter((meeting) => meeting.reportStatus === "reported")
    .slice(0, 8)
    .reverse()
    .map((meeting) => ({
      label: `${formatMeetingDate(meeting.startsAt)} ${meeting.groupName}`,
      value: meeting.presentCount,
    }))

  const contentChart = data.content.postTypes.filter((item) => item.value > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Relatórios</h1>
          <p className="text-muted-foreground">Indicadores reais dos módulos já persistidos.</p>
        </div>
        <a href="/api/reports/export" className={buttonVariants({ variant: "outline" })}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Pessoas"
          value={data.people.total}
          icon={Users}
          trend={data.people.active > 0 ? "up" : undefined}
          trendValue={`${activeRate} ativas`}
          color="gradient-primary"
        />
        <MetricCard
          title="Visitantes"
          value={data.visitors.total}
          icon={UserPlus}
          trend={data.visitors.converted > 0 ? "up" : undefined}
          trendValue={`${conversionRate} conversão`}
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
          trendValue={`${data.content.posts} posts`}
          color="bg-warning"
        />
      </div>

      <Tabs defaultValue="pessoas">
        <TabsList>
          <TabsTrigger value="pessoas">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Pessoas</span>
          </TabsTrigger>
          <TabsTrigger value="grupos">
            <Church className="h-4 w-4" />
            <span className="hidden sm:inline">Grupos</span>
          </TabsTrigger>
          <TabsTrigger value="conteudo">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Conteúdo</span>
          </TabsTrigger>
          <TabsTrigger value="geral">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Geral</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pessoas" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Ativas" value={data.people.active} icon={Heart} trendValue={activeRate} color="bg-success" />
            <MetricCard title="Batizadas" value={data.people.baptized} icon={Target} color="bg-primary" />
            <MetricCard title="Em acompanhamento" value={data.visitors.inFollowUp} icon={UserPlus} color="bg-info" />
            <MetricCard title="Duplicidades" value={data.people.possibleDuplicates} icon={AlertTriangle} color="bg-destructive" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Distribuição de Pessoas" icon={Users}>
              {peopleChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={peopleChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="Sem dados de pessoas para exibir" />
              )}
            </ReportCard>

            <ReportCard title="Aniversariantes do Mês" icon={Gift}>
              {data.birthdayMembers.length > 0 ? (
                <div className="space-y-3">
                  {data.birthdayMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 rounded-lg border border-border/30 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                        <Gift className="h-5 w-5 text-warning" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{member.fullName}</p>
                        <p className="text-xs text-muted-foreground">{formatBirthDate(member.birthDate)}</p>
                      </div>
                      <Badge variant="secondary">{member.phone}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyChart label="Sem aniversariantes neste mês" />
              )}
            </ReportCard>
          </div>
        </TabsContent>

        <TabsContent value="grupos" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Grupos" value={data.groups.total} icon={UsersRound} color="gradient-primary" />
            <MetricCard title="Células Ativas" value={activeCells.length} icon={Church} color="bg-success" />
            <MetricCard title="Presença Média" value={data.meetingSummary.averagePresent} icon={Activity} color="bg-info" />
            <MetricCard title="Reuniões Reportadas" value={data.meetingSummary.reported} icon={CalendarDays} color="bg-warning" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Capacidade dos Grupos" icon={UsersRound}>
              {groupChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={groupChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="oklch(0.7 0.17 155)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="Sem dados de grupos para exibir" />
              )}
            </ReportCard>

            <ReportCard title="Células por Participantes" icon={Church}>
              {cellChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cellChart} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis type="number" allowDecimals={false} stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis type="category" dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={11} width={120} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="oklch(0.7 0.15 230)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="Sem células ativas para exibir" />
              )}
            </ReportCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Frequência Reportada" icon={Activity}>
              {attendanceChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={attendanceChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={10} angle={-20} textAnchor="end" height={70} />
                    <YAxis allowDecimals={false} stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="oklch(0.65 0.18 250)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label="Sem frequência reportada para exibir" />
              )}
            </ReportCard>

            <ReportCard title="Células com Baixa Ocupação" icon={AlertTriangle}>
              {lowOccupancyCells.length > 0 ? (
                <div className="space-y-3">
                  {lowOccupancyCells.map((cell) => {
                    const occupancy = Math.round((cell.memberCount / Math.max(cell.maxCapacity, 1)) * 100)
                    return (
                      <div key={cell.id} className="flex items-center gap-4 rounded-lg border border-border/30 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{cell.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {cell.leaderName ?? "Sem líder"} · {cell.meetingDay}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="destructive">{occupancy}%</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {cell.memberCount}/{cell.maxCapacity}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <EmptyChart label="Sem células com baixa ocupação" />
              )}
            </ReportCard>
          </div>
        </TabsContent>

        <TabsContent value="conteudo" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Categorias" value={data.content.categories} icon={FileText} color="gradient-primary" />
            <MetricCard title="Posts" value={data.content.posts} icon={BookOpen} color="bg-info" />
            <MetricCard title="Rascunhos" value={data.content.draftPosts} icon={FileText} color="bg-warning" />
            <MetricCard title="Banners Ativos" value={data.content.activeBanners} icon={BarChart3} color="bg-success" />
          </div>

          <ReportCard title="Publicações por Tipo" icon={BookOpen}>
            {contentChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={270}>
                <PieChart>
                  <Pie data={contentChart} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                    {contentChart.map((_, index) => (
                      <Cell key={`content-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} posts`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label="Sem publicações para exibir" />
            )}
            {contentChart.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                {contentChart.map((entry, index) => (
                  <div key={entry.label} className="flex items-center gap-2 text-xs">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} />
                    <span className="text-muted-foreground">{entry.label}</span>
                  </div>
                ))}
              </div>
            )}
          </ReportCard>
        </TabsContent>

        <TabsContent value="geral" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportCard title="Resumo de Pessoas" icon={Users}>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pessoas ativas</span>
                  <span className="font-semibold text-success">{data.people.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Visitantes convertidos</span>
                  <span className="font-semibold">{data.visitors.converted}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Taxa de conversão</span>
                  <span className="font-semibold">{conversionRate}</span>
                </div>
              </div>
            </ReportCard>

            <ReportCard title="Resumo Operacional" icon={BarChart3}>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Participantes em grupos</span>
                  <span className="font-semibold">{data.groups.members}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Presentes reportados</span>
                  <span className="font-semibold">{data.meetingSummary.totalPresent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Visitantes em reuniões</span>
                  <span className="font-semibold">{data.meetingSummary.totalVisitors}</span>
                </div>
              </div>
            </ReportCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
