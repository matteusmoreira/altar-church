"use client"

import { useEffect, useRef, useState } from "react"
import type { PublicCellItem } from "@/lib/cells/public-cells"
import "mapbox-gl/dist/mapbox-gl.css"

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

  const token = mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""
  const missingToken = !token

  // Initialize Mapbox
  useEffect(() => {
    if (!mapContainer.current) return

    let isMounted = true

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (!isMounted || !mapContainer.current) return

      mapboxgl.accessToken = token

      const mapStyle =
        themeMode === "dark"
          ? "mapbox://styles/mapbox/dark-v11"
          : "mapbox://styles/mapbox/streets-v12"

      const initialCenter: [number, number] = [
        centerCoordinates.longitude,
        centerCoordinates.latitude,
      ]

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: mapStyle,
        center: initialCenter,
        zoom: 13.8,
        pitch: pitch3d ? 55 : 0,
        bearing: -15,
        antialias: true,
        attributionControl: false,
      })

      map.on("load", () => {
        if (!isMounted) return
        setIsMapLoaded(true)

        // Add 3D building layer
        try {
          const layers = map.getStyle().layers
          const labelLayerId = layers?.find(
            (layer) => layer.type === "symbol" && layer.layout?.["text-field"]
          )?.id

          if (!map.getLayer("3d-buildings") && map.getSource("composite")) {
            map.addLayer(
              {
                id: "3d-buildings",
                source: "composite",
                "source-layer": "building",
                filter: ["==", "extrude", "true"],
                type: "fill-extrusion",
                minzoom: 14,
                paint: {
                  "fill-extrusion-color": themeMode === "dark" ? "#1e293b" : "#e2e8f0",
                  "fill-extrusion-height": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    0,
                    15.05,
                    ["get", "height"],
                  ],
                  "fill-extrusion-base": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    14,
                    0,
                    15.05,
                    ["get", "min_height"],
                  ],
                  "fill-extrusion-opacity": 0.85,
                },
              },
              labelLayerId
            )
          }

          // Add sky atmosphere
          if (!map.getLayer("sky")) {
            map.addLayer({
              id: "sky",
              type: "sky",
              paint: {
                "sky-type": "atmosphere",
                "sky-atmosphere-sun": [0.0, 0.0],
                "sky-atmosphere-sun-intensity": 12,
              },
            })
          }
        } catch {
          // Ignore building layer error if vector source is mocked
        }
      })

      mapRef.current = map
    })

    return () => {
      isMounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeMode])

  // Toggle 3D pitch
  const togglePitch = () => {
    if (!mapRef.current) return
    const nextPitch = !pitch3d
    setPitch3d(nextPitch)
    mapRef.current.easeTo({
      pitch: nextPitch ? 58 : 0,
      bearing: nextPitch ? -18 : 0,
      duration: 800,
    })
  }

  // Handle selected cell flyTo
  useEffect(() => {
    if (!mapRef.current || !selectedCell || selectedCell.latitude === null || selectedCell.longitude === null) return

    mapRef.current.flyTo({
      center: [selectedCell.longitude, selectedCell.latitude],
      zoom: 16.8,
      pitch: 58,
      bearing: -20,
      speed: 1.2,
      curve: 1.4,
      essential: true,
    })
  }, [selectedCell])

  // Update cell 3D markers
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      // Clear old markers
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      cells.forEach((cell) => {
        if (cell.latitude === null || cell.longitude === null) return

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
                <polygon points="12,25 18,28 18,33 12,30" fill="${themeMode === "dark" ? "#fef08a" : "#67e8f9"}" opacity="0.9" />

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
          .setLngLat([cell.longitude, cell.latitude])
          .addTo(mapRef.current)

        markersRef.current.push(marker)
      })
    })
  }, [cells, isMapLoaded, selectedCell, onSelectCell, themeMode])

  // User GPS marker
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    import("mapbox-gl").then(({ default: mapboxgl }) => {
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
    })
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
    import("mapbox-gl").then(({ default: mapboxgl }) => {
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
  }, [routeLine, isMapLoaded])

  return (
    <div className="relative h-full w-full overflow-hidden bg-muted/40">
      {/* Mapbox Canvas Container */}
      <div ref={mapContainer} className="h-full w-full select-none" />

      {/* Missing Token Banner Notification */}
      {missingToken && (
        <div className="absolute top-4 left-4 right-4 z-20 mx-auto max-w-md rounded-lg border border-warning/30 bg-background/95 p-3.5 shadow-lg backdrop-blur text-xs text-foreground">
          <p className="font-semibold text-warning">Dica de Configuração:</p>
          <p className="mt-0.5 text-muted-foreground">
            Adicione <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> no arquivo <code className="rounded bg-muted px-1 py-0.5">.env.local</code> para carregar os prédios 3D oficiais e o mapa com máxima resolução.
          </p>
        </div>
      )}

      {/* Floating 3D/2D Perspective Toggle Button */}
      <div className="absolute bottom-24 right-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={togglePitch}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-background/90 text-xs font-bold text-foreground shadow-xl backdrop-blur-md transition-all active:scale-95 hover:bg-background"
          title="Alternar visão 3D / 2D"
        >
          {pitch3d ? "3D" : "2D"}
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/90 text-lg font-bold text-foreground shadow-lg backdrop-blur-md active:scale-95 hover:bg-background"
          title="Aumentar zoom"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/90 text-lg font-bold text-foreground shadow-lg backdrop-blur-md active:scale-95 hover:bg-background"
          title="Diminuir zoom"
        >
          −
        </button>
      </div>
    </div>
  )
}
