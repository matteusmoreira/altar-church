import { createFormActionPostHandler } from "@/lib/api/operational-route"
import { saveDonationRecurrence } from "@/lib/operational/actions"

export const POST = createFormActionPostHandler(saveDonationRecurrence)
