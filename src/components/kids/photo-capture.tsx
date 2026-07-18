"use client"

import Image from "next/image"
import { useEffect, useId, useMemo, useRef } from "react"
import { Camera, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024

async function compressPhoto(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Use foto JPEG, PNG ou WebP")
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Foto deve ter até 10 MB")
  if (typeof createImageBitmap !== "function") {
    if (file.size > MAX_OUTPUT_BYTES) throw new Error("Foto deve ter até 5 MB")
    return file
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível preparar foto")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
  if (!blob || blob.size > MAX_OUTPUT_BYTES) throw new Error("Não foi possível reduzir foto")
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
}

export function PhotoCapture({
  label,
  currentUrl = null,
  value,
  removed = false,
  allowRemove = true,
  disabled = false,
  onChange,
  onError,
}: {
  label: string
  currentUrl?: string | null
  value: File | null
  removed?: boolean
  allowRemove?: boolean
  disabled?: boolean
  onChange: (file: File | null, removed?: boolean) => void
  onError?: (message: string) => void
}) {
  const cameraId = `${useId()}-camera`
  const galleryId = `${useId()}-gallery`
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const preview = useMemo(() => value ? URL.createObjectURL(value) : null, [value])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  async function select(file: File | null) {
    if (!file) return
    try {
      onChange(await compressPhoto(file), false)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Foto inválida")
    } finally {
      if (cameraRef.current) cameraRef.current.value = ""
      if (galleryRef.current) galleryRef.current.value = ""
    }
  }

  const visibleUrl = preview ?? (!removed ? currentUrl : null)
  const initials = label.trim().slice(0, 2).toUpperCase() || "FT"

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <p className="text-sm font-medium">Foto {label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {visibleUrl ? <Image src={visibleUrl} alt={`Foto ${label}`} fill unoptimized className="object-cover" /> : initials}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={cameraRef} id={cameraId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={disabled} onChange={(event) => void select(event.currentTarget.files?.[0] ?? null)} />
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => cameraRef.current?.click()}>
            <Camera className="mr-1 h-4 w-4" />Tirar foto
          </Button>
          <input ref={galleryRef} id={galleryId} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => void select(event.currentTarget.files?.[0] ?? null)} />
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => galleryRef.current?.click()}>
            <ImagePlus className="mr-1 h-4 w-4" />Galeria
          </Button>
          {(value || (allowRemove && visibleUrl)) && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(null, allowRemove && Boolean(currentUrl))}>
              <Trash2 className="mr-1 h-4 w-4" />{value && !allowRemove ? "Cancelar foto" : "Remover"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Opcional · JPEG, PNG ou WebP.</p>
    </div>
  )
}
