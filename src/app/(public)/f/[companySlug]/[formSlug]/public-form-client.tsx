"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Church, Loader2, ShieldCheck } from "lucide-react"
import { submitPublicForm } from "@/lib/forms/actions"
import type { FormField, PublicFormData } from "@/lib/forms/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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
      const result = await submitPublicForm({
        companySlug: data.companySlug,
        formSlug: data.form.slug,
        values,
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
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
          <Card className="border-border/60 shadow-xl">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Enviado com sucesso</h1>
                <p className="text-muted-foreground">
                  {data.form.successMessage || "Obrigado! Recebemos suas informações."}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{data.publicName}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background">
      <div className="mx-auto grid min-h-screen max-w-5xl content-start gap-8 px-4 py-10 md:grid-cols-[0.9fr_1.1fr] md:content-center md:py-16">
        <section className="space-y-6 md:pr-4">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg">
            <Church className="h-7 w-7" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
              {data.publicName}
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{data.form.title}</h1>
            {data.form.description ? (
              <p className="max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
                {data.form.description}
              </p>
            ) : (
              <p className="max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
                Preencha o formulário ao lado. Nossa equipe entrará em contato com carinho.
              </p>
            )}
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 text-sm text-muted-foreground backdrop-blur">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              Seus dados são usados apenas para o acompanhamento pastoral e administrativo de{" "}
              <span className="font-medium text-foreground">{data.publicName}</span>.
            </p>
          </div>
          <Link
            href={`/church/${data.companySlug}`}
            className={cn(buttonVariants({ variant: "ghost" }), "px-0 text-muted-foreground")}
          >
            Conhecer a igreja
          </Link>
        </section>

        <section>
          <Card className="border-border/70 shadow-2xl shadow-primary/5">
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
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
