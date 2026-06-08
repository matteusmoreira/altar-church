"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Church,
  ClipboardCheck,
  DollarSign,
  Gift,
  HandHeart,
  Heart,
  Home,
  KanbanSquare,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Music,
  Network,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Settings,
  Shield,
  Users,
  UsersRound,
} from "lucide-react"
import { useAuth } from "@/lib/auth/context"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"

const navGroups = [
  {
    label: "Início",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, moduleId: "dashboard" }],
  },
  {
    label: "Sobre a Igreja",
    items: [
      { href: "/church-info", label: "Informações", icon: Church, moduleId: "church-info" },
      { href: "/ministries", label: "Ministérios", icon: Heart, moduleId: "ministries" },
      { href: "/programming", label: "Programação", icon: CalendarDays, moduleId: "programming" },
      { href: "/songs", label: "Louvor", icon: Music, moduleId: "songs" },
      { href: "/congregations", label: "Congregações", icon: Building2, moduleId: "congregations" },
    ],
  },
  {
    label: "Cuidar",
    items: [
      { href: "/members", label: "Pessoas", icon: Users, moduleId: "members" },
      { href: "/visitors", label: "Visitantes", icon: UsersRound, moduleId: "visitors" },
      { href: "/groups", label: "GCEUs", icon: Home, moduleId: "groups" },
      { href: "/cells", label: "Células", icon: Network, moduleId: "cells" },
      { href: "/prayer", label: "Intercessão", icon: HandHeart, moduleId: "prayer" },
      { href: "/reading-plans", label: "Discipulado", icon: BookOpen, moduleId: "reading-plans" },
    ],
  },
  {
    label: "Comunicar",
    items: [
      { href: "/events", label: "Eventos", icon: CalendarDays, moduleId: "events" },
      { href: "/content", label: "Conteúdo", icon: Newspaper, moduleId: "content" },
      { href: "/notifications", label: "Notificação", icon: Bell, moduleId: "notifications" },
      { href: "/communication", label: "Comunicação", icon: MessageSquare, moduleId: "communication" },
      { href: "/inpeace-play", label: "InPeace Play", icon: Play, moduleId: "inpeace-play" },
    ],
  },
  {
    label: "Administrar",
    items: [
      { href: "/attendance", label: "Presença", icon: ClipboardCheck, moduleId: "attendance" },
      { href: "/crm", label: "CRM", icon: KanbanSquare, moduleId: "crm" },
      { href: "/finance", label: "Financeiro", icon: DollarSign, moduleId: "finance" },
      { href: "/donations", label: "Doação", icon: Gift, moduleId: "donations" },
      { href: "/reports", label: "Relatórios", icon: BarChart3, moduleId: "reports" },
      { href: "/settings", label: "Configurações", icon: Settings, moduleId: "settings" },
    ],
  },
]

const mobileNavItems = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard, moduleId: "dashboard" },
  { href: "/members", label: "Pessoas", icon: Users, moduleId: "members" },
  { href: "/events", label: "Eventos", icon: CalendarDays, moduleId: "events" },
  { href: "/groups", label: "GCEUs", icon: Home, moduleId: "groups" },
  { href: "/finance", label: "Financeiro", icon: DollarSign, moduleId: "finance" },
]

