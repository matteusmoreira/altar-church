"use client"

import { useEffect, useRef, useState } from "react"
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser"
import { Button } from "@/components/ui/button"

export function VolunteerQrScanner({ onRead }: { onRead: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controls = useRef<IScannerControls | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => () => controls.current?.stop(), [])
  async function toggle() {
    if (active) { controls.current?.stop(); controls.current = null; setActive(false); return }
    setError("")
    try {
      const reader = new BrowserQRCodeReader()
      controls.current = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (!result) return
        onRead(result.getText())
        controls.current?.stop()
        setActive(false)
      })
      setActive(true)
    } catch { setError("Câmera indisponível. Cole o código QR.") }
  }
  return <div className="space-y-2">
    <Button type="button" size="sm" variant="outline" onClick={toggle}>{active ? "Fechar câmera" : "Ler QR"}</Button>
    <video ref={videoRef} className={active ? "aspect-video w-full rounded-lg bg-black" : "hidden"} muted playsInline />
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
}

