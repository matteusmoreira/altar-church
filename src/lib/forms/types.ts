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
  isActive: boolean
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
}

export interface PublicFormData {
  companyId: string
  companySlug: string
  companyName: string
  publicName: string
  form: ChurchForm
  fields: FormField[]
}

export type FormsActionResult = {
  ok: boolean
  id?: string
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
  isActive?: boolean
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
}
