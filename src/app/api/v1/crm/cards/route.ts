import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveCrmCard } from "@/lib/operational/actions"
import { listCrmCards } from "@/lib/operational/data"

export const GET = createOperationalListHandler("crm.view", listCrmCards)
export const POST = createFormActionPostHandler(saveCrmCard)
