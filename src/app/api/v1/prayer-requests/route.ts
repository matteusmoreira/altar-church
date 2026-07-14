import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { savePrayerRequest } from "@/lib/operational/actions"
import { listPrayerRequests } from "@/lib/operational/data"

export const GET = createOperationalListHandler("prayer.view", listPrayerRequests)
export const POST = createFormActionPostHandler(savePrayerRequest)
