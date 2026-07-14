import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deleteEvent, saveEvent } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(saveEvent)
export const DELETE = createFormActionDeleteHandler(deleteEvent)
