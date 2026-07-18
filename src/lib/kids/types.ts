export type KidStatus = "active" | "inactive"
export type KidRelationship = "father" | "mother" | "guardian" | "grandparent" | "relative" | "other"
export type KidConsentType = "data_processing" | "image_use" | "emergency_care" | "communication"
export type KidConsentStatus = "granted" | "revoked"
export type KidConsentSource = "portal" | "reception" | "import"
export type KidSessionStatus = "draft" | "open" | "closed" | "cancelled"
export type KidAttendanceStatus = "checked_in" | "checkout_requested" | "checked_out"
export type KidLabelPaper = "thermal_62x40" | "a4"
export type KidLabelKind = "child" | "guardian"
export type KidLabelElementType = "text" | "field" | "qr" | "image" | "rect" | "circle" | "line" | "badge"
export type KidLabelTextAlign = "left" | "center" | "right"

export interface KidLabelElement {
  id: string
  type: KidLabelElementType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  zIndex: number
  groupId?: string | null
  text?: string
  field?: string
  assetId?: string | null
  assetUrl?: string | null
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  textAlign?: KidLabelTextAlign
  letterSpacing?: number
  color?: string
  fill?: string
  gradientFrom?: string
  gradientTo?: string
  gradientAngle?: number
  stroke?: string
  strokeWidth?: number
  radius?: number
  shadowColor?: string
  shadowBlur?: number
  fit?: "cover" | "contain" | "stretch"
}

export interface KidLabelDesign {
  schemaVersion: 1
  backgroundColor: string
  backgroundGradientFrom?: string | null
  backgroundGradientTo?: string | null
  backgroundGradientAngle?: number
  backgroundAssetId: string | null
  backgroundAssetUrl?: string | null
  backgroundFit: "cover" | "contain" | "stretch"
  showGrid: boolean
  snapToGrid: boolean
  gridSizeMm: number
  bleedMm: number
  elements: KidLabelElement[]
}

export interface KidLabelRevision {
  id: string
  templateId: string
  version: number
  status: "draft" | "published" | "superseded"
  schemaVersion: number
  widthMm: number
  heightMm: number
  dpi: 203 | 300 | 600
  design: KidLabelDesign
  containsSensitiveFields: boolean
  publishedAt: string | null
  createdAt: string
}

export interface KidLabelTemplate {
  id: string
  congregationId: string | null
  kind: KidLabelKind
  name: string
  isActive: boolean
  draftRevisionId: string | null
  publishedRevisionId: string | null
  revisions: KidLabelRevision[]
}

export interface KidLabelRenderContext {
  childName: string
  childFullName: string
  childBirthDate: string
  childAge: string
  childNotes: string
  childPhotoUrl: string
  attendanceStatus: string
  visitorStatus: string
  guardianName: string
  guardianFullName: string
  guardianPhone: string
  guardianEmail: string
  churchName: string
  congregationName: string
  classroomName: string
  sessionTitle: string
  checkedInAt: string
  pickupCode: string
  qrPayload: string
  consentSummary: string
  alertSummary: string
  allergies: string
  dietaryRestrictions: string
  medication: string
  specialNeeds: string
  healthInstructions: string
  customFields: Record<string, string>
}

export interface KidPrintableLabel {
  kind: KidLabelKind
  revisionId: string | null
  widthMm: number
  heightMm: number
  dpi: 203 | 300 | 600
  design: KidLabelDesign
  context: KidLabelRenderContext
}

export interface KidPrinterPreference {
  printerName: string
  directEnabled: boolean
}
export type KidCustomFieldTarget = "child" | "guardian"
export type KidCustomFieldSurface = "internal" | "public" | "portal"
export type KidCustomFieldType = "text" | "textarea" | "number" | "date" | "single" | "multiple" | "boolean"

export interface KidAddress {
  postalCode: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  country: string
}

export interface KidCustomFieldDefinition {
  id: string
  name: string
  fieldType: KidCustomFieldType
  options: string[]
  targets: KidCustomFieldTarget[]
  surfaces: KidCustomFieldSurface[]
  required: boolean
  sortOrder: number
  isActive: boolean
}

export interface KidCustomFieldValue {
  fieldId: string
  value: string | string[] | boolean
}

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
  photoUrl: string | null
  address: KidAddress
  customValues: KidCustomFieldValue[]
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
  photoUrl: string | null
  customValues: KidCustomFieldValue[]
}

export interface KidPersonSuggestion {
  personId: string
  fullName: string
  phone: string
  email: string | null
  birthDate: string | null
  kidId: string | null
  linkedChildren: { kidId: string; fullName: string }[]
}

export interface KidsCapabilities {
  view: boolean
  manageChildren: boolean
  manageGuardians: boolean
  manageClasses: boolean
  manageSessions: boolean
  viewHealth: boolean
  communicate: boolean
  viewReports: boolean
  manageSettings: boolean
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
  ministryId: string | null
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
  familyPage: number
  familyPageSize: number
  classrooms: KidClassroomItem[]
  settings: KidSettingsItem[]
  congregations: { id: string; name: string }[]
  ministries: { id: string; name: string; leaderPersonId: string | null }[]
  customFields: KidCustomFieldDefinition[]
}

export interface KidsActionResult {
  ok: boolean
  id?: string
  error?: string
  warning?: string
  personId?: string
  guardianPersonIds?: string[]
  createdPerson?: boolean
  createdGuardian?: boolean
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
  childPhotoUrl: string | null
  primaryGuardianPhotoUrl: string | null
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
  photoUrl: string | null
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
  labels?: KidPrintableLabel[]
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
  photoUrl: string | null
  customValues: KidCustomFieldValue[]
}

export interface GuardianPortalData {
  guardianName: string
  guardianPhotoUrl: string | null
  guardianAddress: KidAddress
  guardianCustomValues: KidCustomFieldValue[]
  companyName: string
  children: GuardianChildItem[]
  congregations: { id: string; name: string }[]
  recentReports: GuardianReportItem[]
  customFields: KidCustomFieldDefinition[]
  conversations: KidConversation[]
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
  warning?: string
  personId?: string
  guardianPersonIds?: string[]
  createdPerson?: boolean
  createdGuardian?: boolean
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
  guardians: { personId: string; fullName: string; children: string[]; portalActive: boolean }[]
  conversations: KidConversation[]
}

export interface KidConversationMessage {
  id: string
  conversationId: string
  kidId: string | null
  senderProfileId: string
  senderKind: "staff" | "guardian"
  senderName: string
  body: string
  createdAt: string
}

export interface KidConversation {
  id: string
  guardianPersonId: string
  guardianName: string
  kidId: string | null
  childName: string | null
  portalActive: boolean
  status: "open" | "closed"
  unreadCount: number
  lastMessageAt: string
  messages: KidConversationMessage[]
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
