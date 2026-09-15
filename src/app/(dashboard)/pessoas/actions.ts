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

export async function loadBirthdayPeople(month: number) {
  const { listBirthdayPeople } = await import("@/lib/people/data")
  return listBirthdayPeople(month)
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

export async function updatePersonActivity(input: import("@/lib/people/types").UpdatePersonActivityInput) {
  const { updatePersonActivity: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function deletePersonActivity(activityId: string) {
  const { deletePersonActivity: action } = await import("@/lib/people/actions")
  return action(activityId)
}

export async function assignPersonActivity(input: { personId: string; activityId: string }) {
  const { assignPersonActivity: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function removePersonActivity(assignmentId: string) {
  const { removePersonActivity: action } = await import("@/lib/people/actions")
  return action(assignmentId)
}

export async function togglePersonActivityAssignment(assignmentId: string, isActive: boolean) {
  const { togglePersonActivityAssignment: action } = await import("@/lib/people/actions")
  return action(assignmentId, isActive)
}

export async function loadActivityMembers(activityId: string) {
  const { listActivityMembers } = await import("@/lib/people/data")
  return listActivityMembers(activityId)
}

export async function updateMemberJourney(input: import("@/lib/people/types").UpdateMemberJourneyInput) {
  const { updateMemberJourney: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function deleteMemberJourney(journeyId: string) {
  const { deleteMemberJourney: action } = await import("@/lib/people/actions")
  return action(journeyId)
}

export async function saveJourneyStep(input: import("@/lib/people/types").SaveJourneyStepInput) {
  const { saveJourneyStep: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function deleteJourneyStep(stepId: string) {
  const { deleteJourneyStep: action } = await import("@/lib/people/actions")
  return action(stepId)
}

export async function reorderJourneySteps(journeyId: string, stepIds: string[]) {
  const { reorderJourneySteps: action } = await import("@/lib/people/actions")
  return action(journeyId, stepIds)
}

export async function enrollPersonInJourney(input: { personId: string; journeyId: string }) {
  const { enrollPersonInJourney: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function unenrollPersonFromJourney(enrollmentId: string) {
  const { unenrollPersonFromJourney: action } = await import("@/lib/people/actions")
  return action(enrollmentId)
}

export async function toggleStepProgress(input: {
  personId: string
  journeyId: string
  stepId: string
  completed: boolean
  notes?: string
  completedAt?: string | null
}) {
  const { toggleStepProgress: action } = await import("@/lib/people/actions")
  return action(input)
}

export async function saveFollowUpTrigger(input: {
  id?: string | null
  triggerKind: string
  name: string
  isActive: boolean
  config: Record<string, unknown>
}) {
  const { updateTriggerConfigDirect } = await import("@/lib/people/follow-up-actions")
  return updateTriggerConfigDirect(input)
}

export async function runFollowUpTriggers() {
  const { runFollowUpTriggersDirect } = await import("@/lib/people/follow-up-actions")
  return runFollowUpTriggersDirect()
}


