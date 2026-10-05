import { getAutomationWorkspace } from "@/lib/automations/data"
import { AutomationWorkspace } from "@/components/automations/automation-workspace"
export const dynamic="force-dynamic"
export default async function AutomationsPage({searchParams}:{searchParams:Promise<{tab?:string}>}){
 const params=await searchParams
 const workspace=await getAutomationWorkspace()
 return <AutomationWorkspace workspace={workspace} initialTab={params.tab}/>
}
