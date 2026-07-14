"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart3,
  Users,
  UserPlus,
  CalendarDays,
  TrendingUp,
  DollarSign,
  Heart,
  MessageSquare,
  Activity,
  Church,
  Target,
  AlertTriangle,
  Gift,
  Smartphone,
  CreditCard,
  Banknote,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { format, parseISO, getMonth } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  mockMembers,
  mockVisitors,
  mockGroups,
  mockEvents,
  mockTransactions,
  mockAttendance,
  mockCells,
  mockDashboardMetrics,
} from "@/lib/mock/data"

const PIE_COLORS = [
  "oklch(0.65 0.18 250)",
  "oklch(0.7 0.17 155)",
  "oklch(0.7 0.15 230)",
  "oklch(0.8 0.15 85)",
  "oklch(0.65 0.15 300)",
]

const TOOLTIP_STYLE = {
  backgroundColor: "oklch(0.17 0.02 260)",
  border: "1px solid oklch(1 0 0 / 10%)",
  borderRadius: "8px",
  color: "oklch(0.93 0.01 260)",
}

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência",
  pix: "PIX",
}

const methodIcons: Record<string, React.ElementType> = {
  cash: Banknote,
  card: CreditCard,
  transfer: Building2,
  pix: Smartphone,
}

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  color,
}: {
  title: string
  value: string
  icon: React.ElementType
  trend?: "up" | "down"
  trendValue?: string
  color: string
}) {
  return (
    <Card className="glass overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && trendValue && (
              <div className="flex items-center gap-1">
                {trend === "up" ? (
                  <TrendingUp className="h-3 w-3 text-success" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs font-medium ${trend === "up" ? "text-success" : "text-destructive"}`}>
                  {trendValue}
                </span>
              </div>
            )}
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function ReportsPage() {
  const [financialPeriod, setFinancialPeriod] = useState<string>("all")

  const currentMonth = getMonth(new Date())

  const birthdayMembers = useMemo(
    () =>
      mockMembers.filter((m) => {
        if (!m.birthDate) return false
        const birthMonth = getMonth(parseISO(m.birthDate))
        return birthMonth === currentMonth
      }),
    [currentMonth]
  )

  const activeMembers = mockMembers.filter((m) => m.status === "active").length
  const inactiveMembers = mockMembers.filter((m) => m.status === "inactive").length
  const visitorMembers = mockMembers.filter((m) => m.status === "visitor").length

  const statusDistribution = [
    { name: "Ativos", value: activeMembers },
    { name: "Inativos", value: inactiveMembers },
    { name: "Visitantes", value: visitorMembers },
  ].filter((d) => d.value > 0)

  const newVisitorsCount = mockVisitors.filter((v) => v.status === "new" || v.status === "contacted" || v.status === "following").length
  const convertedCount = mockVisitors.filter((v) => v.status === "converted").length

  const visitorsVsConverted = [
    { name: "Novos Visitantes", count: newVisitorsCount },
    { name: "Convertidos", count: convertedCount },
  ]

  const activeCells = mockCells.filter((c) => c.status === "active")

  const cellActivityData = activeCells
    .map((c) => ({
      name: c.name.replace("Célula ", ""),
      members: c.memberCount,
    }))
    .sort((a, b) => b.members - a.members)

  const lowAttendanceCells = activeCells.filter((c) => {
    const occupancy = (c.memberCount / c.maxCapacity) * 100
    return occupancy < 50
  })

  const totalIncome = mockTransactions.reduce((sum, t) => sum + t.amount, 0)

  const incomeByType = [
    { name: "Dízimos", value: mockTransactions.filter((t) => t.type === "tithe").reduce((s, t) => s + t.amount, 0) },
    { name: "Ofertas", value: mockTransactions.filter((t) => t.type === "offering").reduce((s, t) => s + t.amount, 0) },
    { name: "Doações", value: mockTransactions.filter((t) => t.type === "donation").reduce((s, t) => s + t.amount, 0) },
    { name: "Missões", value: mockTransactions.filter((t) => t.type === "mission").reduce((s, t) => s + t.amount, 0) },
    { name: "Construção", value: mockTransactions.filter((t) => t.type === "building").reduce((s, t) => s + t.amount, 0) },
  ].filter((d) => d.value > 0)

  const incomeByMethod = (["pix", "transfer", "cash", "card"] as const).map((method) => ({
    name: methodLabels[method],
    value: mockTransactions.filter((t) => t.method === method).reduce((s, t) => s + t.amount, 0),
  })).filter((d) => d.value > 0)

  const eventAttendanceSummary = mockEvents
    .filter((e) => e.attendance !== undefined)
    .map((e) => ({
      name: e.title.length > 20 ? e.title.substring(0, 20) + "..." : e.title,
      attendance: e.attendance!,
    }))

  const totalEventAttendance = mockEvents.reduce((sum, e) => sum + (e.attendance || 0), 0)
  const avgEventAttendance = mockEvents.filter((e) => e.attendance).length > 0
    ? Math.round(totalEventAttendance / mockEvents.filter((e) => e.attendance).length)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Relatórios</h1>
        <p className="text-muted-foreground">Análises e métricas da sua igreja</p>
      </div>

      <Tabs defaultValue="membros">
        <TabsList>
          <TabsTrigger value="membros">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Membros</span>
          </TabsTrigger>
          <TabsTrigger value="frequencia">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Frequência</span>
          </TabsTrigger>
          <TabsTrigger value="financeiro">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Financeiro</span>
          </TabsTrigger>
          <TabsTrigger value="geral">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Geral</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="membros" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total de Membros"
              value={mockDashboardMetrics.totalMembers.toString()}
              icon={Users}
              trend="up"
              trendValue="+4 este mês"
              color="gradient-primary"
            />
            <StatCard
              title="Membros Ativos"
              value={activeMembers.toString()}
              icon={Heart}
              trend="up"
              trendValue={`${Math.round((activeMembers / mockMembers.length) * 100)}% ativos`}
              color="bg-success"
            />
            <StatCard
              title="Visitantes"
              value={mockVisitors.length.toString()}
              icon={UserPlus}
              color="bg-info"
            />
            <StatCard
              title="Convertidos"
              value={convertedCount.toString()}
              icon={Target}
              trend="up"
              trendValue={`${Math.round((convertedCount / Math.max(mockVisitors.length, 1)) * 100)}% conversão`}
              color="bg-warning"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Crescimento de Membros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={mockDashboardMetrics.memberGrowth}>
                    <defs>
                      <linearGradient id="memberGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="month" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="oklch(0.65 0.18 250)"
                      strokeWidth={2}
                      fill="url(#memberGrowthGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-4 w-4 text-success" />
                  Visitantes vs Convertidos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={visitorsVsConverted}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="name" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="oklch(0.7 0.17 155)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="glass lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  Distribuição por Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusDistribution.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`${value} membros`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap justify-center gap-4">
                  {statusDistribution.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gift className="h-4 w-4 text-warning" />
                  Aniversariantes do Mês
                  <Badge variant="secondary">{birthdayMembers.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {birthdayMembers.length > 0 ? (
                  <div className="space-y-3">
                    {birthdayMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-4 rounded-lg border border-border/30 p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                          <Gift className="h-5 w-5 text-warning" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(member.birthDate), "dd 'de' MMMM", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge className="bg-warning/10 text-warning border-warning/20">
                          {member.phone}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Gift className="h-12 w-12 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum aniversariante este mês</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frequencia" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Média de Presença"
              value={avgEventAttendance.toString()}
              icon={Activity}
              color="gradient-primary"
            />
            <StatCard
              title="Total de Registros"
              value={mockAttendance.length.toString()}
              icon={CalendarDays}
              color="bg-info"
            />
            <StatCard
              title="Células Ativas"
              value={activeCells.length.toString()}
              icon={Church}
              color="bg-success"
            />
            <StatCard
              title="Eventos com Presença"
              value={mockEvents.filter((e) => e.attendance).length.toString()}
              icon={BarChart3}
              color="bg-warning"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Tendência de Frequência
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={mockDashboardMetrics.attendanceTrend}>
                    <defs>
                      <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.65 0.18 250)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="month" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Area
                      type="monotone"
                      dataKey="attendance"
                      stroke="oklch(0.65 0.18 250)"
                      strokeWidth={2}
                      fill="url(#attendanceGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Church className="h-4 w-4 text-success" />
                  Células Mais Ativas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cellActivityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis type="number" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="oklch(0.6 0.02 260)"
                      fontSize={11}
                      width={120}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="members" fill="oklch(0.7 0.17 155)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Células com Baixa Ocupação
                  <Badge variant="destructive">{lowAttendanceCells.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lowAttendanceCells.length > 0 ? (
                  <div className="space-y-3">
                    {lowAttendanceCells.map((cell) => {
                      const occupancy = Math.round((cell.memberCount / cell.maxCapacity) * 100)
                      return (
                        <div
                          key={cell.id}
                          className="flex items-center gap-4 rounded-lg border border-border/30 p-3"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{cell.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Líder: {cell.leaderName} • {cell.meetingDay}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="destructive">{occupancy}%</Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {cell.memberCount}/{cell.maxCapacity}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Church className="h-12 w-12 text-success/50 mb-3" />
                    <p className="text-sm text-muted-foreground">Todas as células estão com boa ocupação</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Presença por Evento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={eventAttendanceSummary}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="name" stroke="oklch(0.6 0.02 260)" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="attendance" fill="oklch(0.7 0.15 230)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="financeiro" className="mt-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 flex-1">
              <StatCard
                title="Receita Total"
                value={`R$ ${totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                icon={DollarSign}
                trend="up"
                trendValue="+8.5%"
                color="gradient-primary"
              />
              <StatCard
                title="Ticket Médio"
                value={`R$ ${(totalIncome / mockTransactions.length).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                icon={TrendingUp}
                color="bg-success"
              />
              <StatCard
                title="Transações"
                value={mockTransactions.length.toString()}
                icon={BarChart3}
                color="bg-info"
              />
              <StatCard
                title="Maior Contribuição"
                value={`R$ ${Math.max(...mockTransactions.map((t) => t.amount)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                icon={ArrowUpRight}
                color="bg-warning"
              />
            </div>
          </div>

          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4 text-success" />
                  Tendência de Receitas
                </CardTitle>
                <Select value={financialPeriod} onValueChange={(v) => v && setFinancialPeriod(v)}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo o período</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="3m">Últimos 3 meses</SelectItem>
                    <SelectItem value="6m">Últimos 6 meses</SelectItem>
                    <SelectItem value="year">Este ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={mockDashboardMetrics.incomeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                  <XAxis dataKey="month" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                  <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`R$ ${Number(value).toLocaleString("pt-BR")}`, "Receita"]}
                  />
                  <Bar dataKey="amount" fill="oklch(0.7 0.17 155)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Receita por Tipo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={incomeByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {incomeByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap justify-center gap-4">
                  {incomeByType.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4 text-info" />
                  Receita por Método
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={incomeByMethod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 30%)" />
                    <XAxis dataKey="name" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [`R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, ""]}
                    />
                    <Bar dataKey="value" fill="oklch(0.7 0.15 230)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {incomeByMethod.map((entry) => {
                    const methodKey = Object.entries(methodLabels).find(([, v]) => v === entry.name)?.[0]
                    const Icon = methodKey ? methodIcons[methodKey] : DollarSign
                    return (
                      <div key={entry.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                          {entry.name}
                        </span>
                        <span className="font-medium">
                          R$ {entry.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="geral" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total de Membros"
              value={mockDashboardMetrics.totalMembers.toString()}
              icon={Users}
              trend="up"
              trendValue="+4 este mês"
              color="gradient-primary"
            />
            <StatCard
              title="Total de Visitantes"
              value={mockVisitors.length.toString()}
              icon={UserPlus}
              color="bg-info"
            />
            <StatCard
              title="Total de Células"
              value={mockCells.length.toString()}
              icon={Church}
              color="bg-success"
            />
            <StatCard
              title="Total de Eventos"
              value={mockEvents.length.toString()}
              icon={CalendarDays}
              color="bg-warning"
            />
            <StatCard
              title="Receita Total"
              value={`R$ ${totalIncome.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
              icon={DollarSign}
              trend="up"
              trendValue="+8.5%"
              color="gradient-primary"
            />
            <StatCard
              title="Mensagens Enviadas"
              value="1.247"
              icon={MessageSquare}
              color="bg-chart-4"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Resumo Rápido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Membros Ativos</span>
                    <span className="font-bold text-success">{activeMembers}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Membros Inativos</span>
                    <span className="font-bold text-destructive">{inactiveMembers}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Taxa de Atividade</span>
                    <span className="font-bold">{Math.round((activeMembers / mockMembers.length) * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Visitantes Convertidos</span>
                    <span className="font-bold text-success">{convertedCount}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Taxa de Conversão</span>
                    <span className="font-bold">{Math.round((convertedCount / Math.max(mockVisitors.length, 1)) * 100)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-success" />
                  Métricas de Engajamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Média de Presença</span>
                    <span className="font-bold">{avgEventAttendance}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Células Ativas</span>
                    <span className="font-bold text-success">{activeCells.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Grupos Totais</span>
                    <span className="font-bold">{mockGroups.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Eventos Realizados</span>
                    <span className="font-bold">{mockEvents.filter((e) => e.attendance).length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Registros de Presença</span>
                    <span className="font-bold">{mockAttendance.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="h-4 w-4 text-warning" />
                Resumo Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {incomeByType.map((item, index) => (
                  <div key={item.name} className="rounded-lg border border-border/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                    </div>
                    <p className="text-lg font-bold">
                      R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round((item.value / totalIncome) * 100)}% do total
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
