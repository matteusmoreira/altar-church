"use client"

import Link from "next/link"
import { CalendarDays, Clock, Compass, Home, LogIn } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChurchMobileBottomBarProps {
  slug: string
  activeTab: string
  onSelectTab: (tab: string) => void
}

function scrollToFeed() {
  const el = document.getElementById("portal-feed")
  if (el) {
    const y = el.getBoundingClientRect().top + window.scrollY - 70
    window.scrollTo({ top: y, behavior: "smooth" })
  }
}

export function ChurchMobileBottomBar({
  slug,
  activeTab,
  onSelectTab,
}: ChurchMobileBottomBarProps) {
  const items = [
    {
      id: "tudo",
      label: "Início",
      icon: Home,
      onClick: () => {
        onSelectTab("tudo")
        window.scrollTo({ top: 0, behavior: "smooth" })
      },
    },
    {
      id: "programacao",
      label: "Cultos",
      icon: Clock,
      onClick: () => {
        onSelectTab("programacao")
        scrollToFeed()
      },
    },
    {
      id: "celulas",
      label: "Células 3D",
      icon: Compass,
      isSpecial: true,
      href: `/church/${slug}/celulas`,
    },
    {
      id: "eventos",
      label: "Eventos",
      icon: CalendarDays,
      onClick: () => {
        onSelectTab("eventos")
        scrollToFeed()
      },
    },
    {
      id: "login",
      label: "Entrar",
      icon: LogIn,
      href: "/login",
    },
  ]

  return (
    <nav
      aria-label="Navegação móvel"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-border/60 bg-background/90 backdrop-blur-2xl px-2 py-1.5 safe-bottom transition-colors shadow-lg shadow-black/10"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all duration-200 active:scale-90",
                  item.isSpecial
                    ? "text-cyan-500 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-xl transition-all",
                    item.isSpecial &&
                      "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 ring-2 ring-cyan-500/25 animate-pulse"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] mt-1 tracking-tight">{item.label}</span>
              </Link>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all duration-200 active:scale-90",
                isActive
                  ? "text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-xl transition-all",
                  isActive && "bg-primary/15 text-primary"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] mt-1 tracking-tight">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
