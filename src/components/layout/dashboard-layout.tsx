"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import {
  Baby,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Church,
  ClipboardCheck,
  ClipboardList,
  Compass,
  DollarSign,
  ExternalLink,
  Gift,
  HandHeart,
  Handshake,
  Heart,
  KanbanSquare,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth/context"
import { dashboardRoutes, isDashboardRouteActive, type DashboardRouteId } from "@/lib/navigation/routes"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shared"
import { PwaInstallBanner, PwaInstallButton } from "@/components/pwa-install"
import { WhatsappPendingBanner } from "@/components/auth/whatsapp-pending-banner"

type NavigationItem = {
  href: string
  label: string
  icon: LucideIcon
  moduleId: DashboardRouteId
}

const navGroups: { label: string; items: NavigationItem[] }[] = [
  {
    label: "Início",
    items: [{ href: dashboardRoutes.dashboard, label: "Dashboard", icon: LayoutDashboard, moduleId: "dashboard" }],
  },
  {
    label: "Sobre a Igreja",
    items: [
      { href: dashboardRoutes["church-info"], label: "Informações", icon: Church, moduleId: "church-info" },
      { href: dashboardRoutes.ministries, label: "Ministérios", icon: Heart, moduleId: "ministries" },
      { href: dashboardRoutes.congregations, label: "Congregações", icon: Building2, moduleId: "congregations" },
    ],
  },
  {
    label: "Cuidar",
    items: [
      { href: dashboardRoutes.members, label: "Pessoas", icon: Users, moduleId: "members" },
      { href: dashboardRoutes.visitors, label: "Visitantes", icon: UsersRound, moduleId: "visitors" },
      { href: dashboardRoutes.volunteers, label: "Voluntariado", icon: Handshake, moduleId: "volunteers" },
      { href: dashboardRoutes.kids, label: "Kids", icon: Baby, moduleId: "kids" },
      { href: dashboardRoutes.cells, label: "Células", icon: Network, moduleId: "cells" },
      { href: dashboardRoutes.prayer, label: "Intercessão", icon: HandHeart, moduleId: "prayer" },
      { href: dashboardRoutes["reading-plans"], label: "Discipulado", icon: BookOpen, moduleId: "reading-plans" },
    ],
  },
  {
    label: "Comunicar",
    items: [
      { href: dashboardRoutes.events, label: "Eventos", icon: CalendarDays, moduleId: "events" },
      { href: dashboardRoutes.content, label: "Conteúdo", icon: Newspaper, moduleId: "content" },
      { href: dashboardRoutes.notifications, label: "Notificação", icon: Bell, moduleId: "notifications" },
      { href: dashboardRoutes.communication, label: "Comunicação", icon: MessageSquare, moduleId: "communication" },
    ],
  },
  {
    label: "Administrar",
    items: [
      { href: dashboardRoutes.attendance, label: "Presença", icon: ClipboardCheck, moduleId: "attendance" },
      { href: dashboardRoutes.crm, label: "CRM", icon: KanbanSquare, moduleId: "crm" },
      { href: dashboardRoutes.forms, label: "Formulários", icon: ClipboardList, moduleId: "forms" },
      { href: dashboardRoutes.finance, label: "Financeiro", icon: DollarSign, moduleId: "finance" },
      { href: dashboardRoutes.donations, label: "Doação", icon: Gift, moduleId: "donations" },
      { href: dashboardRoutes.reports, label: "Relatórios", icon: BarChart3, moduleId: "reports" },
      { href: dashboardRoutes.settings, label: "Configurações", icon: Settings, moduleId: "settings" },
    ],
  },
]

const mobileNavItems: NavigationItem[] = [
  { href: dashboardRoutes.volunteers, label: "Escala", icon: Handshake, moduleId: "volunteers" },
  { href: dashboardRoutes.dashboard, label: "Início", icon: LayoutDashboard, moduleId: "dashboard" },
  { href: dashboardRoutes.members, label: "Pessoas", icon: Users, moduleId: "members" },
  { href: dashboardRoutes.events, label: "Eventos", icon: CalendarDays, moduleId: "events" },
  { href: dashboardRoutes.cells, label: "Células", icon: Network, moduleId: "cells" },
  { href: dashboardRoutes.finance, label: "Financeiro", icon: DollarSign, moduleId: "finance" },
]

