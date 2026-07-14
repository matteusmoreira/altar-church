import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveCostCenter } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveCostCenter)
