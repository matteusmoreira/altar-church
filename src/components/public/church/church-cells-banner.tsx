"use client"

import Link from "next/link"
import { Compass, Sparkles, MapPin, ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

interface ChurchCellsBannerProps {
  slug: string
  churchName: string
}

export function ChurchCellsBanner({ slug, churchName }: ChurchCellsBannerProps) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-primary/10 to-background p-6 sm:p-8 md:p-10 shadow-xl shadow-cyan-500/5 transition-all hover:border-cyan-500/50">
      {/* Decorative Blur Circles */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 -z-0 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-12 -bottom-12 -z-0 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-3 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-3 py-1 text-xs font-bold text-cyan-600 dark:text-cyan-400">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            Experiência 3D Interativa
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Encontre uma Célula perto de você
          </h2>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            Explore as células da {churchName} espalhadas pela cidade em um mapa 3D imersivo. Encontre o grupo
            ideal por faixa etária, dia da semana e trace sua rota!
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground pt-1">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-cyan-500" />
              Geolocalização em tempo real
            </span>
            <span className="flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-primary" />
              Filtros por horário e idade
            </span>
          </div>
        </div>

        <Link
          href={`/church/${slug}/celulas`}
          className={buttonVariants({
            size: "lg",
            className:
              "relative overflow-hidden bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold shadow-lg shadow-cyan-500/25 h-12 px-6 rounded-2xl shrink-0 btn-shine active:scale-95 transition-transform",
          })}
        >
          <Compass className="mr-2 h-5 w-5" />
          Abrir Mapa 3D
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}
