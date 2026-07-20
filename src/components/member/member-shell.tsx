"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Baby, Church, HeartHandshake, Home, LogOut, Network } from "lucide-react"
import { signOutMember } from "@/lib/member/actions"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { PwaInstallBanner, PwaInstallButton } from "@/components/pwa-install"
import { Button } from "@/components/ui/button"

const navigation = [
  { href: "/membro", label: "Início", icon: Home },
  { href: "/membro/celulas", label: "Células", icon: Network },
  { href: "/membro/ministerios", label: "Ministérios", icon: HeartHandshake },
  { href: "/membro/kids", label: "Kids", icon: Baby },
]

export function MemberShell({
  children,
  memberName,
  churchName,
}: {
  children: React.ReactNode
  memberName: string
  churchName: string
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await signOutMember()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-72 bg-[radial-gradient(circle_at_18%_0%,oklch(0.65_0.18_250/0.18),transparent_48%),radial-gradient(circle_at_88%_12%,oklch(0.7_0.13_205/0.12),transparent_42%)]" />
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl gradient-primary shadow-glow-sm">
            <Church className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{churchName}</p>
            <p className="truncate text-xs text-muted-foreground">Portal do Membro · {memberName}</p>
          </div>
          <PwaInstallButton iconOnly variant="ghost" />
          <ThemeToggle />
          <Button type="button" variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-10 lg:pt-8">
        <PwaInstallBanner className="mb-5" />
        {children}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border/50 bg-background/88 px-2 py-2 backdrop-blur-2xl lg:hidden" aria-label="Navegação do Portal do Membro">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navigation.map((item) => {
            const active = item.href === "/membro" ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <nav className="fixed left-1/2 top-[4.35rem] z-30 hidden -translate-x-1/2 rounded-2xl border border-border/50 bg-background/82 p-1.5 shadow-lg backdrop-blur-2xl lg:flex" aria-label="Navegação do Portal do Membro">
        {navigation.map((item) => {
          const active = item.href === "/membro" ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
