"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Building2, Compass, Moon, Sun, Sunset } from "lucide-react"
import type { PublicCellItem } from "@/lib/cells/public-cells"
import "mapbox-gl/dist/mapbox-gl.css"

export type LightPreset = "dusk" | "night" | "day"

export interface Cells3dMapProps {
  cells: PublicCellItem[]
  centerCoordinates: {
    latitude: number
    longitude: number
  }
  selectedCell: PublicCellItem | null
  onSelectCell: (cell: PublicCellItem | null) => void
  themeMode: "dark" | "light"
  userLocation: { latitude: number; longitude: number } | null
  routeLine: [number, number][] | null
  mapboxToken?: string
}

// Configurações de atmosfera e neblina no horizonte de acordo com o preset de luz
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAtmosphereFog(map: any, preset: LightPreset) {
  if (!map) return
  try {
    if (preset === "dusk") {
      map.setFog({
        range: [-0.5, 3.5],
        color: "rgb(255, 225, 205)", // Brilho quente de pôr do sol no horizonte
        "high-color": "rgb(235, 125, 75)", // Laranja dourado no céu
        "horizon-blend": 0.12,
        "space-color": "rgb(35, 25, 55)", // Espaço crepuscular roxo/azulado
        "star-intensity": 0.25,
      })
    } else if (preset === "night") {
      map.setFog({
        range: [-0.5, 3.5],
        color: "rgb(15, 22, 38)", // Noite profunda
        "high-color": "rgb(22, 32, 58)",
        "horizon-blend": 0.08,
        "space-color": "rgb(8, 12, 22)",
        "star-intensity": 0.75,
      })
    } else {
      map.setFog({
        range: [-0.5, 3.5],
        color: "rgb(235, 243, 255)", // Dia limpo e atmosférico
        "high-color": "rgb(140, 195, 255)",
        "horizon-blend": 0.08,
        "space-color": "rgb(180, 215, 255)",
        "star-intensity": 0.0,
      })
    }
  } catch (err) {
    console.warn("setFog warning:", err)
  }
}

// Configura relevo 3D (DEM) para montanhas e topografia real
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyTerrainElevation(map: any) {
  if (!map) return
  try {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      })
    }
    map.setTerrain({ source: "mapbox-dem", exaggeration: 1.15 })
  } catch (err) {
    console.warn("setTerrain warning:", err)
  }
}

const SHOW_POIS_KEY = "altar_cells_map_show_pois"
const SHOW_POIS_EVENT = "altar-cells-map-show-pois-change"
let currentShowPois = true

function subscribeToShowPois(callback: () => void) {
  window.addEventListener(SHOW_POIS_EVENT, callback)
  return () => window.removeEventListener(SHOW_POIS_EVENT, callback)
}

function getShowPois(): boolean {
  try {
    const stored = window.localStorage.getItem(SHOW_POIS_KEY)
    if (stored !== null) currentShowPois = stored === "true"
  } catch {
    // Ignora falhas em ambientes com localStorage bloqueado
  }
  return currentShowPois
}

function getServerShowPois(): boolean {
  return true
}

