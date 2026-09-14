"use client"

import {
  Calendar,
  Clock,
  Compass,
  MapPin,
  Navigation,
  Search,
  Sparkles,
  Users,
  X,
  Share2,
  MessageCircle,
  Map as MapIcon,
  RotateCcw,
  User,
  Building2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PublicCellItem, PublicCellCategory } from "@/lib/cells/public-cells"
import {
  type FilterOption,
  type AvailableTimesResult,
  formatTimeFilterLabel,
} from "@/lib/cells/filter-helpers"
import { toast } from "sonner"
import { ScrollableFilterRow } from "./scrollable-filter-row"

export interface CellsListDrawerProps {
  cells: (PublicCellItem & { distanceKm?: number | null })[]
  totalCellsCount?: number
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  activeCategoryId?: string
  onSelectCategory?: (categoryId: string) => void
  categories?: PublicCellCategory[]
  activeWeekday?: string
  onSelectWeekday?: (day: string) => void
  activeCity?: string
  onSelectCity?: (city: string) => void
  availableCities?: FilterOption[]
  activeNeighborhood?: string
  onSelectNeighborhood?: (neighborhood: string) => void
  availableNeighborhoods?: FilterOption[]
  activeTime?: string
  onSelectTime?: (time: string) => void
  availableTimes?: AvailableTimesResult
  onResetFilters?: () => void
  onSelectCell: (cell: PublicCellItem) => void
  onOpenVisitModal: (cell: PublicCellItem) => void
  onClose: () => void
  churchName: string
  churchCity?: string
  churchState?: string
  churchSlug?: string
  userLocation?: { latitude: number; longitude: number } | null
  onRequestLocation?: () => void
  isLocating?: boolean
}

