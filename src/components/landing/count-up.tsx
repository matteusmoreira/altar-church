"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"

type CountUpProps = {
  to: number
  /** duração em ms */
  duration?: number
  className?: string
  suffix?: string
}

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
}

/**
 * Número que conta de zero até `to` quando entra na viewport.
 * Em `prefers-reduced-motion` o valor final é exibido direto.
 */
export function CountUp({ to, duration = 1400, className, suffix = "" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const [value, setValue] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion) return

    let raf = 0
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(Math.round(to * eased))
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [to, duration, reducedMotion])

  return (
    <span ref={ref} className={className}>
      {reducedMotion ? to : value}
      {suffix}
    </span>
  )
}
