"use client";

// Keep the navigable local fixture isolated from server actions, even with a logged-in browser.
export function isVolunteerPreview() {
  return (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    window.location.pathname === "/dev/voluntariado"
  );
}

function previewGuard<T extends (...args: never[]) => Promise<unknown>>(
  action: T,
  name: string,
): T {
  return (async (...args: Parameters<T>) => {
    if (isVolunteerPreview()) {
      if (name === "getVolunteerShiftCandidates") {
        const { volunteerPreviewData } = await import("./preview-data");
        return {
          ok: true,
          data: volunteerPreviewData().manager.volunteers.map((person) => ({
            volunteerId: person.id,
            volunteerName: person.name,
            photoUrl: null,
            eligible: true,
            eligibleForSuggestion: true,
            selectableManually: true,
            score: 100,
            reasons: [
              { code: "available", label: "Disponível (exemplo)", points: 100 },
            ],
            warnings: [],
            blockers: [],
          })),
        };
      }
      return {
        ok: false,
        error:
          "Esta é uma prévia com dados fictícios. Alterações e envios estão desabilitados.",
      };
    }
    return action(...args);
  }) as T;
}

import { acceptVolunteerSwap as server_acceptVolunteerSwap } from "@/lib/volunteers/v2-actions";
import { checkInVolunteerAssignment as server_checkInVolunteerAssignment } from "@/lib/volunteers/actions";
import { checkOutVolunteerAssignment as server_checkOutVolunteerAssignment } from "@/lib/volunteers/v2-actions";
import { deleteVolunteerEventSchedule as server_deleteVolunteerEventSchedule } from "@/lib/volunteers/v2-actions";
import { deleteVolunteerProgramming as server_deleteVolunteerProgramming } from "@/lib/volunteers/programming-actions";
import { generateSmartVolunteerSchedule as server_generateSmartVolunteerSchedule } from "@/lib/volunteers/v2-actions";
import { generateVolunteerScheduleForEvent as server_generateVolunteerScheduleForEvent } from "@/lib/volunteers/v2-actions";
import { getVolunteerShiftCandidates as server_getVolunteerShiftCandidates } from "@/lib/volunteers/v2-actions";
import { grantVolunteerRecognition as server_grantVolunteerRecognition } from "@/lib/volunteers/v2-actions";
import { markVolunteerShiftConversationRead as server_markVolunteerShiftConversationRead } from "@/lib/volunteers/v2-actions";
import { prepareVolunteerProgrammingMonth as server_prepareVolunteerProgrammingMonth } from "@/lib/volunteers/programming-actions";
import { publishVolunteerEventSchedule as server_publishVolunteerEventSchedule } from "@/lib/volunteers/v2-actions";
import { publishVolunteerProgrammingEvents as server_publishVolunteerProgrammingEvents } from "@/lib/volunteers/programming-actions";
import { requestVolunteerSwap as server_requestVolunteerSwap } from "@/lib/volunteers/v2-actions";
import { respondVolunteerAssignment as server_respondVolunteerAssignment } from "@/lib/volunteers/v2-actions";
import { reviewVolunteerSwap as server_reviewVolunteerSwap } from "@/lib/volunteers/v2-actions";
import { saveMyVolunteerAvailability as server_saveMyVolunteerAvailability } from "@/lib/volunteers/v2-actions";
import { saveMyVolunteerNotificationPreferences as server_saveMyVolunteerNotificationPreferences } from "@/lib/volunteers/v2-actions";
import { saveProfilePushSubscription as server_saveProfilePushSubscription } from "@/lib/volunteers/v2-actions";
import { saveVolunteer as server_saveVolunteer } from "@/lib/volunteers/actions";
import { saveVolunteerAssignment as server_saveVolunteerAssignment } from "@/lib/volunteers/actions";
import { saveVolunteerDepartment as server_saveVolunteerDepartment } from "@/lib/volunteers/actions";
import { saveVolunteerDepartmentRole as server_saveVolunteerDepartmentRole } from "@/lib/volunteers/v2-actions";
import { saveVolunteerFeedPost as server_saveVolunteerFeedPost } from "@/lib/volunteers/actions";
import { saveVolunteerFeedback as server_saveVolunteerFeedback } from "@/lib/volunteers/v2-actions";
import { saveVolunteerModuleSettings as server_saveVolunteerModuleSettings } from "@/lib/volunteers/v2-actions";
import { saveVolunteerProgramming as server_saveVolunteerProgramming } from "@/lib/volunteers/programming-actions";
import { saveVolunteerServicePlan as server_saveVolunteerServicePlan } from "@/lib/volunteers/v2-actions";
import { searchVolunteerPeople as server_searchVolunteerPeople } from "@/lib/volunteers/actions";
import { sendVolunteerShiftMessage as server_sendVolunteerShiftMessage } from "@/lib/volunteers/v2-actions";
import { softDeleteVolunteer as server_softDeleteVolunteer } from "@/lib/volunteers/v2-actions";
import { softDeleteVolunteerDepartment as server_softDeleteVolunteerDepartment } from "@/lib/volunteers/v2-actions";
import { uploadVolunteerShiftFile as server_uploadVolunteerShiftFile } from "@/lib/volunteers/v2-actions";

