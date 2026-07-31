import { Heart } from "lucide-react"
import { MemberPrayerForm } from "@/components/member/member-prayer-form"

export default function MemberPrayerPage() {
  return <div className="space-y-6"><div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><Heart className="h-6 w-6 text-primary" /> Oração</h1><p className="text-muted-foreground">Compartilhe um pedido com segurança.</p></div><MemberPrayerForm /></div>
}
