import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deleteCrmCard, saveCrmCard } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(saveCrmCard)
export const DELETE = createFormActionDeleteHandler(deleteCrmCard)
