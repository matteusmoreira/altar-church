"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Building2,
  Check,
  DollarSign,
  Edit,
  Grid2X2,
  KeyRound,
  Layers3,
  List,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteCompany,
  deleteProfile,
  saveCompany,
  savePlan,
  saveProfile,
  setModuleActive,
  setProfilePassword,
  toggleCompanyModule,
} from "@/lib/admin/actions"
import { cn } from "@/lib/utils"
import type {
  AdminCompany,
  AdminCellOption,
  AdminDashboardData,
  AdminModule,
  AdminPlan,
  AdminProfile,
  BillingCycle,
  CompanyStatus,
} from "@/lib/admin/types"
import type { UserRole } from "@/lib/types"
import { MetricCard, MetricGrid, PageHeader, ViewToggle } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OpenRouterPanel } from "./openrouter-panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AdminTab = "overview" | "companies" | "users" | "plans" | "modules" | "ai"
type ViewMode = "list" | "grid"

type DeleteTarget =
  | { kind: "company"; id: string; label: string; confirmation: string }
  | { kind: "profile"; id: string; label: string; confirmation: string }

interface SuperAdminConsoleProps {
  initialData: AdminDashboardData
  initialTab?: AdminTab
}

interface CompanyForm {
  id: string | null
  name: string
  responsibleName: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  planId: string
  status: CompanyStatus
  active: boolean
  moduleIds: string[]
}

interface PlanForm {
  id: string | null
  code: string
  name: string
  description: string
  price: number
  billingCycle: BillingCycle
  uazapiInstanceLimit: number
  active: boolean
  moduleIds: string[]
}

interface ProfileForm {
  id: string | null
  companyId: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  password: string
  cellIds: string[]
}

interface PasswordResetForm {
  profileId: string
  name: string
  email: string
  password: string
}

const planLabels: Record<string, string> = {
  free: "Gratuito",
  basic: "Básico",
  premium: "Premium",
  enterprise: "Enterprise",
}

const roleLabels: Record<UserRole, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  pastor: "Pastor",
  ministry_leader: "Líder de Ministério",
  cell_supervisor: "Supervisor de Células",
  cell_leader: "Líder de Célula",
  communication: "Comunicação",
  finance: "Financeiro",
  volunteer: "Voluntário",
  member: "Membro",
}

const statusLabels: Record<CompanyStatus, string> = {
  active: "Ativa",
  blocked: "Bloqueada",
  test: "Teste",
}

const billingCycleLabels: Record<BillingCycle, string> = {
  free: "Grátis",
  monthly: "Mensal",
  yearly: "Anual",
  custom: "Personalizada",
}

function emptyCompanyForm(plans: AdminPlan[]): CompanyForm {
  const firstPlan = plans[0]
  return {
    id: null,
    name: "",
    responsibleName: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    email: "",
    planId: firstPlan?.id ?? "",
    status: "active",
    active: true,
    moduleIds: firstPlan?.moduleIds ?? [],
  }
}

function emptyPlanForm(): PlanForm {
  return {
    id: null,
    code: "",
    name: "",
    description: "",
    price: 0,
    billingCycle: "monthly",
    uazapiInstanceLimit: 1,
    active: true,
    moduleIds: [],
  }
}

function emptyProfileForm(companies: AdminCompany[]): ProfileForm {
  return {
    id: null,
    companyId: companies[0]?.id ?? null,
    name: "",
    email: "",
    role: "member",
    active: true,
    password: "",
    cellIds: [],
  }
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id]
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode
  onChange: (value: ViewMode) => void
}) {
  return (
    <ViewToggle
      value={value}
      onChange={onChange}
      ariaLabel="Modo de visualização"
      options={[
        { value: "list", label: "Modo lista", icon: List },
        { value: "grid", label: "Modo grade", icon: Grid2X2 },
      ]}
    />
  )
}

