"use client"

import { useState, useEffect } from "react"
import { Church } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChurchLogoProps {
  logoUrl?: string | null
  churchName?: string
  className?: string
  iconClassName?: string
  fallbackVariant?: "gradient" | "ghost"
  alt?: string
}

export function ChurchLogo({
  logoUrl,
  churchName = "Altar Church",
  className = "h-10 w-10 rounded-panel",
  iconClassName = "h-5 w-5 text-white",
  fallbackVariant = "gradient",
  alt,
}: ChurchLogoProps) {
  const [logoOverride, setLogoOverride] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)
  const currentLogo = logoOverride ?? logoUrl ?? null

  useEffect(() => {
    const handleLogoUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ logoUrl: string }>
      if (customEvent.detail?.logoUrl) {
        setLogoOverride(customEvent.detail.logoUrl)
        setHasError(false)
      }
    }
    window.addEventListener("church-logo-updated", handleLogoUpdate)
    return () => {
      window.removeEventListener("church-logo-updated", handleLogoUpdate)
    }
  }, [])

  if (currentLogo && !hasError) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-border/50 bg-card shadow-glow-sm",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentLogo}
          alt={alt ?? `Logotipo de ${churchName}`}
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      </div>
    )
  }

  if (fallbackVariant === "ghost") {
    return <Church className={iconClassName} />
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center gradient-primary shadow-glow-sm",
        className,
      )}
    >
      <Church className={iconClassName} />
    </div>
  )
}
