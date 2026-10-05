import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
export default async function AutomationsLayout({children}:{children:React.ReactNode}){
  await requireDashboardModuleAccess({moduleId:"automations",permission:"automations.view"})
  return children
}
