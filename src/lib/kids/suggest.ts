/**
 * Sugestão de sala no check-in — lógica pura (sem dependências do projeto),
 * testável com `node --test`.
 *
 * Ordem de decisão:
 * 1. Regras ativas que combinam congregação + dia/horário + faixa etária (menor prioridade vence).
 * 2. Salas cuja faixa etária comporta a criança (prefere congregação da criança).
 * 3. Qualquer sala com vagas (quando idade é desconhecida).
 * Salas lotadas nunca são sugeridas.
 */

export interface SuggestRule {
  congregationId: string | null
  weekday: number | null
  startTime: string | null
  endTime: string | null
  minAgeMonths: number
  maxAgeMonths: number
  priority: number
  isActive: boolean
}

export interface SuggestCandidate {
  sessionClassroomId: string
  classroomId: string
  name: string
  congregationId: string | null
  minAgeMonths: number
  maxAgeMonths: number
  capacity: number
  occupied: number
  isOpen: boolean
  rules: SuggestRule[]
}

export interface SuggestInput {
  ageMonths: number | null
  congregationId: string | null
  /** Momento de referência (início da sessão) para dia da semana e horário. */
  at: Date
  candidates: SuggestCandidate[]
}

export interface SuggestResult {
  sessionClassroomId: string
  reason: "rule" | "age_range" | "age_range_congregation" | "capacity"
}

/** Idade em meses completos na data de referência (UTC). */
export function ageMonthsAt(birthDate: string | null | undefined, at: Date = new Date()): number | null {
  if (!birthDate) return null
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(birth.getTime())) return null
  let months = (at.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (at.getUTCMonth() - birth.getUTCMonth())
  if (at.getUTCDate() < birth.getUTCDate()) months -= 1
  return Math.max(0, months)
}

function timeToMinutes(value: string | null): number | null {
  if (!value) return null
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Dia da semana e minutos do dia no fuso da igreja (regras são criadas em horário local). */
export function saoPauloParts(at: Date): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at)
  const weekday = WEEKDAY_INDEX[parts.find((part) => part.type === "weekday")?.value ?? "Sun"] ?? 0
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  return { weekday, minutes: hour * 60 + minute }
}

function ruleMatches(rule: SuggestRule, input: SuggestInput, ageMonths: number | null): boolean {
  if (!rule.isActive) return false
  if (rule.congregationId && rule.congregationId !== input.congregationId) return false
  const local = saoPauloParts(input.at)
  if (rule.weekday != null && rule.weekday !== local.weekday) return false
  const start = timeToMinutes(rule.startTime)
  const end = timeToMinutes(rule.endTime)
  if (start != null && end != null) {
    if (local.minutes < start || local.minutes >= end) return false
  }
  if (ageMonths != null && (ageMonths < rule.minAgeMonths || ageMonths > rule.maxAgeMonths)) return false
  return true
}

export function suggestClassroom(input: SuggestInput): SuggestResult | null {
  const ageMonths = input.ageMonths
  const available = input.candidates.filter(
    (candidate) => candidate.isOpen && candidate.occupied < candidate.capacity,
  )
  if (available.length === 0) return null

  // 1) Regra mais específica (menor valor de prioridade).
  let bestRule: { candidate: SuggestCandidate; rule: SuggestRule } | null = null
  for (const candidate of available) {
    for (const rule of candidate.rules) {
      if (!ruleMatches(rule, input, ageMonths)) continue
      if (!bestRule || rule.priority < bestRule.rule.priority) {
        bestRule = { candidate, rule }
      }
    }
  }
  if (bestRule) {
    return { sessionClassroomId: bestRule.candidate.sessionClassroomId, reason: "rule" }
  }

  // 2) Faixa etária da sala (quando idade conhecida).
  if (ageMonths != null) {
    const byAge = available.filter(
      (candidate) => ageMonths >= candidate.minAgeMonths && ageMonths <= candidate.maxAgeMonths,
    )
    const sameCongregation = byAge.filter(
      (candidate) => input.congregationId && candidate.congregationId === input.congregationId,
    )
    if (sameCongregation.length > 0) {
      return { sessionClassroomId: pickWithMostRoom(sameCongregation), reason: "age_range_congregation" }
    }
    if (byAge.length > 0) {
      return { sessionClassroomId: pickWithMostRoom(byAge), reason: "age_range" }
    }
  }

  // 3) Qualquer sala com vagas.
  return { sessionClassroomId: pickWithMostRoom(available), reason: "capacity" }
}

/** Maior folga absoluta; desempate determinístico pelo nome. */
function pickWithMostRoom(candidates: SuggestCandidate[]): string {
  const sorted = [...candidates].sort((a, b) => {
    const slackA = a.capacity - a.occupied
    const slackB = b.capacity - b.occupied
    if (slackA !== slackB) return slackB - slackA
    return a.name.localeCompare(b.name)
  })
  return sorted[0].sessionClassroomId
}
