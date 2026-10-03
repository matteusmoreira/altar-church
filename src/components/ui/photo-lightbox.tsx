"use client"

import { useEffect, useState, useCallback } from "react"
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PhotoLightboxProps {
  open?: boolean
  isOpen?: boolean
  url?: string | null
  photoUrl?: string | null
  title: string
  subtitle?: string
  onClose: () => void
}

export function PhotoLightbox({
  open,
  isOpen,
  url,
  photoUrl,
  title,
  subtitle,
  onClose,
}: PhotoLightboxProps) {
  const isCurrentlyOpen = open ?? isOpen ?? false
  const activeUrl = url ?? photoUrl ?? null
  const [zoom, setZoom] = useState(1)

  // Reinicia o zoom ao fechar durante a renderização (idioma "adjusting state when a prop changes").
  const [wasOpen, setWasOpen] = useState(isCurrentlyOpen)
  if (wasOpen !== isCurrentlyOpen) {
    setWasOpen(isCurrentlyOpen)
    if (!isCurrentlyOpen) setZoom(1)
  }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!isCurrentlyOpen) return
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isCurrentlyOpen, handleKeyDown])

  if (!isCurrentlyOpen || !activeUrl) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto em tela inteira: ${title}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md text-white select-none animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Top action bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
        <div className="min-w-0 pr-4">
          <h2 className="text-base font-semibold text-white truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-white/70 truncate">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
            disabled={zoom <= 1}
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          {zoom > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9"
              onClick={() => setZoom(1)}
              title="Redefinir tamanho"
              aria-label="Redefinir tamanho"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white/80 hover:text-white hover:bg-white/10 h-9 w-9 ml-2"
            onClick={onClose}
            title="Fechar (ESC)"
            aria-label="Fechar visualização"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main photo view area */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-auto cursor-zoom-out"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeUrl}
          alt={title}
          style={{
            transform: `scale(${zoom})`,
            transition: "transform 0.15s ease-out",
          }}
          className="max-h-[calc(100dvh-7rem)] max-w-full rounded-md object-contain shadow-2xl pointer-events-auto cursor-default"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Bottom hint bar */}
      <div className="py-2 text-center text-xs text-white/50 border-t border-white/5 bg-black/30">
        Toque fora da foto ou pressione ESC para fechar
      </div>
    </div>
  )
}
