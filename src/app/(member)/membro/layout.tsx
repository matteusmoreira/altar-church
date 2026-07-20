import { MemberShell } from "@/components/member/member-shell"
import { getMemberShellData } from "@/lib/member/data"

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { user, churchName, capabilities } = await getMemberShellData()
  return (
    <MemberShell
      memberName={user.name}
      churchName={churchName}
      hasVolunteerPortal={capabilities.hasVolunteerPortal}
    >
      {children}
    </MemberShell>
  )
}
