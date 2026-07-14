import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveSubscriptionContent } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveSubscriptionContent)
