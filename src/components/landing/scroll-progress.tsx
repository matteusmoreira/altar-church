"use client"

import { useEffect, useState } from "react"

/**
 * Barra fina de progresso de rolagem no topo da landing, com o degradê da
 * marca. Segue a rolagem feita pelo próprio usuário, então não precisa ser
 * desligada em `prefers-reduced-motion`.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const update = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])

  return (
    <div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5">
      <div className="bg-ac-gradient h-full origin-left" style={{ transform: `scaleX(${progress})` }} />
    </div>
  )
}