function SidebarContent({
  onNavClick,
  collapsed,
  onToggle,
  enabledModuleIds,
}: {
  onNavClick?: () => void
  collapsed?: boolean
  onToggle?: () => void
  enabledModuleIds: string[] | null
}) {
  const pathname = usePathname()
  const { logout, hasRole } = useAuth()
  const canSeeModule = (moduleId: string) => hasRole(["superadmin"]) || enabledModuleIds === null || enabledModuleIds.includes(moduleId)

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-primary shadow-glow-sm">
          <Church className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-tight">Altar Church</h1>
            <p className="truncate text-xs text-muted-foreground">Igreja Batista Central</p>
          </div>
        )}
      </div>

      <Separator className="opacity-50" />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        <nav className="flex flex-col gap-4">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => canSeeModule(item.moduleId))
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label} className="space-y-1">
                {!collapsed && (
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                )}
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavClick}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        collapsed && "justify-center px-2",
                        isActive
                          ? "bg-primary/10 text-primary shadow-glow-sm dark:bg-primary/15"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            )
          })}

          {hasRole(["superadmin"]) && (
            <div className="space-y-1">
              <Separator className="opacity-50" />
              {!collapsed && (
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Administração
                </p>
              )}
              <Link
                href="/admin"
                onClick={onNavClick}
                title={collapsed ? "SuperAdmin" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  collapsed && "justify-center px-2",
                  pathname.startsWith("/admin")
                    ? "bg-warning/10 text-warning"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Shield className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">SuperAdmin</span>}
              </Link>
            </div>
          )}
        </nav>
      </div>

      <Separator className="opacity-50" />

      <div className={cn("flex items-center gap-1 p-4", collapsed ? "flex-col" : "justify-between")}>
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={logout} className="h-9 w-9">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        {onToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn("h-9 w-9 shrink-0", collapsed && "mt-2")}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  )
}

function Topbar() {
  const { user } = useAuth()

  return (
    <div className="hidden h-14 items-center justify-between border-b border-border/50 px-6 glass lg:flex">
      <div className="flex items-center gap-2">
        <Church className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-muted-foreground">Igreja Batista Central</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium leading-none">{user?.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs gradient-primary text-white">{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}

export function DashboardLayout({
  children,
  initialEnabledModuleIds,
}: {
  children: React.ReactNode
  initialEnabledModuleIds: string[] | null
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [enabledModuleIds] = useState<string[] | null>(initialEnabledModuleIds)
  const pathname = usePathname()
  const { user, hasRole, isLoading } = useAuth()
  const isSuperAdmin = hasRole(["superadmin"])

  const currentModuleId = useMemo(() => {
    return navGroups
      .flatMap((group) => group.items)
      .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"))?.moduleId
  }, [pathname])

  const moduleBlocked =
    !!currentModuleId &&
    !isSuperAdmin &&
    enabledModuleIds !== null &&
    !enabledModuleIds.includes(currentModuleId)
  const adminBlocked = pathname.startsWith("/admin") && !isSuperAdmin

  const visibleMobileItems = mobileNavItems.filter(
    (item) => isSuperAdmin || enabledModuleIds === null || enabledModuleIds.includes(item.moduleId)
  )

  if (isLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:border-r lg:border-border/50 glass-strong transition-all duration-300",
          collapsed ? "lg:w-20" : "lg:w-64"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          enabledModuleIds={enabledModuleIds}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-border/50 px-4 glass lg:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="h-9 w-9" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 glass-strong">
              <SidebarContent enabledModuleIds={enabledModuleIds} onNavClick={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary">
              <Church className="h-4 w-4 text-white" />
            </div>
            <span className="truncate font-bold">Altar Church</span>
          </div>
          <div className="ml-auto shrink-0">
            <ThemeToggle />
          </div>
        </header>

        <Topbar />

        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
            {adminBlocked ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="max-w-md rounded-lg border border-border/40 p-6 text-center">
                  <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-semibold">Acesso restrito</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Esta área é exclusiva para SuperAdmin.
                  </p>
                </div>
              </div>
            ) : moduleBlocked ? (
              <div className="flex min-h-[55vh] items-center justify-center">
                <div className="max-w-md rounded-lg border border-border/40 p-6 text-center">
                  <Layers3 className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-semibold">Módulo inativo</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Este recurso não está ativo para esta empresa.
                  </p>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>

        <nav className="flex items-center justify-around border-t border-border/50 px-1 py-1.5 glass safe-bottom lg:hidden">
          {visibleMobileItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_6px_currentColor]")} />
                <span className="max-w-[56px] truncate">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
