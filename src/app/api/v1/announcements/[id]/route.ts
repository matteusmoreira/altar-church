import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deleteAnnouncement, saveAnnouncement } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(saveAnnouncement)
export const DELETE = createFormActionDeleteHandler(deleteAnnouncement)
