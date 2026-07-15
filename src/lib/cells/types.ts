export type CellCheckinSource = "qr" | "manual"
export type CellPrayerStatus = "open" | "praying" | "answered" | "archived"

export interface CellStudyFile {
  id: string
  title: string
  description: string
  scriptureRef: string
  fileName: string
  fileUrl: string
  audience: "all" | "selected"
  groupIds: string[]
  createdAt: string
}

export interface CellCheckinSession {
  id: string
  meetingId: string
  groupId: string
  token: string
  opensAt: string
  expiresAt: string
  closedAt: string | null
  active: boolean
}

export interface CellAttendance {
  id: string
  meetingId: string
  personId: string | null
  personName: string
  source: CellCheckinSource
  occurredAt: string
  visitor: boolean
}

export interface CellPhoto {
  id: string
  meetingId: string
  groupId: string
  fileName: string
  url: string
  createdAt: string
}

export interface CellPrayerRequest {
  id: string
  groupId: string
  groupName: string
  authorName: string
  message: string
  status: CellPrayerStatus
  own: boolean
  createdAt: string
}

export interface CellNotice {
  id: string
  title: string
  content: string
  audience: "all" | "selected"
  groupIds: string[]
  authorName: string
  publishedAt: string
}

export interface CellPortalMeeting {
  id: string
  groupId: string
  groupName: string
  title: string
  startsAt: string
  study: CellStudyFile | null
  photos: CellPhoto[]
}

export interface CellFeaturesData {
  mode: "manager" | "portal"
  personId: string | null
  cells: { id: string; name: string }[]
  people: { id: string; name: string; phone: string; visitor: boolean }[]
  meetings: CellPortalMeeting[]
  studies: CellStudyFile[]
  sessions: CellCheckinSession[]
  attendance: CellAttendance[]
  prayers: CellPrayerRequest[]
  notices: CellNotice[]
}

export interface CellActionResult {
  ok: boolean
  id?: string
  token?: string
  error?: string
}

export interface CellCheckinPreview {
  token: string
  cellName: string
  meetingTitle: string
  startsAt: string
  expiresAt: string
  available: boolean
  alreadyCheckedIn: boolean
}

