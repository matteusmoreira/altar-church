import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deletePrayerRequest, savePrayerRequest } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(savePrayerRequest)
export const DELETE = createFormActionDeleteHandler(deletePrayerRequest)
