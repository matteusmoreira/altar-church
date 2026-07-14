import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveRevenue } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveRevenue)
