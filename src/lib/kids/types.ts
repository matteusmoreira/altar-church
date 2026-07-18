export type KidStatus = "active" | "inactive"
export type KidRelationship = "father" | "mother" | "guardian" | "grandparent" | "relative" | "other"
export type KidConsentType = "data_processing" | "image_use" | "emergency_care" | "communication"
export type KidConsentStatus = "granted" | "revoked"
export type KidConsentSource = "portal" | "reception" | "import"
export type KidSessionStatus = "draft" | "open" | "closed" | "cancelled"
export type KidAttendanceStatus = "checked_in" | "checkout_requested" | "checked_out"
export type KidLabelPaper = "thermal_62x40" | "a4"

export interface KidHealthIndicators {
  hasAllergy: boolean
  hasDietaryRestriction: boolean
  hasMedication: boolean
  hasSpecialNeeds: boolean
}

/** Detalhes clínicos essenciais — trafegam cifrados; nunca vão para logs/webhooks. */
export interface KidHealthDetails {
  allergies: string
  dietaryRestrictions: string
  medication: string
  specialNeeds: string
  instructions: string
}

export interface KidGuardianItem {
  id: string
  personId: string
  profileId: string | null
  name: string
  phone: string
  email: string | null
  relationship: KidRelationship
  isPrimary: boolean
  canCheckin: boolean
  canCheckout: boolean
  isEmergencyContact: boolean
  whatsappEnabled: boolean
  emailEnabled: boolean
}

export interface KidListItem {
  id: string
  personId: string
  firstName: string
  lastName: string
  fullName: string
  birthDate: string | null
  ageMonths: number | null
  congregationId: string | null
  congregationName: string | null
  status: KidStatus
  isVisitor: boolean
  notes: string
  health: KidHealthIndicators
  grantedConsents: KidConsentType[]
  guardians: KidGuardianItem[]
  createdAt: string
}

export interface KidClassroomRuleItem {
  id: string
  classroomId: string
  congregationId: string | null
  congregationName: string | null
  weekday: number | null
  startTime: string | null
  endTime: string | null
  minAgeMonths: number
  maxAgeMonths: number
  priority: number
  isActive: boolean
}

export interface KidClassroomItem {
  id: string
  congregationId: string | null
  congregationName: string | null
  name: string
  minAgeMonths: number
  maxAgeMonths: number
  capacity: number
  location: string
  isActive: boolean
  rules: KidClassroomRuleItem[]
}

export interface KidSettingsItem {
  id: string | null
  congregationId: string | null
  requireCheckoutPin: boolean
  pinRotationMinutes: number
  allowCapacityOverride: boolean
  labelPaper: KidLabelPaper
  labelShowQr: boolean
  autoPrint: boolean
  visitorFormEnabled: boolean
  requiredConsentTypes: KidConsentType[]
}

export interface KidsMetrics {
  totalChildren: number
  visitors: number
  totalGuardians: number
  activeClassrooms: number
  childrenWithHealthAlerts: number
}

export interface KidsDashboardData {
  metrics: KidsMetrics
  children: KidListItem[]
  classrooms: KidClassroomItem[]
  settings: KidSettingsItem[]
  congregations: { id: string; name: string }[]
}

