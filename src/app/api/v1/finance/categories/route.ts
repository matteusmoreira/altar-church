import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveFinancialCategory } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveFinancialCategory)
