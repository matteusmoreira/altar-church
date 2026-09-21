import { Heart } from "lucide-react"
import { MemberPrayerForm } from "@/components/member/member-prayer-form"
import { PageHeader } from "@/components/shared"

export default function MemberPrayerPage() {
  return <div className="space-y-6"><PageHeader title="Oração" description="Compartilhe um pedido com segurança." icon={Heart} /><MemberPrayerForm /></div>
}