export function Cells3dMap({
  cells,
  centerCoordinates,
  selectedCell,
  onSelectCell,
  themeMode,
  userLocation,
  routeLine,
  mapboxToken,
}: Cells3dMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [pitch3d, setPitch3d] = useState(true)
  const [bearing, setBearing] = useState(-18)
  const [lightPreset, setLightPreset] = useState<LightPreset>(() => (themeMode === "light" ? "day" : "dusk"))
  const showPois = useSyncExternalStore(subscribeToShowPois, getShowPois, getServerShowPois)
  const showPoisRef = useRef(showPois)
  useEffect(() => {
    showPoisRef.current = showPois
  }, [showPois])

  const [mapError, setMapError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const token = mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""
  const missingToken = !token

  // Sincroniza lightPreset quando o tema global mudar pelo header
  const prevThemeMode = useRef(themeMode)
  useEffect(() => {
    if (prevThemeMode.current !== themeMode) {
      prevThemeMode.current = themeMode
      setLightPreset(themeMode === "light" ? "day" : "dusk")
    }
  }, [themeMode])

  // Atualiza iluminação dinâmica e atmosfera no Mapbox Standard sem recriar o mapa
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return
    try {
      if (typeof mapRef.current.setConfigProperty === "function") {
        mapRef.current.setConfigProperty("basemap", "lightPreset", lightPreset)
        mapRef.current.setConfigProperty("basemap", "theme", lightPreset === "dusk" ? "warm" : "default")
      }
      applyAtmosphereFog(mapRef.current, lightPreset)
    } catch (err) {
      console.warn("Could not update basemap lightPreset:", err)
    }
  }, [lightPreset, isMapLoaded])

  // Atualiza exibição de pontos de interesse (comércios e transporte) dinamicamente
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return
    try {
      if (typeof mapRef.current.setConfigProperty === "function") {
        mapRef.current.setConfigProperty("basemap", "showPointOfInterestLabels", showPois)
        mapRef.current.setConfigProperty("basemap", "showTransitLabels", showPois)
      }
    } catch (err) {
      console.warn("Could not update basemap POI config:", err)
    }
  }, [showPois, isMapLoaded])

  // Inicialização do Mapbox Standard
  useEffect(() => {
    if (!mapContainer.current || !token) return

    let isMounted = true
    let resizeObserver: ResizeObserver | undefined
    let loadTimeout: ReturnType<typeof setTimeout> | undefined

    const showLoadError = () => {
      if (isMounted) setMapError("Não foi possível carregar o mapa. Tente novamente ou consulte a lista de células.")
    }

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (!isMounted || !mapContainer.current) return
      setIsMapLoaded(false)
      setMapError(null)
      if (!mapboxgl.supported()) {
        setMapError("Seu navegador não oferece suporte ao mapa 3D. Consulte a lista de células.")
        return
      }

      mapboxgl.accessToken = token

      const safeLng =
        typeof centerCoordinates?.longitude === "number" && !isNaN(centerCoordinates.longitude)
          ? centerCoordinates.longitude
          : -46.633308
      const safeLat =
        typeof centerCoordinates?.latitude === "number" && !isNaN(centerCoordinates.latitude)
          ? centerCoordinates.latitude
          : -23.55052

      const initialCenter: [number, number] = [safeLng, safeLat]

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/standard",
        config: {
          basemap: {
            lightPreset: lightPreset,
            theme: lightPreset === "dusk" ? "warm" : "default",
            showPointOfInterestLabels: showPoisRef.current,
            showTransitLabels: showPoisRef.current,
            showPlaceLabels: true,
            showRoadLabels: true,
          },
        },
        center: initialCenter,
        zoom: 14.2,
        pitch: pitch3d ? 58 : 0,
        bearing: -18,
        antialias: true,
        attributionControl: false,
      })
      mapRef.current = map
      loadTimeout = setTimeout(showLoadError, 20000)

      map.on("error", (event) => {
        const status = (event.error as Error & { status?: number }).status
        if (status === 401 || status === 403) {
          showLoadError()
        }
      })

      map.on("rotate", () => {
        setBearing(Math.round(map.getBearing()))
      })

      map.on("style.load", () => {
        try {
          if (typeof map.setConfigProperty === "function") {
            map.setConfigProperty("basemap", "lightPreset", lightPreset)
            map.setConfigProperty("basemap", "theme", lightPreset === "dusk" ? "warm" : "default")
            map.setConfigProperty("basemap", "showPointOfInterestLabels", showPoisRef.current)
            map.setConfigProperty("basemap", "showTransitLabels", showPoisRef.current)
            map.setConfigProperty("basemap", "showPlaceLabels", true)
            map.setConfigProperty("basemap", "showRoadLabels", true)
          }
        } catch (err) {
          console.warn("Config property error:", err)
        }

        if (pitch3d) {
          applyTerrainElevation(map)
        }
        applyAtmosphereFog(map, lightPreset)
      })

      map.on("load", () => {
        if (!isMounted) return
        clearTimeout(loadTimeout)
        setMapError(null)
        setIsMapLoaded(true)

        // Assegura dimensões corretas do canvas
        map.resize()

        // Enquadra células válidas
        const validCells = cells.filter(
          (c) =>
            c.latitude !== null &&
            c.longitude !== null &&
            !isNaN(Number(c.latitude)) &&
            !isNaN(Number(c.longitude))
        )

        if (validCells.length > 1) {
          const bounds = new mapboxgl.LngLatBounds()
          validCells.forEach((c) =>
            bounds.extend([Number(c.longitude), Number(c.latitude)])
          )
          map.fitBounds(bounds, {
            padding: { top: 90, bottom: 90, left: 60, right: 60 },
            maxZoom: 15.5,
            duration: 1200,
          })
        } else if (validCells.length === 1) {
          map.flyTo({
            center: [Number(validCells[0].longitude), Number(validCells[0].latitude)],
            zoom: 15.5,
            pitch: pitch3d ? 58 : 0,
            bearing: -18,
            duration: 1000,
          })
        }
      })

      resizeObserver = new ResizeObserver(() => map.resize())
      resizeObserver.observe(mapContainer.current)
    }).catch(showLoadError)

    return () => {
      isMounted = false
      clearTimeout(loadTimeout)
      resizeObserver?.disconnect()
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, retryCount])

  // Alterna perspectiva 3D / 2D
  const togglePitch = () => {
    if (!mapRef.current) return
    const nextPitch = !pitch3d
    setPitch3d(nextPitch)

    try {
      if (nextPitch) {
        applyTerrainElevation(mapRef.current)
      } else {
        mapRef.current.setTerrain(null)
      }
    } catch {
      // Ignora se terreno não estiver disponível
    }

    mapRef.current.easeTo({
      pitch: nextPitch ? 58 : 0,
      bearing: nextPitch ? (bearing !== 0 ? bearing : -18) : 0,
      duration: 800,
    })
  }

  // Reseta orientação para o Norte
  const handleResetOrientation = () => {
    if (!mapRef.current) return
    mapRef.current.easeTo({
      bearing: 0,
      pitch: pitch3d ? 58 : 0,
      duration: 600,
    })
  }

  // Alterna visibilidade de pontos comerciais e referências
  const togglePois = () => {
    const next = !showPois
    currentShowPois = next
    try {
      localStorage.setItem(SHOW_POIS_KEY, String(next))
    } catch {
      // Ignora erro se localStorage estiver bloqueado
    }
    window.dispatchEvent(new Event(SHOW_POIS_EVENT))
  }

  // Foco cinematográfico ao selecionar uma célula
  useEffect(() => {
    if (
      !mapRef.current ||
      !isMapLoaded ||
      !selectedCell ||
      selectedCell.latitude === null ||
      selectedCell.longitude === null ||
      isNaN(Number(selectedCell.latitude)) ||
      isNaN(Number(selectedCell.longitude))
    )
      return

    mapRef.current.flyTo({
      center: [Number(selectedCell.longitude), Number(selectedCell.latitude)],
      zoom: 16.6,
      pitch: pitch3d ? 58 : 0,
      bearing: -20,
      speed: 1.1,
      curve: 1.3,
      essential: true,
    })
  }, [selectedCell, isMapLoaded, pitch3d])

  // Update cell 3D markers
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return
    let cancelled = false

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !mapRef.current) return
      // Clear old markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      cells.forEach((cell) => {
        if (
          cell.latitude === null ||
          cell.longitude === null ||
          isNaN(Number(cell.latitude)) ||
          isNaN(Number(cell.longitude))
        )
          return

        const isSelected = selectedCell?.id === cell.id
        const color = cell.categoryColor || "#f97316"

        // Create 3D stylized house DOM
        const el = document.createElement("div")
        el.className = `cell-3d-marker flex flex-col items-center ${isSelected ? "is-selected" : ""}`
        el.style.width = "72px"
        el.style.height = "76px"

        el.innerHTML = `
          <div class="relative flex flex-col items-center cursor-pointer group">
            <!-- Pulsing ring if meets today -->
            ${
              cell.meetsToday
                ? `<div class="absolute -inset-2.5 rounded-full cell-pulse-ring pointer-events-none" style="background: radial-gradient(circle, ${color}66 0%, transparent 70%);"></div>`
                : ""
            }

            <!-- Floating Label Pill -->
            <div class="mb-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md whitespace-nowrap backdrop-blur-md transition-all duration-200 ${
              isSelected
                ? "scale-110 bg-foreground text-background ring-2 ring-primary"
                : "bg-background/90 text-foreground border border-border/50 group-hover:scale-105"
            }">
              <span>${cell.name}</span>
              ${cell.meetsToday ? '<span class="ml-1 text-[8px] text-amber-500">🔥 HOJE</span>' : ""}
            </div>

            <!-- Isometric 3D House SVG -->
            <div class="relative drop-shadow-xl transition-transform duration-200">
              <svg width="46" height="42" viewBox="0 0 46 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Ground Drop Shadow -->
                <ellipse cx="23" cy="38" rx="16" ry="4" fill="rgba(0,0,0,0.25)" />

                <!-- Left Wall (shaded) -->
                <path d="M8 22L23 30V39L8 31V22Z" fill="#1e293b" stroke="#334155" stroke-width="0.75" />

                <!-- Right Wall (light) -->
                <path d="M23 30L38 22V31L23 39V30Z" fill="#334155" stroke="#475569" stroke-width="0.75" />

                <!-- Left Roof Slope (shaded with category color) -->
                <path d="M23 11L7 20.5L8 22L23 13V11Z" fill="${color}" opacity="0.8" />
                <path d="M7 20.5L23 11L23 13L8 22L7 20.5Z" fill="#000" opacity="0.2" />

                <!-- Roof Main Pyramid / Gable -->
                <path d="M23 8L6 19L23 29L40 19L23 8Z" fill="${color}" stroke="#ffffff" stroke-width="0.8" />

                <!-- Roof Ridge Highlight -->
                <path d="M23 8L6 19L23 17L40 19L23 8Z" fill="#ffffff" opacity="0.35" />

                <!-- Glowing Window Left -->
                <polygon points="12,25 18,28 18,33 12,30" fill="${lightPreset === "day" ? "#67e8f9" : "#fef08a"}" opacity="0.95" />

                <!-- Glowing Front Door Right -->
                <polygon points="27,29 33,26 33,36 27,39" fill="${color}" opacity="0.95" stroke="#fff" stroke-width="0.5" />
                <circle cx="28.5" cy="34" r="0.8" fill="#ffffff" />

                <!-- Cross / Apex Light -->
                <circle cx="23" cy="8" r="2.5" fill="#ffffff" />
                <circle cx="23" cy="8" r="1.5" fill="${color}" />
              </svg>
            </div>
          </div>
        `

        el.addEventListener("click", (e) => {
          e.stopPropagation()
          onSelectCell(cell)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([Number(cell.longitude), Number(cell.latitude)])
          .addTo(mapRef.current)

        markersRef.current.push(marker)
      })
    })
    return () => { cancelled = true }
  }, [cells, isMapLoaded, selectedCell, onSelectCell, themeMode, lightPreset])

  // User GPS marker
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return
    let cancelled = false

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !mapRef.current) return
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
        userMarkerRef.current = null
      }

      if (!userLocation) return

      const el = document.createElement("div")
      el.className = "relative flex items-center justify-center"
      el.style.width = "32px"
      el.style.height = "32px"
      el.innerHTML = `
        <div class="absolute -inset-1 rounded-full bg-cyan-400/40 animate-ping"></div>
        <div class="relative w-4 h-4 rounded-full bg-cyan-500 border-2 border-white shadow-lg"></div>
      `

      userMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .addTo(mapRef.current)

      // Fly camera to user's location
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 14.8,
        essential: true,
        duration: 1200,
      })
    })
    return () => { cancelled = true }
  }, [userLocation, isMapLoaded])

  // Route drawing
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    const map = mapRef.current

    if (!routeLine || routeLine.length < 2) {
      if (map.getLayer("cell-route-line")) map.removeLayer("cell-route-line")
      if (map.getSource("cell-route")) map.removeSource("cell-route")
      return
    }

    const geojson = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: routeLine,
      },
    }

    if (map.getSource("cell-route")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource("cell-route") as any).setData(geojson)
    } else {
      map.addSource("cell-route", {
        type: "geojson",
        data: geojson,
      })

      map.addLayer({
        id: "cell-route-line",
        type: "line",
        source: "cell-route",
        slot: "top",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#06b6d4",
          "line-width": 5.5,
          "line-blur": 1.2,
          "line-opacity": 0.95,
        },
      })
    }

    // Fit camera to enclose route
    let cancelled = false
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || mapRef.current !== map) return
      const bounds = routeLine.reduce(
        (b, coord) => b.extend(coord as [number, number]),
        new mapboxgl.LngLatBounds(routeLine[0], routeLine[0])
      )
      map.fitBounds(bounds, {
        padding: { top: 120, bottom: 220, left: 50, right: 50 },
        pitch: 50,
        duration: 1200,
      })
    })
    return () => { cancelled = true }
  }, [routeLine, isMapLoaded])

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      {/* Mapbox Canvas Container */}
      <div ref={mapContainer} className="h-full w-full select-none" />

      {(missingToken || mapError || !isMapLoaded) && (
        <div
          role={missingToken || mapError ? "alert" : "status"}
          className="absolute top-1/2 left-4 right-4 z-20 mx-auto max-w-md -translate-y-1/2 rounded-lg border border-border bg-background/95 p-4 text-sm text-foreground shadow-lg backdrop-blur"
        >
          <p>
            {missingToken
              ? "Mapa indisponível no momento. Consulte a lista de células."
              : mapError || "Carregando mapa 3D de células…"}
          </p>
          {mapError && !missingToken && (
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-3 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {/* Floating Controls Toolbar */}
      <div className="absolute bottom-24 right-3 sm:right-4 z-10 flex flex-col items-end gap-2.5 pointer-events-auto select-none">
        {/* Lighting Selector Pill */}
        <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/90 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setLightPreset("dusk")}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-all active:scale-95 ${
              lightPreset === "dusk"
                ? "bg-amber-500/25 border border-amber-500/40 text-amber-500 dark:text-amber-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Iluminação: Crepúsculo (Pôr do Sol)"
          >
            <Sunset className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-[11px]">Crepúsculo</span>
          </button>

          <button
            type="button"
            onClick={() => setLightPreset("night")}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-all active:scale-95 ${
              lightPreset === "night"
                ? "bg-indigo-500/25 border border-indigo-500/40 text-indigo-500 dark:text-indigo-400 shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Iluminação: Noite"
          >
            <Moon className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-[11px]">Noite</span>
          </button>

          <button
            type="button"
            onClick={() => setLightPreset("day")}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-all active:scale-95 ${
              lightPreset === "day"
                ? "bg-sky-500/25 border border-sky-500/40 text-sky-600 dark:text-sky-300 shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Iluminação: Dia"
          >
            <Sun className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-[11px]">Dia</span>
          </button>
        </div>

        {/* Camera & Navigation Stack */}
        <div className="flex flex-col items-center gap-1 rounded-full border border-border/70 bg-background/90 p-1 shadow-xl backdrop-blur-md">
          {/* Compass / Reset North */}
          <button
            type="button"
            onClick={handleResetOrientation}
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-all active:scale-90 hover:bg-accent"
            title="Alinhar ao Norte"
          >
            <Compass
              className="h-4 w-4 transition-transform duration-200"
              style={{ transform: `rotate(${-bearing}deg)` }}
            />
          </button>

          <div className="h-px w-5 bg-border/60" />

          {/* 3D / 2D Toggle */}
          <button
            type="button"
            onClick={togglePitch}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-black transition-all active:scale-90 ${
              pitch3d
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-foreground hover:bg-accent"
            }`}
            title="Alternar visão 3D / 2D"
          >
            {pitch3d ? "3D" : "2D"}
          </button>

          <div className="h-px w-5 bg-border/60" />

          {/* Pontos Comerciais & Referências Toggle */}
          <button
            type="button"
            onClick={togglePois}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-90 ${
              showPois
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-foreground hover:bg-accent"
            }`}
            title={showPois ? "Ocultar pontos de referência e comércios" : "Exibir pontos de referência e comércios"}
            aria-label={showPois ? "Ocultar pontos de referência e comércios" : "Exibir pontos de referência e comércios"}
            aria-pressed={showPois}
          >
            <Building2 className="h-4 w-4" />
          </button>

          <div className="h-px w-5 bg-border/60" />

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold text-foreground transition-all active:scale-90 hover:bg-accent"
            title="Aumentar zoom"
          >
            +
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold text-foreground transition-all active:scale-90 hover:bg-accent"
            title="Diminuir zoom"
          >
            −
          </button>
        </div>
      </div>
    </div>
  )
}
