import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveSubscriptionTag } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveSubscriptionTag)
