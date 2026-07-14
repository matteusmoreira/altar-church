import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveExpense } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveExpense)
