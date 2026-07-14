import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveSubscriptionPlan } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveSubscriptionPlan)
