import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveNotificationGroup } from "@/lib/operational/actions"
import { listNotificationGroups } from "@/lib/operational/data"

export const GET = createOperationalListHandler("notification.view", listNotificationGroups)
export const POST = createFormActionPostHandler(saveNotificationGroup)