const WEEKDAYS = ["Todos", "Hoje 🔥", "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

export function CellsListDrawer({
  cells,
  totalCellsCount = cells.length,
  searchQuery = "",
  onSearchQueryChange,
  activeCategoryId = "all",
  onSelectCategory,
  categories = [],
  activeWeekday = "Todos",
  onSelectWeekday,
  activeCity = "all",
  onSelectCity,
  availableCities = [],
  activeNeighborhood = "all",
  onSelectNeighborhood,
  availableNeighborhoods = [],
  activeTime = "all",
  onSelectTime,
  availableTimes = { periods: [], exactTimes: [] },
  onResetFilters,
  onSelectCell,
  onOpenVisitModal,
  onClose,
  churchName,
  churchCity,
  churchState,
  churchSlug,
  userLocation,
}: CellsListDrawerProps) {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    activeCategoryId !== "all" ||
    activeWeekday !== "Todos" ||
    activeCity !== "all" ||
    activeNeighborhood !== "all" ||
    activeTime !== "all"

  const handleShareCell = async (cell: PublicCellItem) => {
    const slug = churchSlug || ""
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/church/${slug}/celulas`
        : `/church/${slug}/celulas`

    const shareData = {
      title: `Célula ${cell.name} - ${churchName}`,
      text: `Venha conhecer a célula ${cell.name}! Encontros toda ${cell.meetingDay}${
        cell.meetingTime ? ` às ${cell.meetingTime}` : ""
      }.`,
      url: shareUrl,
    }

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // Compartilhamento cancelado pelo usuário
      }
    } else if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(shareUrl)
      toast.success("Link copiado para a área de transferência!")
    }
  }

  return (
    <div className="relative flex-1 h-full w-full overflow-y-auto bg-slate-50/70 dark:bg-slate-950 transition-colors">
      {/* Decorative ambient background glows */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,rgba(59,130,246,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-15%,rgba(99,102,241,0.18),rgba(15,23,42,0))]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-8">
        {/* Hero Section */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-2.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Comunidade & Conexão</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
              Células - {churchName}
            </h1>

            <p className="mt-1.5 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Encontre um grupo perto de você{" "}
              {churchCity ? `em ${churchCity}${churchState ? ` - ${churchState}` : ""}` : ""} para orar,
              compartilhar a vida e caminhar em comunidade.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              onClick={onClose}
              className="h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 text-xs sm:text-sm shadow-sm flex items-center gap-2 active:scale-95 transition"
            >
              <MapIcon className="h-4 w-4" />
              <span>Explorar no Mapa 3D</span>
            </Button>
          </div>
        </section>

        {/* Search and Filters Section */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md p-4 sm:p-5 shadow-xs">
          {/* Search Input Bar */}
          {onSearchQueryChange && (
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Buscar por nome da célula, bairro, líder ou dia da semana…"
                className="h-11 sm:h-12 w-full rounded-xl border border-border/80 bg-background/90 pl-10 pr-10 text-sm shadow-2xs focus-visible:ring-2 focus-visible:ring-primary text-foreground placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchQueryChange("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Categories Filter Pills */}
          {onSelectCategory && categories.length > 0 && (
            <ScrollableFilterRow className="pb-1 pt-1 gap-2">
              <button
                type="button"
                onClick={() => onSelectCategory("all")}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-2xs transition active:scale-95 ${
                  activeCategoryId === "all"
                    ? "bg-foreground text-background"
                    : "border border-border/80 bg-background/80 text-foreground hover:bg-muted"
                }`}
              >
                Todas ({totalCellsCount})
              </button>

              {categories.map((cat) => {
                const isActive = activeCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    style={
                      isActive
                        ? { backgroundColor: cat.color, color: "#fff", borderColor: cat.color }
                        : { borderColor: `${cat.color}66` }
                    }
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-2xs border transition active:scale-95 flex items-center gap-1.5 ${
                      isActive
                        ? "shadow-sm scale-105"
                        : "bg-background/80 text-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span>{cat.name}</span>
                  </button>
                )
              })}
            </ScrollableFilterRow>
          )}

          {/* Weekdays Filter Pills */}
          {onSelectWeekday && (
            <ScrollableFilterRow className="pb-0.5 text-xs">
              <span className="text-muted-foreground font-medium text-[11px] shrink-0 mr-1 hidden sm:inline">
                Dia:
              </span>
              {WEEKDAYS.map((day) => {
                const isSelected = activeWeekday === day
                const isToday = day === "Hoje 🔥"

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onSelectWeekday(day)}
                    className={`shrink-0 rounded-full px-3 py-1 font-medium text-xs transition active:scale-95 ${
                      isSelected
                        ? isToday
                          ? "bg-amber-500 text-white shadow-xs font-bold"
                          : "bg-primary text-primary-foreground shadow-xs font-semibold"
                        : isToday
                          ? "border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                          : "border border-border/70 bg-background/70 text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </ScrollableFilterRow>
          )}

          {/* City, Neighborhood and Time Selects */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1.5 border-t border-border/40">
            {/* Cidade */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3 text-primary" />
                <span>Cidade</span>
              </span>
              <Select
                value={activeCity}
                onValueChange={(val) => {
                  onSelectCity?.(val ?? "all")
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary">
                  <SelectValue placeholder="Todas as cidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cidades ({totalCellsCount})</SelectItem>
                  {availableCities.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label} ({c.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bairro */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 text-primary" />
                <span>Bairro</span>
              </span>
              <Select
                value={activeNeighborhood}
                onValueChange={(val) => {
                  onSelectNeighborhood?.(val ?? "all")
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary">
                  <SelectValue placeholder="Todos os bairros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os bairros</SelectItem>
                  {availableNeighborhoods.map((n) => (
                    <SelectItem key={n.value} value={n.value}>
                      {n.label} ({n.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Horários */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
                <span>Horário</span>
              </span>
              <Select
                value={activeTime}
                onValueChange={(val) => {
                  onSelectTime?.(val ?? "all")
                }}
              >
                <SelectTrigger className="h-10 rounded-xl border-border/80 bg-background/80 text-xs font-medium focus-visible:ring-2 focus-visible:ring-primary">
                  <SelectValue placeholder="Todos os horários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os horários</SelectItem>
                  {availableTimes.periods.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1">
                        Período
                      </SelectLabel>
                      {availableTimes.periods.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label} ({p.count})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {availableTimes.exactTimes.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 border-t border-border/40 mt-1 pt-1">
                        Horário de Início
                      </SelectLabel>
                      {availableTimes.exactTimes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} ({t.count})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
              <span className="text-muted-foreground text-[11px] font-medium mr-0.5">Filtros ativos:</span>
              {activeCity !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-xs font-medium">
                  <Building2 className="h-3 w-3" />
                  <span>Cidade: {activeCity}</span>
                  <button
                    type="button"
                    onClick={() => onSelectCity?.("all")}
                    className="hover:text-primary/70 ml-0.5"
                    aria-label="Remover filtro de cidade"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeNeighborhood !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-xs font-medium">
                  <MapPin className="h-3 w-3" />
                  <span>Bairro: {activeNeighborhood}</span>
                  <button
                    type="button"
                    onClick={() => onSelectNeighborhood?.("all")}
                    className="hover:text-primary/70 ml-0.5"
                    aria-label="Remover filtro de bairro"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeTime !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-xs font-medium">
                  <Clock className="h-3 w-3" />
                  <span>Horário: {formatTimeFilterLabel(activeTime)}</span>
                  <button
                    type="button"
                    onClick={() => onSelectTime?.("all")}
                    className="hover:text-primary/70 ml-0.5"
                    aria-label="Remover filtro de horário"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeCategoryId !== "all" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-xs font-medium">
                  <span>Categoria: {categories.find((c) => c.id === activeCategoryId)?.name || activeCategoryId}</span>
                  <button
                    type="button"
                    onClick={() => onSelectCategory?.("all")}
                    className="hover:text-primary/70 ml-0.5"
                    aria-label="Remover filtro de categoria"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeWeekday !== "Todos" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 text-xs font-medium">
                  <span>Dia: {activeWeekday}</span>
                  <button
                    type="button"
                    onClick={() => onSelectWeekday?.("Todos")}
                    className="hover:text-primary/70 ml-0.5"
                    aria-label="Remover filtro de dia"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border/70 text-foreground px-2.5 py-0.5 text-xs font-medium">
                  <span>Busca: &ldquo;{searchQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => onSearchQueryChange?.("")}
                    className="hover:text-muted-foreground ml-0.5"
                    aria-label="Limpar busca"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Filter Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {cells.length} {cells.length === 1 ? "célula encontrada" : "células encontradas"}
              </span>

              {hasActiveFilters && onResetFilters && (
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium ml-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Limpar filtros</span>
                </button>
              )}
            </div>

            {userLocation && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Compass className="h-3 w-3 text-cyan-500" />
                Ordenado por proximidade do seu GPS
              </span>
            )}
          </div>
        </section>

        {/* Cells Grid */}
        <section>
          {cells.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border/80 bg-card/40 backdrop-blur-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
                <Compass className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Nenhuma célula encontrada</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Não localizamos nenhuma célula com os filtros selecionados. Tente buscar por outro
                termo ou limpar os filtros para ver todas as opções.
              </p>
              {hasActiveFilters && onResetFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onResetFilters}
                  className="mt-5 rounded-full text-xs font-semibold gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpar todos os filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 pb-20">
              {cells.map((cell) => {
                const leaderPhone = cell.leaderPhone
                const rawDigits = leaderPhone ? leaderPhone.replace(/\D/g, "") : ""
                const cleanPhone = rawDigits.startsWith("55") ? rawDigits : `55${rawDigits}`
                const whatsappMessage = encodeURIComponent(
                  `Olá${
                    cell.leaderName ? ` ${cell.leaderName}` : ""
                  }! Encontrei a célula "${cell.name}" no site da ${churchName} e gostaria de visitá-los!`
                )
                const whatsappUrl = rawDigits
                  ? `https://wa.me/${cleanPhone}?text=${whatsappMessage}`
                  : null

                return (
                  <article
                    key={cell.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card/90 backdrop-blur-sm p-5 shadow-xs hover:shadow-xl hover:border-primary/50 hover:-translate-y-1 transition-all duration-200"
                  >
                    {/* Top Color Accent Line */}
                    <div
                      className="absolute top-0 inset-x-0 h-1.5 rounded-t-2xl opacity-90 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: cell.categoryColor || "var(--primary)" }}
                    />

                    <div>
                      {/* Top Badges Row & Share Button */}
                      <div className="flex items-start justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            style={{
                              borderColor: `${cell.categoryColor}66`,
                              backgroundColor: `${cell.categoryColor}18`,
                              color: cell.categoryColor,
                            }}
                            className="font-semibold text-[11px] px-2.5 py-0.5"
                          >
                            {cell.categoryName}
                          </Badge>

                          {cell.meetsToday && (
                            <Badge className="bg-amber-500 text-white font-bold text-[10px] animate-pulse">
                              🔥 Reunião Hoje!
                            </Badge>
                          )}

                          {cell.distanceKm !== null && cell.distanceKm !== undefined && (
                            <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                              <Compass className="h-3 w-3 text-cyan-500" />
                              {cell.distanceKm < 1
                                ? `${Math.round(cell.distanceKm * 1000)}m`
                                : `${cell.distanceKm.toFixed(1)} km`}
                            </Badge>
                          )}

                          {(cell.minAge || cell.maxAge) && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              <Users className="mr-1 h-3 w-3" />
                              {cell.minAge && cell.maxAge
                                ? `${cell.minAge}-${cell.maxAge} anos`
                                : cell.minAge
                                  ? `A partir de ${cell.minAge} anos`
                                  : `Até ${cell.maxAge} anos`}
                            </Badge>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleShareCell(cell)}
                          className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-muted transition"
                          title="Compartilhar Célula"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Cell Photo if available */}
                      {cell.cellPhotoUrl && (
                        <div className="mt-3 relative h-40 w-full overflow-hidden rounded-xl bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cell.cellPhotoUrl}
                            alt={cell.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        </div>
                      )}

                      {/* Cell Name & Description */}
                      <div className="mt-3">
                        <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors leading-snug">
                          {cell.name}
                        </h3>
                        {cell.description ? (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {cell.description}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground/60 italic">
                            Grupo de comunhão da {churchName}
                          </p>
                        )}
                      </div>

                      {/* Leader Info */}
                      {cell.leaderName && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-foreground/80">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                            <User className="h-3 w-3" />
                          </div>
                          <span className="truncate">
                            Líder: <strong className="text-foreground">{cell.leaderName}</strong>
                          </span>
                        </div>
                      )}

                      {/* Schedule & Location Box */}
                      <div className="mt-3.5 rounded-xl border border-border/50 bg-muted/40 p-3 space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium text-foreground truncate">
                            <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate">{cell.meetingDay}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <span>{cell.meetingTime || "A combinar"}</span>
                          </div>
                        </div>

                        <div className="flex items-start gap-1.5 pt-1.5 border-t border-border/40">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <span className="line-clamp-2 leading-tight">
                            {cell.displayAddress}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs font-semibold gap-1.5 h-9 rounded-xl border-border/80 hover:bg-muted"
                        onClick={() => onSelectCell(cell)}
                      >
                        <Navigation className="h-3.5 w-3.5 text-cyan-500" />
                        <span>Ver no Mapa 3D</span>
                      </Button>

                      <Button
                        size="sm"
                        className="flex-1 text-xs font-semibold gap-1.5 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
                        onClick={() => onOpenVisitModal(cell)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Quero Visitar</span>
                      </Button>

                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 active:scale-95 transition"
                          title="Falar no WhatsApp com o líder"
                          aria-label="Falar no WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
