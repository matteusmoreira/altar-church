import { createOperationalListHandler } from "@/lib/api/operational-route"
import { getFinanceData } from "@/lib/operational/data"

export const GET = createOperationalListHandler("finance.view", getFinanceData)
