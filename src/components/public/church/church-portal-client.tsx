"use client"

import { useState, useTransition } from "react"
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Church,
  Clock,
  Compass,
  Heart,
  MapPin,
  Newspaper,
  Radio,
  Search,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ContentPost, PublicChurchData } from "@/lib/content/types"
import { ChurchHero } from "./church-hero"
import { ChurchCellsBanner } from "./church-cells-banner"
import { ChurchItemSheet, type SelectedItem } from "./church-item-sheet"
import { ChurchMobileBottomBar } from "./church-mobile-bottom-bar"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { cn } from "@/lib/utils"

interface ChurchPortalClientProps {
  data: PublicChurchData
  initialTab?: string
}

function formatDate(value: string | null) {
  if (!value) return ""
  try {
    return format(parseISO(value), "dd 'de' MMMM", { locale: ptBR })
  } catch {
    return value
  }
}

function formatDayAndMonth(value: string) {
  try {
    const date = parseISO(value)
    return {
      day: format(date, "dd"),
      month: format(date, "MMM", { locale: ptBR }).replace(".", "").toUpperCase(),
      time: format(date, "HH:mm"),
    }
  } catch {
    return { day: "--", month: "---", time: "--:--" }
  }
}

function postTypeLabel(post: ContentPost) {
  const labels: Record<ContentPost["type"], string> = {
    news: "Notícia",
    devotional: "Devocional",
    ebd: "EBD",
    publication: "Publicação",
  }
  return labels[post.type] || post.type
}

const VALID_TABS = [
  "tudo",
  "programacao",
  "eventos",
  "celulas",
  "ministerios",
  "conteudo",
  "congregacoes",
]

