import { Bell, Mail, MessageCircle, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMyNotificationPreferences, saveMyNotificationPreference } from "@/lib/notifications/preferences"

const channels = [
  { key: "push", label: "Notificações push", description: "Avisos no navegador ou celular.", icon: Bell },
  { key: "email", label: "E-mail", description: "Campanhas enviadas para seu e-mail cadastrado.", icon: Mail },
  { key: "whatsapp", label: "WhatsApp", description: "Mensagens enviadas para seu telefone cadastrado.", icon: MessageCircle },
] as const

export default async function MemberNotificationPreferencesPage() {
  const preferences = await getMyNotificationPreferences()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Preferências de comunicação</h1>
        <p className="mt-1 text-muted-foreground">Escolha em quais canais pode receber avisos da igreja. Alteração tem efeito nas próximas campanhas.</p>
      </div>
      <Card className="glass">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4 text-primary" /> Seus canais</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {channels.map(({ key, label, description, icon: Icon }) => {
            const action = async (formData: FormData) => {
              "use server"
              await saveMyNotificationPreference(key, formData.get("optedOut") === "on")
            }
            return (
              <form action={action} key={key} className="flex items-center justify-between gap-4 rounded-xl border border-border/50 p-4">
                <div className="flex min-w-0 items-center gap-3"><Icon className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">{label}</p><p className="text-sm text-muted-foreground">{description}</p></div></div>
                <div className="flex shrink-0 items-center gap-3"><label className="flex items-center gap-2 text-sm"><span className="sr-only">Bloquear {label}</span><input type="checkbox" name="optedOut" defaultChecked={preferences[key]} className="h-4 w-4 rounded border-border" /> Bloquear</label><button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted">Salvar</button></div>
              </form>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