const allNavItems = navGroups.flatMap((group) => group.items)

function NavItem({
  item,
  isActive,
  collapsed,
  onClick,
  variant = "default",
}: {
  item: NavigationItem
  isActive: boolean
  collapsed?: boolean
  onClick?: () => void
  variant?: "default" | "accent"
}) {
  const activeAccent =
    variant === "accent" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"

  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group/nav focus-ring relative flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        collapsed && "justify-center px-2",
        isActive
          ? cn(activeAccent, "font-semibold")
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-current transition-opacity",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />
      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-current")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function SidebarContent({
  onNavClick,
  collapsed,
  onToggle,
  enabledModuleIds,
  churchName,
  churchSlug,
}: {
  onNavClick?: () => void
  collapsed?: boolean
  onToggle?: () => void
  enabledModuleIds: string[] | null
  churchName: string
  churchSlug?: string
}) {
  const pathname = usePathname()
  const { logout, hasRole, user } = useAuth()
  const canSeeModule = (moduleId: string) => {
    if (user?.role === "volunteer") {
      return ["dashboard", "volunteers"].includes(moduleId) && (enabledModuleIds === null || enabledModuleIds.includes(moduleId))
    }
    return hasRole(["superadmin"]) || enabledModuleIds === null || enabledModuleIds.includes(moduleId)
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel gradient-primary shadow-glow-sm">
          <Church className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">Altar Church</p>
            <p className="truncate text-xs text-muted-foreground">{churchName}</p>
          </div>
        )}
      </div>

      <Separator className="opacity-60" />

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        <nav className="flex flex-col gap-5">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => canSeeModule(item.moduleId))
            if (visibleItems.length === 0) return null

            return (
              <div key={group.label} className="space-y-0.5">
                {!collapsed && (
                  <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                    {group.label}
                  </p>
                )}
                {visibleItems.map((item) => (
                  <NavItem
                    key={item.href}
                    item={item}
                    collapsed={collapsed}
                    onClick={onNavClick}
                    isActive={isDashboardRouteActive(pathname, item.href)}
                  />
                ))}
              </div>
            )
          })}

          {hasRole(["superadmin"]) && (
            <div className="space-y-0.5">
              <Separator className="mb-3 opacity-60" />
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                  Administração
                </p>
              )}
              <NavItem
                item={{ href: dashboardRoutes.admin, label: "SuperAdmin", icon: Shield, moduleId: "admin" }}
                variant="accent"
                collapsed={collapsed}
                onClick={onNavClick}
                isActive={isDashboardRouteActive(pathname, dashboardRoutes.admin)}
              />
            </div>
          )}

          {churchSlug && (
            <div>
              <Separator className="mb-3 opacity-60" />
              <a
                href={`/church/${churchSlug}/celulas`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavClick}
                title={collapsed ? "Mapa 3D Células (Página Pública)" : undefined}
                className={cn(
                  "focus-ring group flex items-center gap-3 rounded-control border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2.5 text-sm font-medium transition-colors duration-200 hover:border-primary/50 hover:bg-primary/15",
                  collapsed && "justify-center px-2",
                )}
              >
                <Compass className="h-4 w-4 shrink-0 text-primary" />
                {!collapsed && (
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="truncate text-foreground transition-colors group-hover:text-primary">
                      Mapa 3D Células
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  </div>
                )}
              </a>
            </div>
          )}
        </nav>
      </div>

      <Separator className="opacity-60" />

      <div className={cn("p-3", collapsed ? "flex flex-col items-center" : "flex items-center justify-center")}>
        <div className={cn("flex items-center justify-center gap-2", collapsed && "flex-col gap-2")}>
          <PwaInstallButton
            iconOnly
            variant="ghost"
            className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          />
          <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-muted/60" />
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Sair da conta"
            aria-label="Sair da conta"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          {onToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-muted/60"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Topbar({ churchName, pageLabel }: { churchName: string; pageLabel?: string }) {
  const { user } = useAuth()

  return (
    <div className="hidden h-14 items-center justify-between gap-4 border-b border-border/50 px-6 glass lg:flex">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <Church className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate font-medium text-muted-foreground">{churchName}</span>
        {pageLabel && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <span className="truncate font-semibold">{pageLabel}</span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle className="text-muted-foreground hover:text-foreground hover:bg-muted/60" />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <div className="text-right">
          <p className="text-sm font-medium leading-none">{user?.name}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{user?.role}</p>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs gradient-primary text-white">{user?.name?.charAt(0)}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}

function RestrictedNotice({
  icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <EmptyState icon={icon} title={title} description={description} variant="card" className="w-full max-w-md" />
    </div>
  )
}

export function DashboardLayout({
  children,
  initialEnabledModuleIds,
  churchName = "Altar Church",
  churchSlug = "",
  whatsappPending = false,
}: {
  children: React.ReactNode
  initialEnabledModuleIds: string[] | null
  churchName?: string
  churchSlug?: string
  whatsappPending?: boolean
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [enabledModuleIds] = useState<string[] | null>(initialEnabledModuleIds)
  const pathname = usePathname()
  const { user, hasRole, isLoading } = useAuth()
  const isSuperAdmin = hasRole(["superadmin"])

  const currentItem = useMemo(
    () => allNavItems.find((item) => isDashboardRouteActive(pathname, item.href)),
    [pathname],
  )
  const currentModuleId = currentItem?.moduleId

  const moduleBlocked =
    !!currentModuleId &&
    !isSuperAdmin &&
    enabledModuleIds !== null &&
    !enabledModuleIds.includes(currentModuleId)
  const adminBlocked = isDashboardRouteActive(pathname, dashboardRoutes.admin) && !isSuperAdmin

  const visibleMobileItems = mobileNavItems.filter((item) => {
    if (user?.role === "volunteer") {
      return ["dashboard", "volunteers"].includes(item.moduleId) && (enabledModuleIds === null || enabledModuleIds.includes(item.moduleId))
    }
    return isSuperAdmin || enabledModuleIds === null || enabledModuleIds.includes(item.moduleId)
  })

  if (isLoading || !user) {
    return (
      <div className="flex h-screen overflow-hidden" aria-busy="true">
        <div className="hidden w-64 shrink-0 flex-col gap-3 border-r border-border/50 p-4 glass-strong lg:flex">
          <div className="flex items-center gap-3 pb-2">
            <Skeleton className="h-10 w-10 rounded-panel" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-control" />
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-8">
          <Skeleton className="h-9 w-56" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
        </div>
        <span className="sr-only">Carregando…</span>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:border-r lg:border-border/50 glass-strong transition-all duration-300",
          collapsed ? "lg:w-20" : "lg:w-64",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          enabledModuleIds={enabledModuleIds}
          churchName={churchName}
          churchSlug={churchSlug}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-border/50 px-4 glass lg:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Abrir menu" />}
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 glass-strong">
              <SidebarContent
                enabledModuleIds={enabledModuleIds}
                churchName={churchName}
                churchSlug={churchSlug}
                onNavClick={() => setSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control gradient-primary">
              <Church className="h-4 w-4 text-white" />
            </div>
            <span className="truncate text-sm font-semibold">{churchName}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
          </div>
        </header>

        <Topbar churchName={churchName} pageLabel={currentItem?.label} />

        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div className="mx-auto max-w-7xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 lg:p-8">
            <PwaInstallBanner className="mb-4" />
            <WhatsappPendingBanner pending={whatsappPending} />
            {adminBlocked ? (
              <RestrictedNotice
                icon={Shield}
                title="Acesso restrito"
                description="Esta área é exclusiva para SuperAdmin."
              />
            ) : moduleBlocked ? (
              <RestrictedNotice
                icon={Layers3}
                title="Módulo inativo"
                description="Este recurso não está ativo para esta empresa."
              />
            ) : (
              children
            )}
          </div>
        </main>

        <nav className="flex min-h-16 items-center justify-around border-t border-border/50 px-1 py-1.5 glass safe-bottom lg:hidden">
          {visibleMobileItems.map((item) => {
            const isActive = isDashboardRouteActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-2 py-1.5 text-[10px] font-medium transition-colors touch-manipulation",
                  isActive ? "text-primary" : "text-muted-foreground",
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
