"use client"

import { useState } from "react"
import {
  Calendar,
  Clock,
  Compass,
  MapPin,
  MessageCircle,
  Navigation,
  Share2,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PublicCellItem } from "@/lib/cells/public-cells"
import { toast } from "sonner"

export interface CellDetailSheetProps {
  cell: PublicCellItem | null
  onClose: () => void
  onTraceRoute: (cell: PublicCellItem) => void
  onOpenVisitModal: (cell: PublicCellItem) => void
  churchName: string
  churchSlug: string
  userDistanceKm?: number | null
}

export function CellDetailSheet({
  cell,
  onClose,
  onTraceRoute,
  onOpenVisitModal,
  churchName,
  churchSlug,
  userDistanceKm,
}: CellDetailSheetProps) {
  const [routeMenuOpen, setRouteMenuOpen] = useState(false)

  if (!cell) return null

  const leaderPhone = cell.leaderPhone
  const whatsappMessage = encodeURIComponent(
    `Olá${cell.leaderName ? ` ${cell.leaderName}` : ""}! Encontrei a célula "${cell.name}" no mapa da ${churchName} e gostaria de visitá-los!`
  )
  const whatsappUrl = leaderPhone ? `https://wa.me/55${leaderPhone}?text=${whatsappMessage}` : null

  // Native map URLs
  const encodedDest = cell.latitude && cell.longitude
    ? `${cell.latitude},${cell.longitude}`
    : encodeURIComponent(cell.displayAddress)

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}`
  const wazeUrl = cell.latitude && cell.longitude
    ? `https://waze.com/ul?ll=${cell.latitude},${cell.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodedDest}&navigate=yes`
  const appleMapsUrl = `https://maps.apple.com/?daddr=${encodedDest}`

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : `/church/${churchSlug}/celulas`
    const shareData = {
      title: `Célula ${cell.name} - ${churchName}`,
      text: `Venha conhecer a célula ${cell.name}! Encontros toda ${cell.meetingDay}${cell.meetingTime ? ` às ${cell.meetingTime}` : ""}.`,
      url: shareUrl,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // User cancelled
      }
    } else {
      navigator.clipboard.writeText(shareUrl)
      toast.success("Link da célula copiado para a área de transferência!")
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg animate-in slide-in-from-bottom duration-300 pointer-events-auto"
      data-testid="cell-detail-sheet"
    >
      <div className="relative mx-3 mb-3 rounded-2xl border border-border/80 bg-background/95 p-5 shadow-2xl backdrop-blur-xl">
        {/* Top Handle */}
        <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header Badges */}
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <Badge
            variant="outline"
            style={{
              borderColor: `${cell.categoryColor}66`,
              backgroundColor: `${cell.categoryColor}1a`,
              color: cell.categoryColor,
            }}
            className="font-semibold text-xs"
          >
            {cell.categoryName}
          </Badge>

          {cell.meetsToday && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs animate-pulse">
              🔥 Reunião Hoje!
            </Badge>
          )}

          {userDistanceKm !== null && userDistanceKm !== undefined && (
            <Badge variant="secondary" className="text-xs">
              <Compass className="mr-1 h-3 w-3 text-primary" />
              {userDistanceKm < 1 ? `${Math.round(userDistanceKm * 1000)}m de você` : `${userDistanceKm.toFixed(1)} km de você`}
            </Badge>
          )}
        </div>

        {/* Title & Description */}
        <div className="mt-2.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">{cell.name}</h2>
          {cell.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{cell.description}</p>
          )}
        </div>

        {/* Details Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Dia de Encontro</p>
              <p className="font-semibold text-foreground">{cell.meetingDay}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-muted-foreground text-[10px]">Horário</p>
              <p className="font-semibold text-foreground">{cell.meetingTime || "A combinar"}</p>
            </div>
          </div>

          <div className="col-span-2 flex items-start gap-2 pt-1 border-t border-border/40">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
              <MapPin className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1">
              <p className="text-muted-foreground text-[10px]">Localização</p>
              <p className="font-medium text-foreground text-xs leading-snug">{cell.displayAddress}</p>
            </div>
          </div>

          {cell.leaderName && (
            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-border/40">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-foreground">
                  {cell.leaderName.charAt(0)}
                </div>
                <span className="text-xs text-muted-foreground">Líder: <strong className="text-foreground">{cell.leaderName}</strong></span>
              </div>

              {(cell.minAge !== null || cell.maxAge !== null) && (
                <span className="text-[11px] text-muted-foreground">
                  Faixa: {cell.minAge && cell.maxAge ? `${cell.minAge} a ${cell.maxAge} anos` : cell.minAge ? `A partir de ${cell.minAge} anos` : `Até ${cell.maxAge} anos`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Traçar Rota Button */}
            <div className="relative">
              <Button
                type="button"
                className="w-full font-semibold shadow-md bg-cyan-600 hover:bg-cyan-700 text-white"
                onClick={() => {
                  onTraceRoute(cell)
                  setRouteMenuOpen(!routeMenuOpen)
                }}
              >
                <Navigation className="mr-1.5 h-4 w-4" />
                Traçar Rota
              </Button>

              {/* GPS Apps Dropdown Menu */}
              {routeMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-border bg-background p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 z-50">
                  <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Navegar com:
                  </p>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <span className="text-emerald-500 font-bold">🗺️</span> Google Maps
                  </a>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <span className="text-cyan-500 font-bold">🚗</span> Waze
                  </a>
                  <a
                    href={appleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <span className="text-indigo-500 font-bold">🍎</span> Apple Maps
                  </a>
                </div>
              )}
            </div>

            {/* Quero Visitar */}
            <Button
              type="button"
              variant="default"
              className="w-full font-semibold shadow-md"
              onClick={() => onOpenVisitModal(cell)}
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Quero Visitar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* WhatsApp Líder */}
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp do Líder
              </a>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onOpenVisitModal(cell)}
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                Contato
              </Button>
            )}

            {/* Compartilhar */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleShare}
            >
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              Compartilhar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
