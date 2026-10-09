"use client"
import { useSyncExternalStore } from "react"
import { QRCodeSVG } from "qrcode.react"
const subscribe = () => () => {}
export function ClientEventQr({ path, size = 190 }: { path: string; size?: number }) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => "")
  return origin ? <QRCodeSVG value={new URL(path, origin).href} size={size} /> : <p className="text-sm text-muted-foreground">Preparando QR…</p>
}
