"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  Building2,
  Check,
  DollarSign,
  Edit,
  KeyRound,
  Layers3,
  MoreVertical,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { saveCompany, savePlan, saveProfile, setModuleActive, setProfilePassword } from "@/lib/admin/actions"
import type {
  AdminCompany,
  AdminDashboardData,
  AdminModule,
  AdminPlan,
  AdminProfile,
  BillingCycle,
  CompanyStatus,
} from "@/lib/admin/types"
import type { UserRole } from "@/lib/types"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type AdminTab = "overview" | "companies" | "users" | "plans" | "modules"

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
  reader: "Leitor",
  guardian: "Responsável",
}

const statusLabels: Record<CompanyStatus, string> = {
  active: "Ativa",
  blocked: "Bloqueada",
  test: "Teste",
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
    role: "reader",
    active: true,
    password: "",
  }
}

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id]
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
                  className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border/40 p-3 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{module.label}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{module.description}</p>
                  </div>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60">
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
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyForm>(() => emptyCompanyForm(initialData.plans))
  const [planForm, setPlanForm] = useState<PlanForm>(() => emptyPlanForm())
  const [profileForm, setProfileForm] = useState<ProfileForm>(() => emptyProfileForm(initialData.companies))
  const [passwordForm, setPasswordForm] = useState<PasswordResetForm>({
    profileId: "",
    name: "",
    email: "",
    password: "",
  })

  const activeCompanies = data.companies.filter((company) => company.active).length
  const totalMembers = data.companies.reduce((sum, company) => sum + company.memberCount, 0)
  const monthlyRevenue = data.companies.reduce((sum, company) => {
    const plan = data.plans.find((item) => item.id === company.planId)
    return sum + (company.active ? plan?.price ?? 0 : 0)
  }, 0)

  const filteredCompanies = data.companies.filter((company) => {
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

  const handleModuleActive = (module: AdminModule, active: boolean) => {
    startTransition(async () => {
      const result = await setModuleActive(module.id, active)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(active ? "Módulo ativado" : "Módulo inativado")
      refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10">
            <Shield className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">SuperAdmin</h1>
            <p className="text-muted-foreground">Empresas, usuários, planos e módulos</p>
          </div>
        </div>
        <Button onClick={() => openCompany()} className="gradient-primary">
          <Plus className="mr-2 h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Empresas</p>
                <p className="text-2xl font-bold">{data.companies.length}</p>
                <p className="text-xs text-success">{activeCompanies} ativas</p>
              </div>
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Usuários</p>
                <p className="text-2xl font-bold">{data.users.length}</p>
                <p className="text-xs text-muted-foreground">Perfis cadastrados</p>
              </div>
              <Users className="h-8 w-8 text-info" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">MRR</p>
                <p className="text-2xl font-bold">
                  {monthlyRevenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
                <p className="text-xs text-muted-foreground">Planos ativos</p>
              </div>
              <DollarSign className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Módulos</p>
                <p className="text-2xl font-bold">{data.modules.length}</p>
                <p className="text-xs text-muted-foreground">{totalMembers.toLocaleString("pt-BR")} membros</p>
              </div>
              <Layers3 className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AdminTab)} className="space-y-4">
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
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {data.companies.slice(0, 6).map((company) => (
              <div key={company.id} className="rounded-lg border border-border/40 p-4">
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

        <TabsContent value="companies" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Empresas</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." className="pl-9 md:pl-9" />
                  </div>
                  <Button onClick={() => openCompany()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                      <TableCell className="text-sm text-muted-foreground">{company.moduleIds.length} ativos</TableCell>
                      <TableCell>
                        <Badge variant={company.active ? "default" : "secondary"}>{statusLabels[company.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openCompany(company)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Usuários</CardTitle>
                <Button onClick={() => openProfile()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              </div>
            </CardHeader>
            <CardContent>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openPlan()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.plans.map((plan) => (
              <div key={plan.id} className="rounded-lg border border-border/40 p-4">
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
        </TabsContent>

        <TabsContent value="modules" className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Módulos do sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {data.modules.map((module) => (
                  <div key={module.id} className="flex items-center justify-between gap-4 rounded-lg border border-border/40 p-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
            <Button onClick={handleCompanySave} disabled={isPending} className="gradient-primary">Salvar</Button>
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
            <ModulesPicker
              modules={data.modules.filter((module) => module.active)}
              selectedIds={planForm.moduleIds}
              onToggle={(moduleId) => setPlanForm({ ...planForm, moduleIds: toggleId(planForm.moduleIds, moduleId) })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handlePlanSave} disabled={isPending} className="gradient-primary">Salvar</Button>
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
                <Select value={profileForm.companyId ?? "system"} onValueChange={(value) => setProfileForm({ ...profileForm, companyId: value === "system" ? null : value })}>
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
            <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
              <Label>Usuário ativo</Label>
              <Switch checked={profileForm.active} onCheckedChange={(checked) => setProfileForm({ ...profileForm, active: !!checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleProfileSave} disabled={isPending} className="gradient-primary">Salvar</Button>
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
            <Button onClick={handlePasswordReset} disabled={isPending} className="gradient-primary">
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
