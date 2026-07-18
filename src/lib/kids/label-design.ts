import { z } from "zod"
import type { KidLabelDesign, KidLabelElement, KidLabelKind, KidLabelRenderContext } from "./types"

export const KID_LABEL_SCHEMA_VERSION = 1 as const
export const KID_LABEL_FONTS = ["Arial", "Inter", "Roboto", "Montserrat", "Poppins", "Nunito", "Open Sans"] as const

export const KID_LABEL_FIELDS = [
  { value: "childName", label: "Nome abreviado da criança", sensitive: false },
  { value: "childFullName", label: "Nome completo da criança", sensitive: true },
  { value: "childBirthDate", label: "Nascimento", sensitive: true },
  { value: "childAge", label: "Idade", sensitive: false },
  { value: "childNotes", label: "Observações", sensitive: true },
  { value: "childPhotoUrl", label: "Foto da criança", sensitive: true },
  { value: "attendanceStatus", label: "Status da presença", sensitive: false },
  { value: "visitorStatus", label: "Visitante/membro", sensitive: false },
  { value: "guardianName", label: "Responsável abreviado", sensitive: false },
  { value: "guardianFullName", label: "Responsável completo", sensitive: true },
  { value: "guardianPhone", label: "Telefone responsável", sensitive: true },
  { value: "guardianEmail", label: "E-mail responsável", sensitive: true },
  { value: "churchName", label: "Nome da igreja", sensitive: false },
  { value: "congregationName", label: "Congregação", sensitive: false },
  { value: "classroomName", label: "Sala", sensitive: false },
  { value: "sessionTitle", label: "Sessão/culto", sensitive: false },
  { value: "checkedInAt", label: "Horário do check-in", sensitive: false },
  { value: "pickupCode", label: "PIN de retirada", sensitive: false },
  { value: "consentSummary", label: "Consentimentos", sensitive: true },
  { value: "alertSummary", label: "Alertas genéricos", sensitive: false },
  { value: "allergies", label: "Alergias detalhadas", sensitive: true },
  { value: "dietaryRestrictions", label: "Restrições alimentares", sensitive: true },
  { value: "medication", label: "Medicação", sensitive: true },
  { value: "specialNeeds", label: "Necessidades especiais", sensitive: true },
  { value: "healthInstructions", label: "Instruções clínicas", sensitive: true },
] as const

const elementSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["text", "field", "qr", "image", "rect", "circle", "line", "badge"]),
  name: z.string().min(1).max(120),
  x: z.number().finite(), y: z.number().finite(), width: z.number().positive(), height: z.number().positive(),
  rotation: z.number().finite().min(-360).max(360), opacity: z.number().min(0).max(1),
  visible: z.boolean(), locked: z.boolean(), zIndex: z.number().int(),
  groupId: z.string().max(100).nullable().optional(),
  text: z.string().max(1000).optional(), field: z.string().max(160).optional(),
  assetId: z.string().uuid().nullable().optional(), assetUrl: z.string().nullable().optional(),
  fontFamily: z.string().max(80).optional(), fontSize: z.number().positive().max(300).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(), textAlign: z.enum(["left", "center", "right"]).optional(),
  letterSpacing: z.number().min(-10).max(50).optional(), color: z.string().max(100).optional(),
  fill: z.string().max(200).optional(), stroke: z.string().max(100).optional(), strokeWidth: z.number().min(0).max(20).optional(),
  gradientFrom: z.string().max(100).optional(), gradientTo: z.string().max(100).optional(), gradientAngle: z.number().min(0).max(360).optional(),
  radius: z.number().min(0).max(100).optional(), shadowColor: z.string().max(100).optional(), shadowBlur: z.number().min(0).max(100).optional(),
  fit: z.enum(["cover", "contain", "stretch"]).optional(),
})

export const kidLabelDesignSchema = z.object({
  schemaVersion: z.literal(1),
  backgroundColor: z.string().max(200),
  backgroundGradientFrom: z.string().max(100).nullable().optional(), backgroundGradientTo: z.string().max(100).nullable().optional(), backgroundGradientAngle: z.number().min(0).max(360).optional(),
  backgroundAssetId: z.string().uuid().nullable(),
  backgroundAssetUrl: z.string().nullable().optional(),
  backgroundFit: z.enum(["cover", "contain", "stretch"]),
  showGrid: z.boolean(), snapToGrid: z.boolean(), gridSizeMm: z.number().min(0.5).max(20), bleedMm: z.number().min(0).max(10),
  elements: z.array(elementSchema).max(150),
})

export const kidLabelDraftSchema = z.object({
  templateId: z.string().uuid(), name: z.string().trim().min(2).max(120),
  widthMm: z.number().min(20).max(297), heightMm: z.number().min(15).max(420), dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]),
  design: kidLabelDesignSchema,
})

export const kidLabelScopeSchema = z.object({
  congregationId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional().transform((value) => value || null),
})

export const SENSITIVE_LABEL_FIELDS = new Set(KID_LABEL_FIELDS.filter((field) => field.sensitive).map((field) => field.value as string))

