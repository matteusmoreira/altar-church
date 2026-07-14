import { createFormActionDeleteHandler } from "@/lib/api/operational-route"
import { deleteRevenue } from "@/lib/operational/actions"

export const DELETE = createFormActionDeleteHandler(deleteRevenue)
