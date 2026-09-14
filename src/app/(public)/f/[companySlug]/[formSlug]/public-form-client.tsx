"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { CheckCircle2, Church, Loader2, MessageSquare, RotateCcw, ShieldCheck } from "lucide-react"
import { submitPublicForm } from "@/lib/forms/actions"
import type { FormField, PublicFormData } from "@/lib/forms/types"
import { ThemeToggle } from "@/components/theme-toggle"
import { AcquisitionBeacon } from "@/components/public/acquisition-beacon"
import { BalloonPopCelebration } from "@/components/ui/balloon-pop-celebration"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface PublicFormClientProps {
  data: PublicFormData
}

function fieldInputType(field: FormField) {
  if (field.fieldType === "email") return "email"
  if (field.fieldType === "number") return "number"
  if (field.fieldType === "date") return "date"
  if (field.fieldType === "phone") return "tel"
  return "text"
}

/** Máscara brasileira: (11) 99999-9999 ou (11) 9999-9999 */
function formatPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function ChurchLogo({
  logoUrl,
  publicName,
  size = "md",
}: {
  logoUrl: string | null
  publicName: string
  size?: "md" | "lg"
}) {
  const containerClass =
    size === "lg"
      ? "h-24 max-w-[240px] sm:h-28 sm:max-w-[280px]"
      : "h-20 max-w-[200px] sm:h-24 sm:max-w-[240px]"
  const icon = size === "lg" ? "h-10 w-10" : "h-9 w-9"

  if (logoUrl) {
    return (
      <div className={`mx-auto flex ${containerClass} items-center justify-center p-1`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL */}
        <img
          src={logoUrl}
          alt={`Logo de ${publicName}`}
          className="h-full w-auto max-w-full object-contain rounded-2xl drop-shadow-sm transition-transform duration-300 hover:scale-105"
        />
      </div>
    )
  }

  return (
    <div
      className={`mx-auto flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg`}
    >
      <Church className={icon} />
    </div>
  )
}