function ModulesPicker({
  modules,
  selectedIds,
  onToggle,
}: {
  modules: AdminModule[]
  selectedIds: string[]
  onToggle: (moduleId: string) => void
}) {
  const grouped = useMemo(() => {
    return modules.reduce<Record<string, AdminModule[]>>((acc, module) => {
      acc[module.menuGroup] = [...(acc[module.menuGroup] ?? []), module]
      return acc
    }, {})
  }, [modules])

  return (
    <div className="grid gap-4">
      {Object.entries(grouped).map(([group, groupModules]) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {groupModules.map((module) => {
              const checked = selectedIds.includes(module.id)
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onToggle(module.id)}
                  className="surface flex min-h-16 items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{module.label}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{module.description}</p>
                  </div>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border">
                    {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SuperAdminConsole({ initialData, initialTab = "overview" }: SuperAdminConsoleProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const data = initialData
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab)
  const [search, setSearch] = useState("")
  const [companyView, setCompanyView] = useState<ViewMode>("list")
  const [userView, setUserView] = useState<ViewMode>("list")
  const [planView, setPlanView] = useState<ViewMode>("grid")
  const [moduleView, setModuleView] = useState<ViewMode>("grid")
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [companyForm, setCompanyForm] = useState<CompanyForm>(() => emptyCompanyForm(initialData.plans))
  const [planForm, setPlanForm] = useState<PlanForm>(() => emptyPlanForm())
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => emptyProfileForm(initialData.companies))
  const [passwordForm, setPasswordForm] = useState<PasswordResetForm>({
    profileId: "",
    name: "",
    email: "",
    password: "",
  })

  const [companies, setCompanies] = useState<AdminCompany[]>(initialData.companies)
  const [selectedCompanyIdForModules, setSelectedCompanyIdForModules] = useState<string>(
    () => initialData.companies[0]?.id ?? ""
  )

  // Espelha a prop no estado durante a renderização (idioma "adjusting state when a prop changes").
  const [syncedCompanies, setSyncedCompanies] = useState(initialData.companies)
  if (syncedCompanies !== initialData.companies) {
    setSyncedCompanies(initialData.companies)
    setCompanies(initialData.companies)
  }

  const modulesByGroup = useMemo(() => {
    return data.modules.reduce<Record<string, AdminModule[]>>((acc, module) => {
      acc[module.menuGroup] = [...(acc[module.menuGroup] ?? []), module]
      return acc
    }, {})
  }, [data.modules])

  const activeCompanies = companies.filter((company) => company.active).length
  const totalMembers = companies.reduce((sum, company) => sum + company.memberCount, 0)
  const monthlyRevenue = companies.reduce((sum, company) => {
    const plan = data.plans.find((item) => item.id === company.planId)
    return sum + (company.active ? plan?.price ?? 0 : 0)
  }, 0)

  const filteredCompanies = companies.filter((company) => {
    const term = search.toLowerCase()
    return company.name.toLowerCase().includes(term) || company.city.toLowerCase().includes(term)
  })

  const filteredUsers = data.users.filter((user) => {
    const term = search.toLowerCase()
    return user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
  })

  const openCompany = (company?: AdminCompany) => {
    if (!company) {
      setCompanyForm(emptyCompanyForm(data.plans))
    } else {
      setCompanyForm({
        id: company.id,
        name: company.name,
        responsibleName: company.responsibleName,
        address: company.address,
        city: company.city,
        state: company.state,
        phone: company.phone,
        email: company.email,
        planId: company.planId ?? data.plans[0]?.id ?? "",
        status: company.status,
        active: company.active,
        moduleIds: company.moduleIds,
      })
    }
    setCompanyDialogOpen(true)
  }

  const openPlan = (plan?: AdminPlan) => {
    setPlanForm(
      plan
        ? {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            description: plan.description,
            price: plan.price,
            billingCycle: plan.billingCycle,
            uazapiInstanceLimit: plan.uazapiInstanceLimit,
            active: plan.active,
            moduleIds: plan.moduleIds,
          }
        : emptyPlanForm()
    )
    setPlanDialogOpen(true)
  }

  const openProfile = (profile?: AdminProfile) => {
    setProfileForm(
      profile
        ? {
            id: profile.id,
            companyId: profile.companyId,
            name: profile.name,
            email: profile.email,
            role: profile.role,
            active: profile.active,
            password: "",
            cellIds: profile.cellIds,
          }
        : emptyProfileForm(data.companies)
    )
    setProfileDialogOpen(true)
  }

  const openPasswordReset = (profile: AdminProfile) => {
    setPasswordForm({
      profileId: profile.id,
      name: profile.name,
      email: profile.email,
      password: "",
    })
    setPasswordDialogOpen(true)
  }

  const openCompanyDelete = (company: AdminCompany) => {
    setDeleteConfirmation("")
    setDeleteTarget({
      kind: "company",
      id: company.id,
      label: company.name,
      confirmation: company.name,
    })
  }

  const openProfileDelete = (profile: AdminProfile) => {
    setDeleteConfirmation("")
    setDeleteTarget({
      kind: "profile",
      id: profile.id,
      label: profile.name,
      confirmation: profile.email,
    })
  }

  const refresh = () => {
    router.refresh()
  }

  const handleCompanySave = () => {
    startTransition(async () => {
      const result = await saveCompany(companyForm)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(companyForm.id ? "Empresa atualizada" : "Empresa criada")
      setCompanyDialogOpen(false)
      refresh()
    })
  }

  const handlePlanSave = () => {
    startTransition(async () => {
      const result = await savePlan(planForm)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(planForm.id ? "Plano atualizado" : "Plano criado")
      setPlanDialogOpen(false)
      refresh()
    })
  }

  const handleProfileSave = () => {
    startTransition(async () => {
      const result = await saveProfile(profileForm)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(profileForm.id ? "Usuário atualizado" : "Usuário criado")
      setProfileDialogOpen(false)
      refresh()
    })
  }

  const handlePasswordReset = () => {
    if (passwordForm.password.trim().length < 8) {
      toast.error("Senha deve ter no mínimo 8 caracteres")
      return
    }

    startTransition(async () => {
      const result = await setProfilePassword(passwordForm.profileId, passwordForm.password.trim())
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível redefinir a senha")
        return
      }
      toast.success("Senha redefinida com sucesso")
      setPasswordDialogOpen(false)
      setPasswordForm({ profileId: "", name: "", email: "", password: "" })
    })
  }

  const handleDelete = () => {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.confirmation) return

    startTransition(async () => {
      const result =
        deleteTarget.kind === "company"
          ? await deleteCompany(deleteTarget.id)
          : await deleteProfile(deleteTarget.id)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir")
        return
      }
      if (result.warning) toast.warning(result.warning)
      else toast.success(deleteTarget.kind === "company" ? "Empresa excluída" : "Usuário excluído")
      setDeleteTarget(null)
      setDeleteConfirmation("")
      refresh()
    })
  }

  const handleModuleActive = (module: AdminModule, active: boolean) => {
    startTransition(async () => {
      const result = await setModuleActive(module.id, active)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(active ? "Módulo ativado no sistema" : "Módulo inativado no sistema")
      refresh()
    })
  }

  const handleToggleCompanyModule = (companyId: string, module: AdminModule, enabled: boolean) => {
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id !== companyId) return c
        const nextModules = enabled
          ? [...c.moduleIds.filter((id) => id !== module.id), module.id]
          : c.moduleIds.filter((id) => id !== module.id)
        return { ...c, moduleIds: nextModules }
      })
    )

    startTransition(async () => {
      const result = await toggleCompanyModule(companyId, module.id, enabled)
      if (!result.ok) {
        toast.error(result.error ?? "Erro ao alterar módulo da empresa")
        refresh()
        return
      }
      const targetCompany = companies.find((c) => c.id === companyId)
      toast.success(
        enabled
          ? `Módulo "${module.label}" ativado para ${targetCompany?.name ?? "a empresa"}!`
          : `Módulo "${module.label}" desativado para ${targetCompany?.name ?? "a empresa"}.`
      )
      refresh()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SuperAdmin"
        description="Empresas, usuários, planos e módulos"
        icon={Shield}
        actions={<Button variant="brand" onClick={() => openCompany()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>}
      />

      <MetricGrid columns={4}>
        <MetricCard title="Empresas" value={data.companies.length} icon={Building2} tone="primary" hint={`${activeCompanies} ativas`} />
        <MetricCard title="Usuários" value={data.users.length} icon={Users} tone="info" hint="Perfis cadastrados" />
        <MetricCard title="MRR" value={monthlyRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} icon={DollarSign} tone="warning" hint="Planos ativos" />
        <MetricCard title="Módulos" value={data.modules.length} icon={Layers3} tone="success" hint={`${totalMembers.toLocaleString("pt-BR")} membros`} />
      </MetricGrid>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminTab)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">
            <Activity />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="companies">
            <Building2 />
            Empresas
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="plans">
            <DollarSign />
            Planos
          </TabsTrigger>
          <TabsTrigger value="modules">
            <Layers3 />
            Módulos
          </TabsTrigger>
          <TabsTrigger value="ai"><KeyRound />OpenRouter / IA</TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-0">
          {activeTab === "ai" && <OpenRouterPanel companies={data.companies} />}
        </TabsContent>

        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            {data.companies.slice(0, 6).map((company) => (
              <div key={company.id} className="surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{company.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {company.city}, {company.state} · {company.planName ?? "Sem plano"}
                    </p>
                  </div>
                  <Badge variant={company.active ? "default" : "secondary"}>{statusLabels[company.status]}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {company.moduleIds.slice(0, 6).map((moduleId) => {
                    const systemModule = data.modules.find((item) => item.id === moduleId)
                    return systemModule ? (
                      <Badge key={moduleId} variant="outline" className="text-xs">
                        {systemModule.label}
                      </Badge>
                    ) : null
                  })}
                  {company.moduleIds.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{company.moduleIds.length - 6}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="companies" className="mt-0 space-y-6">
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Empresas</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="pl-9 md:pl-9" />
                  </div>
                  <ViewModeToggle value={companyView} onChange={setCompanyView} />
                  <Button onClick={() => openCompany()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {companyView === "list" ? (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <p className="font-medium">{company.name}</p>
                        <p className="text-xs text-muted-foreground">{company.email || company.slug}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{company.planCode ? planLabels[company.planCode] ?? company.planName : "Sem plano"}</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCompanyIdForModules(company.id)
                            setActiveTab("modules")
                          }}
                          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          title="Clique para gerenciar módulos desta empresa"
                        >
                          <Layers3 className="h-3.5 w-3.5" />
                          {company.moduleIds.length} ativos
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={company.active ? "default" : "secondary"}>{statusLabels[company.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCompanyIdForModules(company.id)
                                setActiveTab("modules")
                              }}
                            >
                              <Layers3 className="mr-2 h-4 w-4" />
                              Módulos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCompany(company)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => openCompanyDelete(company)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredCompanies.map((company) => (
                    <div key={company.id} className="surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{company.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{company.email || company.slug}</p>
                        </div>
                        <Badge variant={company.active ? "default" : "secondary"}>{statusLabels[company.status]}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="outline">
                          {company.planCode ? planLabels[company.planCode] ?? company.planName : "Sem plano"}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCompanyIdForModules(company.id)
                            setActiveTab("modules")
                          }}
                          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Layers3 className="h-3 w-3" />
                          {company.moduleIds.length} módulos
                        </button>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {company.city || "Cidade não informada"}{company.state ? `, ${company.state}` : ""}
                      </p>
                      <div className="mt-4 flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          title="Gerenciar módulos da empresa"
                          onClick={() => {
                            setSelectedCompanyIdForModules(company.id)
                            setActiveTab("modules")
                          }}
                        >
                          <Layers3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar empresa" onClick={() => openCompany(company)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir empresa" onClick={() => openCompanyDelete(company)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-0 space-y-6">
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Usuários</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="pl-9 md:pl-9" />
                  </div>
                  <ViewModeToggle value={userView} onChange={setUserView} />
                  <Button onClick={() => openProfile()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Usuário
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {userView === "list" ? (
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{user.companyName ?? "Sistema"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabels[user.role]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.active ? "default" : "secondary"}>{user.active ? "Ativo" : "Inativo"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar usuário" onClick={() => openProfile(user)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Redefinir senha"
                            disabled={isPending}
                            onClick={() => openPasswordReset(user)}
                          >
                            <KeyRound className="h-4 w-4" />
                            <span className="sr-only">Redefinir senha</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="Excluir usuário"
                            disabled={isPending}
                            onClick={() => openProfileDelete(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir usuário</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        <Badge variant={user.active ? "default" : "secondary"}>{user.active ? "Ativo" : "Inativo"}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="outline">{roleLabels[user.role]}</Badge>
                        <span className="text-sm text-muted-foreground">{user.companyName ?? "Sistema"}</span>
                      </div>
                      <div className="mt-4 flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar usuário" onClick={() => openProfile(user)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir senha" disabled={isPending} onClick={() => openPasswordReset(user)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir usuário" disabled={isPending} onClick={() => openProfileDelete(user)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-0 space-y-6">
          <div className="flex justify-end gap-2">
            <ViewModeToggle value={planView} onChange={setPlanView} />
            <Button onClick={() => openPlan()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </div>
          {planView === "grid" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.plans.map((plan) => (
                <div key={plan.id} className="surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{plan.code}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPlan(plan)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    {plan.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {plan.moduleIds.slice(0, 7).map((moduleId) => {
                      const systemModule = data.modules.find((item) => item.id === moduleId)
                      return systemModule ? (
                        <Badge key={moduleId} variant="outline" className="text-xs">
                          {systemModule.label}
                        </Badge>
                      ) : null
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Cobrança</TableHead>
                  <TableHead>Módulos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <p className="font-medium">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">{plan.code}</p>
                    </TableCell>
                    <TableCell>{plan.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{billingCycleLabels[plan.billingCycle]}</TableCell>
                    <TableCell>{plan.moduleIds.length}</TableCell>
                    <TableCell><Badge variant={plan.active ? "default" : "secondary"}>{plan.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar plano" onClick={() => openPlan(plan)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="modules" className="mt-0 space-y-6">
          {/* Card 1: Gestão de Módulos por Empresa */}
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Módulos por Igreja / Empresa
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ative ou desative módulos individualmente para a igreja selecionada com efeito imediato no painel.
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <Select
                    value={selectedCompanyIdForModules}
                    onValueChange={(value) => {
                      if (value) setSelectedCompanyIdForModules(value)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.moduleIds.length} ativos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const targetCompany = companies.find((c) => c.id === selectedCompanyIdForModules) ?? companies[0]
                if (!targetCompany) {
                  return (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma empresa cadastrada.
                    </p>
                  )
                }

                return (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-muted/40 border border-border/50">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
                          {targetCompany.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{targetCompany.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Plano: <span className="font-medium text-foreground">{targetCompany.planName ?? "Sem plano"}</span>
                            {targetCompany.city ? ` · ${targetCompany.city}, ${targetCompany.state}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {targetCompany.moduleIds.length} de {data.modules.length} módulos ativos
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCompany(targetCompany)}
                          className="h-8 text-xs"
                        >
                          <Edit className="mr-1.5 h-3.5 w-3.5" />
                          Editar Dados
                        </Button>
                      </div>
                    </div>

                    {Object.entries(modulesByGroup).map(([group, groupModules]) => (
                      <div key={group} className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 px-1">
                          {group}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {groupModules.map((module) => {
                            const isEnabled = targetCompany.moduleIds.includes(module.id)
                            const isGlobalActive = module.active

                            return (
                              <div
                                key={module.id}
                                className={cn(
                                  "surface flex items-center justify-between gap-3 p-3.5 rounded-lg border transition-all",
                                  isEnabled
                                    ? "border-primary/40 bg-primary/5"
                                    : "border-border/60 opacity-80 hover:opacity-100",
                                  !isGlobalActive && "opacity-40 bg-muted/30"
                                )}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-sm truncate">{module.label}</p>
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                      {module.route}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    {module.description}
                                  </p>
                                  {!isGlobalActive && (
                                    <p className="mt-1 text-[11px] text-amber-500 font-medium">
                                      ⚠️ Inativo globalmente no sistema
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-1">
                                  <Switch
                                    checked={isEnabled}
                                    disabled={isPending || !isGlobalActive}
                                    onCheckedChange={(checked) =>
                                      handleToggleCompanyModule(targetCompany.id, module, checked)
                                    }
                                  />
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium",
                                      isEnabled ? "text-primary" : "text-muted-foreground"
                                    )}
                                  >
                                    {isEnabled ? "Ativo" : "Inativo"}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Card 2: Disponibilidade Global do Sistema */}
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-5 w-5 text-warning" />
                    Disponibilidade Global do Sistema (Plataforma)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Interruptores mestres: desative aqui apenas se quiser bloquear o módulo para toda a plataforma SaaS (ex: manutenção ou descontinuação).
                  </p>
                </div>
                <ViewModeToggle value={moduleView} onChange={setModuleView} />
              </div>
            </CardHeader>
            <CardContent>
              {moduleView === "grid" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.modules.map((module) => (
                    <div key={module.id} className="surface flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{module.label}</p>
                          <Badge variant="outline" className="text-xs">{module.route}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                      </div>
                      <Switch checked={module.active} onCheckedChange={(checked) => handleModuleActive(module, !!checked)} />
                    </div>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Rota</TableHead>
                      <TableHead className="w-24">Ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.modules.map((module) => (
                      <TableRow key={module.id}>
                        <TableCell>
                          <p className="font-medium">{module.label}</p>
                          <p className="text-xs text-muted-foreground">{module.description}</p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{module.menuGroup}</TableCell>
                        <TableCell><Badge variant="outline">{module.route}</Badge></TableCell>
                        <TableCell>
                          <Switch checked={module.active} onCheckedChange={(checked) => handleModuleActive(module, !!checked)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isPending) {
            setDeleteTarget(null)
            setDeleteConfirmation("")
          }
        }}
      >
        <DialogContent className="glass-strong">
          <DialogHeader>
            <DialogTitle>
              Excluir {deleteTarget?.kind === "company" ? "empresa" : "usuário"}?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "company"
                ? "Esta ação apaga permanentemente a empresa, seus usuários e todos os dados vinculados."
                : "Esta ação apaga permanentemente o perfil e impede novo acesso ao sistema."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="delete-confirmation">
              Digite <strong>{deleteTarget?.confirmation}</strong> para confirmar
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteConfirmation}
              autoComplete="off"
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && deleteConfirmation === deleteTarget?.confirmation) {
                  handleDelete()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending || !deleteTarget || deleteConfirmation !== deleteTarget.confirmation}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{companyForm.id ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
            <DialogDescription>Defina plano, status e módulos ativos.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Input value={companyForm.responsibleName} onChange={(event) => setCompanyForm({ ...companyForm, responsibleName: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input value={companyForm.email} onChange={(event) => setCompanyForm({ ...companyForm, email: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Endereço</Label>
              <Input value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="grid gap-2 sm:col-span-2">
                <Label>Cidade</Label>
                <Input value={companyForm.city} onChange={(event) => setCompanyForm({ ...companyForm, city: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>UF</Label>
                <Input value={companyForm.state} onChange={(event) => setCompanyForm({ ...companyForm, state: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={companyForm.status} onValueChange={(value) => setCompanyForm({ ...companyForm, status: value as CompanyStatus, active: value !== "blocked" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="blocked">Bloqueada</SelectItem>
                    <SelectItem value="test">Teste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Plano</Label>
              <Select
                value={companyForm.planId}
                onValueChange={(value) => {
                  if (!value) return
                  const selectedPlan = data.plans.find((plan) => plan.id === value)
                  setCompanyForm({ ...companyForm, planId: value, moduleIds: selectedPlan?.moduleIds ?? companyForm.moduleIds })
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {data.plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ModulesPicker
              modules={data.modules.filter((module) => module.active)}
              selectedIds={companyForm.moduleIds}
              onToggle={(moduleId) => setCompanyForm({ ...companyForm, moduleIds: toggleId(companyForm.moduleIds, moduleId) })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCompanySave} disabled={isPending} variant="brand">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{planForm.id ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>Escolha quais módulos entram no plano.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Nome *</Label>
                <Input value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Código *</Label>
                <Input value={planForm.code} onChange={(event) => setPlanForm({ ...planForm, code: event.target.value.toLowerCase() })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={planForm.description} onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Preço</Label>
                <Input type="number" min={0} step="0.01" value={planForm.price} onChange={(event) => setPlanForm({ ...planForm, price: Number(event.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Cobrança</Label>
                <Select value={planForm.billingCycle} onValueChange={(value) => setPlanForm({ ...planForm, billingCycle: value as BillingCycle })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Gratuito</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                    <SelectItem value="custom">Customizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label>Instâncias WhatsApp (Uazapi)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={planForm.uazapiInstanceLimit}
                onChange={(event) =>
                  setPlanForm({ ...planForm, uazapiInstanceLimit: Number(event.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                Limite de instâncias ativas que cada igreja deste plano pode conectar.
              </p>
            </div>
            <ModulesPicker
              modules={data.modules.filter((module) => module.active)}
              selectedIds={planForm.moduleIds}
              onToggle={(moduleId) => setPlanForm({ ...planForm, moduleIds: toggleId(planForm.moduleIds, moduleId) })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePlanSave} disabled={isPending} variant="brand">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{profileForm.id ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {profileForm.id
                ? "Atualize empresa, perfil e, se quiser, a senha de acesso."
                : "Defina empresa, perfil e a senha inicial de acesso."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>E-mail *</Label>
              <Input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="profile-password">{profileForm.id ? "Nova senha (opcional)" : "Senha *"}</Label>
              <Input
                id="profile-password"
                type="password"
                autoComplete="new-password"
                placeholder={profileForm.id ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
                value={profileForm.password}
                onChange={(event) => setProfileForm({ ...profileForm, password: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {profileForm.id
                  ? "Preencha apenas se quiser trocar a senha deste usuário."
                  : "O usuário poderá entrar com este e-mail e senha."}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Empresa</Label>
                <Select value={profileForm.companyId ?? "system"} onValueChange={(value) => setProfileForm({ ...profileForm, companyId: value === "system" ? null : value, cellIds: [] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    {data.companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select value={profileForm.role} onValueChange={(value) => setProfileForm({ ...profileForm, role: value as UserRole })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([role, label]) => (
                      <SelectItem key={role} value={role}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {profileForm.role === "cell_leader" ? (
              <div className="space-y-2 rounded-control border border-primary/20 bg-background/60 p-3">
                <Label>Células do líder *</Label>
                <p className="text-xs text-muted-foreground">Selecione uma ou mais células da igreja escolhida.</p>
                {profileForm.companyId ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.cells.filter((cell: AdminCellOption) => cell.companyId === profileForm.companyId).map((cell) => (
                    <label key={cell.id} className="flex items-center gap-2 rounded-control border p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={profileForm.cellIds.includes(cell.id)}
                          onChange={() => setProfileForm({ ...profileForm, cellIds: toggleId(profileForm.cellIds, cell.id) })}
                        />
                        {cell.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-destructive">Escolha uma igreja antes de selecionar células.</p>
                )}
              </div>
            ) : null}
            <div className="surface flex items-center justify-between p-3">
              <Label>Usuário ativo</Label>
              <Switch checked={profileForm.active} onCheckedChange={(checked) => setProfileForm({ ...profileForm, active: !!checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleProfileSave} disabled={isPending} variant="brand">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {passwordForm.name || "o usuário"}
              {passwordForm.email ? ` (${passwordForm.email})` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reset-password">Nova senha *</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                value={passwordForm.password}
                onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    handlePasswordReset()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePasswordReset} disabled={isPending} variant="brand">
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
