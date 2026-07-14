import { createFormActionDeleteHandler } from "@/lib/api/operational-route"
import { deleteAttendanceRecord } from "@/lib/operational/actions"

export const DELETE = createFormActionDeleteHandler(deleteAttendanceRecord)
