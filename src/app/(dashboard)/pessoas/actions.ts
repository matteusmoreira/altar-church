"use server"

import type {
  CreateMemberJourneyInput,
  CreatePersonActivityInput,
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

export async function deletePeople(input: { ids: string[]; companyId?: string | null }) {
  const { deletePeople: deletePeopleAction } = await import("@/lib/people/actions")
  return deletePeopleAction(input)
}

export async function resolveDuplicateCandidate(input: DuplicateCandidateActionInput) {
  const { resolveDuplicateCandidate: resolveDuplicateCandidateAction } = await import("@/lib/people/actions")
  return resolveDuplicateCandidateAction(input)
}

export async function loadDuplicateCandidates() {
  const { listDuplicateCandidates } = await import("@/lib/people/data")
  return listDuplicateCandidates()
}

export async function invitePersonAccess(input: InvitePersonAccessInput) {
  const { invitePersonAccess: invitePersonAccessAction } = await import("@/lib/people/actions")
  return invitePersonAccessAction(input)
}

export async function movePersonToKanban(input: { personId: string; stageId?: string | null }) {
  const { movePersonToKanbanStage } = await import("@/lib/operational/actions")
  return movePersonToKanbanStage(input)
}

export async function createPersonActivity(input: CreatePersonActivityInput) {
  const { createPersonActivity: createActivityAction } = await import("@/lib/people/actions")
  return createActivityAction(input)
}

export async function createMemberJourney(input: CreateMemberJourneyInput) {
  const { createMemberJourney: createJourneyAction } = await import("@/lib/people/actions")
  return createJourneyAction(input)
}

export async function loadBirthdayPeople(month?: number) {
  const { loadBirthdayPeople: loadBirthdaysAction } = await import("@/lib/people/actions")
  return loadBirthdaysAction(month)
}

