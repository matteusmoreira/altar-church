"use client"

// Instância única para Web Audio API
let globalAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!globalAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass()
    }
  }
  return globalAudioCtx
}

// Desbloqueia o contexto de áudio após interação do usuário (necessário em iOS Safari / Android Chrome)
export function unlockAudio() {
  const ctx = getAudioContext()
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {})
  }
}

// Registra listeners para desbloquear áudio no primeiro toque do usuário
if (typeof window !== "undefined") {
  const unlockEvents = ["click", "touchstart", "keydown"]
  const onUserInteraction = () => {
    unlockAudio()
    unlockEvents.forEach((event) => window.removeEventListener(event, onUserInteraction))
  }
  unlockEvents.forEach((event) =>
    window.addEventListener(event, onUserInteraction, { passive: true }),
  )
}

/**
 * Toca melodia nítida de alerta (adequada para ambientes como igrejas/culto).
 * Utiliza Web Audio API sintetizada nativamente para não depender de downloads de MP3.
 */
export function playKidsAlertSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === "suspended") {
      void ctx.resume()
    }

    const now = ctx.currentTime

    const playTone = (freq: number, start: number, duration: number, gainValue = 0.5) => {
      const effectiveStart = Math.max(start, ctx.currentTime)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(freq, effectiveStart)

      gain.gain.setValueAtTime(0.001, effectiveStart)
      gain.gain.linearRampToValueAtTime(gainValue, effectiveStart + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, effectiveStart + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(effectiveStart)
      osc.stop(effectiveStart + duration)
    }

    // Melodia ascendente dupla de alerta (G5 -> C6 -> E6)
    playTone(784, now, 0.12, 0.6)
    playTone(1046.5, now + 0.1, 0.12, 0.65)
    playTone(1318.5, now + 0.2, 0.25, 0.7)

    // Segunda repetição com intervalo de chamada (G5 -> C6 -> G6)
    playTone(784, now + 0.45, 0.12, 0.6)
    playTone(1046.5, now + 0.55, 0.12, 0.65)
    playTone(1567.98, now + 0.65, 0.35, 0.75)
  } catch (err) {
    console.warn("Falha ao emitir alerta sonoro:", err)
  }
}

/**
 * Dispara vibração no celular (padrão de atenção com 3 pulsos fortes).
 */
export function vibratePhone() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      // 350ms vibrando, 150ms pausa, 350ms vibrando, 150ms pausa, 700ms vibrando
      navigator.vibrate([350, 150, 350, 150, 700])
    } catch (err) {
      console.warn("Falha ao acionar vibração do dispositivo:", err)
    }
  }
}

/**
 * Solicita permissão para notificações do sistema se ainda não configurado.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission !== "denied") {
    try {
      const res = await Notification.requestPermission()
      return res === "granted"
    } catch {
      return false
    }
  }
  return false
}

/**
 * Exibe notificação de sistema (aparece no Android/iOS se PWA e desktop mesmo com app em segundo plano).
 */
export function showSystemNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: "altar-kids-message",
      })
    } catch (err) {
      console.warn("Falha ao exibir notificação nativa:", err)
    }
  }
}

/**
 * Dispara todo o conjunto de alerta: Som + Vibração + Notificação nativa.
 */
export function triggerKidsAlert(messageBody: string, senderName = "Ministério Kids") {
  unlockAudio()
  playKidsAlertSound()
  vibratePhone()
  showSystemNotification(`🚨 ${senderName}`, messageBody)
}
