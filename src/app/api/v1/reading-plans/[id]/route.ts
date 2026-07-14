import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deleteReadingPlan, saveReadingPlan } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(saveReadingPlan)
export const DELETE = createFormActionDeleteHandler(deleteReadingPlan)
