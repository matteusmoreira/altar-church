export type UserRole = "superadmin" | "admin" | "pastor" | "ministry_leader" | "cell_leader" | "communication" | "finance" | "volunteer" | "reader"

export type ChurchStatus = "active" | "blocked" | "test"

export type Permission =
  | "members.view"
  | "members.create"
  | "members.edit"
  | "members.delete"
  | "members.export"
  | "visitors.view"
  | "visitors.create"
  | "visitors.edit"
  | "cells.view"
  | "cells.create"
  | "cells.edit"
  | "cells.delete"
  | "ministries.view"
  | "ministries.create"
  | "ministries.edit"
  | "events.view"
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "attendance.view"
  | "attendance.create"
  | "finance.view"
  | "finance.create"
  | "finance.edit"
  | "finance.delete"
  | "finance.export"
  | "reports.view"
  | "reports.export"
  | "crm.view"
  | "crm.edit"
  | "communication.view"
  | "communication.create"
  | "communication.edit"
  | "communication.delete"
  | "communication.send"
  | "settings.edit"
  | "settings.manage_settings"
  | "prayer.view"
  | "prayer.create"
  | "prayer.edit"
  | "prayer.delete"
  | "content.view"
  | "content.create"
  | "content.edit"
  | "content.delete"
  | "content.publish"
  | "notification.view"
  | "notification.create"
  | "notification.edit"
  | "notification.delete"
  | "notification.send"
  | "notification.approve"
  | "donation.view"
  | "donation.create"
  | "donation.edit"
  | "donation.export"
  | "subscription.view"
  | "subscription.create"
  | "subscription.edit"
  | "subscription.delete"
  | "groups.view"
  | "groups.create"
  | "groups.edit"
  | "groups.delete"
  | "groups.approve"
  | "volunteers.view"
  | "volunteers.create"
  | "volunteers.edit"
  | "volunteers.invite"
  | "schedules.view"
  | "schedules.create"
  | "schedules.edit"
  | "schedules.publish"
  | "volunteer_feed.view"
  | "volunteer_feed.create"
  | "volunteer_feed.publish"
  | "volunteer_checkin.create"
  | "volunteer.self.view"
  | "volunteer.self.checkin"

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  churchId?: string
  createdAt: string
}

export interface Church {
  id: string
  name: string
  slug: string
  responsibleName: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  logo?: string
  plan: "free" | "basic" | "premium" | "enterprise"
  status: ChurchStatus
  active: boolean
  memberCount: number
  userCount: number
  createdAt: string
}

export interface Member {
  id: string
  churchId: string
  name: string
  email: string
  phone: string
  birthDate: string
  gender: "male" | "female"
  address: string
  city: string
  state: string
  status: "active" | "inactive" | "visitor"
  membershipDate?: string
  groupId?: string
  avatar?: string
  notes?: string
  createdAt: string
}

export interface Visitor {
  id: string
  churchId: string
  name: string
  email: string
  phone: string
  source: "event" | "cell" | "online" | "referral" | "walk-in"
  firstVisitDate: string
  lastVisitDate: string
  visitCount: number
  status: "new" | "contacted" | "following" | "converted" | "inactive"
  assignedTo?: string
  assignedToName?: string
  notes?: string
  createdAt: string
}

export interface Cell {
  id: string
  churchId: string
  name: string
  leaderId: string
  leaderName: string
  auxiliaryLeaderId?: string
  auxiliaryLeaderName?: string
  hostId?: string
  hostName?: string
  meetingDay: string
  meetingTime: string
  address: string
  neighborhood: string
  city: string
  status: "active" | "inactive"
  maxCapacity: number
  notes?: string
  memberCount: number
  createdAt: string
}

export interface CellReport {
  id: string
  cellId: string
  cellName: string
  meetingDate: string
  presentIds: string[]
  presentNames: string[]
  absentIds: string[]
  absentNames: string[]
  visitorNames: string[]
  topic: string
  notes?: string
  prayerRequests?: string
  decisions?: string
  createdAt: string
}

export interface Ministry {
  id: string
  churchId: string
  name: string
  description: string
  leaderId: string
  leaderName: string
  memberIds: string[]
  memberCount: number
  active: boolean
  createdAt: string
}

export interface AttendanceRecord {
  id: string
  churchId: string
  personId: string
  personName: string
  eventType: "service" | "event" | "cell" | "ministry" | "course"
  eventRefId: string
  eventRefName: string
  date: string
  time: string
  status: "present" | "absent" | "justified"
  registeredBy: string
  registeredByName: string
  createdAt: string
}

