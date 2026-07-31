export type EventPublicData = {
  token: string
  companySlug: string
  churchName: string
  title: string
  description: string
  type: string
  startsAt: string
  endsAt: string | null
  location: string
  bannerUrl: string
  isOnline: boolean
  onlineLink: string
  registrationEnabled: boolean
  registrationFormSlug: string | null
  registrationFormTitle: string | null
  maxCapacity: number
  goingCount: number
  waitlistedCount: number
  capacityRemaining: number | null
}

export type EventPublicRegistration = {
  id: string
  token: string
  eventToken: string
  eventTitle: string
  fullName: string
  email: string
  phone: string
  status: "going" | "waitlisted" | "canceled"
}

export type EventCheckinPreview = {
  token: string
  eventId: string
  eventTitle: string
  eventLocation: string
  eventStartsAt: string
  attendeeName: string
  attendeeKind: "member" | "guest"
  available: boolean
  alreadyCheckedIn: boolean
}

export type EventCheckinSessionPreview = {
  token: string
  eventId: string
  eventTitle: string
  eventLocation: string
  eventStartsAt: string
  available: boolean
}

export type EventResourceItem = {
  id: string
  title: string
  notes: string
  externalUrl: string | null
  fileId: string | null
  visibility: "private" | "public"
  createdAt: string
}

export type EventReport = {
  going: number
  waitlisted: number
  canceled: number
  present: number
  absent: number
  guestGoing: number
  guestPresent: number
  capacity: number
  attendanceRate: number | null
  followUpCandidates: Array<{ id: string; name: string; email: string; phone: string }>
  notifications: Array<{ id: string; templateKey: string; status: string; scheduledAt: string | null; deliveryCount: number }>
}

export type EventDashboardSummary = {
  total: number
  published: number
  canceled: number
  registrations: number
  present: number
  attendanceRate: number | null
  byType: Array<{ label: string; value: number }>
}

export const eventCommunicationTemplates = [
  { key: "confirmation", label: "Confirmação imediata", title: "Inscrição confirmada", offsetHours: null },
  { key: "reminder_7d", label: "Lembrete 7 dias antes", title: "Lembrete: evento se aproxima", offsetHours: 7 * 24 },
  { key: "reminder_24h", label: "Lembrete 24 horas antes", title: "Lembrete: evento amanhã", offsetHours: 24 },
  { key: "change", label: "Alteração do evento", title: "Alteração no evento", offsetHours: null },
  { key: "cancellation", label: "Cancelamento", title: "Evento cancelado", offsetHours: null },
  { key: "waitlist_promotion", label: "Promoção da espera", title: "Sua inscrição foi promovida", offsetHours: null },
] as const
