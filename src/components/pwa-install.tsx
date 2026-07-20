"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react"
import {
  Check,
  Download,
  ExternalLink,
  MoreVertical,
  Share2,
  Smartphone,
  SquarePlus,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type InstallChoice = {
  outcome: "accepted" | "dismissed"
  platform: string
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

type Platform = "android" | "ios" | "other"
type StepIcon = ComponentType<SVGProps<SVGSVGElement>>

type PwaInstallContextValue = {
  busy: boolean
  canShow: boolean
  install: () => Promise<void>
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null)
const SERVER_DEVICE = { platform: "other" as Platform, inAppBrowser: false }

function subscribeToHydration() {
  return () => {}
}

function detectDevice() {
  const userAgent = navigator.userAgent
  const ios =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(userAgent)
  const inAppBrowser =
    /FBAN|FBAV|Instagram|LinkedInApp|Line\/|Twitter|WhatsApp|; wv\)|\bwv\b/i.test(
      userAgent,
    )

  return {
    platform: (ios ? "ios" : android ? "android" : "other") as Platform,
    inAppBrowser,
  }
}

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

function subscribeToStandalone(callback: () => void) {
  const displayMode = window.matchMedia("(display-mode: standalone)")
  displayMode.addEventListener("change", callback)
  return () => displayMode.removeEventListener("change", callback)
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const standalone = useSyncExternalStore(
    subscribeToStandalone,
    isStandaloneMode,
    () => false,
  )
  const [installedDuringSession, setInstalledDuringSession] = useState(false)
  const [busy, setBusy] = useState(false)
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const device = useMemo(
    () => (hydrated ? detectDevice() : SERVER_DEVICE),
    [hydrated],
  )

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstalledDuringSession(true)
      setInstallPrompt(null)
      setInstructionsOpen(false)
      toast.success("Aplicativo instalado")
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleInstalled)

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      )
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (standalone || installedDuringSession || busy) return
    if (!installPrompt) {
      setInstructionsOpen(true)
      return
    }

    setBusy(true)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === "accepted") {
        toast.success("Instalação iniciada")
      } else {
        toast.info("Instalação cancelada. Você pode tentar novamente pelo menu.")
      }
    } catch {
      setInstallPrompt(null)
      setInstructionsOpen(true)
    } finally {
      setBusy(false)
    }
  }, [busy, installPrompt, installedDuringSession, standalone])

  const canShow =
    hydrated &&
    !standalone &&
    !installedDuringSession &&
    (device.platform !== "other" || installPrompt !== null)

  const value = useMemo(
    () => ({ busy, canShow, install }),
    [busy, canShow, install],
  )

  return (
    <PwaInstallContext.Provider value={value}>
      {children}
      <InstallInstructions
        device={device}
        open={instructionsOpen}
        onOpenChange={setInstructionsOpen}
      />
    </PwaInstallContext.Provider>
  )
}

function usePwaInstall() {
  const context = useContext(PwaInstallContext)
  if (!context) {
    throw new Error("PwaInstallButton deve estar dentro de PwaInstallProvider")
  }
  return context
}

export function PwaInstallButton({
  className,
  iconOnly = false,
  variant = "outline",
  size = "sm",
}: {
  className?: string
  iconOnly?: boolean
  variant?: "default" | "outline" | "secondary" | "ghost"
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm"
}) {
  const { busy, canShow, install } = usePwaInstall()
  if (!canShow) return null

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : size}
      className={className}
      disabled={busy}
      onClick={() => void install()}
      title={iconOnly ? "Instalar Aplicativo" : undefined}
      aria-label={iconOnly ? "Instalar Aplicativo" : undefined}
    >
      <Download className={cn(busy && "animate-bounce")} />
      {!iconOnly && <span>Instalar Aplicativo</span>}
    </Button>
  )
}

const BANNER_DISMISSED_KEY = "altar-pwa-install-banner-dismissed"
const BANNER_DISMISSED_EVENT = "altar-pwa-install-banner-change"

function subscribeToBannerDismissal(callback: () => void) {
  window.addEventListener(BANNER_DISMISSED_EVENT, callback)
  return () => window.removeEventListener(BANNER_DISMISSED_EVENT, callback)
}

function getBannerDismissed() {
  return window.localStorage.getItem(BANNER_DISMISSED_KEY) === "1"
}

export function PwaInstallBanner({ className }: { className?: string }) {
  const { canShow, install } = usePwaInstall()
  const dismissed = useSyncExternalStore(
    subscribeToBannerDismissal,
    getBannerDismissed,
    () => true,
  )

  if (!canShow || dismissed) return null

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3 pr-8 sm:pr-0">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="size-5" />
        </div>
        <div>
          <p className="font-semibold">Altar Church no seu celular</p>
          <p className="text-sm text-muted-foreground">
            Acesso rápido pela tela inicial, como aplicativo.
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full sm:w-auto"
        onClick={() => void install()}
      >
        <Download />
        Instalar Aplicativo
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 sm:-right-2 sm:-top-2"
        aria-label="Ocultar convite de instalação"
        title="Ocultar"
        onClick={() => {
          window.localStorage.setItem(BANNER_DISMISSED_KEY, "1")
          window.dispatchEvent(new Event(BANNER_DISMISSED_EVENT))
        }}
      >
        <X />
      </Button>
    </div>
  )
}

function InstallInstructions({
  device,
  open,
  onOpenChange,
}: {
  device: ReturnType<typeof detectDevice>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const iosSteps: Array<{ icon: StepIcon; title: string; text: string }> = [
    {
      icon: Share2,
      title: "Toque em Compartilhar",
      text: "Use o botão de compartilhar do Safari ou do navegador.",
    },
    {
      icon: SquarePlus,
      title: "Adicionar à Tela de Início",
      text: "Role as opções até encontrar esta ação.",
    },
    {
      icon: Check,
      title: "Confirme em Adicionar",
      text: "O ícone do Altar Church aparecerá na tela inicial.",
    },
  ]
  const androidSteps: Array<{ icon: StepIcon; title: string; text: string }> = [
    {
      icon: MoreVertical,
      title: "Abra o menu do navegador",
      text: "Toque nos três pontos no canto da tela.",
    },
    {
      icon: Download,
      title: "Toque em Instalar aplicativo",
      text: "A opção também pode aparecer como Adicionar à tela inicial.",
    },
    {
      icon: Check,
      title: "Confirme a instalação",
      text: "O ícone do Altar Church aparecerá na tela inicial.",
    },
  ]
  const steps = device.platform === "ios" ? iosSteps : androidSteps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Instalar Altar Church</DialogTitle>
          <DialogDescription>
            {device.platform === "ios"
              ? "No iPhone e iPad, a Apple exige estes passos rápidos."
              : "Seu navegador não abriu a instalação automática. Use o menu:"}
          </DialogDescription>
        </DialogHeader>

        {device.inAppBrowser && (
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
            <ExternalLink className="mt-0.5 size-5 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Abra no navegador do celular</p>
              <p className="text-xs text-muted-foreground">
                No menu desta tela, escolha “Abrir no Safari” ou “Abrir no
                Chrome”. Navegadores internos podem bloquear a instalação.
              </p>
            </div>
          </div>
        )}

        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-lg border border-border/60 p-3"
            >
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <step.icon className="size-5" />
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {index + 1}
                </span>
              </div>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <Button type="button" onClick={() => onOpenChange(false)}>
          Entendi
        </Button>
      </DialogContent>
    </Dialog>
  )
}
