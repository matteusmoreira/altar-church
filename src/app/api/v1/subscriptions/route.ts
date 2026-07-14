import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveSubscription } from "@/lib/operational/actions"
import { getInpeaceData } from "@/lib/operational/data"

export const GET = createOperationalListHandler("subscription.view", getInpeaceData)
export const POST = createFormActionPostHandler(saveSubscription)
