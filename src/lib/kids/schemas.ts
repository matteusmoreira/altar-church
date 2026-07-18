import { z } from "zod"

/** Versão corrente dos termos exibidos ao responsável (auditoria de aceite por versão). */
export const KIDS_CONSENT_VERSION = "1.0"

const uuid = z.string().uuid()

// Zod 4: chaves ausentes não são cobertas por z.undefined() dentro de union.
// Use .optional() para permitir omissão em fluxos de criação.
export const nullableUuidSchema = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const nullableEmailSchema = z
  .union([z.string().trim().email("E-mail inválido"), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const nullableDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const nullableTimeSchema = z
  .union([z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido"), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const consentTypeSchema = z.enum(["data_processing", "image_use", "emergency_care", "communication"])

export const kidGuardianInputSchema = z.object({
  id: nullableUuidSchema,
  personId: nullableUuidSchema,
  firstName: z.string().trim().min(2, "Nome do responsável obrigatório"),
  lastName: z.string().trim().optional().default(""),
  email: nullableEmailSchema,
  phone: z.string().trim().min(8, "Telefone do responsável obrigatório"),
  relationship: z.enum(["father", "mother", "guardian", "grandparent", "relative", "other"]).default("guardian"),
  isPrimary: z.boolean().default(false),
  canCheckin: z.boolean().default(true),
  canCheckout: z.boolean().default(true),
  isEmergencyContact: z.boolean().default(true),
  whatsappEnabled: z.boolean().default(true),
  emailEnabled: z.boolean().default(true),
})

const healthDetailsEmpty = {
  hasAllergy: false,
  hasDietaryRestriction: false,
  hasMedication: false,
  hasSpecialNeeds: false,
  allergies: "",
  dietaryRestrictions: "",
  medication: "",
  specialNeeds: "",
  instructions: "",
}

export const kidHealthInputSchema = z.object({
  hasAllergy: z.boolean().default(false),
  hasDietaryRestriction: z.boolean().default(false),
  hasMedication: z.boolean().default(false),
  hasSpecialNeeds: z.boolean().default(false),
  allergies: z.string().trim().optional().default(""),
  dietaryRestrictions: z.string().trim().optional().default(""),
  medication: z.string().trim().optional().default(""),
  specialNeeds: z.string().trim().optional().default(""),
  instructions: z.string().trim().optional().default(""),
})

export const kidChildSchema = z.object({
  id: nullableUuidSchema,
  personId: nullableUuidSchema,
  firstName: z.string().trim().min(2, "Nome obrigatório"),
  lastName: z.string().trim().optional().default(""),
  birthDate: nullableDateSchema,
  congregationId: nullableUuidSchema,
  isVisitor: z.boolean().default(false),
  notes: z.string().trim().optional().default(""),
  health: kidHealthInputSchema
    .optional()
    .transform((value) => value ?? healthDetailsEmpty),
  consents: z.array(consentTypeSchema).default([]),
  guardians: z.array(kidGuardianInputSchema).min(1, "Informe ao menos um responsável"),
})

export const kidHealthUpdateSchema = z.object({
  kidId: uuid,
  health: kidHealthInputSchema,
})

/** Cadastro de criança pelo próprio responsável (portal): o vínculo é o da conta autenticada. */
export const guardianChildSchema = kidChildSchema.omit({ guardians: true, consents: true })

export const kidConsentUpdateSchema = z.object({
  kidId: uuid,
  consents: z.array(consentTypeSchema).default([]),
})

export const kidClassroomSchema = z
  .object({
    id: nullableUuidSchema,
    congregationId: nullableUuidSchema,
    name: z.string().trim().min(2, "Nome obrigatório").max(120),
    minAgeMonths: z.coerce.number().int().min(0, "Idade mínima inválida").max(216),
    maxAgeMonths: z.coerce.number().int().min(0, "Idade máxima inválida").max(240),
    capacity: z.coerce.number().int().min(1, "Capacidade mínima é 1"),
    location: z.string().trim().optional().default(""),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.maxAgeMonths >= data.minAgeMonths, {
    message: "Faixa etária inválida",
    path: ["maxAgeMonths"],
  })

export const kidClassroomRuleSchema = z
  .object({
    id: nullableUuidSchema,
    classroomId: uuid,
    congregationId: nullableUuidSchema,
    weekday: z
      .union([z.coerce.number().int().min(0).max(6), z.literal(""), z.null()])
      .optional()
      .transform((value) => (value === "" || value == null ? null : value)),
    startTime: nullableTimeSchema,
    endTime: nullableTimeSchema,
    minAgeMonths: z.coerce.number().int().min(0).max(216).default(0),
    maxAgeMonths: z.coerce.number().int().min(0).max(240).default(216),
    priority: z.coerce.number().int().min(0).max(999).default(100),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.maxAgeMonths >= data.minAgeMonths, {
    message: "Faixa etária inválida",
    path: ["maxAgeMonths"],
  })

export const kidSettingsSchema = z.object({
  congregationId: nullableUuidSchema,
  requireCheckoutPin: z.boolean().default(true),
  pinRotationMinutes: z.coerce.number().int().min(5, "Mínimo 5 minutos").max(240, "Máximo 240 minutos").default(30),
  allowCapacityOverride: z.boolean().default(true),
  labelPaper: z.enum(["thermal_62x40", "a4"]).default("thermal_62x40"),
  labelShowQr: z.boolean().default(true),
  autoPrint: z.boolean().default(true),
  visitorFormEnabled: z.boolean().default(true),
  requiredConsentTypes: z.array(consentTypeSchema).default(["data_processing", "emergency_care"]),
})

// ---------------------------------------------------------------------------
// Fase 2 — operação presencial
// ---------------------------------------------------------------------------

const nullableDateTimeSchema = z
  .union([z.string().trim().min(10, "Data/hora inválida"), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

export const kidSessionSchema = z
  .object({
    id: nullableUuidSchema,
    title: z.string().trim().min(2, "Título obrigatório").max(160),
    congregationId: nullableUuidSchema,
    eventId: nullableUuidSchema,
    startsAt: z.string().trim().min(10, "Informe início da sessão"),
    endsAt: nullableDateTimeSchema,
    classroomIds: z.array(uuid).default([]),
  })
  .refine((data) => !data.endsAt || data.endsAt > data.startsAt, {
    message: "Término deve ser após o início",
    path: ["endsAt"],
  })

export const kidSessionClassroomSchema = z.object({
  sessionId: uuid,
  classroomId: uuid,
  capacityOverride: z
    .union([z.coerce.number().int().min(1), z.literal(""), z.null()])
    .optional()
    .transform((value) => (value === "" || value == null ? null : value)),
})

export const kidStaffAssignmentSchema = z.object({
  sessionId: uuid,
  sessionClassroomId: nullableUuidSchema,
  profileId: uuid,
  assignmentRole: z.enum(["leader", "teacher", "helper", "reception"]).default("teacher"),
})

export const kidCheckinSchema = z.object({
  sessionId: uuid,
  kidId: uuid,
  sessionClassroomId: nullableUuidSchema,
  overrideReason: z.string().trim().max(300).optional().default(""),
})

export const kidCheckoutSchema = z.object({
  sessionId: uuid,
  qrPayload: z.string().trim().max(120).optional().default(""),
  attendanceId: nullableUuidSchema,
  pin: z.string().trim().regex(/^\d{6}$/, "PIN deve ter 6 dígitos").or(z.literal("")).optional().default(""),
  overrideReason: z.string().trim().max(300).optional().default(""),
})

export const kidCheckoutRequestSchema = z.object({
  attendanceId: uuid,
})

export const kidRotateCredentialSchema = z.object({
  attendanceId: uuid,
})

export const kidGuardianCallSchema = z.object({
  attendanceId: uuid,
  reason: z.string().trim().min(2, "Motivo obrigatório").max(160),
})

export const kidIncidentSchema = z.object({
  id: nullableUuidSchema,
  sessionId: nullableUuidSchema,
  sessionClassroomId: nullableUuidSchema,
  kidId: nullableUuidSchema,
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  title: z.string().trim().min(2, "Título obrigatório").max(200),
  description: z.string().trim().optional().default(""),
})

// ---------------------------------------------------------------------------
// Fase 4 — comunicação e relatórios
// ---------------------------------------------------------------------------

const nullableIntSchema = z
  .union([z.coerce.number().int().min(0).max(240), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value === "" || value == null ? null : value))

export const kidCampaignSchema = z
  .object({
    channel: z.enum(["whatsapp", "email"]),
    subject: z.string().trim().max(160).optional().default(""),
    body: z.string().trim().min(2, "Mensagem obrigatória").max(2000),
    congregationId: nullableUuidSchema,
    classroomId: nullableUuidSchema,
    minAgeMonths: nullableIntSchema,
    maxAgeMonths: nullableIntSchema,
    kidId: nullableUuidSchema,
  })
  .refine((data) => data.channel !== "email" || data.subject.trim().length > 0, {
    message: "Assunto obrigatório para e-mail",
    path: ["subject"],
  })

export const kidLessonReportSchema = z.object({
  id: nullableUuidSchema,
  sessionId: uuid,
  sessionClassroomId: nullableUuidSchema,
  kidId: nullableUuidSchema,
  title: z.string().trim().min(2, "Título obrigatório").max(200),
  content: z.string().trim().optional().default(""),
  sharedWithGuardians: z.boolean().default(false),
})