export interface CRMCard {
  id: string
  churchId: string
  personId?: string
  personName: string
  personPhone: string
  personEmail?: string
  stage: "new" | "contacted" | "meeting" | "visiting" | "member" | "inactive"
  source: string
  assignedTo: string
  assignedToName: string
  lastContact?: string
  notes?: string
  createdAt: string
}

export interface PersonDirectoryOption {
  id: string
  fullName: string
  email: string
  phone: string
}

export interface Group {
  id: string
  churchId: string
  name: string
  description: string
  type: "cell" | "ministry" | "department" | "class"
  leaderId: string
  leaderName: string
  meetingDay: string
  meetingTime: string
  meetingLocation: string
  memberCount: number
  active: boolean
  createdAt: string
}

export interface ChurchEvent {
  id: string
  churchId: string
  title: string
  description: string
  type: "service" | "prayer" | "youth" | "children" | "special" | "meeting"
  startDate: string
  endDate: string
  location: string
  banner: string
  attendance: number
  maxCapacity: number
  registrationEnabled: boolean
  isPublic: boolean
  isOnline: boolean
  onlineLink: string
  status: "draft" | "published" | "cancelled"
  recurring: boolean
  registrations: EventRegistration[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface EventRegistration {
  id: string
  eventId: string
  personId: string
  personName: string
  personEmail: string
  personPhone: string
  checkedIn: boolean
  checkedInAt: string | null
  createdAt: string
}

export interface Transaction {
  id: string
  churchId: string
  memberId: string
  memberName: string
  type: "tithe" | "offering" | "donation" | "mission" | "building"
  amount: number
  method: "cash" | "card" | "transfer" | "pix"
  date: string
  reference: string
  notes?: string
  createdAt: string
}

export interface Announcement {
  id: string
  churchId: string
  title: string
  content: string
  authorId: string
  authorName: string
  priority: "low" | "medium" | "high"
  published: boolean
  publishedAt?: string
  createdAt: string
}

export interface DashboardMetrics {
  totalMembers: number
  activeMembers: number
  totalGroups: number
  monthlyIncome: number
  monthlyExpenses: number
  upcomingEvents: number
  recentTransactions: Transaction[]
  attendanceTrend: { month: string; attendance: number }[]
  incomeTrend: { month: string; amount: number }[]
  memberGrowth: { month: string; count: number }[]
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [],
  admin: [
    "members.view", "members.create", "members.edit", "members.delete", "members.export",
    "visitors.view", "visitors.create", "visitors.edit",
    "cells.view", "cells.create", "cells.edit", "cells.delete",
    "ministries.view", "ministries.create", "ministries.edit",
    "events.view", "events.create", "events.edit", "events.delete",
    "attendance.view", "attendance.create",
    "finance.view", "finance.create", "finance.edit", "finance.delete", "finance.export",
    "reports.view", "reports.export",
    "crm.view", "crm.edit",
    "communication.view", "communication.create", "communication.edit", "communication.delete", "communication.send",
    "settings.edit", "settings.manage_settings",
    "prayer.view", "prayer.create", "prayer.edit", "prayer.delete",
    "content.view", "content.create", "content.edit", "content.delete", "content.publish",
    "notification.view", "notification.create", "notification.edit", "notification.delete", "notification.send", "notification.approve",
    "donation.view", "donation.create", "donation.edit", "donation.export",
    "subscription.view", "subscription.create", "subscription.edit", "subscription.delete",
    "groups.view", "groups.create", "groups.edit", "groups.delete", "groups.approve",
    "volunteers.view", "volunteers.create", "volunteers.edit", "volunteers.invite",
    "schedules.view", "schedules.create", "schedules.edit", "schedules.publish",
    "volunteer_feed.view", "volunteer_feed.create", "volunteer_feed.publish", "volunteer_checkin.create",
  ],
  pastor: [
    "members.view", "members.create", "members.edit", "members.export",
    "visitors.view", "visitors.create", "visitors.edit",
    "cells.view", "cells.create", "cells.edit",
    "ministries.view", "ministries.create", "ministries.edit",
    "events.view", "events.create", "events.edit",
    "attendance.view", "attendance.create",
    "finance.view", "finance.export",
    "reports.view", "reports.export",
    "crm.view", "crm.edit",
    "communication.view", "communication.create", "communication.edit", "communication.send",
    "prayer.view", "prayer.create", "prayer.edit",
    "content.view", "content.create", "content.edit", "content.publish",
    "notification.view", "notification.create", "notification.send",
    "donation.view", "donation.export",
    "groups.view", "groups.create", "groups.edit", "groups.approve",
    "volunteers.view", "volunteers.create", "volunteers.edit", "volunteers.invite",
    "schedules.view", "schedules.create", "schedules.edit", "schedules.publish",
    "volunteer_feed.view", "volunteer_feed.create", "volunteer_feed.publish", "volunteer_checkin.create",
  ],
  ministry_leader: [
    "members.view",
    "visitors.view", "visitors.create",
    "cells.view", "cells.edit",
    "ministries.view", "ministries.edit",
    "events.view", "events.create", "events.edit",
    "attendance.view", "attendance.create",
    "crm.view", "crm.edit",
    "prayer.view", "prayer.create",
    "content.view", "content.create",
    "groups.view", "groups.edit",
    "volunteers.view", "volunteers.create", "volunteers.edit",
    "schedules.view", "schedules.create", "schedules.edit",
    "volunteer_feed.view", "volunteer_feed.create", "volunteer_checkin.create",
  ],
  cell_leader: [
    "members.view",
    "visitors.view", "visitors.create",
    "cells.view", "cells.edit",
    "events.view",
    "attendance.view", "attendance.create",
    "prayer.view", "prayer.create",
    "groups.view", "groups.edit",
  ],
  communication: [
    "members.view",
    "communication.view", "communication.create", "communication.edit", "communication.send",
    "content.view", "content.create", "content.edit", "content.publish",
    "notification.view", "notification.create", "notification.send",
  ],
  finance: [
    "finance.view", "finance.create", "finance.edit", "finance.delete", "finance.export",
    "reports.view", "reports.export",
    "donation.view", "donation.create", "donation.edit", "donation.export",
    "subscription.view", "subscription.create", "subscription.edit",
  ],
  volunteer: [
    "volunteer.self.view", "volunteer.self.checkin",
  ],
  reader: [
    "members.view",
    "events.view",
    "attendance.view",
    "prayer.view",
    "content.view",
    "reports.view",
  ],
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  if (role === "superadmin") return true
  return ROLE_PERMISSIONS[role].includes(permission)
}

export interface ChurchInfo {
  id: string
  name: string
  publicName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  country: string
  timezone: string
  history: string
  responsibleName: string
  logo: string
  coverImage: string
  socialLinks: { platform: string; url: string }[]
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface Programming {
  id: string
  churchId: string
  title: string
  description: string
  isLive: boolean
  isRecurring: boolean
  date: string
  durationHours: number
  durationMinutes: number
  sendPushNotification: boolean
  allowPublicChat: boolean
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Song {
  id: string
  churchId: string
  title: string
  subtitle: string
  code: string
  author: string
  theme: string
  group: string
  tone: string
  rhythm: string
  content: string
  active: boolean
  createdAt: string
}

export interface Congregation {
  id: string
  churchId: string
  name: string
  responsible: string
  address: string
  active: boolean
  updatedAt: string
  createdAt: string
}

export interface PrayerRequest {
  id: string
  churchId: string
  name: string
  city: string
  state: string
  country: string
  prayerReason: string
  message: string
  receiveVisit: boolean
  receiveCall: boolean
  publishOnWall: boolean
  status: "open" | "praying" | "answered" | "archived"
  active: boolean
  userId: string
  userName: string
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ReadingPlan {
  id: string
  churchId: string
  name: string
  description: string
  coverImage: string
  objectives: string[]
  period: string
  targetAudience: string
  steps: ReadingPlanStep[]
  status: "draft" | "published"
  active: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ReadingPlanStep {
  id: string
  day: number
  title: string
  content: string
  scriptureRef: string
}

export interface News {
  id: string
  churchId: string
  title: string
  summary: string
  content: string
  embedUrl: string
  coverImage: string
  scheduledPublish: boolean
  publishDate: string
  sendPushNotification: boolean
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

export interface Devotional {
  id: string
  churchId: string
  title: string
  content: string
  category: string
  embedUrl: string
  coverImage: string
  scheduledPublish: boolean
  publishDate: string
  sendPushNotification: boolean
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

export interface EBD {
  id: string
  churchId: string
  title: string
  content: string
  category: string
  embedUrl: string
  coverImage: string
  scheduledPublish: boolean
  publishDate: string
  sendPushNotification: boolean
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

export interface Publication {
  id: string
  churchId: string
  title: string
  author: string
  content: string
  publicationType: string
  embedUrl: string
  coverImage: string
  scheduledPublish: boolean
  publishDate: string
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

export interface Banner {
  id: string
  churchId: string
  title: string
  link: string
  image: string
  order: number
  startDate: string
  endDate: string
  active: boolean
  showInApps: boolean
  showInWeb: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Notification {
  id: string
  churchId: string
  title: string
  content: string
  method: "push" | "email" | "sms"
  type: "general" | "group" | "birthday"
  targetGroup: string
  scheduledSend: boolean
  sendDate: string
  status: "sent" | "scheduled" | "draft"
  createdAt: string
}

export interface NotificationGroup {
  id: string
  churchId: string
  name: string
  active: boolean
  filters: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface SubscriptionPlan {
  id: string
  churchId: string
  code: string
  name: string
  description: string
  billingCycle: "daily" | "monthly" | "yearly"
  billingInterval: number
  autoRenew: boolean
  discountType: "none" | "percentage" | "fixed"
  discountValue: number
  price: number
  signupFee: number
  active: boolean
  createdAt: string
}

export interface SubscriptionTag {
  id: string
  churchId: string
  name: string
  createdAt: string
}

export interface Subscription {
  id: string
  churchId: string
  userId: string
  userName: string
  planId: string
  planName: string
  price: number
  startDate: string
  endDate: string
  status: "active" | "expired" | "suspended" | "pending" | "awaiting_payment"
  createdAt: string
}

export interface SubscriptionContent {
  id: string
  churchId: string
  title: string
  description: string
  tags: string[]
  productionYear: string
  contentType: "youtube" | "vimeo"
  contentCode: string
  highlightImage: string
  coverImage: string
  isDraft: boolean
  isFeatured: boolean
  isComingSoon: boolean
  active: boolean
  createdAt: string
}

export interface SubscriptionCollection {
  id: string
  churchId: string
  title: string
  description: string
  tags: string[]
  highlightImage: string
  coverImage: string
  isFeatured: boolean
  isComingSoon: boolean
  active: boolean
  createdAt: string
}

export interface Revenue {
  id: string
  churchId: string
  amount: number
  category: string
  subcategory: string
  receivedFrom: "anonymous" | "supplier" | "person"
  receivedFromName: string
  description: string
  costCenter: string
  bankAccount: string
  paymentMethod: string
  dueDate: string
  paymentDate: string
  received: boolean
  notes: string
  createdAt: string
}

export interface Expense {
  id: string
  churchId: string
  amount: number
  category: string
  subcategory: string
  paidTo: "supplier"
  paidToName: string
  description: string
  costCenter: string
  bankAccount: string
  paymentMethod: string
  dueDate: string
  paymentDate: string
  paid: boolean
  notes: string
  createdAt: string
}

export interface FinancialCategory {
  id: string
  churchId: string
  name: string
  color: string
  type: "revenue" | "expense"
  active: boolean
}

export interface CostCenter {
  id: string
  churchId: string
  title: string
  description: string
  responsible: string
  active: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface BankAccount {
  id: string
  churchId: string
  description: string
  bank: string
  accountType: string
  initialBalance: number
  agency: string
  account: string
  digit: string
  active: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Supplier {
  id: string
  churchId: string
  name: string
  document: string
  responsible: string
  phone: string
  email: string
  active: boolean
}

export interface Donation {
  id: string
  churchId: string
  donorName: string
  amount: number
  reason: string
  method: "pix" | "card" | "boleto" | "cash"
  date: string
  status: "confirmed" | "pending" | "cancelled"
  createdAt: string
}

export interface DonationRecurrence {
  id: string
  churchId: string
  userId: string
  userName: string
  reason: string
  amount: number
  frequency: "monthly" | "weekly" | "yearly"
  active: boolean
  pending: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomField {
  id: string
  churchId: string
  name: string
  type: "multiple" | "single" | "text" | "date"
  availableInApp: boolean
  createdAt: string
}

export interface Activity {
  id: string
  churchId: string
  description: string
  category: "pastoral" | "worship" | "ministry" | "small_group" | "volunteer"
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface MemberJourney {
  id: string
  churchId: string
  name: string
  milestones: JourneyMilestone[]
  active: boolean
}

export interface JourneyMilestone {
  id: string
  name: string
  description: string
  order: number
}

export interface GroupMeeting {
  id: string
  churchId: string
  period: string
  subject: string
  studyId: string
  studyName: string
  groupIds: string[]
  groupCategories: string[]
  createdAt: string
}

export interface GroupStudy {
  id: string
  churchId: string
  name: string
  contentType: "dynamic" | "lesson" | "preaching"
  content: string
  attachmentUrl: string
  status: "draft" | "published"
  createdAt: string
}

export interface Invoice {
  id: string
  churchId: string
  amount: number
  dueDate: string
  paidDate: string
  status: "pending" | "paid" | "overdue"
  description: string
}

export interface AccessManagement {
  id: string
  userId: string
  userName: string
  email: string
  roles: string[]
  active: boolean
}
