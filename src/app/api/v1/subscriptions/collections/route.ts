import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveSubscriptionCollection } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveSubscriptionCollection)
