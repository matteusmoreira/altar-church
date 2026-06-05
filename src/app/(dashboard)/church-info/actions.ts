"use server"

import type { SaveChurchInfoInput } from "@/lib/church-info/types"

export async function saveChurchInfo(input: SaveChurchInfoInput) {
  const { saveChurchInfo: saveChurchInfoAction } = await import("@/lib/church-info/actions")
  return saveChurchInfoAction(input)
}

export async function uploadChurchProfileAsset(formData: FormData) {
  const { uploadEntityAsset } = await import("@/lib/files/actions")
  return uploadEntityAsset(formData)
}
