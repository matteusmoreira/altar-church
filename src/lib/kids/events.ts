/**
 * Payloads dos eventos externos do módulo Kids (webhooks outbound).
 * Contrato rígido: NUNCA incluem saúde, PIN, token de retirada nem observações privadas.
 * Puro e testável — as actions montam os dados aqui antes de enfileirar.
 */

import { formatChildLabelName } from "./security.ts"

/** Chaves proibidas em qualquer payload Kids (verificadas em teste de contrato). */
export const KIDS_FORBIDDEN_PAYLOAD_KEYS = [
  "pin",
  "pinHash",
  "token",
  "tokenHash",
  "pickupToken",
  "pickupPin",
  "qrPayload",
  "health",
  "allergies",
  "medication",
  "specialNeeds",
  "dietaryRestrictions",
  "instructions",
  "notes",
  "internalNotes",
  "detailsEncrypted",
] as const

export interface KidsChildRegisteredPayload {
  kidId: string
  personId: string
  childName: string
  isVisitor: boolean
}

export function buildChildRegisteredPayload(input: {
  kidId: string
  personId: string
  childFullName: string
  isVisitor: boolean
}): KidsChildRegisteredPayload {
  return {
    kidId: input.kidId,
    personId: input.personId,
    childName: formatChildLabelName(input.childFullName),
    isVisitor: input.isVisitor,
  }
}

export interface KidsCheckinCreatedPayload {
  attendanceId: string
  sessionId: string
  kidId: string
  childName: string
  classroomName: string
  checkedInAt: string
}

export function buildCheckinCreatedPayload(input: {
  attendanceId: string
  sessionId: string
  kidId: string
  childFullName: string
  classroomName: string
  checkedInAt: string
}): KidsCheckinCreatedPayload {
  return {
    attendanceId: input.attendanceId,
    sessionId: input.sessionId,
    kidId: input.kidId,
    childName: formatChildLabelName(input.childFullName),
    classroomName: input.classroomName,
    checkedInAt: input.checkedInAt,
  }
}

export interface KidsCheckoutRequestedPayload {
  attendanceId: string
  sessionId: string
  kidId: string
  requestedBy: "guardian" | "staff"
  requestedAt: string
}

export function buildCheckoutRequestedPayload(input: {
  attendanceId: string
  sessionId: string
  kidId: string
  requestedBy: "guardian" | "staff"
  requestedAt: string
}): KidsCheckoutRequestedPayload {
  // Construção explícita: spread de input pode vazar campos não declarados.
  return {
    attendanceId: input.attendanceId,
    sessionId: input.sessionId,
    kidId: input.kidId,
    requestedBy: input.requestedBy,
    requestedAt: input.requestedAt,
  }
}

export interface KidsCheckoutCompletedPayload {
  attendanceId: string
  sessionId: string
  kidId: string
  childName: string
  checkedOutAt: string
  override: boolean
}

export function buildCheckoutCompletedPayload(input: {
  attendanceId: string
  sessionId: string
  kidId: string
  childFullName: string
  checkedOutAt: string
  override: boolean
}): KidsCheckoutCompletedPayload {
  return {
    attendanceId: input.attendanceId,
    sessionId: input.sessionId,
    kidId: input.kidId,
    childName: formatChildLabelName(input.childFullName),
    checkedOutAt: input.checkedOutAt,
    override: input.override,
  }
}

export interface KidsGuardianCalledPayload {
  attendanceId: string
  sessionId: string
  kidId: string
  childName: string
  classroomName: string
  reason: string
  calledAt: string
}

export function buildGuardianCalledPayload(input: {
  attendanceId: string
  sessionId: string
  kidId: string
  childFullName: string
  classroomName: string
  reason: string
  calledAt: string
}): KidsGuardianCalledPayload {
  return {
    attendanceId: input.attendanceId,
    sessionId: input.sessionId,
    kidId: input.kidId,
    childName: formatChildLabelName(input.childFullName),
    classroomName: input.classroomName,
    reason: input.reason,
    calledAt: input.calledAt,
  }
}

export interface KidsIncidentCreatedPayload {
  incidentId: string
  sessionId: string | null
  kidId: string | null
  severity: string
  title: string
  createdAt: string
}

export function buildIncidentCreatedPayload(input: {
  incidentId: string
  sessionId: string | null
  kidId: string | null
  severity: string
  title: string
  createdAt: string
}): KidsIncidentCreatedPayload {
  return {
    incidentId: input.incidentId,
    sessionId: input.sessionId,
    kidId: input.kidId,
    severity: input.severity,
    title: input.title,
    createdAt: input.createdAt,
  }
}
