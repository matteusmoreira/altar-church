"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Check, X, ZoomIn, ZoomOut, RotateCw, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ImageCropModalProps {
  open: boolean
  file: File | null
  imageUrl?: string | null
  title?: string
  onConfirm: (croppedFile: File) => void
  onCancel: () => void
}

const VIEWPORT_SIZE = 300
const CIRCLE_SIZE = 260
const CANVAS_OUTPUT_SIZE = 1000

export function ImageCropModal({
  open,
  file,
  imageUrl,
  title = "Ajustar enquadramento",
  onConfirm,
  onCancel,
}: ImageCropModalProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const touchDistanceRef = useRef<number | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  // Reinicia os controles ao fechar durante a renderização (idioma "adjusting state when a prop changes").
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setOffset({ x: 0, y: 0 })
      setZoom(1)
      setRotation(0)
    }
  }

  // A fonte da imagem é um sistema externo (object URL) — o efeito só cria/revoga;
  // quando não há arquivo, a fonte é a prop imageUrl direta.
  const effectiveSourceUrl = file ? sourceUrl : imageUrl ?? null
  useEffect(() => {
    if (!open || !file) return
    const url = URL.createObjectURL(file)
    void (async () => { setSourceUrl(url) })()
    return () => URL.revokeObjectURL(url)
  }, [open, file])

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    setOffset({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  // Base scale calculation to make sure image covers the circle
  const baseScale = naturalDimensions
    ? Math.max(CIRCLE_SIZE / naturalDimensions.width, CIRCLE_SIZE / naturalDimensions.height)
    : 1
  const effectiveScale = baseScale * zoom

  // Pointer event handlers for dragging (mouse and touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setOffset({
      x: dragStartRef.current.offsetX + dx,
      y: dragStartRef.current.offsetY + dy,
    })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false)
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // Ignora caso já liberado
      }
    }
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.002
    setZoom((prev) => Math.min(3.5, Math.max(0.8, +(prev + delta).toFixed(2))))
  }

  // Touch pinch zoom
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY)

      if (touchDistanceRef.current !== null) {
        const delta = (distance - touchDistanceRef.current) * 0.005
        setZoom((prev) => Math.min(3.5, Math.max(0.8, +(prev + delta).toFixed(2))))
      }
      touchDistanceRef.current = distance
    }
  }

  const handleTouchEnd = () => {
    touchDistanceRef.current = null
  }

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360)
  }

  const handleReset = () => {
    setOffset({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  // Render cropped image to high resolution square JPEG
  const handleConfirm = useCallback(async () => {
    if (!effectiveSourceUrl || !naturalDimensions || !imageRef.current) return
    setIsProcessing(true)

    try {
      const img = imageRef.current
      const canvas = document.createElement("canvas")
      canvas.width = CANVAS_OUTPUT_SIZE
      canvas.height = CANVAS_OUTPUT_SIZE
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Não foi possível processar recorte")

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      const ratio = CANVAS_OUTPUT_SIZE / CIRCLE_SIZE
      const center = CANVAS_OUTPUT_SIZE / 2

      ctx.save()
      // Translate to canvas center
      ctx.translate(center, center)
      // Scale according to ratio
      ctx.scale(ratio, ratio)
      // Apply user offset
      ctx.translate(offset.x, offset.y)
      // Apply rotation
      ctx.rotate((rotation * Math.PI) / 180)
      // Apply scaling
      ctx.scale(effectiveScale, effectiveScale)
      // Draw image centered
      ctx.drawImage(
        img,
        -naturalDimensions.width / 2,
        -naturalDimensions.height / 2,
        naturalDimensions.width,
        naturalDimensions.height,
      )
      ctx.restore()

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      )

      if (!blob) throw new Error("Falha ao exportar imagem cortada")

      const fileName = file
        ? `${file.name.replace(/\.[^.]+$/, "") || "foto"}-ajustada.jpg`
        : "foto-ajustada.jpg"

      const croppedFile = new File([blob], fileName, {
        type: "image/jpeg",
        lastModified: Date.now(),
      })

      onConfirm(croppedFile)
    } catch (err) {
      console.error("Erro ao cortar foto:", err)
    } finally {
      setIsProcessing(false)
    }
  }, [effectiveSourceUrl, naturalDimensions, offset, rotation, effectiveScale, file, onConfirm])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="sm:max-w-md p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Arraste e aproxime a foto para aparecer certinho na bolinha.
          </DialogDescription>
        </DialogHeader>

        {/* Viewport container */}
        <div className="flex flex-col items-center justify-center py-2">
          <div
            className="relative overflow-hidden rounded-lg bg-neutral-900 touch-none select-none cursor-grab active:cursor-grabbing border border-border"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {effectiveSourceUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imageRef}
                src={effectiveSourceUrl}
                alt="Para enquadrar"
                onLoad={onImageLoad}
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transformOrigin: "center center",
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${effectiveScale})`,
                  maxWidth: "none",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            )}

            {/* Circular mask with darkened surround and guide */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-full border-2 border-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] relative"
                style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
              >
                {/* Subtle alignment crosshair / guide */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-full h-px border-t border-dashed border-white" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="h-full w-px border-l border-dashed border-white" />
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-2 text-center">
            Dica: arraste para mover e use os botões ou a roda do mouse para dar zoom.
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-3 px-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setZoom((z) => Math.max(0.8, +(z - 0.2).toFixed(2)))}
              title="Diminuir zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min="0.8"
              max="3.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setZoom((z) => Math.min(3.5, +(z + 0.2).toFixed(2)))}
              title="Aumentar zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleRotate}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Girar 90°
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Centralizar
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isProcessing}>
            <X className="mr-1 h-4 w-4" />
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={isProcessing}>
            <Check className="mr-1 h-4 w-4" />
            {isProcessing ? "Ajustando..." : "Confirmar enquadramento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
