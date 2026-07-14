import {
  createFormActionPostHandler,
  createOperationalListHandler,
} from "@/lib/api/operational-route"
import { saveAttendanceRecord } from "@/lib/operational/actions"
import { listAttendanceRecords } from "@/lib/operational/data"

export const GET = createOperationalListHandler("attendance.view", listAttendanceRecords)
export const POST = createFormActionPostHandler(saveAttendanceRecord)
