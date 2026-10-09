import { ExternalLink } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { parseEventRegistrationSettings, type EventRegistrationSettings } from "@/lib/events/contract"

export function ExternalEventRegistration({ event, disabled = false }: { event: EventRegistrationSettings; disabled?: boolean }) {
  if (event.registrationMode !== "external") return null
  let settings: Required<EventRegistrationSettings>
  try { settings = parseEventRegistrationSettings(event.registrationMode, event.externalPlatform, event.externalTicketUrl) } catch { return <p className="text-sm text-muted-foreground">Link dos ingressos ainda não disponível.</p> }
  return <div className="space-y-3 rounded-xl border p-4">
    <p className="text-sm font-medium">Inscrições pelo {settings.externalPlatform}</p>
    <p className="text-sm text-muted-foreground">Consulte disponibilidade, valores e condições na plataforma. A inscrição e a conferência do ingresso são realizadas lá.</p>
    {disabled ? <p className="text-sm text-muted-foreground">Compra indisponível para este evento.</p> : <a href={settings.externalTicketUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "h-auto min-h-9 max-w-full whitespace-normal text-center" })}><ExternalLink className="h-4 w-4 shrink-0" />Comprar ingressos no {settings.externalPlatform}</a>}
  </div>
}