export const acceptVolunteerSwap = previewGuard(
  server_acceptVolunteerSwap,
  "acceptVolunteerSwap",
);
export const checkInVolunteerAssignment = previewGuard(
  server_checkInVolunteerAssignment,
  "checkInVolunteerAssignment",
);
export const checkOutVolunteerAssignment = previewGuard(
  server_checkOutVolunteerAssignment,
  "checkOutVolunteerAssignment",
);
export const deleteVolunteerEventSchedule = previewGuard(
  server_deleteVolunteerEventSchedule,
  "deleteVolunteerEventSchedule",
);
export const deleteVolunteerProgramming = previewGuard(
  server_deleteVolunteerProgramming,
  "deleteVolunteerProgramming",
);
export const generateSmartVolunteerSchedule = previewGuard(
  server_generateSmartVolunteerSchedule,
  "generateSmartVolunteerSchedule",
);
export const generateVolunteerScheduleForEvent = previewGuard(
  server_generateVolunteerScheduleForEvent,
  "generateVolunteerScheduleForEvent",
);
export const getVolunteerShiftCandidates = previewGuard(
  server_getVolunteerShiftCandidates,
  "getVolunteerShiftCandidates",
);
export const grantVolunteerRecognition = previewGuard(
  server_grantVolunteerRecognition,
  "grantVolunteerRecognition",
);
export const markVolunteerShiftConversationRead = previewGuard(
  server_markVolunteerShiftConversationRead,
  "markVolunteerShiftConversationRead",
);
export const prepareVolunteerProgrammingMonth = previewGuard(
  server_prepareVolunteerProgrammingMonth,
  "prepareVolunteerProgrammingMonth",
);
export const publishVolunteerEventSchedule = previewGuard(
  server_publishVolunteerEventSchedule,
  "publishVolunteerEventSchedule",
);
export const publishVolunteerProgrammingEvents = previewGuard(
  server_publishVolunteerProgrammingEvents,
  "publishVolunteerProgrammingEvents",
);
export const requestVolunteerSwap = previewGuard(
  server_requestVolunteerSwap,
  "requestVolunteerSwap",
);
export const respondVolunteerAssignment = previewGuard(
  server_respondVolunteerAssignment,
  "respondVolunteerAssignment",
);
export const reviewVolunteerSwap = previewGuard(
  server_reviewVolunteerSwap,
  "reviewVolunteerSwap",
);
export const saveMyVolunteerAvailability = previewGuard(
  server_saveMyVolunteerAvailability,
  "saveMyVolunteerAvailability",
);
export const saveMyVolunteerNotificationPreferences = previewGuard(
  server_saveMyVolunteerNotificationPreferences,
  "saveMyVolunteerNotificationPreferences",
);
export const saveProfilePushSubscription = previewGuard(
  server_saveProfilePushSubscription,
  "saveProfilePushSubscription",
);
export const saveVolunteer = previewGuard(
  server_saveVolunteer,
  "saveVolunteer",
);
export const saveVolunteerAssignment = previewGuard(
  server_saveVolunteerAssignment,
  "saveVolunteerAssignment",
);
export const saveVolunteerDepartment = previewGuard(
  server_saveVolunteerDepartment,
  "saveVolunteerDepartment",
);
export const saveVolunteerDepartmentRole = previewGuard(
  server_saveVolunteerDepartmentRole,
  "saveVolunteerDepartmentRole",
);
export const saveVolunteerFeedPost = previewGuard(
  server_saveVolunteerFeedPost,
  "saveVolunteerFeedPost",
);
export const saveVolunteerFeedback = previewGuard(
  server_saveVolunteerFeedback,
  "saveVolunteerFeedback",
);
export const saveVolunteerModuleSettings = previewGuard(
  server_saveVolunteerModuleSettings,
  "saveVolunteerModuleSettings",
);
export const saveVolunteerProgramming = previewGuard(
  server_saveVolunteerProgramming,
  "saveVolunteerProgramming",
);
export const saveVolunteerServicePlan = previewGuard(
  server_saveVolunteerServicePlan,
  "saveVolunteerServicePlan",
);
export const searchVolunteerPeople = previewGuard(
  server_searchVolunteerPeople,
  "searchVolunteerPeople",
);
export const sendVolunteerShiftMessage = previewGuard(
  server_sendVolunteerShiftMessage,
  "sendVolunteerShiftMessage",
);
export const softDeleteVolunteer = previewGuard(
  server_softDeleteVolunteer,
  "softDeleteVolunteer",
);
export const softDeleteVolunteerDepartment = previewGuard(
  server_softDeleteVolunteerDepartment,
  "softDeleteVolunteerDepartment",
);
export const uploadVolunteerShiftFile = previewGuard(
  server_uploadVolunteerShiftFile,
  "uploadVolunteerShiftFile",
);