export function PublicFormClient({ data }: PublicFormClientProps) {
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {}
    for (const field of data.fields) {
      initial[field.fieldKey] = field.fieldType === "checkbox" ? false : ""
    }
    return initial
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const orderedFields = useMemo(
    () => [...data.fields].sort((a, b) => a.sortOrder - b.sortOrder),
    [data.fields]
  )

  function setFieldValue(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const params = new URLSearchParams(window.location.search)
      const result = await submitPublicForm({
        companySlug: data.companySlug,
        formSlug: data.form.slug,
        values,
        attribution: {
          source: params.get("source") || params.get("origem") || params.get("src") || params.get("utm_source") || "direct",
          sourceLabel: params.get("source_label") || params.get("origem_label") || "",
          utmSource: params.get("utm_source") || "",
          utmMedium: params.get("utm_medium") || "",
          utmCampaign: params.get("utm_campaign") || "",
          utmContent: params.get("utm_content") || "",
          utmTerm: params.get("utm_term") || "",
          landingPath: `${window.location.pathname}${window.location.search}`,
          referrer: document.referrer,
        },
      })
      if (!result.ok) {
        setError(result.error || "Não foi possível enviar. Tente novamente.")
        return
      }
      setSuccess(true)
    })
  }

  if (success) {
    return (
      <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background flex flex-col justify-center overflow-hidden">
        <BalloonPopCelebration />
        <AcquisitionBeacon companySlug={data.companySlug} />
        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
          <Card className="border-border/60 shadow-2xl shadow-primary/10 backdrop-blur-md bg-card/95 rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            {/* Top decorative accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-emerald-500 to-primary" />

            <CardContent className="flex flex-col items-center gap-6 p-6 sm:p-10 text-center">
              {/* Church Logo & Public Name Badge */}
              <div className="flex flex-col items-center gap-2.5">
                <ChurchLogo logoUrl={data.logoUrl} publicName={data.publicName} size="md" />
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {data.publicName}
                </span>
              </div>

              {/* Animated Celebratory Checkmark Hero */}
              <div className="relative flex items-center justify-center pt-1">
                <div className="absolute h-20 w-20 rounded-full bg-emerald-500/20 animate-ping opacity-60" />
                <div className="absolute h-18 w-18 rounded-full bg-emerald-500/15 animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-xl shadow-emerald-500/25">
                  <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
                </div>
              </div>

              {/* Title & Success Message */}
              <div className="space-y-2.5">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
                  Enviado com sucesso!
                </h1>
                <p className="text-sm sm:text-base leading-relaxed text-muted-foreground max-w-md mx-auto">
                  {data.form.successMessage || "Obrigado! Recebemos suas informações com carinho."}
                </p>
              </div>

              {/* WhatsApp Notification Card */}
              <div className="w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-800 dark:text-emerald-300 flex items-center gap-3.5 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">Aviso por WhatsApp</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Nossa equipe entrará em contato em breve através do número informado!
                  </p>
                </div>
              </div>

              {/* Action Buttons & Security Footer */}
              <div className="pt-2 w-full flex flex-col gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    const initial: Record<string, string | boolean> = {}
                    for (const field of data.fields) {
                      initial[field.fieldKey] = field.fieldType === "checkbox" ? false : ""
                    }
                    setValues(initial)
                    setError(null)
                    setSuccess(false)
                  }}
                  className="w-full rounded-xl py-5 text-sm font-medium border-border/80 hover:bg-accent/80 transition-colors"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Enviar outra resposta
                </Button>

                <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Seus dados foram enviados com segurança</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background">
      <AcquisitionBeacon companySlug={data.companySlug} />
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="mb-8 flex w-full flex-col items-center text-center">
          <ChurchLogo logoUrl={data.logoUrl} publicName={data.publicName} size="lg" />
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-primary">
            {data.publicName}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{data.form.title}</h1>
          {data.form.description ? (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {data.form.description}
            </p>
          ) : (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Preencha o formulário abaixo. Nossa equipe entrará em contato com carinho.
            </p>
          )}
        </div>

        <Card className="w-full border-border/70 shadow-2xl shadow-primary/5">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {orderedFields.map((field) => (
                <div key={field.id} className="grid gap-2">
                  {field.fieldType !== "checkbox" ? (
                    <Label htmlFor={field.fieldKey} className="text-sm font-medium">
                      {field.label}
                      {field.required ? <span className="text-destructive"> *</span> : null}
                    </Label>
                  ) : null}

                  {field.fieldType === "textarea" ? (
                    <Textarea
                      id={field.fieldKey}
                      rows={4}
                      placeholder={field.placeholder}
                      value={String(values[field.fieldKey] ?? "")}
                      onChange={(event) => setFieldValue(field.fieldKey, event.target.value)}
                      required={field.required}
                      className="min-h-28 resize-y"
                    />
                  ) : field.fieldType === "select" ? (
                    <Select
                      value={String(values[field.fieldKey] ?? "") || undefined}
                      onValueChange={(value) => setFieldValue(field.fieldKey, value || "")}
                    >
                      <SelectTrigger id={field.fieldKey} className="w-full">
                        <SelectValue placeholder={field.placeholder || "Selecione uma opção"} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.fieldType === "checkbox" ? (
                    <label
                      htmlFor={field.fieldKey}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"
                    >
                      <input
                        id={field.fieldKey}
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-input"
                        checked={Boolean(values[field.fieldKey])}
                        onChange={(event) => setFieldValue(field.fieldKey, event.target.checked)}
                        required={field.required}
                      />
                      <span className="text-sm leading-relaxed">
                        <span className="font-medium text-foreground">
                          {field.label}
                          {field.required ? <span className="text-destructive"> *</span> : null}
                        </span>
                        {field.helpText ? (
                          <span className="mt-0.5 block text-muted-foreground">{field.helpText}</span>
                        ) : null}
                      </span>
                    </label>
                  ) : field.fieldType === "phone" ? (
                    <Input
                      id={field.fieldKey}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder={field.placeholder || "(11) 99999-9999"}
                      value={String(values[field.fieldKey] ?? "")}
                      onChange={(event) =>
                        setFieldValue(field.fieldKey, formatPhoneMask(event.target.value))
                      }
                      required={field.required}
                      maxLength={15}
                      className="h-11"
                    />
                  ) : (
                    <Input
                      id={field.fieldKey}
                      type={fieldInputType(field)}
                      placeholder={field.placeholder}
                      value={String(values[field.fieldKey] ?? "")}
                      onChange={(event) => setFieldValue(field.fieldKey, event.target.value)}
                      required={field.required}
                      className="h-11"
                    />
                  )}

                  {field.helpText && field.fieldType !== "checkbox" ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  ) : null}
                </div>
              ))}

              {error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="gradient-primary h-12 w-full text-base"
                disabled={pending || orderedFields.length === 0}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  data.form.submitButtonLabel || "Enviar"
                )}
              </Button>

              <div className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p>
                  Seus dados são usados apenas para o acompanhamento pastoral de{" "}
                  <span className="font-medium text-foreground">{data.publicName}</span>.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
