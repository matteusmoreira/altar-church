"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Building2,
  Clock,
  Compass,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Moon,
  Navigation,
  RotateCcw,
  Search,
  Sun,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import type { PublicCellsPageData, PublicCellItem } from "@/lib/cells/public-cells"
import {
  getAvailableCities,
  getAvailableNeighborhoods,
  getAvailableTimes,
  matchesTimeFilter,
  shortTimeFilterLabel,
} from "@/lib/cells/filter-helpers"
import { Cells3dMap } from "./cells-3d-map"
import { CellDetailSheet } from "./cell-detail-sheet"
import { CellVisitModal } from "./cell-visit-modal"
import { CellsListDrawer } from "./cells-list-drawer"
import { toast } from "sonner"

export interface CellsMapExperienceProps {
  initialData: PublicCellsPageData
}

// Haversine formula to calculate distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const WEEKDAYS = ["Todos", "Hoje 🔥", "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

export function CellsMapExperience({ initialData }: CellsMapExperienceProps) {
  const { church, cells, categories, centerCoordinates } = initialData

  const [selectedCell, setSelectedCell] = useState<PublicCellItem | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all")
  const [activeWeekday, setActiveWeekday] = useState<string>("Todos")
  const [activeCity, setActiveCity] = useState<string>("all")
  const [activeNeighborhood, setActiveNeighborhood] = useState<string>("all")
  const [activeTime, setActiveTime] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"map" | "list">("map")
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark")
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [routeLine, setRouteLine] = useState<[number, number][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; cell: PublicCellItem } | null>(null)
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false)
  const [visitingCell, setVisitingCell] = useState<PublicCellItem | null>(null)

  // Derived filter options
  const availableCities = useMemo(() => getAvailableCities(cells), [cells])
  const availableNeighborhoods = useMemo(
    () => getAvailableNeighborhoods(cells, activeCity),
    [cells, activeCity]
  )
  const availableTimes = useMemo(() => getAvailableTimes(cells), [cells])

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    activeCategoryId !== "all" ||
    activeWeekday !== "Todos" ||
    activeCity !== "all" ||
    activeNeighborhood !== "all" ||
    activeTime !== "all"

  const handleResetAllFilters = () => {
    setSearchQuery("")
    setActiveCategoryId("all")
    setActiveWeekday("Todos")
    setActiveCity("all")
    setActiveNeighborhood("all")
    setActiveTime("all")
  }

  // Handle GPS location
  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada no seu navegador.")
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }
        setUserLocation(coords)
        setIsLocating(false)
        toast.success("Localização identificada! Células ordenadas por proximidade.")
      },
      (err) => {
        setIsLocating(false)
        if (err.code === 1) {
          toast.error("Acesso à localização negado. Permita a localização nas configurações do seu navegador.")
        } else {
          toast.error("Não foi possível obter sua localização. Tente novamente.")
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Filter & calculate distances
  const filteredCells = useMemo(() => {
    return cells
      .map((cell) => {
        let distanceKm: number | null = null
        if (userLocation && cell.latitude !== null && cell.longitude !== null) {
          distanceKm = calculateDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            cell.latitude,
            cell.longitude
          )
        }
        return { ...cell, distanceKm }
      })
      .filter((cell) => {
        // Category filter
        if (activeCategoryId !== "all" && cell.categoryId !== activeCategoryId) {
          return false
        }

        // Weekday filter
        if (activeWeekday === "Hoje 🔥") {
          if (!cell.meetsToday) return false
        } else if (activeWeekday !== "Todos") {
          const normCellDay = cell.meetingDay.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          const normFilterDay = activeWeekday.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          if (!normCellDay.includes(normFilterDay)) return false
        }

        // City filter
        if (activeCity !== "all") {
          if (!cell.city || cell.city.trim().toLowerCase() !== activeCity.trim().toLowerCase()) {
            return false
          }
        }

        // Neighborhood filter
        if (activeNeighborhood !== "all") {
          if (
            !cell.neighborhood ||
            cell.neighborhood.trim().toLowerCase() !== activeNeighborhood.trim().toLowerCase()
          ) {
            return false
          }
        }

        // Time filter
        if (activeTime !== "all") {
          if (!matchesTimeFilter(cell.meetingTime, activeTime)) {
            return false
          }
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          const inName = cell.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inNeigh = cell.neighborhood.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inCity = cell.city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inLeader = (cell.leaderName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inDesc = cell.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          if (!inName && !inNeigh && !inCity && !inLeader && !inDesc) return false
        }

        return true
      })
      .sort((a, b) => {
        // Sort by distance if user location is known
        if (a.distanceKm !== null && b.distanceKm !== null) {
          return a.distanceKm - b.distanceKm
        }
        return 0
      })
  }, [cells, userLocation, activeCategoryId, activeWeekday, activeCity, activeNeighborhood, activeTime, searchQuery])

  // Handle Trace Route
  const handleTraceRoute = async (cell: PublicCellItem) => {
    if (!cell.latitude || !cell.longitude) {
      toast.error("Esta célula não possui coordenadas cadastradas.")
      return
    }

    if (!userLocation) {
      // Request location first
      if (navigator.geolocation) {
        setIsLocating(true)
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const userCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }
            setUserLocation(userCoords)
            setIsLocating(false)
            await buildRoute(userCoords, cell)
          },
          () => {
            setIsLocating(false)
            toast.error("Ative a localização do seu celular para traçar a rota no mapa.")
          },
          { enableHighAccuracy: true, timeout: 8000 }
        )
      }
    } else {
      await buildRoute(userLocation, cell)
    }
  }

  const buildRoute = async (from: { latitude: number; longitude: number }, toCell: PublicCellItem) => {
    if (!toCell.latitude || !toCell.longitude) return

    const dist = calculateDistanceKm(from.latitude, from.longitude, toCell.latitude, toCell.longitude)
    const estTimeMin = Math.max(3, Math.round(dist * 2.5)) // Approximate driving time

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    let coordinates: [number, number][] = [
      [from.longitude, from.latitude],
      [toCell.longitude, toCell.latitude],
    ]

    // Fetch directions if token available
    if (token) {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from.longitude},${from.latitude};${toCell.longitude},${toCell.latitude}?geometries=geojson&access_token=${token}`
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          const route = data.routes?.[0]
          if (route?.geometry?.coordinates) {
            coordinates = route.geometry.coordinates
          }
        }
      } catch {
        // fallback to straight line
      }
    }

    setRouteLine(coordinates)
    setRouteInfo({
      distanceKm: dist,
      durationMin: estTimeMin,
      cell: toCell,
    })
    setViewMode("map")
    toast.success(`Rota calculada: ${dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)} km`} (${estTimeMin} min)`)
  }

  const handleOpenVisitModal = (cell: PublicCellItem) => {
    setVisitingCell(cell)
    setIsVisitModalOpen(true)
  }

  const handleSelectFromList = (cell: PublicCellItem) => {
    setSelectedCell(cell)
    setViewMode("map")
  }

  return (
    <div className={`relative h-dvh w-full overflow-hidden flex flex-col ${themeMode === "dark" ? "dark bg-slate-950 text-white" : "bg-background text-foreground"}`}>
      {/* Top Header Bar */}
      {viewMode === "map" ? (
        <header
          className={`absolute top-0 inset-x-0 z-30 flex flex-col p-3 pointer-events-none transition-all duration-300 ${
            themeMode === "dark"
              ? "bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent"
              : "bg-gradient-to-b from-white/95 via-white/70 to-transparent"
          }`}
        >
          <div className="flex items-center justify-between gap-2 pointer-events-auto">
            {/* Back & Church Branding */}
            <Link
              href={`/church/${church.slug}`}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition active:scale-95 ${
                themeMode === "dark"
                  ? "border border-white/20 bg-black/40 text-white hover:bg-black/60"
                  : "border border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px] sm:max-w-xs">{church.publicName}</span>
            </Link>

            {/* Quick Actions (GPS, Theme, View Mode) */}
            <div className="flex items-center gap-1.5">
              {/* GPS Perto de Mim Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestLocation}
                disabled={isLocating}
                className={`h-8 rounded-full px-2.5 text-xs font-semibold shadow-md backdrop-blur-md active:scale-95 ${
                  themeMode === "dark"
                    ? "border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/80"
                    : "border-cyan-400/50 bg-cyan-50/90 text-cyan-800 hover:bg-cyan-100 shadow-2xs"
                }`}
                title="Células perto de você"
              >
                {isLocating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                ) : (
                  <Compass className="h-3.5 w-3.5 text-cyan-500" />
                )}
                <span className="hidden sm:inline ml-1">Perto de Mim</span>
              </Button>

              {/* View Mode Switcher */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("list")}
                className={`h-8 rounded-full px-3 text-xs font-semibold shadow-md backdrop-blur-md active:scale-95 flex items-center gap-1.5 ${
                  themeMode === "dark"
                    ? "border-white/20 bg-black/40 text-white hover:bg-black/60"
                    : "border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                }`}
              >
                <List className="h-3.5 w-3.5 text-primary" />
                <span className="hidden sm:inline ml-1">Ver Lista</span>
              </Button>

              {/* Theme Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
                className={`h-8 w-8 rounded-full p-0 shadow-md backdrop-blur-md active:scale-95 ${
                  themeMode === "dark"
                    ? "border-white/20 bg-black/40 text-white hover:bg-black/60"
                    : "border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                }`}
                title="Alternar Tema Claro / Escuro"
              >
                {themeMode === "dark" ? (
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-slate-600" />
                )}
              </Button>
            </div>
          </div>

          {/* Search Bar & Filters */}
          <div className="mt-2.5 flex flex-col gap-2 pointer-events-auto max-w-lg mx-auto w-full">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar célula por nome, líder ou bairro…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`h-9 w-full rounded-full pl-8 pr-8 text-xs shadow-md backdrop-blur-md focus-visible:ring-1 focus-visible:ring-primary ${
                  themeMode === "dark"
                    ? "border-white/20 bg-black/50 text-white placeholder:text-muted-foreground"
                    : "border-slate-200 bg-white/95 text-slate-900 placeholder:text-slate-500 shadow-2xs"
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills Scrolling Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveCategoryId("all")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold shadow-md backdrop-blur-md transition active:scale-95 ${
                  activeCategoryId === "all"
                    ? themeMode === "dark"
                      ? "bg-white text-slate-950 font-bold"
                      : "bg-slate-900 text-white font-bold"
                    : themeMode === "dark"
                      ? "border border-white/20 bg-black/40 text-white hover:bg-black/60"
                      : "border border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                }`}
              >
                Todas ({cells.length})
              </button>

              {categories.map((cat) => {
                const count = cells.filter((c) => c.categoryId === cat.id).length
                const isActive = activeCategoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategoryId(cat.id)}
                    style={
                      isActive
                        ? { backgroundColor: cat.color, color: "#fff", borderColor: cat.color }
                        : { borderColor: `${cat.color}66` }
                    }
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold shadow-md backdrop-blur-md border transition active:scale-95 ${
                      isActive
                        ? "shadow-lg scale-105"
                        : themeMode === "dark"
                          ? "bg-black/40 text-white hover:bg-black/60"
                          : "bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                    }`}
                  >
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name} ({count})
                  </button>
                )
              })}
            </div>

            {/* Weekday Quick Filter Row */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none no-scrollbar text-[11px]">
              {WEEKDAYS.map((day) => {
                const isSelected = activeWeekday === day
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveWeekday(day)}
                    className={`shrink-0 rounded-full px-2.5 py-0.5 font-medium transition active:scale-95 ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                        : themeMode === "dark"
                          ? "bg-black/30 text-white/80 border border-white/10 hover:bg-black/50"
                          : "bg-white/90 text-slate-700 border border-slate-200/80 hover:bg-white shadow-2xs"
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {/* City, Neighborhood and Time Filter Selects */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none no-scrollbar text-[11px]">
              {/* Cidade Select */}
              <Select
                value={activeCity}
                onValueChange={(val) => {
                  const nextCity = val ?? "all"
                  setActiveCity(nextCity)
                  if (nextCity !== "all" && activeNeighborhood !== "all") {
                    const exists = cells.some(
                      (c) =>
                        c.city?.toLowerCase() === nextCity.toLowerCase() &&
                        c.neighborhood?.toLowerCase() === activeNeighborhood.toLowerCase()
                    )
                    if (!exists) setActiveNeighborhood("all")
                  }
                }}
              >
                <SelectTrigger
                  className={`h-7 w-auto shrink-0 rounded-full px-2.5 text-[11px] font-semibold shadow-md backdrop-blur-md transition active:scale-95 flex items-center gap-1.5 [&_svg:last-child]:text-current ${
                    activeCity !== "all"
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : themeMode === "dark"
                        ? "border border-white/20 bg-black/40 text-white hover:bg-black/60"
                        : "border border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                  }`}
                >
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[85px] sm:max-w-[120px]">
                    {activeCity === "all" ? "Cidade" : activeCity}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as cidades ({cells.length})</SelectItem>
                  {availableCities.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label} ({c.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Bairro Select */}
              <Select
                value={activeNeighborhood}
                onValueChange={(val) => setActiveNeighborhood(val ?? "all")}
              >
                <SelectTrigger
                  className={`h-7 w-auto shrink-0 rounded-full px-2.5 text-[11px] font-semibold shadow-md backdrop-blur-md transition active:scale-95 flex items-center gap-1.5 [&_svg:last-child]:text-current ${
                    activeNeighborhood !== "all"
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : themeMode === "dark"
                        ? "border border-white/20 bg-black/40 text-white hover:bg-black/60"
                        : "border border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                  }`}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[85px] sm:max-w-[120px]">
                    {activeNeighborhood === "all" ? "Bairro" : activeNeighborhood}
                  </span>
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

              {/* Horário Select */}
              <Select
                value={activeTime}
                onValueChange={(val) => setActiveTime(val ?? "all")}
              >
                <SelectTrigger
                  className={`h-7 w-auto shrink-0 rounded-full px-2.5 text-[11px] font-semibold shadow-md backdrop-blur-md transition active:scale-95 flex items-center gap-1.5 [&_svg:last-child]:text-current ${
                    activeTime !== "all"
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : themeMode === "dark"
                        ? "border border-white/20 bg-black/40 text-white hover:bg-black/60"
                        : "border border-slate-200/80 bg-white/90 text-slate-800 hover:bg-white shadow-2xs"
                  }`}
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[85px] sm:max-w-[120px]">
                    {shortTimeFilterLabel(activeTime)}
                  </span>
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

              {/* Reset Quick Action */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 transition active:scale-95 flex items-center gap-1 shadow-xs backdrop-blur-md"
                  title="Limpar todos os filtros"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          </div>
        </header>
      ) : (
        /* Top Navigation Bar in List Mode */
        <header className="sticky top-0 z-30 w-full border-b border-border/60 bg-background/85 backdrop-blur-xl shrink-0 transition-colors shadow-2xs">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3">
            {/* Back & Church Branding */}
            <Link
              href={`/church/${church.slug}`}
              className="flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-2xs transition hover:bg-accent active:scale-95"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="truncate max-w-[140px] sm:max-w-xs">{church.publicName}</span>
              {church.city && (
                <span className="hidden md:inline text-[11px] text-muted-foreground font-normal">
                  • {church.city}
                </span>
              )}
            </Link>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              {/* GPS Perto de Mim Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestLocation}
                disabled={isLocating}
                className="h-8 rounded-full border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 active:scale-95 text-xs font-medium"
                title="Células perto de você"
              >
                {isLocating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
                ) : (
                  <Compass className="h-3.5 w-3.5 text-cyan-500" />
                )}
                <span className="hidden sm:inline ml-1">Perto de Mim</span>
              </Button>

              {/* Switch to Map 3D */}
              <Button
                size="sm"
                onClick={() => setViewMode("map")}
                className="h-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-3 text-xs shadow-xs flex items-center gap-1.5 active:scale-95 transition"
              >
                <MapIcon className="h-3.5 w-3.5" />
                <span>Ver no Mapa 3D</span>
              </Button>

              {/* Theme Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
                className="h-8 w-8 rounded-full border-border/80 bg-card/80 p-0 text-foreground shadow-2xs hover:bg-accent active:scale-95"
                title="Alternar Tema Claro / Escuro"
              >
                {themeMode === "dark" ? (
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-slate-600" />
                )}
              </Button>
            </div>
          </div>
        </header>
      )}

      {/* Active Route Top Banner (apenas no modo Mapa 3D) */}
      {routeInfo && viewMode === "map" && (
        <div className="absolute top-36 left-4 right-4 z-30 mx-auto max-w-sm rounded-xl border border-cyan-500/50 bg-cyan-950/90 p-3 text-white shadow-2xl backdrop-blur-md animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500 text-white">
                <Navigation className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">Rota para {routeInfo.cell.name}</p>
                <p className="text-[11px] text-cyan-200">
                  {routeInfo.distanceKm < 1
                    ? `${Math.round(routeInfo.distanceKm * 1000)}m`
                    : `${routeInfo.distanceKm.toFixed(1)} km`}{" "}
                  • Aprox. {routeInfo.durationMin} min
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setRouteLine(null)
                setRouteInfo(null)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-900/60 text-cyan-300 hover:bg-cyan-800"
              aria-label="Cancelar rota"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content: Map 3D or List View */}
      <main className="relative min-h-0 flex-1 w-full overflow-hidden flex flex-col">
        {viewMode === "map" ? (
          <>
            <Cells3dMap
              cells={filteredCells}
              centerCoordinates={centerCoordinates}
              selectedCell={selectedCell}
              onSelectCell={(cell) => setSelectedCell(cell)}
              themeMode={themeMode}
              userLocation={userLocation}
              routeLine={routeLine}
              mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            />

            {/* Empty state overlay on 3D map */}
            {filteredCells.length === 0 && (
              <div className="absolute top-44 left-4 right-4 z-20 mx-auto max-w-sm rounded-2xl border border-border/80 bg-background/95 p-4 text-center shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
                <p className="text-xs font-semibold text-foreground">Nenhuma célula encontrada com estes filtros</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Tente selecionar outra cidade, bairro ou horário.</p>
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition active:scale-95"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Limpar filtros</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <CellsListDrawer
            cells={filteredCells}
            totalCellsCount={cells.length}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            activeCategoryId={activeCategoryId}
            onSelectCategory={setActiveCategoryId}
            categories={categories}
            activeWeekday={activeWeekday}
            onSelectWeekday={setActiveWeekday}
            activeCity={activeCity}
            onSelectCity={(city) => {
              setActiveCity(city)
              if (city !== "all" && activeNeighborhood !== "all") {
                const exists = cells.some(
                  (c) =>
                    c.city?.toLowerCase() === city.toLowerCase() &&
                    c.neighborhood?.toLowerCase() === activeNeighborhood.toLowerCase()
                )
                if (!exists) setActiveNeighborhood("all")
              }
            }}
            availableCities={availableCities}
            activeNeighborhood={activeNeighborhood}
            onSelectNeighborhood={setActiveNeighborhood}
            availableNeighborhoods={availableNeighborhoods}
            activeTime={activeTime}
            onSelectTime={setActiveTime}
            availableTimes={availableTimes}
            onResetFilters={handleResetAllFilters}
            onSelectCell={handleSelectFromList}
            onOpenVisitModal={handleOpenVisitModal}
            onClose={() => setViewMode("map")}
            churchName={church.publicName}
            churchCity={church.city}
            churchState={church.state}
            churchSlug={church.slug}
            userLocation={userLocation}
            onRequestLocation={handleRequestLocation}
            isLocating={isLocating}
          />
        )}
      </main>

      {/* Selected Cell Detail Bottom Sheet (apenas no modo Mapa 3D) */}
      {viewMode === "map" && (
        <CellDetailSheet
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
          onTraceRoute={handleTraceRoute}
          onOpenVisitModal={handleOpenVisitModal}
          churchName={church.publicName}
          churchSlug={church.slug}
          userDistanceKm={
            userLocation && selectedCell?.latitude && selectedCell?.longitude
              ? calculateDistanceKm(
                  userLocation.latitude,
                  userLocation.longitude,
                  selectedCell.latitude,
                  selectedCell.longitude
                )
              : null
          }
        />
      )}

      {/* Visit Contact Modal */}
      <CellVisitModal
        key={visitingCell?.id ?? "closed"}
        cell={visitingCell}
        isOpen={isVisitModalOpen}
        onClose={() => {
          setIsVisitModalOpen(false)
          setVisitingCell(null)
        }}
        churchSlug={church.slug}
        churchName={church.publicName}
      />
    </div>
  )
}
