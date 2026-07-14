import { createFormActionDeleteHandler } from "@/lib/api/operational-route"
import { deleteExpense } from "@/lib/operational/actions"

export const DELETE = createFormActionDeleteHandler(deleteExpense)
