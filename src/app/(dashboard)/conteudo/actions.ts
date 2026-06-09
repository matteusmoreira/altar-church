"use server"

import type { SaveContentBannerInput, SaveContentPostInput } from "@/lib/content/types"

export async function saveContentPost(input: SaveContentPostInput) {
  const { saveContentPost: saveContentPostAction } = await import("@/lib/content/actions")
  return saveContentPostAction(input)
}

export async function deleteContentPost(input: { id: string; companyId?: string | null }) {
  const { deleteContentPost: deleteContentPostAction } = await import("@/lib/content/actions")
  return deleteContentPostAction(input)
}

export async function saveContentBanner(input: SaveContentBannerInput) {
  const { saveContentBanner: saveContentBannerAction } = await import("@/lib/content/actions")
  return saveContentBannerAction(input)
}

export async function deleteContentBanner(input: { id: string; companyId?: string | null }) {
  const { deleteContentBanner: deleteContentBannerAction } = await import("@/lib/content/actions")
  return deleteContentBannerAction(input)
}

export async function uploadContentAsset(formData: FormData) {
  const { uploadEntityAsset } = await import("@/lib/files/actions")
  return uploadEntityAsset(formData)
}
