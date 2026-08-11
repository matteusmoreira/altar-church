export type FormStatus = "draft" | "published" | "archived"

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "number"
  | "select"
  | "checkbox"
  | "date"

export type FormFieldMapTo = "person_name" | "person_email" | "person_phone" | "notes" | "none"

export type FormAfterSubmitMode = "webhook" | "direct_message"
export type FormDirectMessageType = "text" | "button" | "list" | "carousel"
export type FormButtonAction = "reply" | "url" | "call" | "copy"

export interface FormDirectButton {
  label: string
  action: FormButtonAction
  value: string
}

export interface FormDirectListItem {
  label: string
  id: string
  description: string
}

export interface FormDirectListSection {
  title: string
  items: FormDirectListItem[]
}

export interface FormDirectCarouselCard {
  text: string
  mediaFileId: string | null
  mediaType: "image" | "video" | "document" | null
  filename: string
  buttons: FormDirectButton[]
}

export type FormDirectMessage =
  | { type: "text"; text: string }
  | {
      type: "button"
      text: string
      footer: string
      buttons: FormDirectButton[]
    }
  | {
      type: "list"
      text: string
      footer: string
      listButton: string
      sections: FormDirectListSection[]
    }
  | {
      type: "carousel"
      text: string
      cards: FormDirectCarouselCard[]
    }

export interface FormUazapiInstanceOption {
  id: string
  name: string
  status: "disconnected" | "connecting" | "connected" | "error"
  profileName: string | null
  phone: string | null
  isDefault: boolean
}

export interface FormWhatsappMedia {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  signedUrl: string | null
}

export interface FormWhatsappDelivery {
  id: string
  formId: string
  submissionId: string
  personId: string | null
  instanceId: string | null
  instanceName: string | null
  recipient: string
  recipientName: string
  messageType: FormDirectMessageType
  status: "pending" | "processing" | "sent" | "failed" | "dead"
  attempts: number
  lastError: string | null
  responseStatus: number | null
  providerId: string | null
  createdAt: string
  sentAt: string | null
}

export interface FormField {
  id: string
  formId: string
  companyId: string
  fieldType: FormFieldType
  label: string
  fieldKey: string
  placeholder: string
  helpText: string
  required: boolean
  options: string[]
  mapTo: FormFieldMapTo
  sortOrder: number
}

export interface ChurchForm {
  id: string
  companyId: string
  title: string
  slug: string
  description: string
  status: FormStatus
  targetStageId: string | null
  targetStageName?: string | null
  successMessage: string
  submitButtonLabel: string
  createPerson: boolean
  createAccountAfterSubmit: boolean
  isActive: boolean
  afterSubmitMode: FormAfterSubmitMode
  whatsappInstanceId: string | null
  directMessage: FormDirectMessage | null
  fieldCount?: number
  submissionCount?: number
  publicUrl?: string
  createdAt: string
  updatedAt: string
}

export interface FormSubmission {
  id: string
  formId: string
  companyId: string
  crmCardId: string | null
  personId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface FormSubmissionPagination {
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface FormsDashboardData {
  companyId: string
  companySlug: string
  forms: ChurchForm[]
  stages: { id: string; name: string; color: string }[]
}

export interface FormBuilderData {
  companyId: string
  companySlug: string
  form: ChurchForm
  fields: FormField[]
  stages: { id: string; name: string; color: string }[]
  recentSubmissions: FormSubmission[]
  submissionsPagination: FormSubmissionPagination
  uazapiInstances: FormUazapiInstanceOption[]
  whatsappMediaFiles: FormWhatsappMedia[]
  whatsappDeliveries: FormWhatsappDelivery[]
}

export interface PublicFormData {
  companyId: string
  companySlug: string
  companyName: string
  publicName: string
  logoUrl: string | null
  form: ChurchForm
  fields: FormField[]
}

export type FormsActionResult = {
  ok: boolean
  id?: string
  data?: unknown
  error?: string
}

export type FormMediaUploadResult = {
  ok: boolean
  id?: string
  originalName?: string
  mimeType?: string
  sizeBytes?: number
  signedUrl?: string | null
  error?: string
}

export type SaveFormInput = {
  id?: string | null
  companyId?: string | null
  title: string
  slug?: string
  description?: string
  status?: FormStatus
  targetStageId?: string | null
  successMessage?: string
  submitButtonLabel?: string
  createPerson?: boolean
  createAccountAfterSubmit?: boolean
  isActive?: boolean
  afterSubmitMode?: FormAfterSubmitMode
  whatsappInstanceId?: string | null
  directMessage?: FormDirectMessage | null
}

export type SaveFormFieldInput = {
  id?: string | null
  companyId?: string | null
  formId: string
  fieldType: FormFieldType
  label: string
  fieldKey?: string
  placeholder?: string
  helpText?: string
  required?: boolean
  options?: string[]
  mapTo?: FormFieldMapTo
  sortOrder?: number
}

export type PublicSubmitInput = {
  companySlug: string
  formSlug: string
  values: Record<string, string | boolean>
  attribution?: PublicAttributionInput
}

export type PublicAttributionInput = {
  source?: string
  sourceLabel?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  landingPath?: string
  referrer?: string
}
