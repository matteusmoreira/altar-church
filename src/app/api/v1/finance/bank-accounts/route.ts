import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveBankAccount } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveBankAccount)
