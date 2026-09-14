"use client"

import Link from "next/link"
import { Church, LogIn, Share2 } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface ChurchPublicHeaderProps {
  churchName: string
  slug: string
}

export function ChurchPublicHeader({ churchName, slug }: ChurchPublicHeaderProps) {
  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    if (navigator.share) {
      try {
        await navigator.share({
          title: churchName,
          text: `Conheça a ${churchName} no Altar Church!`,
          url,
        })
      } catch {
        // usuário cancelou ou não suportado
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado para a área de transferência!")
    }
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl transition-colors duration-300">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href={`/church/${slug}`}
          className="flex items-center gap-2.5 transition-transform active:scale-95 focus:outline-none"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Church className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm sm:text-base leading-tight tracking-tight text-foreground line-clamp-1">
              {churchName}
            </span>
            <span className="text-[11px] text-muted-foreground leading-none hidden sm:inline">
              Portal Oficial
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            title="Compartilhar"
          >
            <Share2 className="h-4 w-4" />
            <span className="sr-only">Compartilhar portal</span>
          </Button>

          <ThemeToggle />

          <Link href="/login">
            <Button
              size="sm"
              className="h-9 rounded-full font-medium px-3 sm:px-4 text-xs sm:text-sm gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/25 transition-transform active:scale-95"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Acessar sistema</span>
              <span className="sm:hidden">Entrar</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
