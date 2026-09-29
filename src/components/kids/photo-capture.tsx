"use client"

import Image from "next/image"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Camera, Crop, Expand, ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ImageCropModal } from "./image-crop-modal"
import { PhotoLightbox } from "@/components/ui/photo-lightbox"

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024

async function compressPhoto(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("Use foto JPEG, PNG ou WebP")
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Foto deve ter até 15 MB")
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

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88))
  if (!blob || blob.size > MAX_OUTPUT_BYTES) throw new Error("Não foi possível reduzir foto")
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
}

export function PhotoCapture({
  label,
  currentUrl = null,
  value = null,
  removed = false,
  allowRemove = true,
  disabled = false,
  onChange,
  onError,
}: {
  label: string
  currentUrl?: string | null
  value?: File | null
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

  // Cropper state
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null)
  const [cropModalOpen, setCropModalOpen] = useState(false)

  // Lightbox full-screen state
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value])
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const visibleUrl = preview ?? (!removed ? currentUrl : null)
  const initials = label.trim().slice(0, 2).toUpperCase() || "FT"

  async function handleFileSelected(file: File | null) {
    if (!file) return
    try {
      if (!ACCEPTED_TYPES.has(file.type)) {
        throw new Error("Use foto JPEG, PNG ou WebP")
      }
      if (file.size > MAX_SOURCE_BYTES) {
        throw new Error("Foto deve ter até 15 MB")
      }

      // Abre modal de reposicionamento/recorte
      setCropFile(file)
      setCropImageUrl(null)
      setCropModalOpen(true)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Foto inválida")
    } finally {
      if (cameraRef.current) cameraRef.current.value = ""
      if (galleryRef.current) galleryRef.current.value = ""
    }
  }

  async function handleCropConfirm(croppedFile: File) {
    setCropModalOpen(false)
    try {
      const finalFile = await compressPhoto(croppedFile)
      onChange(finalFile, false)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Erro ao preparar foto")
    }
  }

  function handleOpenCropForCurrent() {
    if (value) {
      setCropFile(value)
      setCropImageUrl(null)
      setCropModalOpen(true)
    } else if (visibleUrl) {
      setCropFile(null)
      setCropImageUrl(visibleUrl)
      setCropModalOpen(true)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3 bg-card/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Foto {label}</p>
        {visibleUrl && (
          <button
            type="button"
            className="text-xs text-primary flex items-center gap-1 hover:underline cursor-pointer"
            onClick={() => setLightboxOpen(true)}
          >
            <Expand className="h-3 w-3" />
            Ver tela inteira
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Avatar circle preview (clickable to view full screen) */}
        <div
          className={`group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border/70 bg-muted text-sm font-semibold text-muted-foreground ${
            visibleUrl ? "cursor-zoom-in ring-offset-background hover:ring-2 hover:ring-primary/50" : ""
          }`}
          onClick={() => {
            if (visibleUrl) setLightboxOpen(true)
          }}
          title={visibleUrl ? "Clique para ver em tela inteira" : undefined}
        >
          {visibleUrl ? (
            <>
              <Image src={visibleUrl} alt={`Foto ${label}`} fill unoptimized className="object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                <Expand className="h-5 w-5" />
              </div>
            </>
          ) : (
            initials
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <input
            ref={cameraRef}
            id={cameraId}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={disabled}
            onChange={(event) => void handleFileSelected(event.currentTarget.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-1 h-4 w-4" />
            Tirar foto
          </Button>

          <input
            ref={galleryRef}
            id={galleryId}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled}
            onChange={(event) => void handleFileSelected(event.currentTarget.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
          >
            <ImagePlus className="mr-1 h-4 w-4" />
            Galeria
          </Button>

          {/* Reposition / Crop button for existing or newly selected image */}
          {visibleUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={handleOpenCropForCurrent}
              title="Reposicionar para enquadrar na bolinha"
            >
              <Crop className="mr-1 h-4 w-4" />
              Reposicionar
            </Button>
          )}

          {(value || (allowRemove && visibleUrl)) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(null, allowRemove && Boolean(currentUrl))}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {value && !allowRemove ? "Cancelar foto" : "Remover"}
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Opcional · JPEG, PNG ou WebP. Clique na bolinha para ver em tela inteira.
      </p>

      {/* Reposition & Crop Modal */}
      <ImageCropModal
        open={cropModalOpen}
        file={cropFile}
        imageUrl={cropImageUrl}
        title={`Ajustar foto ${label}`}
        onConfirm={handleCropConfirm}
        onCancel={() => setCropModalOpen(false)}
      />

      {/* Full-screen Lightbox */}
      <PhotoLightbox
        open={lightboxOpen}
        url={visibleUrl}
        title={`Foto ${label}`}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}