export function ChurchPortalClient({ data, initialTab = "tudo" }: ChurchPortalClientProps) {
  const [activeTab, setActiveTab] = useState<string>(
    VALID_TABS.includes(initialTab) ? initialTab : "tudo"
  )
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null)
  const [, startTransition] = useTransition()

  // Sync activeTab with URL without reload
  const handleSelectTab = (tabId: string) => {
    startTransition(() => {
      setActiveTab(tabId)
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href)
        if (tabId === "tudo") {
          url.searchParams.delete("tab")
        } else {
          url.searchParams.set("tab", tabId)
        }
        window.history.replaceState({}, "", url.toString())
      }
    })
  }

  const { church, posts, programmings, events, ministries, congregations, banners } = data
  const heroBanner = banners[0]

  // Filtered lists if search query is active
  const q = searchQuery.toLowerCase().trim()

  const filteredProgrammings = programmings.filter(
    (p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  )

  const filteredEvents = events.filter(
    (e) =>
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q)
  )

  const filteredPosts = posts.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q)
  )

  const filteredMinistries = ministries.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      (m.leaderName && m.leaderName.toLowerCase().includes(q))
  )

  const filteredCongregations = congregations.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.responsible.toLowerCase().includes(q)
  )

  const hasAnyResults =
    filteredProgrammings.length > 0 ||
    filteredEvents.length > 0 ||
    filteredPosts.length > 0 ||
    filteredMinistries.length > 0 ||
    filteredCongregations.length > 0

  const categories = [
    { id: "tudo", label: "Tudo", count: undefined },
    { id: "programacao", label: "Cultos", count: programmings.length },
    { id: "eventos", label: "Eventos", count: events.length },
    { id: "celulas", label: "Células 3D", count: undefined, isHighlight: true },
    { id: "ministerios", label: "Ministérios", count: ministries.length },
    { id: "conteudo", label: "Notícias", count: posts.length },
    { id: "congregacoes", label: "Congregações", count: congregations.length },
  ]

  return (
    <div className="pb-24 md:pb-12">
      {/* Dynamic Hero with Glassmorphism & Aurora Gradient */}
      <ChurchHero church={church} heroBanner={heroBanner} />

      {/* Main Content Area */}
      <main id="portal-feed" className="mx-auto max-w-6xl space-y-10 px-4 sm:px-6 pt-8 sm:pt-12">
        {/* Interactive Category Tabs Bar & Search */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Category Navigation Pills (Horizontally Scrollable) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              {categories.map((cat) => {
                const isActive = activeTab === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectTab(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 shrink-0 focus:outline-none",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-2 ring-primary/20"
                        : cat.isHighlight
                          ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                    )}
                  >
                    {cat.isHighlight && <Compass className="h-3.5 w-3.5 text-cyan-500" />}
                    <span>{cat.label}</span>
                    {typeof cat.count === "number" && cat.count > 0 && (
                      <span
                        className={cn(
                          "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                          isActive
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        )}
                      >
                        {cat.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Quick Search Input */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar no portal..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-14 h-9 rounded-full bg-muted/40 border-border/60 text-xs sm:text-sm focus-visible:ring-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Global Search Empty State */}
        {q && !hasAnyResults && (
          <Card className="border-dashed border-border/70 bg-card/40 backdrop-blur text-center py-12 animate-fade-up">
            <CardContent className="space-y-3">
              <Search className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <h3 className="text-lg font-bold text-foreground">
                Nenhum resultado encontrado para &ldquo;{searchQuery}&rdquo;
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                Tente verificar a ortografia ou buscar por outros termos como culto, jovens, oração, etc.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="rounded-full mt-2"
              >
                Limpar busca
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ============================================================ */}
        {/* TAB: CÉLULAS 3D (OR TUDO) */}
        {/* ============================================================ */}
        {(!q || hasAnyResults) && (activeTab === "tudo" || activeTab === "celulas") && (
          <div className="animate-fade-up">
            <ChurchCellsBanner slug={church.slug} churchName={church.publicName} />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB: CULTOS & PROGRAMAÇÃO */}
        {/* ============================================================ */}
        {(!q || filteredProgrammings.length > 0) &&
          (activeTab === "tudo" || activeTab === "programacao") && (
            <section className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Cultos & Programação</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Horários e encontros semanais da comunidade
                    </p>
                  </div>
                </div>

                {activeTab === "tudo" && programmings.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectTab("programacao")}
                    className="text-xs font-semibold text-primary hover:text-primary/90"
                  >
                    Ver todos ({programmings.length})
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {filteredProgrammings.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProgrammings
                    .slice(0, activeTab === "tudo" ? 4 : undefined)
                    .map((programming) => (
                      <Card
                        key={programming.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem({ type: "programming", data: programming })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedItem({ type: "programming", data: programming })
                          }
                        }}
                        className="group cursor-pointer border-border/70 bg-card/70 backdrop-blur hover:bg-accent/40 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                                <Calendar className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-xs font-medium text-muted-foreground">
                                {formatDate(programming.startsAt) || "Encontro Semanal"}
                              </span>
                            </div>
                            {programming.isLive && (
                              <Badge className="bg-red-500 hover:bg-red-600 text-white text-[11px] gap-1 animate-pulse">
                                <Radio className="h-3 w-3" /> Ao Vivo
                              </Badge>
                            )}
                          </div>

                          <div>
                            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                              {programming.title}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {programming.description || "Participe conosco deste culto presencial e online."}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <Card className="border-dashed border-border/70 bg-muted/10">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                    <Clock className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground">
                      {q ? `Nenhuma programação para "${searchQuery}"` : "Nenhuma programação listada"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Fique atento às nossas redes ou contate a secretaria para conferir os horários dos cultos.
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

        {/* ============================================================ */}
        {/* TAB: EVENTOS */}
        {/* ============================================================ */}
        {(!q || filteredEvents.length > 0) && (activeTab === "tudo" || activeTab === "eventos") && (
          <section className="space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Próximos Eventos</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Conferências, retiros, workshops e momentos especiais
                  </p>
                </div>
              </div>

              {activeTab === "tudo" && events.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelectTab("eventos")}
                  className="text-xs font-semibold text-primary hover:text-primary/90"
                >
                  Ver todos ({events.length})
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {filteredEvents.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredEvents
                  .slice(0, activeTab === "tudo" ? 3 : undefined)
                  .map((event) => {
                    const dateInfo = formatDayAndMonth(event.startsAt)
                    return (
                      <Card
                        key={event.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem({ type: "event", data: event })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedItem({ type: "event", data: event })
                          }
                        }}
                        className="group cursor-pointer overflow-hidden border-border/70 bg-card/70 backdrop-blur hover:bg-accent/40 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <CardContent className="p-5 flex gap-4 items-start">
                          {/* Modern Date Tile */}
                          <div className="flex flex-col items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-center shrink-0 w-14">
                            <span className="text-lg font-black text-primary leading-none">
                              {dateInfo.day}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80 mt-1">
                              {dateInfo.month}
                            </span>
                          </div>

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-semibold py-0 px-2 bg-secondary"
                              >
                                {event.type || "Evento"}
                              </Badge>
                              {event.registrationEnabled && (
                                <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 dark:text-emerald-400 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Inscrições
                                </span>
                              )}
                            </div>

                            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors truncate">
                              {event.title}
                            </h3>

                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {event.description || "Clique para ver todas as informações do evento."}
                            </p>

                            <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-primary" />
                                {dateInfo.time}
                              </span>
                              {event.location && (
                                <span className="flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3 text-primary shrink-0" />
                                  <span className="truncate">{event.location}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            ) : (
              <Card className="border-dashed border-border/70 bg-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">
                    {q ? `Nenhum evento para "${searchQuery}"` : "Nenhum evento agendado no momento"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Estamos preparando novidades e encontros transformadores. Fique ligado!
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB: CONTEÚDO (NOTÍCIAS & DEVOCIONAIS) */}
        {/* ============================================================ */}
        {(!q || filteredPosts.length > 0) && (activeTab === "tudo" || activeTab === "conteudo") && (
          <section className="space-y-4 animate-fade-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Conteúdos & Mensagens</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Devocionais, notícias, avisos e estudos bíblicos
                  </p>
                </div>
              </div>

              {activeTab === "tudo" && posts.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSelectTab("conteudo")}
                  className="text-xs font-semibold text-primary hover:text-primary/90"
                >
                  Ver todos ({posts.length})
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {filteredPosts.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPosts
                  .slice(0, activeTab === "tudo" ? 3 : undefined)
                  .map((post) => (
                    <Card
                      key={post.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedItem({ type: "post", data: post })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelectedItem({ type: "post", data: post })
                        }
                      }}
                      className="group cursor-pointer overflow-hidden border-border/70 bg-card/70 backdrop-blur hover:bg-accent/40 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {post.coverImageUrl && (
                        <div className="relative h-40 w-full overflow-hidden bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={post.coverImageUrl}
                            alt={post.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <Badge className="absolute bottom-2.5 left-3 text-[10px] bg-primary text-primary-foreground font-semibold">
                            {postTypeLabel(post)}
                          </Badge>
                        </div>
                      )}

                      <CardHeader className="p-5 pb-2">
                        {!post.coverImageUrl && (
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <Badge variant="secondary" className="text-[10px] font-semibold">
                              {postTypeLabel(post)}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(post.publishedAt)}
                            </span>
                          </div>
                        )}
                        <CardTitle className="text-base font-bold group-hover:text-primary transition-colors line-clamp-2">
                          {post.title}
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="p-5 pt-0 space-y-3">
                        <p className="line-clamp-3 text-xs text-muted-foreground leading-relaxed">
                          {post.summary || post.content}
                        </p>
                        {post.authorName && (
                          <p className="text-[11px] font-medium text-muted-foreground pt-1">
                            Por {post.authorName}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            ) : (
              <Card className="border-dashed border-border/70 bg-muted/10">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                  <Newspaper className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-semibold text-foreground">
                    {q ? `Nenhuma publicação para "${searchQuery}"` : "Nenhum conteúdo publicado ainda"}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Em breve você encontrará artigos, devocionais diários e mensagens edificantes aqui.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* TAB: MINISTÉRIOS */}
        {/* ============================================================ */}
        {(!q || filteredMinistries.length > 0) &&
          (activeTab === "tudo" || activeTab === "ministerios") && (
            <section className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Heart className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Ministérios</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Áreas de serviço, voluntariado e discipulado
                    </p>
                  </div>
                </div>

                {activeTab === "tudo" && ministries.length > 4 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectTab("ministerios")}
                    className="text-xs font-semibold text-primary hover:text-primary/90"
                  >
                    Ver todos ({ministries.length})
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {filteredMinistries.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredMinistries
                    .slice(0, activeTab === "tudo" ? 4 : undefined)
                    .map((ministry) => (
                      <Card
                        key={ministry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedItem({ type: "ministry", data: ministry })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedItem({ type: "ministry", data: ministry })
                          }
                        }}
                        className="group cursor-pointer border-border/70 bg-card/70 backdrop-blur hover:bg-accent/40 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                              <Heart className="h-4 w-4" />
                            </div>
                            <div>
                              <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
                                {ministry.name}
                              </h3>
                              {ministry.leaderName && (
                                <p className="text-[11px] text-muted-foreground">
                                  Liderança: <span className="font-medium">{ministry.leaderName}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {ministry.description || "Ministério ativo servindo ao Reino e à congregação."}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <Card className="border-dashed border-border/70 bg-muted/10">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                    <Heart className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground">
                      {q ? `Nenhum ministério para "${searchQuery}"` : "Ministérios em estruturação"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Fale com os pastores nos cultos para descobrir onde você pode servir com seus dons!
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

        {/* ============================================================ */}
        {/* TAB: CONGREGAÇÕES (CAMPUS) */}
        {/* ============================================================ */}
        {(!q || filteredCongregations.length > 0) &&
          (activeTab === "tudo" || activeTab === "congregacoes") && (
            <section className="space-y-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Congregações & Campus</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Endereços e frentes de atuação da igreja
                    </p>
                  </div>
                </div>
              </div>

              {filteredCongregations.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCongregations.map((congregation) => {
                    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      congregation.address
                    )}`
                    return (
                      <Card
                        key={congregation.id}
                        className="border-border/70 bg-card/70 backdrop-blur hover:shadow-lg transition-all duration-200"
                      >
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-base text-foreground">{congregation.name}</h3>
                            <Badge variant="outline" className="text-[10px]">
                              Campus
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{congregation.address}</span>
                          </p>

                          {congregation.responsible && (
                            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                              Responsável:{" "}
                              <span className="font-semibold text-foreground">
                                {congregation.responsible}
                              </span>
                            </p>
                          )}

                          <a
                            href={mapsLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center w-full text-xs rounded-xl mt-2 h-8 border border-border/70 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                          >
                            <MapPin className="mr-1.5 h-3.5 w-3.5 text-primary" />
                            Ver no Google Maps
                          </a>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <Card className="border-dashed border-border/70 bg-muted/10">
                  <CardContent className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                    <Church className="h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground">
                      {q ? `Nenhuma congregação para "${searchQuery}"` : "Sede Principal"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      {church.address
                        ? `${church.address}, ${church.city}`
                        : "Consulte a sede para mais informações."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>
          )}
      </main>

      {/* Interactive Item Details Sheet / Modal */}
      <ChurchItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />

      {/* Mobile Bottom Navigation Bar (SuperApp) */}
      <ChurchMobileBottomBar
        slug={church.slug}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
      />
    </div>
  )
}
