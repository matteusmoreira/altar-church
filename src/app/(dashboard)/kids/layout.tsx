import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function KidsLayout({ children }: { children: React.ReactNode }) {
  // Apenas verifica módulo ativo + autenticação; cada página exige sua permissão
  // (kids.view no hub, kids.checkin.create na recepção, kids.room.view no painel da sala).
  await requireDashboardModuleAccess({ moduleId: "kids" })
  return children
}
