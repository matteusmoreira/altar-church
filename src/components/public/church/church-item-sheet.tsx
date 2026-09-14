"use client"

import {
  CalendarDays,
  Clock,
  ExternalLink,
  Heart,
  MapPin,
  Share2,
  User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ContentPost, PublicChurchData } from "@/lib/content/types"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"

export type SelectedItem =
  | { type: "event"; data: PublicChurchData["events"][number] }
  | { type: "post"; data: ContentPost }
  | { type: "ministry"; data: PublicChurchData["ministries"][number] }
  | { type: "programming"; data: PublicChurchData["programmings"][number] }
  | null

interface ChurchItemSheetProps {
  item: SelectedItem
  onClose: () => void
}

function formatFullDateTime(value: string) {
  try {
    return format(parseISO(value), "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
  } catch {
    return value
  }
}

function formatDate(value: string | null) {
  if (!value) return ""
  try {
    return format(parseISO(value), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  } catch {
    return value
  }
}

export function ChurchItemSheet({ item, onClose }: ChurchItemSheetProps) {
  if (!item) return null

  const handleShareItem = async (title: string, text: string) => {
    const url = typeof window !== "undefined" ? window.location.href : ""
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // usuário cancelou
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${title} - ${url}`)
      toast.success("Link copiado com sucesso!")
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl">
        {/* EVENT ITEM */}
        {item.type === "event" && (
          <div className="flex flex-col max-h-[85vh]">
            <div className="p-6 bg-gradient-to-br from-primary/15 via-primary/5 to-card border-b border-border/50">
              <div className="flex items-center justify-between gap-3 mb-3">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-semibold">
                  {item.data.type || "Evento"}
                </Badge>
                {item.data.registrationEnabled && (
                  <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium">
                    Inscrições Abertas
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                {item.data.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detalhes do evento {item.data.title}
              </DialogDescription>
              <div className="flex items-center gap-2 mt-3 text-xs sm:text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                <span className="capitalize">{formatFullDateTime(item.data.startsAt)}</span>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {item.data.location && (
                <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/40 p-3.5 text-sm">
                  <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Local</p>
                    <p className="text-muted-foreground">{item.data.location}</p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.data.location)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-primary hover:underline self-center shrink-0"
                  >
                    Ver mapa
                  </a>
                </div>
              )}

              {item.data.isOnline && item.data.onlineLink && (
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 p-3.5 text-sm">
                  <span className="font-medium text-foreground">Transmissão Online</span>
                  <a
                    href={item.data.onlineLink}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ size: "sm", className: "gap-1.5 rounded-lg" })}
                  >
                    Assistir
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</p>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {item.data.description || "Nenhuma descrição adicional informada para este evento."}
                </p>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShareItem(item.data.title, item.data.description)}
                  className="rounded-xl gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </Button>

                <Button variant="secondary" size="sm" onClick={onClose} className="rounded-xl">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* POST / NOTÍCIA / DEVOCIONAL */}
        {item.type === "post" && (
          <div className="flex flex-col max-h-[85vh]">
            {item.data.coverImageUrl && (
              <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.data.coverImageUrl}
                  alt={item.data.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <Badge className="absolute bottom-3 left-3 bg-primary text-primary-foreground">
                  {item.data.categoryName || item.data.type}
                </Badge>
              </div>
            )}

            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                {!item.data.coverImageUrl && (
                  <Badge variant="outline" className="mb-2 text-primary border-primary/30">
                    {item.data.categoryName || item.data.type}
                  </Badge>
                )}
                <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {item.data.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Publicação {item.data.title}
                </DialogDescription>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {item.data.publishedAt && <span>{formatDate(item.data.publishedAt)}</span>}
                  {item.data.authorName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.data.authorName}
                    </span>
                  )}
                </div>
              </div>

              {item.data.summary && (
                <p className="text-sm font-medium text-foreground italic border-l-2 border-primary pl-3 py-0.5">
                  {item.data.summary}
                </p>
              )}

              <div className="text-sm leading-relaxed text-foreground whitespace-pre-line pt-2">
                {item.data.content}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShareItem(item.data.title, item.data.summary || item.data.title)}
                  className="rounded-xl gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </Button>

                <Button variant="secondary" size="sm" onClick={onClose} className="rounded-xl">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* MINISTÉRIO */}
        {item.type === "ministry" && (
          <div className="flex flex-col max-h-[85vh]">
            <div className="p-6 bg-gradient-to-br from-primary/15 via-card to-card border-b border-border/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
                <Heart className="h-6 w-6" />
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                {item.data.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detalhes do ministério {item.data.name}
              </DialogDescription>
              {item.data.leaderName && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Liderança: <span className="font-semibold text-foreground">{item.data.leaderName}</span>
                </p>
              )}
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sobre o Ministério</p>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {item.data.description || "Nenhuma descrição informada para este ministério."}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">Deseja participar ou servir?</p>
                <p>Procure a liderança deste ministério nos cultos ou fale com a nossa secretaria.</p>
              </div>

              <div className="pt-4 flex items-center justify-end">
                <Button variant="secondary" size="sm" onClick={onClose} className="rounded-xl">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* PROGRAMAÇÃO / CULTO */}
        {item.type === "programming" && (
          <div className="flex flex-col max-h-[85vh]">
            <div className="p-6 bg-gradient-to-br from-primary/15 via-card to-card border-b border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-primary border-primary/30">
                  Culto & Programação
                </Badge>
                {item.data.isLive && (
                  <Badge className="bg-red-500 hover:bg-red-600 text-white animate-pulse">
                    Ao Vivo
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
                {item.data.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detalhes da programação {item.data.title}
              </DialogDescription>
              {item.data.startsAt && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{formatDate(item.data.startsAt)}</span>
                </div>
              )}
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhes</p>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {item.data.description || "Participe conosco deste momento de louvor, oração e palavra."}
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end">
                <Button variant="secondary" size="sm" onClick={onClose} className="rounded-xl">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
