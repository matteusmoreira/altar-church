"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PushActivation() {
  const [message, setMessage] = useState("Ative os avisos neste dispositivo para receber notificações da igreja.")
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      void Promise.resolve().then(() => {
        setSupported(false)
        setMessage("Push indisponível neste navegador. No iPhone/iPad, adicione o app à Tela de Início e abra por ela.")
      })
      return
    }
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription()
      if (!subscription || Notification.permission !== "granted") return
      const configResponse = await fetch("/api/v1/notifications/preferences")
      const config = await configResponse.json()
      if (!configResponse.ok || !config.push?.publicKey || !config.push.canSubscribe) return
      const key = Uint8Array.from(atob(config.push.publicKey.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0))
      const oldKey = subscription.options.applicationServerKey
      if (!oldKey || oldKey.byteLength !== key.length || !new Uint8Array(oldKey).every((byte, index) => byte === key[index])) {
        setMessage("A configuração do push mudou. Atualize o cadastro neste dispositivo.")
        return
      }
      const json = subscription.toJSON()
      const response = await fetch("/api/v1/notifications/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, userAgent: navigator.userAgent } }),
      })
      if (response.ok) {
        setActive(true)
        setMessage("Este dispositivo está cadastrado para receber push. A preferência de bloqueio do canal continua sendo respeitada.")
      } else {
        const result = await response.json()
        setMessage(result.error?.message ?? "Não foi possível cadastrar este dispositivo.")
      }
    }).catch(() => setMessage("Não foi possível conferir o cadastro. Tente ativar os avisos novamente."))
  }, [])

  async function activate() {
    if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator) || !window.isSecureContext) return
    if (Notification.permission === "denied") {
      setMessage("O navegador bloqueou os avisos. Permita notificações nas configurações deste site e tente novamente.")
      return
    }
    setBusy(true)
    try {
      // Ask in the click handler before any network request (required by browsers).
      if (await Notification.requestPermission() !== "granted") throw new Error("Autorize as notificações no navegador para ativar os avisos.")
      const response = await fetch("/api/v1/notifications/preferences")
      const config = await response.json()
      if (!response.ok) throw new Error(config.error?.message ?? "Não foi possível carregar a configuração.")
      if (!config.push?.publicKey) throw new Error("Push ainda não configurado pela administração.")
      if (!config.push.canSubscribe) throw new Error("Sua conta precisa estar vinculada a uma pessoa ativa da igreja para receber campanhas.")
      await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const registration = await navigator.serviceWorker.ready
      const base64 = config.push.publicKey.replaceAll("-", "+").replaceAll("_", "/")
      const key = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      let subscription = await registration.pushManager.getSubscription()
      const oldKey = subscription?.options.applicationServerKey
      if (subscription && (!oldKey || oldKey.byteLength !== key.length || !new Uint8Array(oldKey).every((byte, index) => byte === key[index]))) {
        await subscription.unsubscribe()
        subscription = null
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      const json = subscription.toJSON()
      const saved = await fetch("/api/v1/notifications/preferences", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, userAgent: navigator.userAgent } }),
      })
      const result = await saved.json()
      if (!saved.ok) throw new Error(result.error?.message ?? "Não foi possível cadastrar este dispositivo.")
      setActive(true)
      setMessage("Push ativado neste dispositivo. Confira também se o canal está permitido nas preferências.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar os avisos.")
    } finally {
      setBusy(false)
    }
  }

  return <div className="rounded-lg border p-4 space-y-3">
    <p className="font-medium flex items-center gap-2"><Bell className="h-4 w-4" /> Avisos neste dispositivo</p>
    <p className="text-sm text-muted-foreground" role="status">{message}</p>
    <Button type="button" variant="outline" onClick={activate} disabled={busy || !supported}>{busy ? "Ativando…" : active ? "Atualizar cadastro push" : "Ativar notificações push"}</Button>
  </div>
}
