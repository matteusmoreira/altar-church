"use server"

import type { SaveGroupCategoryInput, SaveGroupInput, SaveGroupMeetingInput, SaveGroupMemberInput } from "@/lib/groups/types"

export async function saveGroup(input: SaveGroupInput) {
  const { saveGroup: saveGroupAction } = await import("@/lib/groups/actions")
  return saveGroupAction(input)
}

export async function createGroupCategory(input: SaveGroupCategoryInput) {
  const { createGroupCategory: createGroupCategoryAction } = await import("@/lib/groups/actions")
  return createGroupCategoryAction(input)
}

export async function deleteGroup(input: { id: string; companyId?: string | null }) {
  const { deleteGroup: deleteGroupAction } = await import("@/lib/groups/actions")
  return deleteGroupAction(input)
}

export async function saveGroupMember(input: SaveGroupMemberInput) {
  const { saveGroupMember: saveGroupMemberAction } = await import("@/lib/groups/actions")
  return saveGroupMemberAction(input)
}

export async function removeGroupMember(input: { id: string; companyId?: string | null }) {
  const { removeGroupMember: removeGroupMemberAction } = await import("@/lib/groups/actions")
  return removeGroupMemberAction(input)
}

export async function saveGroupMeeting(input: SaveGroupMeetingInput) {
  const { saveGroupMeeting: saveGroupMeetingAction } = await import("@/lib/groups/actions")
  return saveGroupMeetingAction(input)
}
