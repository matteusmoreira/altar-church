"use server"

import type { SaveCongregationInput } from "@/lib/congregations/types"

export async function saveCongregation(input: SaveCongregationInput) {
  const { saveCongregation: saveCongregationAction } = await import("@/lib/congregations/actions")
  return saveCongregationAction(input)
}

export async function deleteCongregation(input: { id: string; companyId?: string | null }) {
  const { deleteCongregation: deleteCongregationAction } = await import("@/lib/congregations/actions")
  return deleteCongregationAction(input)
}
