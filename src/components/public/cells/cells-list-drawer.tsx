"use client"

import { Calendar, Clock, Compass, MapPin, Navigation, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PublicCellItem } from "@/lib/cells/public-cells"

export interface CellsListDrawerProps {
  cells: (PublicCellItem & { distanceKm?: number | null })[]
  onSelectCell: (cell: PublicCellItem) => void
  onOpenVisitModal: (cell: PublicCellItem) => void
  onClose: () => void
  churchName: string
}

export function CellsListDrawer({
  cells,
  onSelectCell,
  onOpenVisitModal,
  onClose,
  churchName,
}: CellsListDrawerProps) {
  return (
    <div className="flex h-full flex-col bg-background p-4 overflow-y-auto max-w-lg mx-auto">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground">Células - {churchName}</h2>
          <p className="text-xs text-muted-foreground">
            {cells.length} {cells.length === 1 ? "célula encontrada" : "células encontradas"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
          Ver no Mapa 3D
        </Button>
      </div>

      <div className="mt-4 space-y-3 pb-24">
        {cells.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma célula encontrada com os filtros selecionados.
          </div>
        ) : (
          cells.map((cell) => (
            <div
              key={cell.id}
              className="rounded-xl border border-border/80 bg-card p-4 shadow-sm hover:border-primary/50 transition duration-150 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: `${cell.categoryColor}66`,
                        backgroundColor: `${cell.categoryColor}1a`,
                        color: cell.categoryColor,
                      }}
                      className="font-semibold text-[10px]"
                    >
                      {cell.categoryName}
                    </Badge>

                    {cell.meetsToday && (
                      <Badge className="bg-amber-500 text-white font-bold text-[10px] animate-pulse">
                        🔥 Reunião Hoje!
                      </Badge>
                    )}

                    {cell.distanceKm !== null && cell.distanceKm !== undefined && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Compass className="mr-1 h-3 w-3 text-primary" />
                        {cell.distanceKm < 1
                          ? `${Math.round(cell.distanceKm * 1000)}m`
                          : `${cell.distanceKm.toFixed(1)} km`}
                      </Badge>
                    )}
                  </div>

                  <h3 className="mt-1.5 font-bold text-base text-foreground">{cell.name}</h3>
                  {cell.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{cell.description}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>{cell.meetingDay}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>{cell.meetingTime || "A combinar"}</span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{cell.displayAddress}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => onSelectCell(cell)}
                >
                  <Navigation className="mr-1.5 h-3.5 w-3.5 text-cyan-500" />
                  Ver no Mapa 3D
                </Button>

                <Button
                  size="sm"
                  className="text-xs font-semibold"
                  onClick={() => onOpenVisitModal(cell)}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Quero Visitar
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
