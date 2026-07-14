import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveNotification } from "@/lib/operational/actions"
import { listNotifications } from "@/lib/operational/data"

export const GET = createOperationalListHandler("notification.view", listNotifications)
export const POST = createFormActionPostHandler(saveNotification)
