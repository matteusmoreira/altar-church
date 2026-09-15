import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("Migration: People Journeys and Activities Evolution", () => {
  const sql = read("supabase/migrations/20260915120000_people_journeys_and_activities_evolution.sql")

  assert.match(sql, /is_auto_enroll boolean not null default false/)
  assert.match(sql, /auto_enroll_type text default null/)
  assert.match(sql, /estimated_days integer not null default 7/)
  assert.match(sql, /create table if not exists public\.person_journey_enrollments/)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /person_journey_enrollments_person_idx/)
})

test("Types: activities, journeys, enrollments and triggers", () => {
  const types = read("src/lib/people/types.ts")

  assert.match(types, /export interface MemberJourneyStep/)
  assert.match(types, /export interface MemberJourneyWithSteps/)
  assert.match(types, /export interface PersonActivityWithCount/)
  assert.match(types, /export interface PersonEnrolledJourney/)
  assert.match(types, /export interface FollowUpTriggerConfig/)
  assert.match(types, /export interface UpdatePersonActivityInput/)
  assert.match(types, /export interface SaveJourneyStepInput/)
  assert.match(types, /export interface UpdateMemberJourneyInput/)
  assert.match(types, /enrolledJourneys: PersonEnrolledJourney\[\]/)
  assert.match(types, /availableJourneys:/)
  assert.match(types, /availableActivities:/)
})

test("Data queries: activities with counts, journey steps, timeline integration", () => {
  const data = read("src/lib/people/data.ts")

  assert.match(data, /export async function listActivitiesWithCounts/)
  assert.match(data, /export async function listActivityMembers/)
  assert.match(data, /export async function listJourneysWithSteps/)
  assert.match(data, /person_journey_enrollments/)
  assert.match(data, /enrolledJourneys/)
  assert.match(data, /availableJourneysRows/)
  assert.match(data, /availableActivitiesRows/)
})

test("Follow-up backend: triggers calibration and direct execution", () => {
  const followUp = read("src/lib/people/follow-up.ts")
  const followUpActions = read("src/lib/people/follow-up-actions.ts")

  // Timeline union
  assert.match(followUp, /'journey'::text as kind/)
  assert.match(followUp, /'activity'::text as kind/)
  assert.match(followUp, /person_journey_progress/)
  assert.match(followUp, /person_activity_assignments/)

  // Dynamic trigger parameters & tasks
  assert.match(followUp, /processFollowUpTriggers/)
  assert.match(followUp, /daysThreshold/)
  assert.match(followUp, /dueDays/)
  assert.match(followUp, /responsible_profile_id/)

  // Follow-up actions
  assert.match(followUpActions, /export async function updateTriggerConfigDirect/)
  assert.match(followUpActions, /export async function runFollowUpTriggersDirect/)
})

test("Server Actions: Journey, Activity, Enrollment, and Auto-enroll on Person creation", () => {
  const actions = read("src/lib/people/actions.ts")
  const routeActions = read("src/app/(dashboard)/pessoas/actions.ts")

  // Activity actions
  assert.match(actions, /export async function updatePersonActivity/)
  assert.match(actions, /export async function deletePersonActivity/)
  assert.match(actions, /export async function assignPersonActivity/)
  assert.match(actions, /export async function removePersonActivity/)
  assert.match(actions, /export async function togglePersonActivityAssignment/)

  // Journey actions
  assert.match(actions, /export async function updateMemberJourney/)
  assert.match(actions, /export async function deleteMemberJourney/)
  assert.match(actions, /export async function saveJourneyStep/)
  assert.match(actions, /export async function deleteJourneyStep/)
  assert.match(actions, /export async function reorderJourneySteps/)

  // Enrollment actions
  assert.match(actions, /export async function enrollPersonInJourney/)
  assert.match(actions, /export async function unenrollPersonFromJourney/)
  assert.match(actions, /export async function toggleStepProgress/)

  // Auto-enroll on savePerson
  assert.match(actions, /is_auto_enroll = true/)
  assert.match(actions, /person_journey_enrollments/)

  // Route actions export
  assert.match(routeActions, /export async function assignPersonActivity/)
  assert.match(routeActions, /export async function enrollPersonInJourney/)
  assert.match(routeActions, /export async function toggleStepProgress/)
  assert.match(routeActions, /export async function saveFollowUpTrigger/)
  assert.match(routeActions, /export async function runFollowUpTriggers/)
})

test("Components: ActivityMembersSheet, JourneyBuilderSheet, TriggerConfigDialog", () => {
  const actSheet = read("src/components/people/activity-members-sheet.tsx")
  const jrnSheet = read("src/components/people/journey-builder-sheet.tsx")
  const trigDialog = read("src/components/people/trigger-config-dialog.tsx")

  // Activity members sheet
  assert.match(actSheet, /ActivityMembersSheet/)
  assert.match(actSheet, /assignPersonActivity/)
  assert.match(actSheet, /removePersonActivity/)
  assert.match(actSheet, /togglePersonActivityAssignment/)

  // Journey builder sheet
  assert.match(jrnSheet, /JourneyBuilderSheet/)
  assert.match(jrnSheet, /saveJourneyStep/)
  assert.match(jrnSheet, /reorderJourneySteps/)
  assert.match(jrnSheet, /estimatedDays/)

  // Trigger config dialog
  assert.match(trigDialog, /TriggerConfigDialog/)
  assert.match(trigDialog, /triggerLabels/)
  assert.match(trigDialog, /daysThreshold/)
  assert.match(trigDialog, /dueDays/)
  assert.match(trigDialog, /priority/)
})

test("UI integration: members-client config tab and member profile detail", () => {
  const membersClient = read("src/app/(dashboard)/pessoas/members-client.tsx")
  const memberDetail = read("src/app/(dashboard)/pessoas/[id]/member-detail-client.tsx")

  // members-client config tab
  assert.match(membersClient, /TabsContent value="config"/)
  assert.match(membersClient, /Atividades e Ministérios Pastorais/)
  assert.match(membersClient, /Trilhas de Crescimento & Integração/)
  assert.match(membersClient, /Gatilhos Automáticos de Follow-up/)
  assert.match(membersClient, /ActivityMembersSheet/)
  assert.match(membersClient, /JourneyBuilderSheet/)
  assert.match(membersClient, /TriggerConfigDialog/)
  assert.match(membersClient, /handleRunFollowUpTriggers/)

  // member-detail-client
  assert.match(memberDetail, /TabsContent value="historico"/)
  assert.match(memberDetail, /Vincular atividade/)
  assert.match(memberDetail, /TabsContent value="jornada"/)
  assert.match(memberDetail, /Iniciar nova trilha/)
  assert.match(memberDetail, /handleOpenStepModal/)
  assert.match(memberDetail, /handleSaveStepProgress/)
  assert.match(memberDetail, /enrolledJourneys/)
})
