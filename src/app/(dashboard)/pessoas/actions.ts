"use server"

import type {
  DuplicateCandidateActionInput,
  InvitePersonAccessInput,
  SavePersonInput,
} from "@/lib/people/types"

export async function savePerson(input: SavePersonInput) {
  const { savePerson: savePersonAction } = await import("@/lib/people/actions")
  return savePersonAction(input)
}

export async function deletePerson(input: { id: string; companyId?: string | null }) {
  const { deletePerson: deletePersonAction } = await import("@/lib/people/actions")
  return deletePersonAction(input)
}

export async function resolveDuplicateCandidate(input: DuplicateCandidateActionInput) {
  const { resolveDuplicateCandidate: resolveDuplicateCandidateAction } = await import("@/lib/people/actions")
  return resolveDuplicateCandidateAction(input)
}

export async function invitePersonAccess(input: InvitePersonAccessInput) {
  const { invitePersonAccess: invitePersonAccessAction } = await import("@/lib/people/actions")
  return invitePersonAccessAction(input)
}
