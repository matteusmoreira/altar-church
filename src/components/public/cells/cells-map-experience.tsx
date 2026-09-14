"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Compass,
  List,
  Loader2,
  Map as MapIcon,
  Moon,
  Navigation,
  Search,
  Sun,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PublicCellsPageData, PublicCellItem } from "@/lib/cells/public-cells"
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
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"map" | "list">("map")
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark")
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [routeLine, setRouteLine] = useState<[number, number][] | null>(null)
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; cell: PublicCellItem } | null>(null)
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false)
  const [visitingCell, setVisitingCell] = useState<PublicCellItem | null>(null)

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
      () => {
        setIsLocating(false)
        toast.error("Não foi possível obter sua localização. Verifique as permissões do navegador.")
      },
      { enableHighAccuracy: true, timeout: 8000 }
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

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          const inName = cell.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inNeigh = cell.neighborhood.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inLeader = (cell.leaderName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          const inDesc = cell.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)
          if (!inName && !inNeigh && !inLeader && !inDesc) return false
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
  }, [cells, userLocation, activeCategoryId, activeWeekday, searchQuery])

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
      <header className="absolute top-0 inset-x-0 z-30 flex flex-col p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-center justify-between gap-2 pointer-events-auto">
          {/* Back & Church Branding */}
          <Link
            href={`/church/${church.slug}`}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition hover:bg-black/60 active:scale-95"
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
              className="h-8 rounded-full border-cyan-500/40 bg-cyan-950/60 px-2.5 text-xs font-semibold text-cyan-300 shadow-lg backdrop-blur-md hover:bg-cyan-900/80 active:scale-95"
              title="Células perto de você"
            >
              {isLocating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              ) : (
                <Compass className="h-3.5 w-3.5 text-cyan-400" />
              )}
              <span className="hidden sm:inline ml-1">Perto de Mim</span>
            </Button>

            {/* View Mode Switcher */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === "map" ? "list" : "map")}
              className="h-8 rounded-full border-white/20 bg-black/40 px-2.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md hover:bg-black/60 active:scale-95"
            >
              {viewMode === "map" ? (
                <>
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline ml-1">Lista</span>
                </>
              ) : (
                <>
                  <MapIcon className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="hidden sm:inline ml-1">Mapa 3D</span>
                </>
              )}
            </Button>

            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
              className="h-8 w-8 rounded-full border-white/20 bg-black/40 p-0 text-white shadow-lg backdrop-blur-md hover:bg-black/60 active:scale-95"
              title="Alternar Tema Claro / Escuro"
            >
              {themeMode === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-slate-200" />}
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
              className="h-9 w-full rounded-full border-white/20 bg-black/50 pl-8 pr-8 text-xs text-white placeholder:text-muted-foreground shadow-lg backdrop-blur-md focus-visible:ring-1 focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
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
                  ? "bg-foreground text-background"
                  : "border border-white/20 bg-black/40 text-white hover:bg-black/60"
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
                    isActive ? "shadow-lg scale-105" : "bg-black/40 text-white hover:bg-black/60"
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
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-black/30 text-white/80 border border-white/10 hover:bg-black/50"
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Active Route Top Banner */}
      {routeInfo && (
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
      <main className="relative flex-1 w-full h-full">
        {viewMode === "map" ? (
          <Cells3dMap
            cells={filteredCells}
            centerCoordinates={centerCoordinates}
            selectedCell={selectedCell}
            onSelectCell={(cell) => setSelectedCell(cell)}
            themeMode={themeMode}
            userLocation={userLocation}
            routeLine={routeLine}
          />
        ) : (
          <CellsListDrawer
            cells={filteredCells}
            onSelectCell={handleSelectFromList}
            onOpenVisitModal={handleOpenVisitModal}
            onClose={() => setViewMode("map")}
            churchName={church.publicName}
          />
        )}
      </main>

      {/* Selected Cell Detail Bottom Sheet */}
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

      {/* Visit Contact Modal */}
      <CellVisitModal
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
