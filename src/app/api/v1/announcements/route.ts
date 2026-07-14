import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveAnnouncement } from "@/lib/operational/actions"
import { listAnnouncements } from "@/lib/operational/data"

export const GET = createOperationalListHandler("communication.view", listAnnouncements)
export const POST = createFormActionPostHandler(saveAnnouncement)
