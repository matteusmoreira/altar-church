import { MemberShell } from "@/components/member/member-shell"
import { getMemberShellData } from "@/lib/member/data"

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { user, churchName } = await getMemberShellData()
  return <MemberShell memberName={user.name} churchName={churchName}>{children}</MemberShell>
}
