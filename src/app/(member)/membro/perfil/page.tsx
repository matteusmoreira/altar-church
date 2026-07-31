import { UserRound } from "lucide-react"
import { MemberProfileForm } from "@/components/member/member-profile-form"
import { getMemberProfile } from "@/lib/member/data"

export default async function MemberProfilePage() {
  const profile = await getMemberProfile()
  return <div className="space-y-6"><div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl"><UserRound className="h-6 w-6 text-primary" /> Meu cadastro</h1><p className="text-muted-foreground">Atualize somente seus dados de contato.</p></div>{profile ? <MemberProfileForm profile={profile} /> : <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Sua conta ainda não está vinculada a uma pessoa ativa. Peça ao administrador para corrigir o vínculo.</p>}</div>
}
