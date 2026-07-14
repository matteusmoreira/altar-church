import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveSupplier } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveSupplier)
