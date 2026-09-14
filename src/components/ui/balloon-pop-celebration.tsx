"use client"

import { useEffect, useRef } from "react"

interface Balloon {
  id: number
  x: number
  y: number
  targetY: number
  radiusX: number
  radiusY: number
  color: string
  highlightColor: string
  stringLength: number
  stringWobble: number
  vx: number
  vy: number
  swaySpeed: number
  swayPhase: number
  popped: boolean
  popTime: number
  inflating: boolean
  scale: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  vRot: number
  alpha: number
  type: "ribbon" | "rubber" | "star"
  aspectRatio: number
}

interface Shockwave {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
}

const BALLOON_COLORS = [
  { main: "#EF4444", highlight: "#FCA5A5" }, // Coral / Red
  { main: "#10B981", highlight: "#6EE7B7" }, // Emerald
  { main: "#F59E0B", highlight: "#FDE68A" }, // Amber / Gold
  { main: "#3B82F6", highlight: "#93C5FD" }, // Royal Blue
  { main: "#8B5CF6", highlight: "#C4B5FD" }, // Violet
  { main: "#EC4899", highlight: "#F9A8D4" }, // Pink
  { main: "#06B6D4", highlight: "#67E8F9" }, // Cyan
]

const CONFETTI_COLORS = [
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#FBBF24",
  "#34D399",
  "#A78BFA",
]

