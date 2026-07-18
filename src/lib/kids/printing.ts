/**
 * Modelo da etiqueta 62×40 mm (impressa pelo navegador, fallback A4).
 * Puro e testável — a etiqueta NUNCA exibe dados clínicos, nome completo ou token legível:
 * o QR carrega apenas um payload opaco versionado.
 */

import { formatChildLabelName, labelAlertFlags } from "./security.ts"

export const KIDS_QR_PREFIX = "ak1"

export interface KidLabelInput {
  childFullName: string
  classroomName: string
  sessionTitle: string
  pickupPin: string
  pickupToken: string
  health: {
    hasAllergy: boolean
    hasDietaryRestriction: boolean
    hasMedication: boolean
    hasSpecialNeeds: boolean
  }
  checkedInAt: string
}

export interface KidLabelModel {
  /** Primeiro nome + inicial do sobrenome ("Maria S."). */
  childName: string
  classroomName: string
  sessionTitle: string
  /** PIN de 6 dígitos exibido como código de retirada. */
  pickupCode: string
  /** Alertas visuais genéricos ("ALERGIA"); detalhes só no painel autorizado. */
  alertFlags: string[]
  /** Payload opaco do QR, sem dados pessoais. */
  qrPayload: string
  checkedInAt: string
}

export function buildQrPayload(pickupToken: string): string {
  return `${KIDS_QR_PREFIX}.${pickupToken}`
}

/** Extrai o token de um payload lido; aceita tanto "ak1.<token>" quanto o token puro. */
export function parseQrPayload(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(`${KIDS_QR_PREFIX}.`)) {
    const token = trimmed.slice(KIDS_QR_PREFIX.length + 1)
    return token || null
  }
  return /^[A-Za-z0-9_-]{32}$/.test(trimmed) ? trimmed : null
}

export function buildKidLabelModel(input: KidLabelInput): KidLabelModel {
  return {
    childName: formatChildLabelName(input.childFullName),
    classroomName: input.classroomName,
    sessionTitle: input.sessionTitle,
    pickupCode: input.pickupPin,
    alertFlags: labelAlertFlags(input.health),
    qrPayload: buildQrPayload(input.pickupToken),
    checkedInAt: input.checkedInAt,
  }
}
