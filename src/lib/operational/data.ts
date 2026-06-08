import { requireCompanyAccess, requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import type {
  Announcement,
  AttendanceRecord,
  BankAccount,
  ChurchEvent,
  CostCenter,
  CRMCard,
  Donation,
  DonationRecurrence,
  Expense,
  FinancialCategory,
  Notification,
  NotificationGroup,
  PrayerRequest,
  ReadingPlan,
  ReadingPlanStep,
  Revenue,
  Subscription,
  SubscriptionCollection,
  SubscriptionContent,
  SubscriptionPlan,
  SubscriptionTag,
  Supplier,
} from "@/lib/types"

interface EventRow {
  id: string
  company_id: string
  title: string
  description: string
  type: ChurchEvent["type"]
  starts_at: Date | string
  ends_at: Date | string | null
  location: string
  banner_url: string
  attendance_count: number
  max_capacity: number
  registration_enabled: boolean
  is_public: boolean
  is_online: boolean
  online_link: string
  status: ChurchEvent["status"]
  recurring: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

interface AttendanceRow {
  id: string
  company_id: string
  person_id: string | null
  person_name: string
  event_type: AttendanceRecord["eventType"]
  event_ref_id: string | null
  event_ref_name: string
  occurred_on: Date | string
  occurred_time: string | null
  status: AttendanceRecord["status"]
  registered_by: string | null
  registered_by_name: string
  created_at: Date | string
}

interface CrmRow {
  id: string
  company_id: string
  person_name: string
  person_phone: string
  person_email: string
  stage: CRMCard["stage"]
  source: string
  assigned_to: string | null
  assigned_to_name: string
  last_contact: Date | string | null
  notes: string
  created_at: Date | string
}

interface PrayerRow {
  id: string
  company_id: string
  name: string
  city: string
  state: string
  country: string
  prayer_reason: string
  message: string
  receive_visit: boolean
  receive_call: boolean
  publish_on_wall: boolean
  status: PrayerRequest["status"]
  is_active: boolean
  user_id: string | null
  user_name: string
  created_by: string | null
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

interface ReadingPlanRow {
  id: string
  company_id: string
  name: string
  description: string
  cover_image_url: string
  cover_file_id: string | null
  cover_storage_path: string | null
  objectives: unknown
  period: string
  target_audience: string
  status: ReadingPlan["status"]
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

interface ReadingPlanStepRow {
  id: string
  plan_id: string
  day_number: number
  title: string
  content: string
  scripture_ref: string
}

interface AnnouncementRow {
  id: string
  company_id: string
  title: string
  content: string
  author_id: string | null
  author_name: string
  priority: Announcement["priority"]
  published: boolean
  published_at: Date | string | null
  created_at: Date | string
}

interface NotificationRow {
  id: string
  company_id: string
  title: string
  content: string
  method: Notification["method"]
  type: Notification["type"]
  target_group: string
  scheduled_send: boolean
  send_date: Date | string | null
  status: Notification["status"]
  created_at: Date | string
}

interface NotificationGroupRow {
  id: string
  company_id: string
  name: string
  is_active: boolean
  filters: unknown
  created_at: Date | string
  updated_at: Date | string
}

interface RevenueRow {
  id: string
  company_id: string
  amount: string | number
  category: string
  subcategory: string
  received_from: Revenue["receivedFrom"]
  received_from_name: string
  description: string
  cost_center: string
  bank_account: string
  payment_method: string
  due_date: Date | string | null
  payment_date: Date | string
  received: boolean
  notes: string
  created_at: Date | string
}

interface ExpenseRow {
  id: string
  company_id: string
  amount: string | number
  category: string
  subcategory: string
  paid_to: Expense["paidTo"]
  paid_to_name: string
  description: string
  cost_center: string
  bank_account: string
  payment_method: string
  due_date: Date | string | null
  payment_date: Date | string
  paid: boolean
  notes: string
  created_at: Date | string
}

interface FinancialCategoryRow {
  id: string
  company_id: string
  name: string
  color: string
  type: FinancialCategory["type"]
  is_active: boolean
}

interface CostCenterRow {
  id: string
  company_id: string
  title: string
  description: string
  responsible: string
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

interface BankAccountRow {
  id: string
  company_id: string
  description: string
  bank: string
  account_type: string
  initial_balance: string | number
  agency: string
  account: string
  digit: string
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  deleted_at: Date | string | null
}

interface SupplierRow {
  id: string
  company_id: string
  name: string
  document: string
  responsible: string
  phone: string
  email: string
  is_active: boolean
}

interface DonationRow {
  id: string
  company_id: string
  donor_name: string
  amount: string | number
  reason: string
  method: Donation["method"]
  donated_on: Date | string
  status: Donation["status"]
  created_at: Date | string
}

interface DonationRecurrenceRow {
  id: string
  company_id: string
  user_id: string | null
  user_name: string
  reason: string
  amount: string | number
  frequency: DonationRecurrence["frequency"]
  is_active: boolean
  pending: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface SubscriptionPlanRow {
  id: string
  company_id: string
  code: string
  name: string
  description: string
  billing_cycle: SubscriptionPlan["billingCycle"]
  billing_interval: number
  auto_renew: boolean
  discount_type: SubscriptionPlan["discountType"]
  discount_value: string | number
  price: string | number
  signup_fee: string | number
  is_active: boolean
  created_at: Date | string
}

interface SubscriptionTagRow {
  id: string
  company_id: string
  name: string
  created_at: Date | string
}

interface SubscriptionRow {
  id: string
  company_id: string
  user_id: string | null
  user_name: string
  plan_id: string | null
  plan_name: string
  price: string | number
  start_date: Date | string
  end_date: Date | string | null
  status: Subscription["status"]
  created_at: Date | string
}

interface SubscriptionContentRow {
  id: string
  company_id: string
  title: string
  description: string
  tags: unknown
  production_year: string
  content_type: SubscriptionContent["contentType"]
  content_code: string
  highlight_image_url: string
  cover_image_url: string
  highlight_file_id: string | null
  cover_file_id: string | null
  highlight_storage_path: string | null
  cover_storage_path: string | null
  is_draft: boolean
  is_featured: boolean
  is_coming_soon: boolean
  is_active: boolean
  created_at: Date | string
}

interface SubscriptionCollectionRow {
  id: string
  company_id: string
  title: string
  description: string
  tags: unknown
  highlight_image_url: string
  cover_image_url: string
  highlight_file_id: string | null
  cover_file_id: string | null
  highlight_storage_path: string | null
  cover_storage_path: string | null
  is_featured: boolean
  is_coming_soon: boolean
  is_active: boolean
  created_at: Date | string
}

export interface FinanceData {
  revenues: Revenue[]
  expenses: Expense[]
  categories: FinancialCategory[]
  costCenters: CostCenter[]
  bankAccounts: BankAccount[]
  suppliers: Supplier[]
}

export interface DonationData {
  donations: Donation[]
  recurrences: DonationRecurrence[]
}

export interface InpeaceData {
  plans: SubscriptionPlan[]
  tags: SubscriptionTag[]
  subscriptions: Subscription[]
  contents: SubscriptionContent[]
  collections: SubscriptionCollection[]
}

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

function toIso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function toDate(value: Date | string | null) {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : ""
}

function toTime(value: string | null) {
  return value ? value.slice(0, 5) : ""
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

function toEvent(row: EventRow): ChurchEvent {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    description: row.description,
    type: row.type,
    startDate: toIso(row.starts_at) ?? "",
    endDate: toIso(row.ends_at) ?? toIso(row.starts_at) ?? "",
    location: row.location,
    banner: row.banner_url,
    attendance: row.attendance_count,
    maxCapacity: row.max_capacity,
    registrationEnabled: row.registration_enabled,
    isPublic: row.is_public,
    isOnline: row.is_online,
    onlineLink: row.online_link,
    status: row.status,
    recurring: row.recurring,
    registrations: [],
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  }
}

function toAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    churchId: row.company_id,
    personId: row.person_id ?? "",
    personName: row.person_name,
    eventType: row.event_type,
    eventRefId: row.event_ref_id ?? "",
    eventRefName: row.event_ref_name,
    date: toDate(row.occurred_on),
    time: toTime(row.occurred_time),
    status: row.status,
    registeredBy: row.registered_by ?? "",
    registeredByName: row.registered_by_name,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toCrmCard(row: CrmRow): CRMCard {
  return {
    id: row.id,
    churchId: row.company_id,
    personName: row.person_name,
    personPhone: row.person_phone,
    personEmail: row.person_email,
    stage: row.stage,
    source: row.source,
    assignedTo: row.assigned_to ?? "",
    assignedToName: row.assigned_to_name,
    lastContact: toDate(row.last_contact),
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toPrayerRequest(row: PrayerRow): PrayerRequest {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    city: row.city,
    state: row.state,
    country: row.country,
    prayerReason: row.prayer_reason,
    message: row.message,
    receiveVisit: row.receive_visit,
    receiveCall: row.receive_call,
    publishOnWall: row.publish_on_wall,
    status: row.status,
    active: row.is_active,
    userId: row.user_id ?? "",
    userName: row.user_name,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  }
}

function signedFileUrl(rowStoragePath: string | null, fallbackUrl: string, signedUrls: Map<string, string>) {
  return rowStoragePath ? signedUrls.get(rowStoragePath) ?? fallbackUrl : fallbackUrl
}

function toReadingPlan(row: ReadingPlanRow, steps: ReadingPlanStep[], signedUrls = new Map<string, string>()): ReadingPlan {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    description: row.description,
    coverImage: signedFileUrl(row.cover_storage_path, row.cover_image_url, signedUrls),
    objectives: toStringArray(row.objectives),
    period: row.period,
    targetAudience: row.target_audience,
    steps,
    status: row.status,
    active: row.is_active,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  }
}

function toReadingPlanStep(row: ReadingPlanStepRow): ReadingPlanStep {
  return {
    id: row.id,
    day: row.day_number,
    title: row.title,
    content: row.content,
    scriptureRef: row.scripture_ref,
  }
}

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    content: row.content,
    authorId: row.author_id ?? "",
    authorName: row.author_name,
    priority: row.priority,
    published: row.published,
    publishedAt: toIso(row.published_at) ?? undefined,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    content: row.content,
    method: row.method,
    type: row.type,
    targetGroup: row.target_group,
    scheduledSend: row.scheduled_send,
    sendDate: toDate(row.send_date),
    status: row.status,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toNotificationGroup(row: NotificationGroupRow): NotificationGroup {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    active: row.is_active,
    filters: toStringRecord(row.filters),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function toRevenue(row: RevenueRow): Revenue {
  return {
    id: row.id,
    churchId: row.company_id,
    amount: toNumber(row.amount),
    category: row.category,
    subcategory: row.subcategory,
    receivedFrom: row.received_from,
    receivedFromName: row.received_from_name,
    description: row.description,
    costCenter: row.cost_center,
    bankAccount: row.bank_account,
    paymentMethod: row.payment_method,
    dueDate: toDate(row.due_date),
    paymentDate: toDate(row.payment_date),
    received: row.received,
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    churchId: row.company_id,
    amount: toNumber(row.amount),
    category: row.category,
    subcategory: row.subcategory,
    paidTo: row.paid_to,
    paidToName: row.paid_to_name,
    description: row.description,
    costCenter: row.cost_center,
    bankAccount: row.bank_account,
    paymentMethod: row.payment_method,
    dueDate: toDate(row.due_date),
    paymentDate: toDate(row.payment_date),
    paid: row.paid,
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toFinancialCategory(row: FinancialCategoryRow): FinancialCategory {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    color: row.color,
    type: row.type,
    active: row.is_active,
  }
}

function toCostCenter(row: CostCenterRow): CostCenter {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    description: row.description,
    responsible: row.responsible,
    active: row.is_active,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  }
}

function toBankAccount(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    churchId: row.company_id,
    description: row.description,
    bank: row.bank,
    accountType: row.account_type,
    initialBalance: toNumber(row.initial_balance),
    agency: row.agency,
    account: row.account,
    digit: row.digit,
    active: row.is_active,
    createdBy: row.created_by ?? "",
    updatedBy: row.updated_by ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
    deletedAt: toIso(row.deleted_at),
  }
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    document: row.document,
    responsible: row.responsible,
    phone: row.phone,
    email: row.email,
    active: row.is_active,
  }
}

function toDonation(row: DonationRow): Donation {
  return {
    id: row.id,
    churchId: row.company_id,
    donorName: row.donor_name,
    amount: toNumber(row.amount),
    reason: row.reason,
    method: row.method,
    date: toDate(row.donated_on),
    status: row.status,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toDonationRecurrence(row: DonationRecurrenceRow): DonationRecurrence {
  return {
    id: row.id,
    churchId: row.company_id,
    userId: row.user_id ?? "",
    userName: row.user_name,
    reason: row.reason,
    amount: toNumber(row.amount),
    frequency: row.frequency,
    active: row.is_active,
    pending: row.pending,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function toSubscriptionPlan(row: SubscriptionPlanRow): SubscriptionPlan {
  return {
    id: row.id,
    churchId: row.company_id,
    code: row.code,
    name: row.name,
    description: row.description,
    billingCycle: row.billing_cycle,
    billingInterval: row.billing_interval,
    autoRenew: row.auto_renew,
    discountType: row.discount_type,
    discountValue: toNumber(row.discount_value),
    price: toNumber(row.price),
    signupFee: toNumber(row.signup_fee),
    active: row.is_active,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toSubscriptionTag(row: SubscriptionTagRow): SubscriptionTag {
  return {
    id: row.id,
    churchId: row.company_id,
    name: row.name,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    churchId: row.company_id,
    userId: row.user_id ?? "",
    userName: row.user_name,
    planId: row.plan_id ?? "",
    planName: row.plan_name,
    price: toNumber(row.price),
    startDate: toDate(row.start_date),
    endDate: toDate(row.end_date),
    status: row.status,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toSubscriptionContent(row: SubscriptionContentRow, signedUrls = new Map<string, string>()): SubscriptionContent {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    description: row.description,
    tags: toStringArray(row.tags),
    productionYear: row.production_year,
    contentType: row.content_type,
    contentCode: row.content_code,
    highlightImage: signedFileUrl(row.highlight_storage_path, row.highlight_image_url, signedUrls),
    coverImage: signedFileUrl(row.cover_storage_path, row.cover_image_url, signedUrls),
    isDraft: row.is_draft,
    isFeatured: row.is_featured,
    isComingSoon: row.is_coming_soon,
    active: row.is_active,
    createdAt: toIso(row.created_at) ?? "",
  }
}

function toSubscriptionCollection(row: SubscriptionCollectionRow, signedUrls = new Map<string, string>()): SubscriptionCollection {
  return {
    id: row.id,
    churchId: row.company_id,
    title: row.title,
    description: row.description,
    tags: toStringArray(row.tags),
    highlightImage: signedFileUrl(row.highlight_storage_path, row.highlight_image_url, signedUrls),
    coverImage: signedFileUrl(row.cover_storage_path, row.cover_image_url, signedUrls),
    isFeatured: row.is_featured,
    isComingSoon: row.is_coming_soon,
    active: row.is_active,
    createdAt: toIso(row.created_at) ?? "",
  }
}

export async function listEvents(companyIdInput?: string | null): Promise<ChurchEvent[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("events.view", companyId)

  const sql = getSql()
  const rows = await sql<EventRow[]>`
    select *
    from public.events
    where company_id = ${companyId}
      and deleted_at is null
    order by starts_at desc
    limit 200
  `

  return rows.map(toEvent)
}

export async function listAttendanceRecords(companyIdInput?: string | null): Promise<AttendanceRecord[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("attendance.view", companyId)

  const sql = getSql()
  const rows = await sql<AttendanceRow[]>`
    select *
    from public.attendance_records
    where company_id = ${companyId}
      and deleted_at is null
    order by occurred_on desc, created_at desc
    limit 300
  `

  return rows.map(toAttendance)
}

export async function listCrmCards(companyIdInput?: string | null): Promise<CRMCard[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("crm.view", companyId)

  const sql = getSql()
  const rows = await sql<CrmRow[]>`
    select *
    from public.crm_cards
    where company_id = ${companyId}
      and deleted_at is null
    order by created_at desc
    limit 300
  `

  return rows.map(toCrmCard)
}

export async function listPrayerRequests(companyIdInput?: string | null): Promise<PrayerRequest[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("prayer.view", companyId)

  const sql = getSql()
  const rows = await sql<PrayerRow[]>`
    select *
    from public.prayer_requests
    where company_id = ${companyId}
      and deleted_at is null
    order by updated_at desc
    limit 300
  `

  return rows.map(toPrayerRequest)
}

export async function listReadingPlans(companyIdInput?: string | null): Promise<ReadingPlan[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requireCompanyAccess(companyId)

  const sql = getSql()
  const [plans, steps] = await Promise.all([
    sql<ReadingPlanRow[]>`
      select p.*, cover_file.storage_path as cover_storage_path
      from public.reading_plans p
      left join public.app_files cover_file
        on cover_file.id = p.cover_file_id
       and cover_file.company_id = p.company_id
       and cover_file.is_active = true
       and cover_file.deleted_at is null
      where p.company_id = ${companyId}
        and p.deleted_at is null
      order by p.created_at desc
      limit 200
    `,
    sql<ReadingPlanStepRow[]>`
      select id, plan_id, day_number, title, content, scripture_ref
      from public.reading_plan_steps
      where company_id = ${companyId}
        and deleted_at is null
      order by day_number asc
      limit 1000
    `,
  ])

  const stepsByPlan = new Map<string, ReadingPlanStep[]>()
  for (const step of steps) {
    const current = stepsByPlan.get(step.plan_id) ?? []
    current.push(toReadingPlanStep(step))
    stepsByPlan.set(step.plan_id, current)
  }

  const signedUrls = await createSignedUrlsByStoragePath(plans.map((plan) => plan.cover_storage_path ?? ""))

  return plans.map((plan) => toReadingPlan(plan, stepsByPlan.get(plan.id) ?? [], signedUrls))
}

export async function listAnnouncements(companyIdInput?: string | null): Promise<Announcement[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("communication.view", companyId)

  const sql = getSql()
  const rows = await sql<AnnouncementRow[]>`
    select id, company_id, title, content, author_id, author_name, priority, published, published_at, created_at
    from public.announcements
    where company_id = ${companyId}
      and deleted_at is null
    order by created_at desc
    limit 200
  `

  return rows.map(toAnnouncement)
}

export async function listNotifications(companyIdInput?: string | null): Promise<Notification[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("notification.view", companyId)

  const sql = getSql()
  const rows = await sql<NotificationRow[]>`
    select id, company_id, title, content, method, type, target_group, scheduled_send, send_date, status, created_at
    from public.notifications
    where company_id = ${companyId}
      and deleted_at is null
    order by created_at desc
    limit 200
  `

  return rows.map(toNotification)
}

export async function listNotificationGroups(companyIdInput?: string | null): Promise<NotificationGroup[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("notification.view", companyId)

  const sql = getSql()
  const rows = await sql<NotificationGroupRow[]>`
    select id, company_id, name, is_active, filters, created_at, updated_at
    from public.notification_groups
    where company_id = ${companyId}
      and deleted_at is null
    order by created_at desc
    limit 200
  `

  return rows.map(toNotificationGroup)
}

export async function getFinanceData(companyIdInput?: string | null): Promise<FinanceData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("finance.view", companyId)

  const sql = getSql()
  const [revenues, expenses, categories, costCenters, bankAccounts, suppliers] = await Promise.all([
    sql<RevenueRow[]>`
      select *
      from public.revenues
      where company_id = ${companyId}
        and deleted_at is null
      order by payment_date desc
      limit 300
    `,
    sql<ExpenseRow[]>`
      select *
      from public.expenses
      where company_id = ${companyId}
        and deleted_at is null
      order by payment_date desc
      limit 300
    `,
    sql<FinancialCategoryRow[]>`
      select id, company_id, name, color, type, is_active
      from public.financial_categories
      where company_id = ${companyId}
        and deleted_at is null
      order by type, name
      limit 300
    `,
    sql<CostCenterRow[]>`
      select *
      from public.cost_centers
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 200
    `,
    sql<BankAccountRow[]>`
      select *
      from public.bank_accounts
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 200
    `,
    sql<SupplierRow[]>`
      select id, company_id, name, document, responsible, phone, email, is_active
      from public.suppliers
      where company_id = ${companyId}
        and deleted_at is null
      order by name
      limit 200
    `,
  ])

  return {
    revenues: revenues.map(toRevenue),
    expenses: expenses.map(toExpense),
    categories: categories.map(toFinancialCategory),
    costCenters: costCenters.map(toCostCenter),
    bankAccounts: bankAccounts.map(toBankAccount),
    suppliers: suppliers.map(toSupplier),
  }
}

export async function getDonationData(companyIdInput?: string | null): Promise<DonationData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("donation.view", companyId)

  const sql = getSql()
  const [donations, recurrences] = await Promise.all([
    sql<DonationRow[]>`
      select id, company_id, donor_name, amount, reason, method, donated_on, status, created_at
      from public.donations
      where company_id = ${companyId}
        and deleted_at is null
      order by donated_on desc
      limit 300
    `,
    sql<DonationRecurrenceRow[]>`
      select id, company_id, user_id, user_name, reason, amount, frequency, is_active, pending, created_at, updated_at
      from public.donation_recurrences
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 200
    `,
  ])

  return {
    donations: donations.map(toDonation),
    recurrences: recurrences.map(toDonationRecurrence),
  }
}

export async function getInpeaceData(companyIdInput?: string | null): Promise<InpeaceData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("subscription.view", companyId)

  const sql = getSql()
  const [plans, tags, subscriptions, contents, collections] = await Promise.all([
    sql<SubscriptionPlanRow[]>`
      select *
      from public.subscription_plans
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 200
    `,
    sql<SubscriptionTagRow[]>`
      select id, company_id, name, created_at
      from public.subscription_tags
      where company_id = ${companyId}
        and deleted_at is null
      order by name
      limit 200
    `,
    sql<SubscriptionRow[]>`
      select *
      from public.subscriptions
      where company_id = ${companyId}
        and deleted_at is null
      order by start_date desc
      limit 300
    `,
    sql<SubscriptionContentRow[]>`
      select c.*,
             highlight_file.storage_path as highlight_storage_path,
             cover_file.storage_path as cover_storage_path
      from public.subscription_contents c
      left join public.app_files highlight_file
        on highlight_file.id = c.highlight_file_id
       and highlight_file.company_id = c.company_id
       and highlight_file.is_active = true
       and highlight_file.deleted_at is null
      left join public.app_files cover_file
        on cover_file.id = c.cover_file_id
       and cover_file.company_id = c.company_id
       and cover_file.is_active = true
       and cover_file.deleted_at is null
      where c.company_id = ${companyId}
        and c.deleted_at is null
      order by c.created_at desc
      limit 200
    `,
    sql<SubscriptionCollectionRow[]>`
      select c.*,
             highlight_file.storage_path as highlight_storage_path,
             cover_file.storage_path as cover_storage_path
      from public.subscription_collections c
      left join public.app_files highlight_file
        on highlight_file.id = c.highlight_file_id
       and highlight_file.company_id = c.company_id
       and highlight_file.is_active = true
       and highlight_file.deleted_at is null
      left join public.app_files cover_file
        on cover_file.id = c.cover_file_id
       and cover_file.company_id = c.company_id
       and cover_file.is_active = true
       and cover_file.deleted_at is null
      where c.company_id = ${companyId}
        and c.deleted_at is null
      order by c.created_at desc
      limit 200
    `,
  ])

  const signedUrls = await createSignedUrlsByStoragePath([
    ...contents.flatMap((content) => [content.highlight_storage_path ?? "", content.cover_storage_path ?? ""]),
    ...collections.flatMap((collection) => [collection.highlight_storage_path ?? "", collection.cover_storage_path ?? ""]),
  ])

  return {
    plans: plans.map(toSubscriptionPlan),
    tags: tags.map(toSubscriptionTag),
    subscriptions: subscriptions.map(toSubscription),
    contents: contents.map((content) => toSubscriptionContent(content, signedUrls)),
    collections: collections.map((collection) => toSubscriptionCollection(collection, signedUrls)),
  }
}