export interface KidsActionResult {
  ok: boolean
  id?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Fase 2 — operação presencial (sessões, check-in, checkout, salas)
// ---------------------------------------------------------------------------

export type KidStaffRole = "leader" | "teacher" | "helper" | "reception"
export type KidIncidentSeverity = "info" | "warning" | "critical"
export type KidAccessEventType =
  | "checkin"
  | "checkout"
  | "checkout_denied"
  | "checkout_override"
  | "guardian_called"
  | "credential_rotated"
  | "credential_locked"
  | "room_changed"

export interface KidSessionClassroomItem {
  id: string
  classroomId: string
  name: string
  congregationId: string | null
  congregationName: string | null
  minAgeMonths: number
  maxAgeMonths: number
  capacity: number
  effectiveCapacity: number
  occupied: number
  capacityOverride: number | null
  isOpen: boolean
  sortOrder: number
}

export interface KidStaffAssignmentItem {
  id: string
  sessionClassroomId: string | null
  classroomName: string | null
  profileId: string
  profileName: string
  assignmentRole: KidStaffRole
}

export interface KidSessionListItem {
  id: string
  title: string
  status: KidSessionStatus
  congregationId: string | null
  congregationName: string | null
  eventId: string | null
  eventTitle: string | null
  startsAt: string
  endsAt: string | null
  presentCount: number
  checkedOutCount: number
  totalCapacity: number
  classrooms: KidSessionClassroomItem[]
  staff: KidStaffAssignmentItem[]
}

export interface KidAttendanceItem {
  id: string
  kidId: string
  childName: string
  childFullName: string
  ageMonths: number | null
  status: KidAttendanceStatus
  sessionClassroomId: string | null
  classroomName: string
  health: KidHealthIndicators
  primaryGuardianName: string | null
  primaryGuardianPhone: string | null
  checkedInAt: string
  checkoutRequestedAt: string | null
  checkedOutAt: string | null
  roomOverrideReason: string | null
}

export interface KidGuardianCallItem {
  id: string
  attendanceId: string | null
  kidId: string | null
  childName: string
  classroomName: string
  reason: string
  calledAt: string
  calledByName: string | null
}

export interface KidIncidentItem {
  id: string
  sessionId: string | null
  sessionClassroomId: string | null
  kidId: string | null
  childName: string | null
  severity: KidIncidentSeverity
  title: string
  description: string
  reportedByName: string | null
  resolvedAt: string | null
  createdAt: string
}

/** Configuração efetiva resolvida: override da congregação → padrão da empresa → defaults. */
export interface KidEffectiveSettings {
  requireCheckoutPin: boolean
  pinRotationMinutes: number
  allowCapacityOverride: boolean
  labelPaper: KidLabelPaper
  labelShowQr: boolean
  autoPrint: boolean
  visitorFormEnabled: boolean
  requiredConsentTypes: KidConsentType[]
}

export interface KidsSessionsData {
  sessions: KidSessionListItem[]
  classrooms: KidClassroomItem[]
  congregations: { id: string; name: string }[]
  staffOptions: { id: string; name: string; role: string }[]
  eventOptions: { id: string; title: string; startsAt: string }[]
}

export interface KidCheckinCandidate {
  kidId: string
  personId: string
  fullName: string
  labelName: string
  ageMonths: number | null
  congregationId: string | null
  congregationName: string | null
  isVisitor: boolean
  health: KidHealthIndicators
  missingConsents: KidConsentType[]
  guardiansSummary: string
  /** Presença ativa nesta sessão, se houver (bloqueia duplicidade na UI). */
  activeAttendanceId: string | null
  activeClassroomName: string | null
}

export interface KidsReceptionData {
  session: KidSessionListItem
  attendances: KidAttendanceItem[]
  calls: KidGuardianCallItem[]
  settings: KidEffectiveSettings
}

export interface KidRoomPanelData {
  sessionClassroomId: string
  sessionId: string
  sessionTitle: string
  sessionStatus: KidSessionStatus
  classroomName: string
  capacity: number
  occupied: number
  attendances: KidAttendanceItem[]
  incidents: KidIncidentItem[]
  reports: KidLessonReportItem[]
  canManage: boolean
}

export interface KidCheckinSuccess {
  attendanceId: string
  label: import("./printing").KidLabelModel
}

export interface KidsCheckinResult {
  ok: boolean
  error?: string
  attendanceId?: string
  label?: import("./printing").KidLabelModel
}

export interface KidsCheckoutResult {
  ok: boolean
  error?: string
  deniedReason?: "invalid_token" | "session_closed" | "already_out" | "locked" | "pin_expired" | "pin_invalid"
  childName?: string
  classroomName?: string
}

// ---------------------------------------------------------------------------
// Fase 3 — portal familiar
// ---------------------------------------------------------------------------

export interface GuardianActiveAttendance {
  attendanceId: string
  sessionId: string
  sessionTitle: string
  classroomName: string
  status: "checked_in" | "checkout_requested"
  checkedInAt: string
  pinExpiresAt: string | null
}

export interface GuardianChildItem {
  kidId: string
  personId: string
  firstName: string
  lastName: string
  fullName: string
  birthDate: string | null
  ageMonths: number | null
  congregationId: string | null
  congregationName: string | null
  isVisitor: boolean
  notes: string
  health: KidHealthIndicators
  healthDetails: KidHealthDetails
  consents: KidConsentType[]
  guardians: KidGuardianItem[]
  activeAttendance: GuardianActiveAttendance | null
}

export interface GuardianPortalData {
  guardianName: string
  companyName: string
  children: GuardianChildItem[]
  congregations: { id: string; name: string }[]
  recentReports: GuardianReportItem[]
}

export interface GuardianPickupCode {
  qrPayload: string
  pin: string
  expiresAt: string
}

export interface KidsPortalActionResult {
  ok: boolean
  error?: string
  id?: string
  pickupCode?: GuardianPickupCode
}

// ---------------------------------------------------------------------------
// Fase 4 — comunicação e relatórios
// ---------------------------------------------------------------------------

export type KidMessageStatus = "draft" | "queued" | "sent" | "failed" | "cancelled"
export type KidMessageChannel = "whatsapp" | "email" | "internal"

export interface KidMessageItem {
  id: string
  channel: KidMessageChannel
  audience: "guardian" | "classroom" | "segment"
  subject: string
  body: string
  status: KidMessageStatus
  createdAt: string
  createdByName: string | null
  pendingCount: number
  queuedCount: number
  sentCount: number
  deliveredCount: number
  failedCount: number
}

export interface KidsCommunicationData {
  messages: KidMessageItem[]
  classrooms: { id: string; name: string }[]
  congregations: { id: string; name: string }[]
  children: { id: string; fullName: string }[]
}

export interface KidsReportsMetrics {
  attendancesLast30d: number
  newVisitorsLast30d: number
  returningVisitors: number
  activeChildren: number
  childrenWithAttendance30d: number
  incidentsLast30d: number
  criticalIncidentsLast30d: number
}

export interface KidsSessionReportRow {
  id: string
  title: string
  startsAt: string
  status: KidSessionStatus
  present: number
  checkedOut: number
  visitors: number
}

export interface KidsReportsData {
  metrics: KidsReportsMetrics
  sessions: KidsSessionReportRow[]
  weekly: { week: string; attendances: number }[]
  healthByClassroom: {
    classroomName: string
    allergy: number
    dietary: number
    medication: number
    specialNeeds: number
  }[]
  recentIncidents: KidIncidentItem[]
}

export interface KidLessonReportItem {
  id: string
  sessionId: string
  sessionClassroomId: string | null
  kidId: string | null
  childName: string | null
  title: string
  content: string
  sharedWithGuardians: boolean
  authorName: string | null
  createdAt: string
}

export interface GuardianReportItem {
  id: string
  title: string
  content: string
  classroomName: string | null
  sessionTitle: string
  childName: string | null
  createdAt: string
}
