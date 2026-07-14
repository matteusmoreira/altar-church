import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveEvent } from "@/lib/operational/actions"
import { listEvents } from "@/lib/operational/data"

export const GET = createOperationalListHandler("events.view", listEvents)
export const POST = createFormActionPostHandler(saveEvent)
