"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteFormField,
  reorderFormFields,
  saveForm,
  saveFormField,
} from "@/lib/forms/actions"
import type {
  FormBuilderData,
  FormField,
  FormFieldMapTo,
  FormFieldType,
  FormStatus,
} from "@/lib/forms/types"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { DeliveryRow, WebhookEndpoint } from "@/lib/integrations/types"
import { FormWebhooksPanel } from "./form-webhooks-panel"

interface FormBuilderClientProps {
  data: FormBuilderData
  formWebhooks?: WebhookEndpoint[]
  formDeliveries?: DeliveryRow[]
}

type FieldFormState = {
  id: string | null
  fieldType: FormFieldType
  label: string
  fieldKey: string
  placeholder: string
  helpText: string
  required: boolean
  optionsText: string
  mapTo: FormFieldMapTo
  /** Se true, não sobrescreve a variável ao digitar o rótulo */
  variableLocked: boolean
}

const fieldTypeLabels: Record<FormFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  textarea: "Área de texto",
  number: "Número",
  select: "Lista",
  checkbox: "Caixa de seleção",
  date: "Data",
}

const mapToLabels: Record<FormFieldMapTo, string> = {
  person_name: "Nome da pessoa",
  person_email: "E-mail",
  person_phone: "Telefone",
  notes: "Notas do card",
  none: "Somente no envio",
}

const SYSTEM_AUTOMATION_VARS = ["form_title", "form_slug", "source"] as const

/** Slug de variável a partir do rótulo (espelha fieldKeyify do server). */
function slugifyVariable(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "campo"
  )
}

/**
 * Sugere variável amigável a partir do rótulo.
 * Ex.: "Nome completo" → nome, "Endereço" → endereco
 */
function suggestVariableFromLabel(label: string): string {
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")

  if (!normalized) return ""

  if (
    normalized === "nome" ||
    normalized === "name" ||
    normalized === "nome completo" ||
    normalized === "seu nome" ||
    normalized === "nome e sobrenome" ||
    normalized.startsWith("nome completo")
  ) {
    return "nome"
  }
  if (
    normalized === "telefone" ||
    normalized === "celular" ||
    normalized === "whatsapp" ||
    normalized === "fone" ||
    normalized === "tel" ||
    normalized.includes("telefone") ||
    normalized.includes("whatsapp")
  ) {
    return "telefone"
  }
  if (
    normalized === "email" ||
    normalized === "e mail" ||
    normalized === "e-mail" ||
    normalized.includes("email") ||
    normalized.includes("e mail")
  ) {
    return "email"
  }
  if (
    normalized === "endereco" ||
    normalized === "endereco completo" ||
    normalized.includes("endereco")
  ) {
    return "endereco"
  }

  return slugifyVariable(label)
}

function formatAutomationVar(key: string) {
  const k = key.trim()
  if (!k) return ""
  return `{{${k}}}`
}

