"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Baby, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PhotoCapture } from "@/components/kids/photo-capture"
import { AddressFields } from "@/components/kids/address-fields"
import { CustomFieldInputs } from "@/components/kids/custom-field-inputs"
import { EMPTY_KID_ADDRESS } from "@/lib/kids/form-model"
import { registerVisitorKidWithPhotos } from "@/lib/kids/photo-actions"
import type { KidConsentType, KidCustomFieldDefinition, KidCustomFieldValue, KidRelationship } from "@/lib/kids/types"

const CONSENT_LABELS: Record<KidConsentType, string> = {
  data_processing: "Autorizo o tratamento dos dados do meu filho(a)",
  image_use: "Autorizo o uso de imagem nas atividades",
  emergency_care: "Autorizo atendimento emergencial",
  communication: "Aceito receber comunicações da igreja",
}

const RELATIONSHIP_LABELS: Record<KidRelationship, string> = {
  father: "Pai",
  mother: "Mãe",
  guardian: "Responsável",
  grandparent: "Avô/Avó",
  relative: "Parente",
  other: "Outro",
}

function formatPhoneMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function CadastroVisitanteClient({
  slug,
  info,
}: {
  slug: string
  info: { ok: boolean; error?: string; companyName?: string; requiredConsents?: KidConsentType[]; customFields?: KidCustomFieldDefinition[] }
}) {
  const [form, setForm] = useState({
    childFullName: "",
    childBirthDate: "",
    guardianFullName: "",
    guardianPhone: "",
    guardianEmail: "",
    relationship: "guardian" as KidRelationship,
    allergies: "",
    instructions: "",
  })
  const [flags, setFlags] = useState({ hasAllergy: false, hasDietaryRestriction: false, hasMedication: false, hasSpecialNeeds: false })
  const [consents, setConsents] = useState<KidConsentType[]>(["data_processing", "emergency_care"])
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)
  const [childPhoto, setChildPhoto] = useState<File | null>(null)
  const [guardianPhoto, setGuardianPhoto] = useState<File | null>(null)
  const [guardianAddress, setGuardianAddress] = useState({ ...EMPTY_KID_ADDRESS })
  const [childCustomValues, setChildCustomValues] = useState<KidCustomFieldValue[]>([])
  const [guardianCustomValues, setGuardianCustomValues] = useState<KidCustomFieldValue[]>([])

  async function submit() {
    setPending(true)
    try {
      const payload = {
        slug,
        childFullName: form.childFullName,
        childBirthDate: form.childBirthDate || null,
        guardianFullName: form.guardianFullName,
        guardianPhone: form.guardianPhone,
        guardianEmail: form.guardianEmail || null,
        guardianAddress,
        childCustomValues,
        guardianCustomValues,
        relationship: form.relationship,
        health: {
          ...flags,
          allergies: form.allergies,
          dietaryRestrictions: "",
          medication: "",
          specialNeeds: "",
          instructions: form.instructions,
        },
        consents,
      }
      const request = new FormData()
      request.set("payload", JSON.stringify(payload))
      if (childPhoto) request.set("childPhoto", childPhoto)
      if (guardianPhoto) request.set("guardianPhoto", guardianPhoto)
      const result = await registerVisitorKidWithPhotos(request)
      if (result.warning) toast.warning(result.warning)
      if (!result.ok) return toast.error(result.error ?? "Não foi possível concluir")
      setDone(true)
    } finally {
      setPending(false)
    }
  }

  if (!info.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 gradient-hero">
        <Card className="w-full max-w-md glass-strong text-center">
          <CardContent className="py-10">
            <Baby className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">{info.error ?? "Cadastro indisponível."}</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 gradient-hero">
        <Card className="w-full max-w-md glass-strong text-center">
          <CardHeader>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <CardTitle>Cadastro concluído!</CardTitle>
            <CardDescription>
              Apresente-se na recepção do ministério infantil de {info.companyName} e informe seu nome e telefone para o check-in.
              Guarde o acesso ao Portal da Família com o e-mail informado.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg space-y-6 p-4 pb-16">
      <header className="flex flex-col items-center gap-2 pt-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow">
          <Baby className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastro rápido Kids</h1>
        <p className="text-sm text-muted-foreground">{info.companyName} · visitante</p>
      </header>

      <Card className="glass-strong">
        <CardHeader>
          <CardTitle className="text-base">Criança</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome completo *</Label>
              <Input value={form.childFullName} onChange={(event) => setForm({ ...form, childFullName: event.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Nascimento</Label>
            <Input type="date" value={form.childBirthDate} onChange={(event) => setForm({ ...form, childBirthDate: event.target.value })} />
          </div>
          <PhotoCapture label="da criança" value={childPhoto} disabled={pending} onChange={(file) => setChildPhoto(file)} onError={(message) => toast.error(message)} />
          <CustomFieldInputs definitions={info.customFields ?? []} target="child" surface="public" values={childCustomValues} onChange={setChildCustomValues} disabled={pending} />
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Saúde essencial</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flags.hasAllergy} onChange={(event) => setFlags({ ...flags, hasAllergy: event.target.checked })} />
                Alergia
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flags.hasDietaryRestriction} onChange={(event) => setFlags({ ...flags, hasDietaryRestriction: event.target.checked })} />
                Restrição alimentar
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flags.hasMedication} onChange={(event) => setFlags({ ...flags, hasMedication: event.target.checked })} />
                Medicação
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flags.hasSpecialNeeds} onChange={(event) => setFlags({ ...flags, hasSpecialNeeds: event.target.checked })} />
                Necessidades específicas
              </label>
            </div>
            {flags.hasAllergy && (
              <Textarea placeholder="Quais alergias?" rows={1} value={form.allergies} onChange={(event) => setForm({ ...form, allergies: event.target.value })} />
            )}
            <Textarea placeholder="Instruções de cuidado (opcional)" rows={1} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-strong">
        <CardHeader>
          <CardTitle className="text-base">Responsável</CardTitle>
          <CardDescription>Seus dados para contato e retirada da criança.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome completo *</Label>
              <Input value={form.guardianFullName} onChange={(event) => setForm({ ...form, guardianFullName: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Telefone (WhatsApp) *</Label>
              <Input type="tel" inputMode="tel" maxLength={15} value={form.guardianPhone} onChange={(event) => setForm({ ...form, guardianPhone: formatPhoneMask(event.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input type="email" value={form.guardianEmail} onChange={(event) => setForm({ ...form, guardianEmail: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Parentesco</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.relationship}
                onChange={(event) => setForm({ ...form, relationship: event.target.value as KidRelationship })}
              >
                {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <PhotoCapture label="do responsável" value={guardianPhoto} disabled={pending} onChange={(file) => setGuardianPhoto(file)} onError={(message) => toast.error(message)} />
          <AddressFields value={guardianAddress} onChange={setGuardianAddress} disabled={pending} />
          <CustomFieldInputs definitions={info.customFields ?? []} target="guardian" surface="public" values={guardianCustomValues} onChange={setGuardianCustomValues} disabled={pending} />
        </CardContent>
      </Card>

      <Card className="glass-strong">
        <CardHeader>
          <CardTitle className="text-base">Termos (versão 1.0)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(CONSENT_LABELS) as KidConsentType[]).map((type) => {
            const required = info.requiredConsents?.includes(type)
            return (
              <label key={type} className="flex items-start gap-2 rounded-md border border-border/50 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5"
                  checked={consents.includes(type)}
                  onChange={(event) =>
                    setConsents(event.target.checked ? [...consents, type] : consents.filter((item) => item !== type))
                  }
                />
                <span>
                  {CONSENT_LABELS[type]}
                  {required ? <span className="text-destructive"> *</span> : null}
                </span>
              </label>
            )
          })}
        </CardContent>
      </Card>

      <Button
        type="button"
        className="h-12 w-full gradient-primary text-base"
        disabled={pending || form.childFullName.trim().length < 2 || form.guardianFullName.trim().length < 2 || form.guardianPhone.trim().length < 8}
        onClick={() => void submit()}
      >
        Concluir cadastro
      </Button>
    </main>
  )
}