export function BalloonPopCelebration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)
    let dpr = window.devicePixelRatio || 1

    function resize() {
      if (!canvas) return
      width = canvas.width = window.innerWidth * dpr
      height = canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx?.scale(dpr, dpr)
    }
    resize()
    window.addEventListener("resize", resize)

    // Synthesized gentle pop sound (using Web Audio API, safe fallback)
    function playPopSound() {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) return
        const ctxAudio = new AudioCtx()
        if (ctxAudio.state === "suspended") {
          void ctxAudio.resume()
        }
        const osc = ctxAudio.createOscillator()
        const gain = ctxAudio.createGain()
        osc.type = "sine"
        osc.frequency.setValueAtTime(450, ctxAudio.currentTime)
        osc.frequency.exponentialRampToValueAtTime(80, ctxAudio.currentTime + 0.08)
        gain.gain.setValueAtTime(0.3, ctxAudio.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctxAudio.currentTime + 0.08)
        osc.connect(gain)
        gain.connect(ctxAudio.destination)
        osc.start()
        osc.stop(ctxAudio.currentTime + 0.09)
      } catch {
        // AudioContext disabled or blocked by browser gesture policies
      }
    }

    const balloons: Balloon[] = []
    const particles: Particle[] = []
    const shockwaves: Shockwave[] = []

    const count = Math.min(8, Math.max(5, Math.floor(window.innerWidth / 160)))
    const startTime = performance.now()

    for (let i = 0; i < count; i++) {
      const col = BALLOON_COLORS[i % BALLOON_COLORS.length]
      const spreadX = (window.innerWidth * (i + 1)) / (count + 1)
      const jitterX = (Math.random() - 0.5) * (window.innerWidth / (count * 1.5))
      const radius = 32 + Math.random() * 10

      balloons.push({
        id: i,
        x: Math.max(40, Math.min(window.innerWidth - 40, spreadX + jitterX)),
        y: window.innerHeight + 60 + i * 45 + Math.random() * 50,
        targetY: 80 + Math.random() * (window.innerHeight * 0.45),
        radiusX: radius,
        radiusY: radius * 1.22,
        color: col.main,
        highlightColor: col.highlight,
        stringLength: 55 + Math.random() * 20,
        stringWobble: Math.random() * Math.PI * 2,
        vx: 0,
        vy: -(2.8 + Math.random() * 1.2),
        swaySpeed: 0.025 + Math.random() * 0.02,
        swayPhase: Math.random() * Math.PI * 2,
        popped: false,
        popTime: 700 + i * 450 + Math.random() * 300,
        inflating: false,
        scale: 1,
      })
    }

    function createExplosion(x: number, y: number, color: string) {
      playPopSound()

      // Shockwave
      shockwaves.push({
        x,
        y,
        radius: 12,
        maxRadius: 80 + Math.random() * 25,
        alpha: 0.85,
        color,
      })

      // Particles (ribbons, rubber shards, sparkles)
      const particleCount = 32 + Math.floor(Math.random() * 12)
      for (let p = 0; p < particleCount; p++) {
        const angle = Math.random() * Math.PI * 2
        const speed = 3.5 + Math.random() * 8.5
        const typeRand = Math.random()
        const type: "ribbon" | "rubber" | "star" =
          typeRand < 0.45 ? "ribbon" : typeRand < 0.75 ? "rubber" : "star"

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.5,
          color: type === "rubber" ? color : CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: type === "ribbon" ? 7 + Math.random() * 6 : 4 + Math.random() * 4,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
          alpha: 1,
          type,
          aspectRatio: type === "ribbon" ? 0.35 + Math.random() * 0.3 : 1,
        })
      }
    }

    // Launch side confetti cannon bursts
    function triggerCannon(fromLeft: boolean) {
      const originX = fromLeft ? 40 : window.innerWidth - 40
      const originY = window.innerHeight - 30
      const angleBase = fromLeft ? -Math.PI / 3.5 : (-2 * Math.PI) / 3.5

      for (let i = 0; i < 28; i++) {
        const angle = angleBase + (Math.random() - 0.5) * 0.6
        const speed = 7 + Math.random() * 9
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: 6 + Math.random() * 7,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.28,
          alpha: 1,
          type: "ribbon",
          aspectRatio: 0.3 + Math.random() * 0.3,
        })
      }
    }

    const timerCannon1 = setTimeout(() => triggerCannon(true), 300)
    const timerCannon2 = setTimeout(() => triggerCannon(false), 500)
    const timerCannon3 = setTimeout(() => {
      triggerCannon(true)
      triggerCannon(false)
    }, 1400)

    // Interactive clicking/tapping to pop balloons
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX
      const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY

      for (const b of balloons) {
        if (b.popped) continue
        const dx = clientX - b.x
        const dy = clientY - b.y
        const distSq = (dx * dx) / (b.radiusX * b.radiusX) + (dy * dy) / (b.radiusY * b.radiusY)
        if (distSq <= 1.4) {
          b.popped = true
          createExplosion(b.x, b.y, b.color)
          break
        }
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)

    let animationFrameId: number
    let running = true

    function render(now: number) {
      if (!running || !ctx) return

      const elapsed = now - startTime
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)

      // 1. Update and draw balloons
      let activeBalloons = 0
      for (const b of balloons) {
        if (b.popped) continue
        activeBalloons++

        // Check if it's time to pop
        if (!b.inflating && elapsed >= b.popTime - 180) {
          b.inflating = true
        }

        if (b.inflating) {
          b.scale += 0.02
        }

        if (elapsed >= b.popTime) {
          b.popped = true
          createExplosion(b.x, b.y, b.color)
          continue
        }

        // Float motion
        b.y += b.vy
        b.swayPhase += b.swaySpeed
        b.x += Math.sin(b.swayPhase) * 0.9

        // Slow down slightly as it reaches upper area
        if (b.y < b.targetY) {
          b.vy *= 0.985
        }

        // Draw balloon
        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.scale(b.scale, b.scale)

        // Draw string
        ctx.beginPath()
        ctx.moveTo(0, b.radiusY)
        const stringSway = Math.sin(b.swayPhase * 1.4) * 8
        ctx.bezierCurveTo(
          stringSway,
          b.radiusY + b.stringLength * 0.35,
          -stringSway,
          b.radiusY + b.stringLength * 0.7,
          stringSway * 0.6,
          b.radiusY + b.stringLength
        )
        ctx.strokeStyle = "rgba(140, 150, 165, 0.45)"
        ctx.lineWidth = 1.4
        ctx.stroke()

        // Draw knot
        ctx.beginPath()
        ctx.moveTo(0, b.radiusY - 2)
        ctx.lineTo(-4, b.radiusY + 5)
        ctx.lineTo(4, b.radiusY + 5)
        ctx.closePath()
        ctx.fillStyle = b.color
        ctx.fill()

        // Draw balloon body (egg-shaped path)
        ctx.beginPath()
        ctx.moveTo(0, -b.radiusY)
        ctx.bezierCurveTo(
          b.radiusX * 1.15,
          -b.radiusY,
          b.radiusX * 1.15,
          b.radiusY * 0.6,
          0,
          b.radiusY
        )
        ctx.bezierCurveTo(
          -b.radiusX * 1.15,
          b.radiusY * 0.6,
          -b.radiusX * 1.15,
          -b.radiusY,
          0,
          -b.radiusY
        )
        ctx.closePath()

        // 3D Radial gradient
        const grad = ctx.createRadialGradient(
          -b.radiusX * 0.32,
          -b.radiusY * 0.35,
          b.radiusX * 0.1,
          0,
          0,
          b.radiusY * 1.1
        )
        grad.addColorStop(0, b.highlightColor)
        grad.addColorStop(0.35, b.color)
        grad.addColorStop(1, shadeColor(b.color, -25))
        ctx.fillStyle = grad
        ctx.shadowColor = "rgba(0,0,0,0.12)"
        ctx.shadowBlur = 12
        ctx.shadowOffsetY = 6
        ctx.fill()
        ctx.shadowColor = "transparent"

        // Gloss highlight
        ctx.beginPath()
        ctx.ellipse(
          -b.radiusX * 0.36,
          -b.radiusY * 0.4,
          b.radiusX * 0.24,
          b.radiusY * 0.16,
          -Math.PI / 5,
          0,
          Math.PI * 2
        )
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)"
        ctx.fill()

        ctx.restore()
      }

      // 2. Update and draw shockwaves
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s]
        sw.radius += 3.8
        sw.alpha -= 0.045
        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(s, 1)
          continue
        }
        ctx.save()
        ctx.beginPath()
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2)
        ctx.strokeStyle = sw.color
        ctx.globalAlpha = sw.alpha
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.restore()
      }

      // 3. Update and draw particles
      for (let p = particles.length - 1; p >= 0; p--) {
        const part = particles[p]
        part.x += part.vx
        part.y += part.vy
        part.vy += 0.22 // gravity
        part.vx *= 0.985 // drag
        part.rotation += part.vRot
        part.alpha -= 0.008

        if (part.alpha <= 0 || part.y > window.innerHeight + 40) {
          particles.splice(p, 1)
          continue
        }

        ctx.save()
        ctx.translate(part.x, part.y)
        ctx.rotate(part.rotation)
        ctx.globalAlpha = Math.max(0, part.alpha)
        ctx.fillStyle = part.color

        if (part.type === "ribbon") {
          const w = part.size
          const h = part.size * part.aspectRatio
          ctx.scale(1, Math.cos(part.rotation * 2))
          ctx.fillRect(-w / 2, -h / 2, w, h)
        } else if (part.type === "rubber") {
          ctx.beginPath()
          ctx.arc(0, 0, part.size * 0.6, 0, Math.PI * 1.5)
          ctx.lineTo(0, 0)
          ctx.closePath()
          ctx.fill()
        } else {
          // Sparkle star
          drawStar(ctx, 0, 0, 4, part.size * 1.1, part.size * 0.45)
          ctx.fill()
        }

        ctx.restore()
      }

      // If everything finished and elapsed > 7s, terminate animation
      if (activeBalloons === 0 && particles.length === 0 && shockwaves.length === 0 && elapsed > 6500) {
        running = false
        return
      }

      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      running = false
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointerdown", handlePointerDown)
      clearTimeout(timerCannon1)
      clearTimeout(timerCannon2)
      clearTimeout(timerCannon3)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full select-none"
      aria-hidden="true"
    />
  )
}

function shadeColor(color: string, percent: number) {
  let num = parseInt(color.replace("#", ""), 16)
  if (isNaN(num)) return color
  let amt = Math.round(2.55 * percent)
  let R = (num >> 16) + amt
  let B = ((num >> 8) & 0x00ff) + amt
  let G = (num & 0x0000ff) + amt
  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (B < 255 ? (B < 1 ? 0 : B) : 255) * 0x100 +
      (G < 255 ? (G < 1 ? 0 : G) : 255)
    )
      .toString(16)
      .slice(1)
  )
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  let rot = (Math.PI / 2) * 3
  let x = cx
  let y = cy
  let step = Math.PI / spikes

  ctx.beginPath()
  ctx.moveTo(cx, cy - outerRadius)
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius
    y = cy + Math.sin(rot) * outerRadius
    ctx.lineTo(x, y)
    rot += step

    x = cx + Math.cos(rot) * innerRadius
    y = cy + Math.sin(rot) * innerRadius
    ctx.lineTo(x, y)
    rot += step
  }
  ctx.lineTo(cx, cy - outerRadius)
  ctx.closePath()
}
