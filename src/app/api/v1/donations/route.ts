import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveDonation } from "@/lib/operational/actions"
import { getDonationData } from "@/lib/operational/data"

export const GET = createOperationalListHandler("donation.view", getDonationData)
export const POST = createFormActionPostHandler(saveDonation)