export function labelContainsSensitiveFields(design: KidLabelDesign) {
  return design.elements.some((element) => element.type === "field" && Boolean(element.field) && (SENSITIVE_LABEL_FIELDS.has(element.field!) || element.field!.startsWith("custom.")))
}

export function validatePublishableLabel(kind: KidLabelKind, design: KidLabelDesign) {
  const visible = design.elements.filter((element) => element.visible)
  if (kind === "child" && !visible.some((element) => element.type === "field" && ["childName", "childFullName"].includes(element.field ?? ""))) {
    return "Etiqueta da criança precisa identificar a criança"
  }
  if (kind === "guardian" && !visible.some((element) => element.type === "qr" || (element.type === "field" && element.field === "pickupCode"))) {
    return "Etiqueta do responsável precisa conter QR ou PIN"
  }
  return null
}

const element = (input: Partial<KidLabelElement> & Pick<KidLabelElement, "id" | "type" | "name" | "x" | "y" | "width" | "height">): KidLabelElement => ({
  rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0,
  fontFamily: "Arial", fontSize: 4, fontWeight: 400, textAlign: "left", letterSpacing: 0,
  color: "#111111", fill: "transparent", stroke: "transparent", strokeWidth: 0, radius: 0, shadowColor: "transparent", shadowBlur: 0,
  ...input,
})

export function createDefaultLabelDesign(kind: KidLabelKind): KidLabelDesign {
  const common: KidLabelDesign = { schemaVersion: 1, backgroundColor: "#ffffff", backgroundGradientFrom: null, backgroundGradientTo: null, backgroundGradientAngle: 0, backgroundAssetId: null, backgroundFit: "cover", showGrid: true, snapToGrid: true, gridSizeMm: 2, bleedMm: 1, elements: [] }
  if (kind === "guardian") {
    common.elements = [
      element({ id: "guardian-title", type: "text", name: "Título", x: 4, y: 3, width: 36, height: 5, text: "RETIRADA", fontSize: 3.2, fontWeight: 700 }),
      element({ id: "guardian-child", type: "field", name: "Criança", x: 4, y: 9, width: 36, height: 8, field: "childName", fontSize: 5.5, fontWeight: 700 }),
      element({ id: "guardian-pin", type: "field", name: "PIN", x: 4, y: 20, width: 34, height: 12, field: "pickupCode", fontSize: 8, fontWeight: 800, letterSpacing: 2 }),
      element({ id: "guardian-qr", type: "qr", name: "QR", x: 43, y: 5, width: 15, height: 15 }),
      element({ id: "guardian-session", type: "field", name: "Sessão", x: 4, y: 34, width: 54, height: 4, field: "sessionTitle", fontSize: 2.3, color: "#555555" }),
    ]
    return common
  }
  common.elements = [
    element({ id: "child-name", type: "field", name: "Nome", x: 4, y: 4, width: 37, height: 9, field: "childName", fontSize: 7, fontWeight: 800 }),
    element({ id: "child-room", type: "field", name: "Sala", x: 4, y: 14, width: 37, height: 6, field: "classroomName", fontSize: 4.2, fontWeight: 600 }),
    element({ id: "child-session", type: "field", name: "Sessão", x: 4, y: 21, width: 37, height: 4, field: "sessionTitle", fontSize: 2.5, color: "#555555" }),
    element({ id: "child-alert", type: "badge", name: "Alertas", x: 4, y: 27, width: 37, height: 5, field: "alertSummary", fontSize: 2.6, fontWeight: 700, fill: "#eeeeee", radius: 1 }),
    element({ id: "child-pin", type: "field", name: "PIN", x: 4, y: 33, width: 37, height: 5, field: "pickupCode", fontSize: 4.5, fontWeight: 800, letterSpacing: 1.2 }),
    element({ id: "child-qr", type: "qr", name: "QR", x: 43, y: 5, width: 15, height: 15 }),
  ]
  return common
}

export const SAMPLE_LABEL_CONTEXT: KidLabelRenderContext = {
  childName: "Noah L.", childFullName: "Noah Lima", childBirthDate: "15/04/2021", childAge: "5 anos", childNotes: "",
  childPhotoUrl: "", attendanceStatus: "Check-in confirmado", visitorStatus: "Visitante", guardianName: "Ana L.", guardianFullName: "Ana Lima", guardianPhone: "(11) 99999-9999", guardianEmail: "ana@exemplo.com",
  churchName: "Altar Church", congregationName: "Unidade Centro", classroomName: "Sala Azul", sessionTitle: "Culto de domingo",
  checkedInAt: "18:16", pickupCode: "984280", qrPayload: "ak1.preview-safe-token", consentSummary: "Dados e emergência",
  alertSummary: "ALERGIA", allergies: "Amendoim", dietaryRestrictions: "Sem lactose", medication: "", specialNeeds: "", healthInstructions: "",
  customFields: {},
}

export function resolveLabelField(context: KidLabelRenderContext, field?: string) {
  if (!field) return ""
  if (field.startsWith("custom.")) return context.customFields[field.slice(7)] ?? ""
  return String(context[field as keyof Omit<KidLabelRenderContext, "customFields">] ?? "")
}
