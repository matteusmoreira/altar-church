import { MemberShell } from "@/components/member/member-shell"
import { getMemberShellData } from "@/lib/member/data"

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { user, churchName, churchLogoUrl, capabilities, whatsappPending } = await getMemberShellData()
  return (
    <MemberShell
      memberName={user.name}
      churchName={churchName}
      churchLogoUrl={churchLogoUrl}
      hasVolunteerPortal={capabilities.hasVolunteerPortal}
      whatsappPending={whatsappPending}
    >
      {children}
    </MemberShell>
  )
}
