"use client"

import React, { useRef, useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface ScrollableFilterRowProps {
  children: React.ReactNode
  className?: string
  themeMode?: "light" | "dark"
}

export function ScrollableFilterRow({
  children,
  className = "",
  themeMode = "dark",
}: ScrollableFilterRowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    // Tolerância de 3px para precisão de subpixel
    setCanScrollLeft(scrollLeft > 3)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 3)
  }, [])

  useEffect(() => {
    checkScroll()
    const el = containerRef.current
    if (!el) return

    const handleResize = () => checkScroll()
    window.addEventListener("resize", handleResize)
    const observer = new ResizeObserver(checkScroll)
    observer.observe(el)

    return () => {
      window.removeEventListener("resize", handleResize)
      observer.disconnect()
    }
  }, [checkScroll])

  const handleScroll = (direction: "left" | "right") => {
    const el = containerRef.current
    if (!el) return
    const offset = direction === "left" ? -220 : 220
    el.scrollBy({ left: offset, behavior: "smooth" })
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = containerRef.current
    if (!el) return
    // Converte scroll vertical da rodinha do mouse em scroll horizontal suave
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY
      checkScroll()
    }
  }

  return (
    <div className="relative w-fit mx-auto max-w-full flex items-center">
      {/* Botão de rolagem para esquerda */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScroll("left")}
          className={`absolute left-0 z-20 flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-lg backdrop-blur-md transition active:scale-95 ${
            themeMode === "dark"
              ? "bg-slate-900/95 text-white hover:bg-slate-800 border border-white/20"
              : "bg-white/95 text-slate-800 hover:bg-white border border-slate-200 shadow-sm"
          }`}
          aria-label="Rolar filtros para a esquerda"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Linha rolável */}
      <div
        ref={containerRef}
        onScroll={checkScroll}
        onWheel={handleWheel}
        className={`flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar scroll-smooth w-full px-1 py-0.5 transition-all ${
          canScrollLeft ? "pl-7" : ""
        } ${canScrollRight ? "pr-7" : ""} ${className}`}
      >
        {children}
      </div>

      {/* Botão de rolagem para direita */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => handleScroll("right")}
          className={`absolute right-0 z-20 flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-lg backdrop-blur-md transition active:scale-95 ${
            themeMode === "dark"
              ? "bg-slate-900/95 text-white hover:bg-slate-800 border border-white/20"
              : "bg-white/95 text-slate-800 hover:bg-white border border-slate-200 shadow-sm"
          }`}
          aria-label="Rolar filtros para a direita"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
