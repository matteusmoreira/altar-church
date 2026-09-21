"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Landmark,
  Layers,
  Plus,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"
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
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmptyState, MetricCard, MetricGrid, PageHeader } from "@/components/shared"

import {
  deleteBankAccount,
  deleteCostCenter,
  deleteExpense,
  deleteFinancialCategory,
  deleteRevenue,
  deleteSupplier,
  saveBankAccount,
  saveCostCenter,
  saveExpense,
  saveFinancialCategory,
  saveRevenue,
  saveSupplier,
  toggleExpensePaid,
  toggleRevenueReceived,
} from "@/lib/operational/actions"
import type {
  BankAccount,
  CostCenter,
  Expense,
  FinancialCategory,
  Revenue,
  Supplier,
} from "@/lib/types"
import type { FinanceData } from "@/lib/operational/data"

const PAYMENT_METHODS = [
  "PIX",
  "Transferência bancária",
  "Boleto",
  "Cartão de crédito",
  "Cartão de débito",
  "Dinheiro",
  "Cheque",
]

const BANKS = [
  "Banco do Brasil",
  "Bradesco",
  "Itaú",
  "Santander",
  "Caixa Econômica Federal",
  "Nubank",
  "Inter",
  "C6 Bank",
  "Outro",
]

const ACCOUNT_TYPES = ["Corrente", "Poupança", "Investimento"]

const CHART_COLORS = [
  "#10b981", // emerald
  "#6366f1", // indigo
  "#f43f5e", // rose
  "#f59e0b", // amber
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
]