async function copyAutomationVar(key: string) {
  const text = formatAutomationVar(key)
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${text} copiado`)
  } catch {
    toast.error("Não foi possível copiar")
  }
}

function emptyFieldForm(): FieldFormState {
  return {
    id: null,
    fieldType: "text",
    label: "",
    fieldKey: "",
    placeholder: "",
    helpText: "",
    required: false,
    optionsText: "",
    mapTo: "none",
    variableLocked: false,
  }
}

/** Sugere map_to a partir do tipo / chave do campo (telefone → person_phone). */
function suggestedMapTo(fieldType: FormFieldType, fieldKey: string): FormFieldMapTo {
  const key = fieldKey.trim().toLowerCase()
  if (fieldType === "phone" || key === "telefone" || key === "phone" || key === "celular" || key === "whatsapp") {
    return "person_phone"
  }
  if (fieldType === "email" || key === "email" || key === "e-mail") return "person_email"
  if (key === "nome" || key === "name" || key === "nome_completo") return "person_name"
  return "none"
}

export function FormBuilderClient({
  data,
  formWebhooks = [],
  formDeliveries = [],
}: FormBuilderClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [localFields, setLocalFields] = useState<FormField[] | null>(null)
  const fields = localFields ?? data.fields

  const [title, setTitle] = useState(data.form.title)
  const [slug, setSlug] = useState(data.form.slug)
  const [description, setDescription] = useState(data.form.description)
  const [status, setStatus] = useState<FormStatus>(data.form.status)
  const [targetStageId, setTargetStageId] = useState(data.form.targetStageId || "")
  const [successMessage, setSuccessMessage] = useState(data.form.successMessage)
  const [submitButtonLabel, setSubmitButtonLabel] = useState(data.form.submitButtonLabel)
  const [createPerson, setCreatePerson] = useState(data.form.createPerson)
  const [isActive, setIsActive] = useState(data.form.isActive)

  const [fieldOpen, setFieldOpen] = useState(false)
  const [fieldForm, setFieldForm] = useState<FieldFormState>(emptyFieldForm)

  const publicPath = `/f/${data.companySlug}/${slug}`
  const orderedFields = useMemo(
    () => [...fields].sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  )

  function saveSettings(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveForm({
        id: data.form.id,
        companyId: data.companyId,
        title,
        slug,
        description,
        status,
        targetStageId: targetStageId || null,
        successMessage,
        submitButtonLabel,
        createPerson,
        isActive,
      })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível salvar")
        return
      }
      toast.success("Configurações salvas")
      router.refresh()
    })
  }

  const automationVariables = useMemo(() => {
    const fromFields = orderedFields.map((f) => f.fieldKey).filter(Boolean)
    const fromMapTo: string[] = []
    for (const f of orderedFields) {
      if (f.mapTo === "person_name" && !fromFields.includes("nome")) fromMapTo.push("nome")
      if (f.mapTo === "person_phone" && !fromFields.includes("telefone")) fromMapTo.push("telefone")
      if (f.mapTo === "person_email" && !fromFields.includes("email")) fromMapTo.push("email")
    }
    return {
      fields: fromFields,
      person: [...new Set(fromMapTo)],
      system: [...SYSTEM_AUTOMATION_VARS],
    }
  }, [orderedFields])

  function openCreateField() {
    setFieldForm(emptyFieldForm())
    setFieldOpen(true)
  }

  function openEditField(field: FormField) {
    setFieldForm({
      id: field.id,
      fieldType: field.fieldType,
      label: field.label,
      fieldKey: field.fieldKey,
      placeholder: field.placeholder,
      helpText: field.helpText,
      required: field.required,
      optionsText: field.options.join("\n"),
      mapTo: field.mapTo,
      // Ao editar, trava para não sobrescrever a variável existente ao mudar o rótulo
      variableLocked: true,
    })
    setFieldOpen(true)
  }

  function submitField(event: FormEvent) {
    event.preventDefault()
    const options = fieldForm.optionsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    startTransition(async () => {
      const result = await saveFormField({
        id: fieldForm.id,
        companyId: data.companyId,
        formId: data.form.id,
        fieldType: fieldForm.fieldType,
        label: fieldForm.label,
        fieldKey: fieldForm.fieldKey,
        placeholder: fieldForm.placeholder,
        helpText: fieldForm.helpText,
        required: fieldForm.required,
        options,
        mapTo: fieldForm.mapTo,
      })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível salvar o campo")
        return
      }
      toast.success(fieldForm.id ? "Campo atualizado" : "Campo adicionado")
      setFieldOpen(false)
      router.refresh()
    })
  }

  function handleDeleteField(fieldId: string) {
    startTransition(async () => {
      const result = await deleteFormField({ id: fieldId, companyId: data.companyId })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível excluir")
        return
      }
      setLocalFields(null)
      toast.success("Campo removido")
      router.refresh()
    })
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    const sorted = [...orderedFields]
    const index = sorted.findIndex((field) => field.id === fieldId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return

    const reordered = [...sorted]
    const [item] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, item)
    setLocalFields(reordered.map((field, idx) => ({ ...field, sortOrder: (idx + 1) * 10 })))

    startTransition(async () => {
      const result = await reorderFormFields({
        formId: data.form.id,
        companyId: data.companyId,
        orderedIds: reordered.map((field) => field.id),
      })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível reordenar")
        setLocalFields(null)
        router.refresh()
        return
      }
      setLocalFields(null)
      router.refresh()
    })
  }

  async function copyLink() {
    const url = `${window.location.origin}${publicPath}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link público copiado")
    } catch {
      toast.error("Não foi possível copiar")
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={title || data.form.title} description="Construtor e configurações do formulário">
        <div className="flex flex-wrap gap-2">
          <Link href="/formularios" className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
          <Button type="button" variant="outline" onClick={copyLink}>
            <Copy className="mr-2 h-4 w-4" />
            Copiar link
          </Button>
          {status === "published" && isActive ? (
            <Link
              href={publicPath}
              target="_blank"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir
            </Link>
          ) : null}
        </div>
      </PageHeader>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Campos</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="submissions">Envios</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="mt-4">
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
            <Card className="glass">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Campos do formulário</CardTitle>
                  <CardDescription>
                    Cada campo gera uma variável <code className="text-xs">{"{{...}}"}</code> para
                    o Altar Chat.
                  </CardDescription>
                </div>
                <Button type="button" onClick={openCreateField}>
                  <Plus className="mr-2 h-4 w-4" />
                  Campo
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {orderedFields.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum campo. Adicione o primeiro campo do formulário.
                  </p>
                ) : (
                  orderedFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex items-start gap-2 rounded-xl border border-border/60 bg-background/50 p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0 || pending}
                          onClick={() => moveField(field.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === orderedFields.length - 1 || pending}
                          onClick={() => moveField(field.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openEditField(field)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{field.label}</span>
                          {field.required ? <Badge variant="secondary">obrigatório</Badge> : null}
                          <Badge variant="outline">{fieldTypeLabels[field.fieldType]}</Badge>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-primary">
                            {formatAutomationVar(field.fieldKey)}
                          </code>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {mapToLabels[field.mapTo]}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={`Copiar ${formatAutomationVar(field.fieldKey)}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void copyAutomationVar(field.fieldKey)
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDeleteField(field.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Variáveis para automação</CardTitle>
                <CardDescription>
                  Cole no bloco <strong>Enviar texto</strong> do Altar Chat (ex.:{" "}
                  <code className="text-xs">{"Olá {{nome}}!"}</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Campos do form</p>
                  {automationVariables.fields.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Adicione campos para gerar variáveis.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {automationVariables.fields.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono text-xs"
                          onClick={() => void copyAutomationVar(key)}
                        >
                          {formatAutomationVar(key)}
                          <Copy className="ml-1.5 h-3 w-3 opacity-60" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {automationVariables.person.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Pessoa (map_to)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {automationVariables.person.map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="font-mono text-xs"
                          onClick={() => void copyAutomationVar(key)}
                        >
                          {formatAutomationVar(key)}
                          <Copy className="ml-1.5 h-3 w-3 opacity-60" />
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Sistema</p>
                  <div className="flex flex-wrap gap-2">
                    {automationVariables.system.map((key) => (
                      <Button
                        key={key}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="border font-mono text-xs"
                        onClick={() => void copyAutomationVar(key)}
                      >
                        {formatAutomationVar(key)}
                        <Copy className="ml-1.5 h-3 w-3 opacity-60" />
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>

            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base">Pré-visualização</CardTitle>
                <CardDescription>Como o visitante verá o formulário.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border bg-background p-5 shadow-sm">
                  <div className="mb-5 space-y-1">
                    <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                    {description ? (
                      <p className="text-sm text-muted-foreground">{description}</p>
                    ) : null}
                  </div>
                  <div className="space-y-4">
                    {orderedFields.map((field) => (
                      <div key={field.id} className="grid gap-1.5">
                        <Label>
                          {field.label}
                          {field.required ? " *" : ""}
                        </Label>
                        {field.fieldType === "textarea" ? (
                          <Textarea placeholder={field.placeholder} disabled rows={3} />
                        ) : field.fieldType === "select" ? (
                          <Select disabled>
                            <SelectTrigger>
                              <SelectValue placeholder={field.placeholder || "Selecione"} />
                            </SelectTrigger>
                          </Select>
                        ) : field.fieldType === "checkbox" ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" disabled className="h-4 w-4" />
                            {field.helpText || field.label}
                          </div>
                        ) : (
                          <Input
                            type={
                              field.fieldType === "email"
                                ? "email"
                                : field.fieldType === "number"
                                  ? "number"
                                  : field.fieldType === "date"
                                    ? "date"
                                    : field.fieldType === "phone"
                                      ? "tel"
                                      : "text"
                            }
                            placeholder={field.placeholder}
                            disabled
                          />
                        )}
                        {field.helpText && field.fieldType !== "checkbox" ? (
                          <p className="text-xs text-muted-foreground">{field.helpText}</p>
                        ) : null}
                      </div>
                    ))}
                    <Button type="button" className="w-full gradient-primary" disabled>
                      {submitButtonLabel || "Enviar"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card className="glass max-w-3xl">
            <CardHeader>
              <CardTitle className="text-base">Configurações do formulário</CardTitle>
              <CardDescription>
                Defina slug público e em qual coluna do Kanban as respostas caem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveSettings} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="slug">Slug amigável</Label>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="text-xs text-muted-foreground">/f/{data.companySlug}/</span>
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) =>
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]+/g, "-")
                            .replace(/^-+|-+$/g, "")
                        )
                      }
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição pública</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onValueChange={(value) => setStatus((value as FormStatus) || "draft")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="published">Publicado</SelectItem>
                        <SelectItem value="archived">Arquivado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Coluna no Kanban</Label>
                    <Select
                      value={targetStageId || "__default__"}
                      onValueChange={(value) =>
                        setTargetStageId(!value || value === "__default__" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Coluna padrão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Coluna padrão do CRM</SelectItem>
                        {data.stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="submitLabel">Texto do botão</Label>
                    <Input
                      id="submitLabel"
                      value={submitButtonLabel}
                      onChange={(e) => setSubmitButtonLabel(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="successMessage">Mensagem de sucesso</Label>
                    <Input
                      id="successMessage"
                      value={successMessage}
                      onChange={(e) => setSuccessMessage(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Criar pessoa (visitante)</p>
                    <p className="text-xs text-muted-foreground">
                      Gera/atualiza cadastro a partir dos campos mapeados.
                    </p>
                  </div>
                  <Switch checked={createPerson} onCheckedChange={setCreatePerson} />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Formulário ativo</p>
                    <p className="text-xs text-muted-foreground">Desative para bloquear novos envios.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                  Link público: <span className="font-mono text-foreground">{publicPath}</span>
                </div>
                <Button type="submit" className="gradient-primary w-fit" disabled={pending}>
                  Salvar configurações
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="mt-4">
          <FormWebhooksPanel
            companyId={data.companyId}
            formId={data.form.id}
            endpoints={formWebhooks}
            deliveries={formDeliveries}
          />
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Envios recentes</CardTitle>
              <CardDescription>
                Pessoas que preencheram o formulário público (não é o log do webhook — esse fica na
                aba Webhooks).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentSubmissions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum envio ainda.</p>
              ) : (
                data.recentSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {new Date(submission.createdAt).toLocaleString("pt-BR")}
                      </span>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {submission.crmCardId ? <Badge variant="outline">card CRM</Badge> : null}
                        {submission.personId ? <Badge variant="outline">pessoa</Badge> : null}
                      </div>
                    </div>
                    <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-muted/40 p-2 text-xs">
                      {JSON.stringify(submission.payload, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{fieldForm.id ? "Editar campo" : "Novo campo"}</DialogTitle>
            <DialogDescription>
              O rótulo aparece no formulário público; a variável vira{" "}
              <code className="text-xs">{"{{...}}"}</code> no Altar Chat.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitField} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Rótulo</Label>
              <Input
                value={fieldForm.label}
                onChange={(e) => {
                  const label = e.target.value
                  setFieldForm((c) => {
                    if (c.variableLocked) {
                      return { ...c, label }
                    }
                    const fieldKey = suggestVariableFromLabel(label)
                    const mapTo =
                      c.mapTo === "none"
                        ? suggestedMapTo(c.fieldType, fieldKey)
                        : c.mapTo
                    return { ...c, label, fieldKey, mapTo }
                  })
                }}
                required
                placeholder="Ex.: Nome completo, Endereço"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select
                  value={fieldForm.fieldType}
                  onValueChange={(value) =>
                    setFieldForm((c) => {
                      const fieldType = (value as FormFieldType) || "text"
                      const nextMap =
                        c.mapTo === "none"
                          ? suggestedMapTo(fieldType, c.fieldKey)
                          : c.mapTo
                      return { ...c, fieldType, mapTo: nextMap }
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(fieldTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Mapear para</Label>
                <Select
                  value={fieldForm.mapTo}
                  onValueChange={(value) =>
                    setFieldForm((c) => ({ ...c, mapTo: (value as FormFieldMapTo) || "none" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(mapToLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Variável da automação</Label>
              <div className="flex gap-2">
                <Input
                  value={fieldForm.fieldKey}
                  onChange={(e) => {
                    const fieldKey = e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_")
                    setFieldForm((c) => {
                      const nextMap =
                        c.mapTo === "none" ? suggestedMapTo(c.fieldType, fieldKey) : c.mapTo
                      return {
                        ...c,
                        fieldKey,
                        mapTo: nextMap,
                        variableLocked: true,
                      }
                    })
                  }}
                  placeholder="gerada a partir do rótulo"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={!fieldForm.fieldKey}
                  title="Copiar variável"
                  onClick={() => void copyAutomationVar(fieldForm.fieldKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Usar na automação:</span>
                {fieldForm.fieldKey ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-medium text-primary">
                    {formatAutomationVar(fieldForm.fieldKey)}
                  </code>
                ) : (
                  <span className="italic">digite o rótulo</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                No Altar Chat, cole esta variável no bloco Enviar texto. Ex.:{" "}
                <code className="text-[11px]">{"Olá {{nome}}! Mora em {{endereco}}?"}</code>
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Placeholder</Label>
              <Input
                value={fieldForm.placeholder}
                onChange={(e) => setFieldForm((c) => ({ ...c, placeholder: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Ajuda</Label>
              <Input
                value={fieldForm.helpText}
                onChange={(e) => setFieldForm((c) => ({ ...c, helpText: e.target.value }))}
              />
            </div>
            {fieldForm.fieldType === "select" ? (
              <div className="grid gap-2">
                <Label>Opções (uma por linha)</Label>
                <Textarea
                  rows={4}
                  value={fieldForm.optionsText}
                  onChange={(e) => setFieldForm((c) => ({ ...c, optionsText: e.target.value }))}
                  placeholder={"Opção A\nOpção B"}
                />
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Obrigatório</p>
              </div>
              <Switch
                checked={fieldForm.required}
                onCheckedChange={(checked) => setFieldForm((c) => ({ ...c, required: checked }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFieldOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gradient-primary" disabled={pending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Salvar campo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
