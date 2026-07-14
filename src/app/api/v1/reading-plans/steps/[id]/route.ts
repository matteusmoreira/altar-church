import {
  createFormActionDeleteHandler,
  createFormActionPatchHandler,
} from "@/lib/api/operational-route"
import { deleteReadingPlanStep, saveReadingPlanStep } from "@/lib/operational/actions"

export const PATCH = createFormActionPatchHandler(saveReadingPlanStep)
export const DELETE = createFormActionDeleteHandler(deleteReadingPlanStep)
