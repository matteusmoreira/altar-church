"use client"

import Link from "next/link"
import {
  Church,
  Compass,
  Mail,
  MapPin,
  MapPinned,
  MessageCircle,
  Phone,
  Share2,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ContentBanner, PublicChurchData } from "@/lib/content/types"
import { toast } from "sonner"

interface ChurchHeroProps {
  church: PublicChurchData["church"]
  heroBanner?: ContentBanner
}

export function ChurchHero({ church, heroBanner }: ChurchHeroProps) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${church.address}, ${church.city} - ${church.state}`
  )}`

  const cleanPhone = church.phone?.replace(/\D/g, "") || ""
  const hasValidPhone = cleanPhone.length >= 10
  const whatsappUrl = hasValidPhone
    ? `https://wa.me/55${cleanPhone.startsWith("55") ? cleanPhone.slice(2) : cleanPhone}?text=${encodeURIComponent(
        `Olá! Vim pelo portal da ${church.publicName} e gostaria de mais informações.`
      )}`
    : null

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    if (navigator.share) {
      try {
        await navigator.share({
          title: church.publicName,
          text: `Conheça a comunidade ${church.publicName}!`,
          url,
        })
      } catch {
        // cancelado
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado para a área de transferência!")
    }
  }

  return (
    <section className="relative overflow-hidden border-b border-border/40 bg-gradient-to-b from-primary/10 via-background to-background py-10 sm:py-16 md:py-20 transition-colors">
      {/* Background Decorative Aurora Blurs with animations */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-full max-w-4xl -translate-x-1/2 rounded-full bg-primary/15 blur-3xl animate-aurora dark:bg-primary/20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 -left-32 -z-10 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl animate-float dark:bg-cyan-500/15"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
          {/* Main Church Identity Column */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-primary/10">
                <Church className="h-7 w-7 sm:h-8 sm:w-8" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> Comunidade Ativa
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {church.city ? `${church.city} - ${church.state}` : "Brasil"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15]">
                {church.publicName}
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                {church.history ||
                  "Uma comunidade acolhedora para servir, discipular e caminhar em comunhão na presença de Deus."}
              </p>
            </div>

            {/* Contact Badges */}
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm text-muted-foreground">
              {church.address && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 backdrop-blur hover:bg-accent/70 hover:text-foreground transition-colors"
                >
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[260px] sm:max-w-xs">
                    {church.address}, {church.city}
                  </span>
                </a>
              )}

              {hasValidPhone && (
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 backdrop-blur hover:bg-accent/70 hover:text-foreground transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{church.phone}</span>
                </a>
              )}

              {church.email && (
                <a
                  href={`mailto:${church.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5 backdrop-blur hover:bg-accent/70 hover:text-foreground transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate max-w-[200px] sm:max-w-xs">{church.email}</span>
                </a>
              )}
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 pt-2">
              <Link
                href={`/church/${church.slug}/celulas`}
                className={buttonVariants({
                  size: "lg",
                  className:
                    "relative overflow-hidden bg-gradient-to-r from-cyan-600 via-primary to-primary text-white font-bold shadow-lg shadow-primary/25 border-0 rounded-xl h-11 sm:h-12 px-5 text-sm sm:text-base btn-shine active:scale-[0.98] transition-all",
                })}
              >
                <Compass className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Mapa 3D de Células
              </Link>

              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className:
                      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-xl h-11 sm:h-12 px-4 text-sm font-semibold active:scale-[0.98] transition-all",
                  })}
                >
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  WhatsApp
                </a>
              )}

              {church.address && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: "secondary",
                    size: "lg",
                    className:
                      "border border-border/60 rounded-xl h-11 sm:h-12 px-4 text-sm font-medium active:scale-[0.98] transition-all",
                  })}
                >
                  <MapPinned className="mr-2 h-4 w-4 text-primary" />
                  Como chegar
                </a>
              )}

              <Button
                variant="ghost"
                size="lg"
                onClick={handleShare}
                className="rounded-xl h-11 sm:h-12 px-3 sm:px-4 text-sm font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all"
              >
                <Share2 className="mr-1.5 h-4 w-4" />
                Compartilhar
              </Button>
            </div>
          </div>

          {/* Side Floating Announcement / Hero Banner Card */}
          <div className="relative">
            <Card className="overflow-hidden border-border/70 bg-card/80 backdrop-blur-xl shadow-xl transition-all hover:shadow-2xl">
              {heroBanner?.imageUrl && (
                <div className="relative h-44 w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroBanner.imageUrl}
                    alt={heroBanner.title}
                    className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <Badge className="absolute bottom-3 left-3 bg-primary text-primary-foreground">
                    Destaque
                  </Badge>
                </div>
              )}

              <CardHeader className="space-y-2 pb-3">
                {!heroBanner?.imageUrl && (
                  <Badge variant="outline" className="w-fit border-primary/40 text-primary bg-primary/5">
                    {heroBanner ? "Aviso em Destaque" : "Bem-vindo"}
                  </Badge>
                )}
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                  {heroBanner?.title ?? "Portal Oficial da Igreja"}
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Acompanhe os cultos, encontre sua célula pelo mapa 3D imersivo, inscreva-se em eventos e
                  faça parte dos ministérios conectados à vida da igreja.
                </p>

                {heroBanner?.linkUrl && (
                  <Link
                    href={heroBanner.linkUrl}
                    className={buttonVariants({
                      variant: "default",
                      className: "w-full rounded-xl font-medium h-10 shadow-sm",
                    })}
                  >
                    Ver detalhes do destaque
                  </Link>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