function money(value: number) {
  return (value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "-"
  const clean = dateString.slice(0, 10)
  const parts = clean.split("-")
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateString
}

function isOverdue(dueDateString?: string | null, isSettled?: boolean) {
  if (isSettled || !dueDateString) return false
  const due = new Date(`${dueDateString.slice(0, 10)}T23:59:59`)
  const now = new Date()
  return due.getTime() < now.getTime()
}

type PeriodFilter = "this-month" | "last-month" | "last-30-days" | "last-90-days" | "this-year" | "all"

export function FinanceClient({ initialData }: { initialData: FinanceData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Primary Navigation
  const [activeTab, setActiveTab] = useState<string>("visao-geral")
  const [activeCadastrosTab, setActiveCadastrosTab] = useState<string>("categorias")

  // Global Period Filter
  const [period, setPeriod] = useState<PeriodFilter>("this-month")

  // Search & Filtering inside Tabs
  const [revenueSearch, setRevenueSearch] = useState("")
  const [revenueStatus, setRevenueStatus] = useState<"all" | "received" | "pending">("all")
  const [revenueCategory, setRevenueCategory] = useState<string>("all")

  const [expenseSearch, setExpenseSearch] = useState("")
  const [expenseStatus, setExpenseStatus] = useState<"all" | "paid" | "pending">("all")
  const [expenseCategory, setExpenseCategory] = useState<string>("all")
  const [expenseCostCenter, setExpenseCostCenter] = useState<string>("all")

  // Sheets state
  const [isRevenueSheetOpen, setIsRevenueSheetOpen] = useState(false)
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false)
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false)
  const [isCostCenterSheetOpen, setIsCostCenterSheetOpen] = useState(false)
  const [isBankAccountSheetOpen, setIsBankAccountSheetOpen] = useState(false)
  const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false)

  // Transaction Details Drawer
  const [selectedTransaction, setSelectedTransaction] = useState<
    | ({ type: "revenue" } & Revenue)
    | ({ type: "expense" } & Expense)
    | null
  >(null)

  // Delete Dialog State
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    type: "revenue" | "expense" | "category" | "costCenter" | "bankAccount" | "supplier"
    title: string
  } | null>(null)

  // Form helper switches
  const [revenueReceivedNow, setRevenueReceivedNow] = useState(true)
  const [expensePaidNow, setExpensePaidNow] = useState(true)

  const today = new Date().toISOString().slice(0, 10)

  // Categories partition
  const revenueCategories = useMemo(
    () => initialData.categories.filter((cat: FinancialCategory) => cat.type === "revenue"),
    [initialData.categories]
  )
  const expenseCategories = useMemo(
    () => initialData.categories.filter((cat: FinancialCategory) => cat.type === "expense"),
    [initialData.categories]
  )

  // Date Range Bounds based on period
  const dateRange = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    if (period === "this-month") {
      const start = new Date(year, month, 1, 0, 0, 0)
      const end = new Date(year, month + 1, 0, 23, 59, 59)
      return { start, end }
    }
    if (period === "last-month") {
      const start = new Date(year, month - 1, 1, 0, 0, 0)
      const end = new Date(year, month, 0, 23, 59, 59)
      return { start, end }
    }
    if (period === "last-30-days") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { start, end: now }
    }
    if (period === "last-90-days") {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      return { start, end: now }
    }
    if (period === "this-year") {
      const start = new Date(year, 0, 1, 0, 0, 0)
      const end = new Date(year, 11, 31, 23, 59, 59)
      return { start, end }
    }
    return null
  }, [period])

  // Filter helper for transactions
  const isDateInPeriod = (dateStr?: string | null) => {
    if (!dateRange || !dateStr) return true
    const itemDate = new Date(`${dateStr.slice(0, 10)}T12:00:00`)
    return itemDate >= dateRange.start && itemDate <= dateRange.end
  }

  // Filtered lists
  const periodRevenues = useMemo(() => {
    return initialData.revenues.filter((r: Revenue) => isDateInPeriod(r.paymentDate || r.dueDate))
  }, [initialData.revenues, dateRange])

  const periodExpenses = useMemo(() => {
    return initialData.expenses.filter((e: Expense) => isDateInPeriod(e.paymentDate || e.dueDate))
  }, [initialData.expenses, dateRange])

  // KPI calculations
  const totalRevenues = useMemo(
    () => periodRevenues.filter((r: Revenue) => r.received).reduce((acc: number, r: Revenue) => acc + r.amount, 0),
    [periodRevenues]
  )
  const totalExpenses = useMemo(
    () => periodExpenses.filter((e: Expense) => e.paid).reduce((acc: number, e: Expense) => acc + e.amount, 0),
    [periodExpenses]
  )
  const netBalance = totalRevenues - totalExpenses

  const pendingRevenues = useMemo(
    () => periodRevenues.filter((r: Revenue) => !r.received).reduce((acc: number, r: Revenue) => acc + r.amount, 0),
    [periodRevenues]
  )
  const pendingExpenses = useMemo(
    () => periodExpenses.filter((e: Expense) => !e.paid).reduce((acc: number, e: Expense) => acc + e.amount, 0),
    [periodExpenses]
  )

  // Chart: Monthly Cash Flow (last 6 months)
  const monthlyFlowData = useMemo(() => {
    const months: { [key: string]: { month: string; rawMonth: string; receitas: number; despesas: number } } = {}
    const now = new Date()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
      const capitalized = label.charAt(0).toUpperCase() + label.slice(1)
      months[key] = { month: capitalized, rawMonth: key, receitas: 0, despesas: 0 }
    }

    initialData.revenues.forEach((r: Revenue) => {
      if (!r.received || !r.paymentDate) return
      const key = r.paymentDate.slice(0, 7)
      if (months[key]) {
        months[key].receitas += r.amount
      }
    })

    initialData.expenses.forEach((e: Expense) => {
      if (!e.paid || !e.paymentDate) return
      const key = e.paymentDate.slice(0, 7)
      if (months[key]) {
        months[key].despesas += e.amount
      }
    })

    return Object.values(months)
  }, [initialData.revenues, initialData.expenses])

  // Chart: Expenses by Category
  const expensesByCategoryData = useMemo(() => {
    const grouped: Record<string, number> = {}
    periodExpenses
      .filter((e: Expense) => e.paid)
      .forEach((e: Expense) => {
        const cat = e.category || "Geral"
        grouped[cat] = (grouped[cat] || 0) + e.amount
      })

    const list = Object.entries(grouped).map(([name, value], index) => {
      const catObj = initialData.categories.find((c: FinancialCategory) => c.name === name)
      return {
        name,
        value,
        color: catObj?.color || CHART_COLORS[index % CHART_COLORS.length],
      }
    })

    return list.sort((a, b) => b.value - a.value).slice(0, 6)
  }, [periodExpenses, initialData.categories])

  // Upcoming Pending Items (sorted by nearest due date)
  const upcomingItems = useMemo(() => {
    const pendingRev = initialData.revenues
      .filter((r: Revenue) => !r.received)
      .map((r: Revenue) => ({
        id: r.id,
        kind: "revenue" as const,
        description: r.description,
        amount: r.amount,
        dueDate: r.dueDate || r.paymentDate,
        party: r.receivedFromName,
        category: r.category,
      }))

    const pendingExp = initialData.expenses
      .filter((e: Expense) => !e.paid)
      .map((e: Expense) => ({
        id: e.id,
        kind: "expense" as const,
        description: e.description,
        amount: e.amount,
        dueDate: e.dueDate || e.paymentDate,
        party: e.paidToName,
        category: e.category,
      }))

    return [...pendingRev, ...pendingExp]
      .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"))
      .slice(0, 5)
  }, [initialData.revenues, initialData.expenses])

  // Filtered revenues for Receitas tab
  const filteredRevenues = useMemo(() => {
    return periodRevenues.filter((rev: Revenue) => {
      if (revenueStatus === "received" && !rev.received) return false
      if (revenueStatus === "pending" && rev.received) return false
      if (revenueCategory !== "all" && rev.category !== revenueCategory) return false
      if (revenueSearch.trim()) {
        const query = revenueSearch.toLowerCase()
        const descMatch = rev.description?.toLowerCase().includes(query)
        const partyMatch = rev.receivedFromName?.toLowerCase().includes(query)
        const catMatch = rev.category?.toLowerCase().includes(query)
        if (!descMatch && !partyMatch && !catMatch) return false
      }
      return true
    })
  }, [periodRevenues, revenueStatus, revenueCategory, revenueSearch])

  // Filtered expenses for Despesas tab
  const filteredExpenses = useMemo(() => {
    return periodExpenses.filter((exp: Expense) => {
      if (expenseStatus === "paid" && !exp.paid) return false
      if (expenseStatus === "pending" && exp.paid) return false
      if (expenseCategory !== "all" && exp.category !== expenseCategory) return false
      if (expenseCostCenter !== "all" && exp.costCenter !== expenseCostCenter) return false
      if (expenseSearch.trim()) {
        const query = expenseSearch.toLowerCase()
        const descMatch = exp.description?.toLowerCase().includes(query)
        const partyMatch = exp.paidToName?.toLowerCase().includes(query)
        const catMatch = exp.category?.toLowerCase().includes(query)
        if (!descMatch && !partyMatch && !catMatch) return false
      }
      return true
    })
  }, [periodExpenses, expenseStatus, expenseCategory, expenseCostCenter, expenseSearch])

  // Handlers for quick toggles
  const handleToggleRevenue = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", id)
      const res = await toggleRevenueReceived(fd)
      if (res.ok) {
        toast.success("Status da receita atualizado")
        router.refresh()
      } else {
        toast.error(res.error || "Não foi possível alterar status")
      }
    })
  }

  const handleToggleExpense = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", id)
      const res = await toggleExpensePaid(fd)
      if (res.ok) {
        toast.success("Status da despesa atualizado")
        router.refresh()
      } else {
        toast.error(res.error || "Não foi possível alterar status")
      }
    })
  }

  // Handlers for deletions
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set("id", deleteTarget.id)
      let res: { ok: boolean; error?: string } = { ok: false }

      switch (deleteTarget.type) {
        case "revenue":
          res = await deleteRevenue(fd)
          break
        case "expense":
          res = await deleteExpense(fd)
          break
        case "category":
          res = await deleteFinancialCategory(fd)
          break
        case "costCenter":
          res = await deleteCostCenter(fd)
          break
        case "bankAccount":
          res = await deleteBankAccount(fd)
          break
        case "supplier":
          res = await deleteSupplier(fd)
          break
      }

      if (res.ok) {
        toast.success("Registro excluído com sucesso")
        if (selectedTransaction?.id === deleteTarget.id) {
          setSelectedTransaction(null)
        }
        setDeleteTarget(null)
        router.refresh()
      } else {
        toast.error(res.error || "Não foi possível excluir")
      }
    })
  }

  // Form Submissions
  const handleCreateRevenue = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveRevenue(fd)
      if (res.ok) {
        toast.success("Receita registrada com sucesso!")
        setIsRevenueSheetOpen(false)
        setRevenueReceivedNow(true)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao registrar receita")
      }
    })
  }

  const handleCreateExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveExpense(fd)
      if (res.ok) {
        toast.success("Despesa registrada com sucesso!")
        setIsExpenseSheetOpen(false)
        setExpensePaidNow(true)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao registrar despesa")
      }
    })
  }

  const handleCreateCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveFinancialCategory(fd)
      if (res.ok) {
        toast.success("Categoria criada com sucesso!")
        setIsCategorySheetOpen(false)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao salvar categoria")
      }
    })
  }

  const handleCreateCostCenter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveCostCenter(fd)
      if (res.ok) {
        toast.success("Centro de custo criado!")
        setIsCostCenterSheetOpen(false)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao criar centro de custo")
      }
    })
  }

  const handleCreateBankAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveBankAccount(fd)
      if (res.ok) {
        toast.success("Conta bancária cadastrada!")
        setIsBankAccountSheetOpen(false)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao cadastrar conta bancária")
      }
    })
  }

  const handleCreateSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    startTransition(async () => {
      const res = await saveSupplier(fd)
      if (res.ok) {
        toast.success("Fornecedor cadastrado!")
        setIsSupplierSheetOpen(false)
        form.reset()
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao cadastrar fornecedor")
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header - Executive Minimalist */}
      <PageHeader title="Financeiro" description="Gestão de receitas, despesas, fluxo de caixa e centros de custo." badge={<Badge variant="outline" className="text-xs font-medium text-muted-foreground">Módulo Executivo</Badge>} actions={<div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <Select
            value={period}
            onValueChange={(val: string | null) => setPeriod((val as PeriodFilter) || "this-month")}
          >
            <SelectTrigger className="h-9 w-[160px] text-xs font-medium">
              <Calendar className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">Este Mês</SelectItem>
              <SelectItem value="last-month">Mês Anterior</SelectItem>
              <SelectItem value="last-30-days">Últimos 30 dias</SelectItem>
              <SelectItem value="last-90-days">Últimos 90 dias</SelectItem>
              <SelectItem value="this-year">Este Ano</SelectItem>
              <SelectItem value="all">Todo o Período</SelectItem>
            </SelectContent>
          </Select>

          {/* Export button */}
          <a
            href="/api/finance/export"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            title="Exportar dados em CSV"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Exportar CSV
          </a>

          {/* New Expense button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExpensePaidNow(true)
              setIsExpenseSheetOpen(true)
            }}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/40 dark:text-destructive dark:hover:bg-destructive/10"
          >
            <ArrowDownRight className="mr-1.5 h-4 w-4" />
            Nova Despesa
          </Button>

          {/* New Revenue button */}
          <Button
            size="sm"
            onClick={() => {
              setRevenueReceivedNow(true)
              setIsRevenueSheetOpen(true)
            }}
            className="bg-success text-white hover:bg-success/90 dark:bg-success dark:hover:bg-success/90"
          >
            <ArrowUpRight className="mr-1.5 h-4 w-4" />
            Nova Receita
          </Button>
        </div>} />

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="bg-muted/60 p-1 w-full sm:w-auto inline-flex">
            <TabsTrigger value="visao-geral" className="gap-2 text-xs font-medium sm:text-sm shrink-0">
              <Layers className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="receitas" className="gap-2 text-xs font-medium sm:text-sm shrink-0">
              <ArrowUpRight className="h-4 w-4 text-success" />
              Receitas
              <span className="ml-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                {filteredRevenues.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="despesas" className="gap-2 text-xs font-medium sm:text-sm shrink-0">
              <ArrowDownRight className="h-4 w-4 text-destructive" />
              Despesas
              <span className="ml-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                {filteredExpenses.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="cadastros" className="gap-2 text-xs font-medium sm:text-sm shrink-0">
              <Tag className="h-4 w-4 text-primary" />
              Cadastros
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: VISÃO GERAL (DASHBOARD) */}
        {/* ========================================================================= */}
        <TabsContent value="visao-geral" className="mt-0 space-y-6 outline-none">
          {/* 5 Compact Executive KPI Cards */}
          <MetricGrid columns={5}>
            <MetricCard variant="executive" title="Total Receitas" value={`R$ ${money(totalRevenues)}`} icon={TrendingUp} tone="success" hint={`${periodRevenues.filter((r: Revenue) => r.received).length} entradas recebidas`} />
            <MetricCard variant="executive" title="Total Despesas" value={`R$ ${money(totalExpenses)}`} icon={TrendingDown} tone="destructive" hint={`${periodExpenses.filter((e: Expense) => e.paid).length} saídas pagas`} />
            <MetricCard variant="executive" title="Saldo Líquido" value={`R$ ${money(netBalance)}`} icon={Wallet} tone={netBalance >= 0 ? "success" : "destructive"} hint={netBalance >= 0 ? "Superávit operacional" : "Déficit no período"} />
            <MetricCard variant="executive" title="A Receber" value={`R$ ${money(pendingRevenues)}`} icon={Clock} tone="warning" hint={`${periodRevenues.filter((r: Revenue) => !r.received).length} pendências futuras`} />
            <MetricCard variant="executive" title="A Pagar" value={`R$ ${money(pendingExpenses)}`} icon={Clock} tone="destructive" hint={`${periodExpenses.filter((e: Expense) => !e.paid).length} contas em aberto`} />
          </MetricGrid>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Monthly Flux Chart (7 cols) */}
            <Card className="bg-card/60 shadow-xs lg:col-span-7">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Fluxo de Caixa Mensal</CardTitle>
                    <CardDescription className="text-xs">
                      Comparativo de Receitas vs Despesas realizadas nos últimos 6 meses.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-success" />
                      <span className="text-muted-foreground">Receitas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-destructive" />
                      <span className="text-muted-foreground">Despesas</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="h-[260px] w-full">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-10" />
                        <XAxis dataKey="month" stroke="currentColor" className="text-xs opacity-50" fontSize={11} />
                        <YAxis
                          stroke="currentColor"
                          className="text-xs opacity-50"
                          fontSize={11}
                          tickFormatter={(val) => `R$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "8px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                            fontSize: "12px",
                          }}
                          formatter={(val: unknown) => [`R$ ${money(Number(val) || 0)}`]}
                        />
                        <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="despesas" name="Despesas" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full w-full animate-pulse rounded-lg bg-muted/20" />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Expenses by Category (5 cols) */}
            <Card className="bg-card/60 shadow-xs lg:col-span-5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Despesas por Categoria</CardTitle>
                <CardDescription className="text-xs">
                  Distribuição dos gastos realizados no período selecionado.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                {expensesByCategoryData.length === 0 ? (
                  <EmptyState icon={Tag} title="Nenhuma despesa registrada neste período." />
                ) : (
                  <div className="flex flex-col items-center sm:flex-row sm:justify-between">
                    <div className="h-[180px] w-[180px]">
                      {isMounted ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expensesByCategoryData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={3}
                            >
                              {expensesByCategoryData.map((entry, idx) => (
                                <Cell key={`cell-${idx}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(val: unknown) => [`R$ ${money(Number(val) || 0)}`]}
                              contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                borderColor: "hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full w-full animate-pulse rounded-full bg-muted/20" />
                      )}
                    </div>
                    <div className="mt-3 flex flex-1 flex-col gap-1.5 pl-2 sm:mt-0">
                      {expensesByCategoryData.map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                            <span className="truncate text-muted-foreground">{cat.name}</span>
                          </div>
                          <span className="font-semibold text-foreground">R$ {money(cat.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom Section: Upcoming Pending & Bank Accounts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Próximos Vencimentos */}
            <Card className="bg-card/60 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Próximos Vencimentos</CardTitle>
                  <span className="text-xs font-medium text-muted-foreground">Contas em aberto</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {upcomingItems.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma conta pendente ou vencendo no momento.
                  </p>
                ) : (
                  upcomingItems.map((item) => {
                    const overdue = isOverdue(item.dueDate, false)
                    return (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className="flex items-center justify-between rounded-lg border border-border/40 p-2.5 text-xs hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                              item.kind === "revenue"
                                ? "bg-success/10 text-success"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {item.kind === "revenue" ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{item.description}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Vencimento: {formatDate(item.dueDate)}{" "}
                              {overdue && <span className="font-semibold text-destructive">(Vencido)</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`font-semibold ${
                              item.kind === "revenue" ? "text-success" : "text-destructive"
                            }`}
                          >
                            R$ {money(item.amount)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={(e: React.MouseEvent) =>
                              item.kind === "revenue" ? handleToggleRevenue(item.id, e) : handleToggleExpense(item.id, e)
                            }
                            disabled={isPending}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" />
                            {item.kind === "revenue" ? "Receber" : "Pagar"}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Contas Bancárias & Saldos Cadastrados */}
            <Card className="bg-card/60 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Contas Bancárias Ativas</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setActiveTab("cadastros")
                      setActiveCadastrosTab("contas")
                    }}
                  >
                    Gerenciar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {initialData.bankAccounts.filter((b: BankAccount) => b.active).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Nenhuma conta bancária cadastrada.
                  </p>
                ) : (
                  initialData.bankAccounts
                    .filter((b: BankAccount) => b.active)
                    .map((acc: BankAccount) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between rounded-lg border border-border/40 p-2.5 text-xs hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
                            <Landmark className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{acc.description}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {acc.bank} • {acc.accountType} {acc.agency ? `• Ag: ${acc.agency}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">R$ {money(acc.initialBalance)}</p>
                          <p className="text-[10px] text-muted-foreground">Saldo inicial</p>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: RECEITAS */}
        {/* ========================================================================= */}
        <TabsContent value="receitas" className="mt-0 space-y-6 outline-none">
          {/* Toolbar */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou pessoa..."
                  value={revenueSearch}
                  onChange={(e) => setRevenueSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>

              {/* Status filter */}
              <Select
                value={revenueStatus}
                onValueChange={(v: string | null) => setRevenueStatus((v as "all" | "received" | "pending") || "all")}
              >
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="received">Recebidas</SelectItem>
                  <SelectItem value="pending">A Receber</SelectItem>
                </SelectContent>
              </Select>

              {/* Category filter */}
              <Select
                value={revenueCategory}
                onValueChange={(val: string | null) => setRevenueCategory(val || "all")}
              >
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {revenueCategories.map((cat: FinancialCategory) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              onClick={() => {
                setRevenueReceivedNow(true)
                setIsRevenueSheetOpen(true)
              }}
              className="bg-success text-white hover:bg-success/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova Receita
            </Button>
          </div>

          {/* Table */}
          <Card className="bg-card/60 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px] text-xs font-semibold">Data</TableHead>
                    <TableHead className="text-xs font-semibold">Descrição</TableHead>
                    <TableHead className="text-xs font-semibold">Categoria</TableHead>
                    <TableHead className="text-xs font-semibold">Conta</TableHead>
                    <TableHead className="text-xs font-semibold">Recebido de</TableHead>
                    <TableHead className="text-xs font-semibold">Valor</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="w-[100px] text-right text-xs font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRevenues.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                        Nenhuma receita encontrada para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRevenues.map((rev: Revenue) => {
                      const catObj = revenueCategories.find((c: FinancialCategory) => c.name === rev.category)
                      return (
                        <TableRow
                          key={rev.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedTransaction({ type: "revenue", ...rev })}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(rev.paymentDate || rev.dueDate)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs text-foreground">{rev.description}</div>
                            {rev.receiptFileId && (
                              <div className="flex items-center gap-1 text-[11px] text-success">
                                <FileCheck className="h-3 w-3" />
                                Comprovante anexado
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {rev.category ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal"
                                style={{
                                  borderColor: catObj?.color ? `${catObj.color}40` : undefined,
                                  color: catObj?.color,
                                }}
                              >
                                {rev.category}
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rev.bankAccount || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rev.receivedFromName || "-"}</TableCell>
                          <TableCell className="text-xs font-semibold text-success">
                            + R$ {money(rev.amount)}
                          </TableCell>
                          <TableCell>
                            {rev.received ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                Recebido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground dark:text-warning">
                                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                                A Receber
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title={rev.received ? "Marcar como a receber" : "Marcar como recebido"}
                                onClick={(e) => handleToggleRevenue(rev.id, e)}
                                disabled={isPending}
                              >
                                <CheckCircle2
                                  className={`h-4 w-4 ${rev.received ? "text-success" : "text-muted-foreground/50"}`}
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Ver detalhes"
                                onClick={() => setSelectedTransaction({ type: "revenue", ...rev })}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Excluir receita"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: rev.id,
                                    type: "revenue",
                                    title: rev.description,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive/70" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: DESPESAS */}
        {/* ========================================================================= */}
        <TabsContent value="despesas" className="mt-0 space-y-6 outline-none">
          {/* Toolbar */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou fornecedor..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>

              {/* Status filter */}
              <Select
                value={expenseStatus}
                onValueChange={(v: string | null) => setExpenseStatus((v as "all" | "paid" | "pending") || "all")}
              >
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="pending">A Pagar</SelectItem>
                </SelectContent>
              </Select>

              {/* Category filter */}
              <Select
                value={expenseCategory}
                onValueChange={(val: string | null) => setExpenseCategory(val || "all")}
              >
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {expenseCategories.map((cat: FinancialCategory) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Cost Center filter */}
              <Select
                value={expenseCostCenter}
                onValueChange={(val: string | null) => setExpenseCostCenter(val || "all")}
              >
                <SelectTrigger className="h-9 w-[150px] text-xs">
                  <SelectValue placeholder="Centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os centros</SelectItem>
                  {initialData.costCenters.map((cc: CostCenter) => (
                    <SelectItem key={cc.id} value={cc.title}>
                      {cc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              onClick={() => {
                setExpensePaidNow(true)
                setIsExpenseSheetOpen(true)
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova Despesa
            </Button>
          </div>

          {/* Table */}
          <Card className="bg-card/60 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px] text-xs font-semibold">Data</TableHead>
                    <TableHead className="text-xs font-semibold">Descrição</TableHead>
                    <TableHead className="text-xs font-semibold">Categoria</TableHead>
                    <TableHead className="text-xs font-semibold">Fornecedor</TableHead>
                    <TableHead className="text-xs font-semibold">Centro de Custo</TableHead>
                    <TableHead className="text-xs font-semibold">Valor</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="w-[100px] text-right text-xs font-semibold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                        Nenhuma despesa encontrada para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpenses.map((exp: Expense) => {
                      const catObj = expenseCategories.find((c: FinancialCategory) => c.name === exp.category)
                      const overdue = isOverdue(exp.dueDate, exp.paid)
                      return (
                        <TableRow
                          key={exp.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedTransaction({ type: "expense", ...exp })}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(exp.paymentDate || exp.dueDate)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-xs text-foreground">{exp.description}</div>
                            {exp.receiptFileId && (
                              <div className="flex items-center gap-1 text-[11px] text-destructive">
                                <FileCheck className="h-3 w-3" />
                                Comprovante anexado
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {exp.category ? (
                              <Badge
                                variant="outline"
                                className="text-[11px] font-normal"
                                style={{
                                  borderColor: catObj?.color ? `${catObj.color}40` : undefined,
                                  color: catObj?.color,
                                }}
                              >
                                {exp.category}
                              </Badge>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{exp.paidToName || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{exp.costCenter || "-"}</TableCell>
                          <TableCell className="text-xs font-semibold text-destructive">
                            - R$ {money(exp.amount)}
                          </TableCell>
                          <TableCell>
                            {exp.paid ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                Pago
                              </span>
                            ) : overdue ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                                Vencido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning-foreground dark:text-warning">
                                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                                A Pagar
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title={exp.paid ? "Marcar como pendente" : "Marcar como pago"}
                                onClick={(e) => handleToggleExpense(exp.id, e)}
                                disabled={isPending}
                              >
                                <CheckCircle2
                                  className={`h-4 w-4 ${exp.paid ? "text-success" : "text-muted-foreground/50"}`}
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                title="Ver detalhes"
                                onClick={() => setSelectedTransaction({ type: "expense", ...exp })}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Excluir despesa"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: exp.id,
                                    type: "expense",
                                    title: exp.description,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive/70" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 4: CADASTROS (CATEGORIAS, CENTROS, CONTAS, FORNECEDORES) */}
        {/* ========================================================================= */}
        <TabsContent value="cadastros" className="mt-0 space-y-6 outline-none">
          {/* Sub-tabs pills */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
              <Button
                variant={activeCadastrosTab === "categorias" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCadastrosTab("categorias")}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Tag className="h-3.5 w-3.5" />
                Categorias ({initialData.categories.length})
              </Button>
              <Button
                variant={activeCadastrosTab === "centros" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCadastrosTab("centros")}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Building2 className="h-3.5 w-3.5" />
                Centros de Custo ({initialData.costCenters.length})
              </Button>
              <Button
                variant={activeCadastrosTab === "contas" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCadastrosTab("contas")}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Landmark className="h-3.5 w-3.5" />
                Contas Bancárias ({initialData.bankAccounts.length})
              </Button>
              <Button
                variant={activeCadastrosTab === "fornecedores" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCadastrosTab("fornecedores")}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <Users className="h-3.5 w-3.5" />
                Fornecedores ({initialData.suppliers.length})
              </Button>
            </div>

            {/* Action button corresponding to sub-tab */}
            {activeCadastrosTab === "categorias" && (
              <Button size="sm" onClick={() => setIsCategorySheetOpen(true)} className="h-8 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nova Categoria
              </Button>
            )}
            {activeCadastrosTab === "centros" && (
              <Button size="sm" onClick={() => setIsCostCenterSheetOpen(true)} className="h-8 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo Centro de Custo
              </Button>
            )}
            {activeCadastrosTab === "contas" && (
              <Button size="sm" onClick={() => setIsBankAccountSheetOpen(true)} className="h-8 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nova Conta Bancária
              </Button>
            )}
            {activeCadastrosTab === "fornecedores" && (
              <Button size="sm" onClick={() => setIsSupplierSheetOpen(true)} className="h-8 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Novo Fornecedor
              </Button>
            )}
          </div>

          {/* Sub-tab: Categorias */}
          {activeCadastrosTab === "categorias" && (
            <Card className="bg-card/60 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Nome</TableHead>
                      <TableHead className="text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold">Cor Indicativa</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-[80px] text-right text-xs font-semibold">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialData.categories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                          Nenhuma categoria financeira cadastrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      initialData.categories.map((cat: FinancialCategory) => (
                        <TableRow key={cat.id}>
                          <TableCell className="font-medium text-xs text-foreground">{cat.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={cat.type === "revenue" ? "default" : "secondary"}
                              className="text-[10px] font-medium"
                            >
                              {cat.type === "revenue" ? "Receita" : "Despesa"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="text-xs font-mono text-muted-foreground">{cat.color}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-success">Ativo</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: cat.id,
                                  type: "category",
                                  title: cat.name,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Sub-tab: Centros de Custo */}
          {activeCadastrosTab === "centros" && (
            <Card className="bg-card/60 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Título</TableHead>
                      <TableHead className="text-xs font-semibold">Responsável</TableHead>
                      <TableHead className="text-xs font-semibold">Descrição</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-[80px] text-right text-xs font-semibold">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialData.costCenters.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                          Nenhum centro de custo cadastrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      initialData.costCenters.map((center: CostCenter) => (
                        <TableRow key={center.id}>
                          <TableCell className="font-medium text-xs text-foreground">{center.title}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{center.responsible || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{center.description || "-"}</TableCell>
                          <TableCell>
                            <span className="text-xs text-success">Ativo</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: center.id,
                                  type: "costCenter",
                                  title: center.title,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Sub-tab: Contas Bancárias */}
          {activeCadastrosTab === "contas" && (
            <Card className="bg-card/60 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Descrição</TableHead>
                      <TableHead className="text-xs font-semibold">Banco</TableHead>
                      <TableHead className="text-xs font-semibold">Tipo</TableHead>
                      <TableHead className="text-xs font-semibold">Agência / Conta</TableHead>
                      <TableHead className="text-xs font-semibold">Saldo Inicial</TableHead>
                      <TableHead className="w-[80px] text-right text-xs font-semibold">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialData.bankAccounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                          Nenhuma conta bancária cadastrada.
                        </TableCell>
                      </TableRow>
                    ) : (
                      initialData.bankAccounts.map((account: BankAccount) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium text-xs text-foreground">{account.description}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{account.bank || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{account.accountType || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {account.agency ? `Ag: ${account.agency} ` : ""}
                            {account.account ? `Cc: ${account.account}${account.digit ? `-${account.digit}` : ""}` : "-"}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-foreground">
                            R$ {money(account.initialBalance)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: account.id,
                                  type: "bankAccount",
                                  title: account.description,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Sub-tab: Fornecedores */}
          {activeCadastrosTab === "fornecedores" && (
            <Card className="bg-card/60 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold">Nome</TableHead>
                      <TableHead className="text-xs font-semibold">Documento (CNPJ/CPF)</TableHead>
                      <TableHead className="text-xs font-semibold">Responsável</TableHead>
                      <TableHead className="text-xs font-semibold">Telefone / E-mail</TableHead>
                      <TableHead className="text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-[80px] text-right text-xs font-semibold">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialData.suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                          Nenhum fornecedor cadastrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      initialData.suppliers.map((sup: Supplier) => (
                        <TableRow key={sup.id}>
                          <TableCell className="font-medium text-xs text-foreground">{sup.name}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{sup.document || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{sup.responsible || "-"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {sup.phone || sup.email ? `${sup.phone || ""} ${sup.email ? `(${sup.email})` : ""}` : "-"}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-success">Ativo</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setDeleteTarget({
                                  id: sup.id,
                                  type: "supplier",
                                  title: sup.name,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ========================================================================= */}
      {/* DRAWER (SHEET): NOVA RECEITA */}
      {/* ========================================================================= */}
      <Sheet open={isRevenueSheetOpen} onOpenChange={setIsRevenueSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-lg font-bold">Nova Receita</SheetTitle>
                <SheetDescription className="text-xs">Registre uma entrada de valor para a igreja.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleCreateRevenue} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rev-amount" className="text-xs font-semibold">
                  Valor (R$) *
                </Label>
                <Input
                  id="rev-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  required
                  className="text-base font-bold text-success"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rev-desc" className="text-xs font-semibold">
                  Descrição *
                </Label>
                <Input
                  id="rev-desc"
                  name="description"
                  placeholder="Ex: Dízimo, Oferta de culto, Doação campanha"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Categoria</Label>
                <Select name="category">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {revenueCategories.map((c: FinancialCategory) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Método de Pagamento</Label>
                <Select name="paymentMethod" defaultValue="PIX">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Conta Bancária</Label>
                <Select name="bankAccount">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialData.bankAccounts.map((b: BankAccount) => (
                      <SelectItem key={b.id} value={b.description}>
                        {b.description} ({b.bank})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Centro de Custo</Label>
                <Select name="costCenter">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o centro" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialData.costCenters.map((cc: CostCenter) => (
                      <SelectItem key={cc.id} value={cc.title}>
                        {cc.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rev-from" className="text-xs font-semibold">
                  Recebido de (Membro / Contribuinte)
                </Label>
                <Input id="rev-from" name="receivedFromName" placeholder="Nome da pessoa ou anônimo" />
                <input type="hidden" name="receivedFrom" value="person" />
              </div>

              {/* Toggle: Já recebido vs A Receber */}
              <div className="col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="rev-received" className="text-xs font-semibold">
                      Lançamento já recebido?
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {revenueReceivedNow ? "Entrada já efetivada no caixa." : "Previsão futura (a receber)."}
                    </p>
                  </div>
                  <Switch
                    id="rev-received"
                    checked={revenueReceivedNow}
                    onCheckedChange={setRevenueReceivedNow}
                  />
                  <input type="hidden" name="received" value={revenueReceivedNow ? "true" : "false"} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="rev-paydate" className="text-[11px] text-muted-foreground">
                      {revenueReceivedNow ? "Data do Recebimento *" : "Data Prevista *"}
                    </Label>
                    <Input id="rev-paydate" name="paymentDate" type="date" defaultValue={today} required />
                  </div>
                  {!revenueReceivedNow && (
                    <div className="space-y-1">
                      <Label htmlFor="rev-duedate" className="text-[11px] text-muted-foreground">
                        Data de Vencimento
                      </Label>
                      <Input id="rev-duedate" name="dueDate" type="date" defaultValue={today} />
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rev-notes" className="text-xs font-semibold">
                  Observações
                </Label>
                <Textarea id="rev-notes" name="notes" placeholder="Detalhes adicionais..." rows={2} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="rev-receipt" className="text-xs font-semibold">
                  Comprovante / Recibo (PDF ou Imagem)
                </Label>
                <Input
                  id="rev-receipt"
                  name="receiptFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="text-xs file:text-xs"
                />
              </div>
            </div>

            <SheetFooter className="border-t border-border/40 pt-4">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsRevenueSheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-success text-white hover:bg-success/90"
                disabled={isPending}
              >
                {isPending ? "Salvando..." : "Registrar Receita"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* DRAWER (SHEET): NOVA DESPESA */}
      {/* ========================================================================= */}
      <Sheet open={isExpenseSheetOpen} onOpenChange={setIsExpenseSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-lg font-bold">Nova Despesa</SheetTitle>
                <SheetDescription className="text-xs">Registre um pagamento ou conta da igreja.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleCreateExpense} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="exp-amount" className="text-xs font-semibold">
                  Valor (R$) *
                </Label>
                <Input
                  id="exp-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  required
                  className="text-base font-bold text-destructive"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="exp-desc" className="text-xs font-semibold">
                  Descrição *
                </Label>
                <Input
                  id="exp-desc"
                  name="description"
                  placeholder="Ex: Aluguel do templo, Energia elétrica, Compra som"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Categoria</Label>
                <Select name="category">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseCategories.map((c: FinancialCategory) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Método</Label>
                <Select name="paymentMethod" defaultValue="PIX">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Conta Bancária</Label>
                <Select name="bankAccount">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialData.bankAccounts.map((b: BankAccount) => (
                      <SelectItem key={b.id} value={b.description}>
                        {b.description} ({b.bank})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Centro de Custo</Label>
                <Select name="costCenter">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o centro" />
                  </SelectTrigger>
                  <SelectContent>
                    {initialData.costCenters.map((cc: CostCenter) => (
                      <SelectItem key={cc.id} value={cc.title}>
                        {cc.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="exp-to" className="text-xs font-semibold">
                  Pago para / Fornecedor
                </Label>
                <Input id="exp-to" name="paidToName" placeholder="Ex: Enel, Sabesp, Papelaria Alfa" />
              </div>

              {/* Toggle: Já pago vs A Pagar */}
              <div className="col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="exp-paid" className="text-xs font-semibold">
                      Despesa já foi paga?
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {expensePaidNow ? "Saída já quitada no caixa." : "Conta a pagar com data de vencimento."}
                    </p>
                  </div>
                  <Switch id="exp-paid" checked={expensePaidNow} onCheckedChange={setExpensePaidNow} />
                  <input type="hidden" name="paid" value={expensePaidNow ? "true" : "false"} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="exp-paydate" className="text-[11px] text-muted-foreground">
                      {expensePaidNow ? "Data do Pagamento *" : "Data Prevista *"}
                    </Label>
                    <Input id="exp-paydate" name="paymentDate" type="date" defaultValue={today} required />
                  </div>
                  {!expensePaidNow && (
                    <div className="space-y-1">
                      <Label htmlFor="exp-duedate" className="text-[11px] text-muted-foreground">
                        Data de Vencimento
                      </Label>
                      <Input id="exp-duedate" name="dueDate" type="date" defaultValue={today} />
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="exp-notes" className="text-xs font-semibold">
                  Observações
                </Label>
                <Textarea id="exp-notes" name="notes" placeholder="Detalhes adicionais..." rows={2} />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="exp-receipt" className="text-xs font-semibold">
                  Comprovante / Nota Fiscal (PDF ou Imagem)
                </Label>
                <Input
                  id="exp-receipt"
                  name="receiptFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="text-xs file:text-xs"
                />
              </div>
            </div>

            <SheetFooter className="border-t border-border/40 pt-4">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsExpenseSheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isPending}
              >
                {isPending ? "Salvando..." : "Registrar Despesa"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* DRAWER (SHEET): DETALHES DA TRANSAÇÃO & COMPROVANTE */}
      {/* ========================================================================= */}
      <Sheet open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          {selectedTransaction && (
            <>
              <SheetHeader className="border-b border-border/40 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        selectedTransaction.type === "revenue"
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {selectedTransaction.type === "revenue" ? (
                        <ArrowUpRight className="h-5 w-5" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <SheetTitle className="text-lg font-bold">
                        {selectedTransaction.type === "revenue" ? "Detalhes da Receita" : "Detalhes da Despesa"}
                      </SheetTitle>
                      <SheetDescription className="text-xs">
                        {selectedTransaction.type === "revenue" ? "Entrada financeira" : "Saída financeira"}
                      </SheetDescription>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* Amount display */}
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-center">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Valor do Lançamento</p>
                  <div
                    className={`mt-1 text-2xl font-black ${
                      selectedTransaction.type === "revenue"
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {selectedTransaction.type === "revenue" ? "+" : "-"} R$ {money(selectedTransaction.amount)}
                  </div>
                  <div className="mt-2 flex justify-center">
                    {(selectedTransaction as Revenue).received || (selectedTransaction as Expense).paid ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {selectedTransaction.type === "revenue" ? "Recebida" : "Paga"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning-foreground dark:text-warning">
                        <Clock className="h-3.5 w-3.5" />
                        {selectedTransaction.type === "revenue" ? "Pendente (A Receber)" : "Pendente (A Pagar)"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Structured Fields */}
                <div className="space-y-2 rounded-lg border border-border/40 p-3.5">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Descrição:</span>
                    <span className="font-semibold text-foreground">{selectedTransaction.description}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Categoria:</span>
                    <span className="font-semibold text-foreground">{selectedTransaction.category || "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">
                      {selectedTransaction.type === "revenue" ? "Recebido de:" : "Pago para:"}
                    </span>
                    <span className="font-semibold text-foreground">
                      {selectedTransaction.type === "revenue"
                        ? (selectedTransaction as Revenue).receivedFromName || "-"
                        : (selectedTransaction as Expense).paidToName || "-"}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Conta Bancária:</span>
                    <span className="font-semibold text-foreground">{selectedTransaction.bankAccount || "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Centro de Custo:</span>
                    <span className="font-semibold text-foreground">{selectedTransaction.costCenter || "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Método:</span>
                    <span className="font-semibold text-foreground">{selectedTransaction.paymentMethod || "-"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground">Data Pagamento:</span>
                    <span className="font-semibold text-foreground">{formatDate(selectedTransaction.paymentDate)}</span>
                  </div>
                  {selectedTransaction.dueDate && (
                    <div className="flex justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground">Data Vencimento:</span>
                      <span className="font-semibold text-foreground">{formatDate(selectedTransaction.dueDate)}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedTransaction.notes && (
                  <div className="rounded-lg border border-border/40 p-3 bg-muted/10">
                    <p className="font-semibold text-muted-foreground mb-1">Observações:</p>
                    <p className="text-foreground whitespace-pre-wrap">{selectedTransaction.notes}</p>
                  </div>
                )}

                {/* Receipt Section */}
                <div className="rounded-lg border border-border/40 p-3.5 bg-muted/10 space-y-2">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    Comprovante Anexado
                  </p>
                  {selectedTransaction.receiptFileId ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-muted-foreground">Documento armazenado com segurança</span>
                      <a
                        href={`/api/v1/files/${selectedTransaction.receiptFileId}`}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Visualizar Comprovante
                      </a>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-[11px]">Nenhum comprovante foi enviado para este lançamento.</p>
                  )}
                </div>
              </div>

              {/* Action buttons at bottom */}
              <SheetFooter className="border-t border-border/40 p-4 flex flex-col gap-2">
                <div className="flex w-full items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setDeleteTarget({
                        id: selectedTransaction.id,
                        type: selectedTransaction.type,
                        title: selectedTransaction.description,
                      })
                    }}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir Lançamento
                  </Button>

                  <Button
                    size="sm"
                    className={`flex-1 ${
                      selectedTransaction.type === "revenue"
                        ? "bg-success hover:bg-success/90 text-white"
                        : "bg-destructive hover:bg-destructive/90 text-white"
                    }`}
                    onClick={(e) => {
                      if (selectedTransaction.type === "revenue") {
                        handleToggleRevenue(selectedTransaction.id, e)
                      } else {
                        handleToggleExpense(selectedTransaction.id, e)
                      }
                      setSelectedTransaction(null)
                    }}
                    disabled={isPending}
                  >
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Alternar Status
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* AUXILIARY SHEETS (CATEGORY, COST CENTER, BANK ACCOUNT, SUPPLIER) */}
      {/* ========================================================================= */}
      {/* Nova Categoria */}
      <Sheet open={isCategorySheetOpen} onOpenChange={setIsCategorySheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <SheetTitle className="text-lg font-bold">Nova Categoria Financeira</SheetTitle>
            <SheetDescription className="text-xs">Classifique suas receitas e despesas.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateCategory} className="flex-1 p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name" className="text-xs font-semibold">
                Nome da Categoria *
              </Label>
              <Input id="cat-name" name="name" placeholder="Ex: Dízimos, Manutenção, Missões" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-type" className="text-xs font-semibold">
                Tipo
              </Label>
              <Select name="type" defaultValue="expense">
                <SelectTrigger id="cat-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Receita (Entrada)</SelectItem>
                  <SelectItem value="expense">Despesa (Saída)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-color" className="text-xs font-semibold">
                Cor de Destaque
              </Label>
              <Input id="cat-color" name="color" type="color" defaultValue="#10b981" className="h-10 cursor-pointer" />
            </div>
            <SheetFooter className="border-t border-border/40 pt-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsCategorySheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                Salvar Categoria
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Novo Centro de Custo */}
      <Sheet open={isCostCenterSheetOpen} onOpenChange={setIsCostCenterSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <SheetTitle className="text-lg font-bold">Novo Centro de Custo</SheetTitle>
            <SheetDescription className="text-xs">Agrupe lançamentos por ministério ou setor.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateCostCenter} className="flex-1 p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cc-title" className="text-xs font-semibold">
                Título do Centro de Custo *
              </Label>
              <Input id="cc-title" name="title" placeholder="Ex: Ministério de Louvor, Kids, Administração" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-resp" className="text-xs font-semibold">
                Responsável
              </Label>
              <Input id="cc-resp" name="responsible" placeholder="Nome do pastor ou líder" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-desc" className="text-xs font-semibold">
                Descrição
              </Label>
              <Textarea id="cc-desc" name="description" placeholder="Objetivo ou escopo deste centro..." rows={3} />
            </div>
            <input type="hidden" name="active" value="true" />
            <SheetFooter className="border-t border-border/40 pt-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsCostCenterSheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                Salvar Centro de Custo
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Nova Conta Bancária */}
      <Sheet open={isBankAccountSheetOpen} onOpenChange={setIsBankAccountSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <SheetTitle className="text-lg font-bold">Nova Conta Bancária</SheetTitle>
            <SheetDescription className="text-xs">Cadastre contas correntes, poupanças ou caixas.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateBankAccount} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-desc" className="text-xs font-semibold">
                Identificação da Conta *
              </Label>
              <Input id="bank-desc" name="description" placeholder="Ex: Conta Principal Bradesco, Caixa Culto" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Banco</Label>
                <Select name="bank" defaultValue="Banco do Brasil">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tipo</Label>
                <Select name="accountType" defaultValue="Corrente">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank-balance" className="text-xs font-semibold">
                Saldo Inicial (R$)
              </Label>
              <Input id="bank-balance" name="initialBalance" type="number" step="0.01" min="0" placeholder="0,00" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="bank-agency" className="text-[11px] text-muted-foreground">
                  Agência
                </Label>
                <Input id="bank-agency" name="agency" placeholder="0000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-acc" className="text-[11px] text-muted-foreground">
                  Conta
                </Label>
                <Input id="bank-acc" name="account" placeholder="00000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bank-digit" className="text-[11px] text-muted-foreground">
                  Dígito
                </Label>
                <Input id="bank-digit" name="digit" placeholder="0" />
              </div>
            </div>
            <input type="hidden" name="active" value="true" />
            <SheetFooter className="border-t border-border/40 pt-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsBankAccountSheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                Cadastrar Conta
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Novo Fornecedor */}
      <Sheet open={isSupplierSheetOpen} onOpenChange={setIsSupplierSheetOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="border-b border-border/40 p-5">
            <SheetTitle className="text-lg font-bold">Novo Fornecedor</SheetTitle>
            <SheetDescription className="text-xs">Cadastre parceiros e prestadores de serviço.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleCreateSupplier} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sup-name" className="text-xs font-semibold">
                Razão Social / Nome Fantasia *
              </Label>
              <Input id="sup-name" name="name" placeholder="Ex: Gráfica Express, Distribuidora XYZ" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-doc" className="text-xs font-semibold">
                Documento (CNPJ / CPF)
              </Label>
              <Input id="sup-doc" name="document" placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-resp" className="text-xs font-semibold">
                Pessoa de Contato / Responsável
              </Label>
              <Input id="sup-resp" name="responsible" placeholder="Nome do representante" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone" className="text-xs font-semibold">
                  Telefone
                </Label>
                <Input id="sup-phone" name="phone" placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-email" className="text-xs font-semibold">
                  E-mail
                </Label>
                <Input id="sup-email" name="email" type="email" placeholder="contato@empresa.com" />
              </div>
            </div>
            <input type="hidden" name="active" value="true" />
            <SheetFooter className="border-t border-border/40 pt-4 mt-6">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setIsSupplierSheetOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isPending}>
                Cadastrar Fornecedor
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* DIÁLOGO DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {/* ========================================================================= */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir <strong>{deleteTarget?.title}</strong>? Esta operação removerá o lançamento das
              consultas ativas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
