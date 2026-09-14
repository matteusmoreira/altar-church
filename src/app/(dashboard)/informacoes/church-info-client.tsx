"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Camera,
  Check,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Heart,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Radio,
  Search,
  Share2,
  Sparkles,
  Upload,
  UserCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { saveChurchInfo, uploadChurchProfileAsset } from "./actions"
import type { ChurchInfoData, SocialLinkItem } from "@/lib/church-info/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  )
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  )
}

interface ChurchInfoClientProps {
  churchInfoData: ChurchInfoData
}

interface ChurchInfoFormState {
  companyId: string
  companyName: string
  publicName: string
  responsibleName: string
  email: string
  phone: string
  website: string
  address: string
  city: string
  state: string
  country: string
  timezone: string
  history: string
}

type ChurchAssetTarget = "church-logo" | "church-cover"

function toForm(data: ChurchInfoData): ChurchInfoFormState {
  return {
    companyId: data.profile.companyId,
    companyName: data.profile.companyName,
    publicName: data.profile.publicName,
    responsibleName: data.profile.responsibleName,
    email: data.profile.email,
    phone: data.profile.phone,
    website: data.profile.website,
    address: data.profile.address,
    city: data.profile.city,
    state: data.profile.state,
    country: data.profile.country,
    timezone: data.profile.timezone,
    history: data.profile.history,
  }
}

function formatDate(value: string | null) {
  if (!value) return "-"
  try {
    return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: ptBR })
  } catch {
    return value
  }
}

function statusBadge(active: boolean) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
      }
    >
      {active ? "Ativo" : "Inativo"}
    </Badge>
  )
}

function EmptyState({
  label,
  actionLabel,
  actionHref,
}: {
  label: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 p-8 text-center bg-muted/10">
      <p className="text-sm text-muted-foreground mb-3">{label}</p>
      {actionLabel && actionHref && (
        <Button size="sm" variant="outline" render={<Link href={actionHref} />}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

function getSocialIcon(platform: string) {
  const p = platform.toLowerCase()
  if (p.includes("instagram")) return <InstagramIcon className="h-4 w-4 text-pink-500" />
  if (p.includes("facebook")) return <FacebookIcon className="h-4 w-4 text-blue-600" />
  if (p.includes("youtube")) return <YoutubeIcon className="h-4 w-4 text-red-500" />
  if (p.includes("twitter") || p.includes("x")) return <TwitterIcon className="h-4 w-4 text-sky-500" />
  return <Globe className="h-4 w-4 text-primary" />
}

export function ChurchInfoClient({ churchInfoData }: ChurchInfoClientProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [uploadingAsset, setUploadingAsset] = useState<ChurchAssetTarget | null>(null)
  const [formData, setFormData] = useState(() => toForm(churchInfoData))
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>(churchInfoData.socialLinks)
  const [assetFiles, setAssetFiles] = useState({
    logo: churchInfoData.profile.logoFileName,
    cover: churchInfoData.profile.coverFileName,
  })
  const [assetUrls, setAssetUrls] = useState({
    logo: churchInfoData.profile.logoUrl ?? null,
    cover: churchInfoData.profile.coverUrl ?? null,
  })

  const [searchMinistries, setSearchMinistries] = useState("")
  const [searchCongregations, setSearchCongregations] = useState("")
  const [searchProgramming, setSearchProgramming] = useState("")
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const coverInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const activeCongregationsCount = useMemo(
    () => churchInfoData.congregations.filter((c) => c.isActive).length,
    [churchInfoData.congregations]
  )

  const activeMinistriesCount = useMemo(
    () => churchInfoData.ministries.filter((m) => m.isActive).length,
    [churchInfoData.ministries]
  )

  const activeSocialCount = useMemo(
    () => socialLinks.filter((s) => Boolean(s.url?.trim())).length,
    [socialLinks]
  )

  const filteredMinistries = useMemo(() => {
    const q = searchMinistries.toLowerCase().trim()
    if (!q) return churchInfoData.ministries
    return churchInfoData.ministries.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.leaderName && m.leaderName.toLowerCase().includes(q))
    )
  }, [churchInfoData.ministries, searchMinistries])

  const filteredCongregations = useMemo(() => {
    const q = searchCongregations.toLowerCase().trim()
    if (!q) return churchInfoData.congregations
    return churchInfoData.congregations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.responsible && c.responsible.toLowerCase().includes(q))
    )
  }, [churchInfoData.congregations, searchCongregations])

  const filteredProgrammings = useMemo(() => {
    const q = searchProgramming.toLowerCase().trim()
    if (!q) return churchInfoData.programmings
    return churchInfoData.programmings.filter((p) => p.title.toLowerCase().includes(q))
  }, [churchInfoData.programmings, searchProgramming])

  const updateSocialLink = (index: number, url: string) => {
    setSocialLinks((current) =>
      current.map((link, currentIndex) =>
        currentIndex === index ? { ...link, url } : link
      )
    )
  }

  const handleSave = async () => {
    if (!formData.publicName.trim() || !formData.email.trim()) {
      toast.error("Preencha os campos obrigatórios")
      return
    }

    setIsSaving(true)
    const result = await saveChurchInfo({
      companyId: formData.companyId,
      publicName: formData.publicName,
      responsibleName: formData.responsibleName,
      email: formData.email,
      phone: formData.phone,
      website: formData.website,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      country: formData.country,
      timezone: formData.timezone,
      history: formData.history,
      socialLinks: socialLinks.map((link, index) => ({
        platform: link.platform,
        url: link.url,
        sortOrder: index,
        isActive: link.isActive,
      })),
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar as informações da igreja")
      return
    }

    toast.success("Informações da igreja salvas com sucesso")
  }

  const handleAssetUpload = async (target: ChurchAssetTarget, file: File | null) => {
    if (!file) return

    // Preview imediato
    const localUrl = URL.createObjectURL(file)
    setAssetUrls((curr) => ({
      ...curr,
      [target === "church-logo" ? "logo" : "cover"]: localUrl,
    }))

    setUploadingAsset(target)
    const payload = new FormData()
    payload.set("target", target)
    payload.set("companyId", formData.companyId)
    if (churchInfoData.profile.id) {
      payload.set("entityId", churchInfoData.profile.id)
    }
    payload.set("file", file)

    const result = await uploadChurchProfileAsset(payload)
    setUploadingAsset(null)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível enviar o arquivo")
      return
    }

    setAssetFiles((current) => ({
      ...current,
      [target === "church-logo" ? "logo" : "cover"]: result.originalName ?? file.name,
    }))
    toast.success("Arquivo enviado com sucesso")
  }

  const handleCopyShareLink = () => {
    const shareText = `${formData.publicName || formData.companyName}\n${formData.address ? `${formData.address}, ${formData.city}/${formData.state}` : ""}\n${formData.phone ? `Contato: ${formData.phone}` : ""}\n${formData.website ? `Site: ${formData.website}` : ""}`
    navigator.clipboard.writeText(shareText)
    setCopiedLink(true)
    toast.success("Informações da igreja copiadas para a área de transferência!")
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  const googleMapsUrl = formData.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${formData.address}, ${formData.city || ""} ${formData.state || ""}`
      )}`
    : null

  const churchInitials = (formData.publicName || formData.companyName || "IC")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* Estilos dedicados para impressão da Ficha Cadastral */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-church-ficha,
          #printable-church-ficha * {
            visibility: visible !important;
          }
          #printable-church-ficha {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 16px !important;
            background: #ffffff !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
          div[role="dialog"],
          div[data-slot="dialog-content"] {
            max-height: none !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: transparent !important;
          }
        }
      `}</style>

      {/* INPUTS DE ARQUIVO OCULTOS PARA O HERO */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleAssetUpload("church-cover", e.target.files?.[0] ?? null)}
      />
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleAssetUpload("church-logo", e.target.files?.[0] ?? null)}
      />

      {/* HEADER HERO INSTITUCIONAL */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* Banner de Capa */}
        <div className="relative h-44 w-full md:h-56 bg-gradient-to-r from-primary/25 via-primary/10 to-muted flex items-center justify-center overflow-hidden">
          {assetUrls.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrls.cover}
              alt="Capa da igreja"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
              <ImageIcon className="h-10 w-10 stroke-1" />
              <span className="text-xs">Nenhuma imagem de capa selecionada</span>
            </div>
          )}

          {/* Botão para trocar a capa */}
          <Button
            size="sm"
            variant="secondary"
            className="absolute right-4 top-4 bg-background/85 backdrop-blur-md hover:bg-background shadow-sm text-xs"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingAsset === "church-cover"}
          >
            <Camera className="mr-1.5 h-3.5 w-3.5 text-primary" />
            {uploadingAsset === "church-cover" ? "Enviando..." : "Alterar capa"}
          </Button>
        </div>

        {/* Informações da Igreja no Banner */}
        <div className="px-6 pb-6 pt-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 sm:-mt-14">
            {/* Avatar / Logo */}
            <div className="flex items-end gap-4">
              <div
                className="group relative h-24 w-24 rounded-2xl border-4 border-background bg-muted shadow-md overflow-hidden flex items-center justify-center cursor-pointer transition-transform hover:scale-[1.02]"
                onClick={() => logoInputRef.current?.click()}
                title="Clique para alterar o logotipo"
              >
                {assetUrls.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrls.logo}
                    alt="Logo da igreja"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold tracking-tight text-primary">
                    {churchInitials}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                  <Camera className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                    Informações da Igreja
                  </h1>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    Ativa
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {formData.publicName || formData.companyName}
                  </span>
                  {formData.city && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {formData.city}/{formData.state}
                      </span>
                    </>
                  )}
                  {formData.responsibleName && (
                    <>
                      <span>•</span>
                      <span>Resp.: {formData.responsibleName}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Ações do Topo */}
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
                className="text-xs"
              >
                {copiedLink ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Share2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiedLink ? "Copiado!" : "Compartilhar dados"}
              </Button>

              {/* Menu de Exportação */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm" className="text-xs">
                      <Download className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Exportar
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Opções de Exportação</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsPrintDialogOpen(true)}>
                    <Printer className="mr-2 h-4 w-4 text-primary" />
                    <span>Ficha Cadastral (PDF/Imprimir)</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={
                      <a href="/api/church-info/export?format=xlsx" download>
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
                        <span>Planilha Excel (.xls)</span>
                      </a>
                    }
                  />
                  <DropdownMenuItem
                    render={
                      <a href="/api/church-info/export?format=csv" download>
                        <Download className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span>Planilha CSV (.csv)</span>
                      </a>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gradient-primary text-xs"
                size="sm"
              >
                {isSaving ? "Salvando..." : "Salvar perfil"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* CARDS DE MÉTRICAS / KPIS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="glass shadow-none hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Congregações</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{churchInfoData.congregations.length}</span>
                <span className="text-xs text-muted-foreground">({activeCongregationsCount} ativas)</span>
              </div>
            </div>
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass shadow-none hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Ministérios</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{churchInfoData.ministries.length}</span>
                <span className="text-xs text-muted-foreground">({activeMinistriesCount} ativos)</span>
              </div>
            </div>
            <div className="rounded-xl bg-pink-500/10 p-2.5 text-pink-500">
              <Heart className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass shadow-none hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Programações</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{churchInfoData.programmings.length}</span>
                <span className="text-xs text-muted-foreground">cultos e eventos</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass shadow-none hover:border-primary/40 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Canais Oficiais</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">{activeSocialCount}</span>
                <span className="text-xs text-muted-foreground">de {socialLinks.length} redes</span>
              </div>
            </div>
            <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-500">
              <Globe className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* TABS DE CONTEÚDO */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="flex h-auto flex-wrap border-b rounded-none bg-transparent p-0 gap-2">
          <TabsTrigger
            value="general"
            className="data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary rounded-lg border border-transparent px-4 py-2"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Informações Gerais
          </TabsTrigger>
          <TabsTrigger
            value="ministries"
            className="data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary rounded-lg border border-transparent px-4 py-2"
          >
            <Users className="mr-2 h-4 w-4" />
            Ministérios
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
              {churchInfoData.ministries.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="programming"
            className="data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary rounded-lg border border-transparent px-4 py-2"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Programação
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
              {churchInfoData.programmings.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="congregations"
            className="data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary rounded-lg border border-transparent px-4 py-2"
          >
            <MapPin className="mr-2 h-4 w-4" />
            Congregações
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-xs">
              {churchInfoData.congregations.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ABA: INFORMAÇÕES GERAIS */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <div className="grid gap-6">
            {/* Bloco 1: Dados Cadastrais & Liderança */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Dados Institucionais e Liderança
                </CardTitle>
                <CardDescription>
                  Identificação oficial da organização e pastoral responsável.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Nome da igreja (Razão Social)</Label>
                      <Input
                        value={formData.companyName}
                        disabled
                        placeholder="Nome da igreja"
                        className="bg-muted/50"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Nome público *</Label>
                      <Input
                        value={formData.publicName}
                        onChange={(event) =>
                          setFormData({ ...formData, publicName: event.target.value })
                        }
                        placeholder="Nome exibido publicamente"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Responsável / Pastor Presidente</Label>
                      <Input
                        value={formData.responsibleName}
                        onChange={(event) =>
                          setFormData({ ...formData, responsibleName: event.target.value })
                        }
                        placeholder="Nome do responsável"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>E-mail oficial *</Label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(event) =>
                          setFormData({ ...formData, email: event.target.value })
                        }
                        placeholder="email@igreja.com.br"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 2: Contato & Localização */}
            <Card className="glass">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Contato e Localização da Sede
                  </CardTitle>
                  <CardDescription>
                    Endereço físico e canais diretos para membros e visitantes.
                  </CardDescription>
                </div>
                {googleMapsUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-primary gap-1"
                    render={<a href={googleMapsUrl} target="_blank" rel="noreferrer" />}
                  >
                    Ver no Google Maps
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Telefone / WhatsApp</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={formData.phone}
                          onChange={(event) =>
                            setFormData({ ...formData, phone: event.target.value })
                          }
                          placeholder="(11) 3456-7890"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Website oficial</Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          value={formData.website}
                          onChange={(event) =>
                            setFormData({ ...formData, website: event.target.value })
                          }
                          placeholder="https://www.igreja.com.br"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Endereço completo</Label>
                      <Input
                        value={formData.address}
                        onChange={(event) =>
                          setFormData({ ...formData, address: event.target.value })
                        }
                        placeholder="Endereço completo"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Cidade</Label>
                      <Input
                        value={formData.city}
                        onChange={(event) =>
                          setFormData({ ...formData, city: event.target.value })
                        }
                        placeholder="Cidade"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Estado (UF)</Label>
                      <Input
                        value={formData.state}
                        onChange={(event) =>
                          setFormData({ ...formData, state: event.target.value.toUpperCase() })
                        }
                        placeholder="SP"
                        maxLength={2}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>País</Label>
                      <Input
                        value={formData.country}
                        onChange={(event) =>
                          setFormData({ ...formData, country: event.target.value })
                        }
                        placeholder="Brasil"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Fuso horário</Label>
                      <Select
                        value={formData.timezone}
                        onValueChange={(value) =>
                          value && setFormData({ ...formData, timezone: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/Sao_Paulo">America/São Paulo (GMT-3)</SelectItem>
                          <SelectItem value="America/Manaus">America/Manaus (GMT-4)</SelectItem>
                          <SelectItem value="America/Belem">America/Belém</SelectItem>
                          <SelectItem value="America/Fortaleza">America/Fortaleza</SelectItem>
                          <SelectItem value="America/New_York">America/New York</SelectItem>
                          <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                          <SelectItem value="America/Los_Angeles">America/Los Angeles</SelectItem>
                          <SelectItem value="Europe/Lisbon">Europe/Lisbon</SelectItem>
                          <SelectItem value="Europe/London">Europe/London</SelectItem>
                          <SelectItem value="Africa/Luanda">Africa/Luanda</SelectItem>
                          <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 3: Identidade Visual e Mídias */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Identidade Visual e Imagens
                </CardTitle>
                <CardDescription>
                  Imagens utilizadas no portal dos membros, aplicativo e cabeçalhos institucionais.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Card Logo */}
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 bg-card/60">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Logotipo Oficial
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {assetFiles.logo ? "Cadastrado" : "Pendente"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 py-2">
                      <div className="h-16 w-16 rounded-xl border-2 border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                        {assetUrls.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={assetUrls.logo}
                            alt="Logo preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-bold text-primary">{churchInitials}</span>
                        )}
                      </div>
                      <div className="space-y-1 text-xs">
                        <p className="font-medium text-foreground truncate max-w-[200px]">
                          {assetFiles.logo || "Nenhum arquivo enviado"}
                        </p>
                        <p className="text-muted-foreground">PNG, JPG ou WEBP (recomendado 512x512)</p>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingAsset === "church-logo"}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {uploadingAsset === "church-logo" ? "Enviando logo..." : "Selecionar novo logo"}
                    </Button>
                  </div>

                  {/* Card Capa */}
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 p-4 bg-card/60">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-primary" /> Imagem de Capa
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        {assetFiles.cover ? "Cadastrado" : "Pendente"}
                      </Badge>
                    </div>

                    <div className="h-16 w-full rounded-xl border border-border bg-muted overflow-hidden">
                      {assetUrls.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrls.cover}
                          alt="Capa preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          Nenhuma imagem de capa
                        </div>
                      )}
                    </div>

                    <div className="text-xs space-y-1">
                      <p className="font-medium text-foreground truncate">
                        {assetFiles.cover || "Nenhum arquivo enviado"}
                      </p>
                      <p className="text-muted-foreground">Ideal para banners horizontais (1920x600)</p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingAsset === "church-cover"}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {uploadingAsset === "church-cover" ? "Enviando capa..." : "Selecionar nova capa"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bloco 4: Redes Sociais */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Redes Sociais e Canais Digitais
                </CardTitle>
                <CardDescription>
                  Links exibidos aos membros e visitantes nas páginas públicas da igreja.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {socialLinks.map((link, index) => {
                    const hasUrl = Boolean(link.url?.trim())
                    return (
                      <div
                        key={`${link.platform}-${index}`}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border/60 p-3 bg-card/40"
                      >
                        <div className="flex items-center gap-2.5 sm:w-40 shrink-0">
                          <div className="rounded-lg bg-background p-1.5 border border-border shadow-2xs">
                            {getSocialIcon(link.platform)}
                          </div>
                          <span className="text-sm font-medium">{link.platform}</span>
                        </div>

                        <div className="flex-1">
                          <Input
                            value={link.url}
                            onChange={(event) => updateSocialLink(index, event.target.value)}
                            placeholder={`URL do ${link.platform}`}
                            className="text-xs sm:text-sm"
                          />
                        </div>

                        {hasUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 text-xs text-muted-foreground hover:text-primary gap-1"
                            render={<a href={link.url} target="_blank" rel="noreferrer" />}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Testar link
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Bloco 5: História & Visão */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  História e Missão da Igreja
                </CardTitle>
                <CardDescription>
                  Apresentação institucional, fundamentação e trajetória da comunidade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <Textarea
                    value={formData.history}
                    onChange={(event) =>
                      setFormData({ ...formData, history: event.target.value })
                    }
                    placeholder="Conte um pouco da história da igreja..."
                    rows={6}
                    className="leading-relaxed"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Texto visível na apresentação institucional e portal dos membros.</span>
                    <span>{formData.history?.length || 0} caracteres</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Botão de salvar no rodapé */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gradient-primary px-8"
              >
                {isSaving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ABA: MINISTÉRIOS */}
        <TabsContent value="ministries" className="mt-6">
          <Card className="glass">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Ministérios e Departamentos
                </CardTitle>
                <CardDescription>
                  {churchInfoData.ministries.length} ministérios registrados na igreja.
                </CardDescription>
              </div>

              {/* Ações para a área específica */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  render={<Link href="/ministerios" />}
                >
                  Gerenciar Ministérios
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Barra de busca */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar ministério ou líder..."
                  value={searchMinistries}
                  onChange={(e) => setSearchMinistries(e.target.value)}
                  className="pl-9 text-xs sm:text-sm"
                />
              </div>

              {filteredMinistries.length === 0 ? (
                <EmptyState
                  label={
                    searchMinistries
                      ? "Nenhum ministério encontrado com o termo pesquisado."
                      : "Nenhum ministério cadastrado."
                  }
                  actionLabel="Cadastrar novo ministério"
                  actionHref="/ministerios"
                />
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold">Ministério</TableHead>
                        <TableHead className="font-semibold">Líder Responsável</TableHead>
                        <TableHead className="font-semibold">Membros Ativos</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMinistries.map((ministry) => (
                        <TableRow key={ministry.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="rounded-lg bg-pink-500/10 p-2 text-pink-500">
                                <Heart className="h-4 w-4" />
                              </div>
                              <span className="font-semibold text-foreground">{ministry.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {ministry.leaderName ? (
                              <div className="flex items-center gap-2">
                                <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{ministry.leaderName}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Não definido</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 font-medium">
                              <Users className="h-3.5 w-3.5 text-muted-foreground" />
                              {ministry.memberCount}
                            </span>
                          </TableCell>
                          <TableCell>{statusBadge(ministry.isActive)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-primary hover:bg-primary/10 gap-1"
                              render={<Link href={`/ministerios/${ministry.id}`} />}
                            >
                              Ver detalhes
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: PROGRAMAÇÃO */}
        <TabsContent value="programming" className="mt-6">
          <Card className="glass">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Grade de Programação e Cultos
                </CardTitle>
                <CardDescription>
                  {churchInfoData.programmings.length} programações cadastradas no calendário oficial.
                </CardDescription>
              </div>

              {/* Ações para a área específica */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  render={<Link href="/programacao" />}
                >
                  Gerenciar Programações
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Barra de busca */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar evento ou culto..."
                  value={searchProgramming}
                  onChange={(e) => setSearchProgramming(e.target.value)}
                  className="pl-9 text-xs sm:text-sm"
                />
              </div>

              {filteredProgrammings.length === 0 ? (
                <EmptyState
                  label={
                    searchProgramming
                      ? "Nenhuma programação encontrada com o termo pesquisado."
                      : "Nenhuma programação cadastrada."
                  }
                  actionLabel="Criar nova programação"
                  actionHref="/programacao"
                />
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold">Título do Evento / Culto</TableHead>
                        <TableHead className="font-semibold">Horário de Início</TableHead>
                        <TableHead className="font-semibold">Transmissão</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProgrammings.map((programming) => (
                        <TableRow key={programming.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2.5">
                              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                                <Calendar className="h-4 w-4" />
                              </div>
                              <span className="font-semibold text-foreground">{programming.title}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(programming.startsAt)}
                          </TableCell>
                          <TableCell>
                            {programming.isLive ? (
                              <Badge className="bg-red-500/10 text-red-600 border-red-500/20 font-medium flex items-center w-fit gap-1.5">
                                <Radio className="h-3 w-3 animate-pulse" />
                                Ao Vivo
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-xs">
                                Presencial
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{statusBadge(programming.isActive)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-primary hover:bg-primary/10 gap-1"
                              render={<Link href="/programacao" />}
                            >
                              Ver na grade
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: CONGREGAÇÕES */}
        <TabsContent value="congregations" className="mt-6">
          <Card className="glass">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Congregações e Filiais Vinculadas
                </CardTitle>
                <CardDescription>
                  {churchInfoData.congregations.length} congregações vinculadas à igreja.
                </CardDescription>
              </div>

              {/* Ações para a área específica */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  render={<Link href="/congregacoes" />}
                >
                  Gerenciar Congregações
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Barra de busca */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar congregação, endereço ou responsável..."
                  value={searchCongregations}
                  onChange={(e) => setSearchCongregations(e.target.value)}
                  className="pl-9 text-xs sm:text-sm"
                />
              </div>

              {filteredCongregations.length === 0 ? (
                <EmptyState
                  label={
                    searchCongregations
                      ? "Nenhuma congregação encontrada com o termo pesquisado."
                      : "Nenhuma congregação cadastrada."
                  }
                  actionLabel="Cadastrar congregação"
                  actionHref="/congregacoes"
                />
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="font-semibold">Nome da Congregação</TableHead>
                        <TableHead className="font-semibold">Endereço</TableHead>
                        <TableHead className="font-semibold">Pastor / Responsável</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCongregations.map((congregation) => {
                        const mapUrl = congregation.address
                          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              congregation.address
                            )}`
                          : null

                        return (
                          <TableRow key={congregation.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2.5">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <div>
                                  <span className="font-semibold text-foreground block">
                                    {congregation.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">Filial oficial</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              {congregation.address ? (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{congregation.address}</span>
                                  {mapUrl && (
                                    <a
                                      href={mapUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline shrink-0"
                                      title="Abrir no Google Maps"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {congregation.responsible ? (
                                <div className="flex items-center gap-2">
                                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">{congregation.responsible}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">-</span>
                              )}
                            </TableCell>
                            <TableCell>{statusBadge(congregation.isActive)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-primary hover:bg-primary/10 gap-1"
                                render={
                                  <Link
                                    href={`/congregacoes?search=${encodeURIComponent(
                                      congregation.name
                                    )}`}
                                  />
                                }
                              >
                                Ver no módulo
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL & VIEW DE IMPRESSÃO: FICHA CADASTRAL OFICIAL */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Ficha Cadastral Institucional
            </DialogTitle>
            <DialogDescription>
              Visualize a ficha timbrada oficial da igreja antes de imprimir ou salvar em PDF.
            </DialogDescription>
          </DialogHeader>

          {/* DOCUMENTO TIMBRADO */}
          <div
            id="printable-church-ficha"
            className="rounded-xl border border-border p-8 bg-card space-y-6 text-foreground shadow-xs"
          >
            {/* Cabeçalho do Documento */}
            <div className="flex items-center justify-between border-b pb-6">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-xl border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {assetUrls.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrls.logo}
                      alt="Logo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl font-bold text-primary">{churchInitials}</span>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">
                    {formData.publicName || formData.companyName}
                  </h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Ficha Cadastral Institucional • {formData.companyName}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs text-muted-foreground">
                <p>Data de Emissão:</p>
                <p className="font-semibold text-foreground">
                  {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>

            {/* Seção 1: Dados Gerais */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                1. Informações Institucionais & Contato
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm pt-1">
                <div>
                  <p className="text-xs text-muted-foreground">Nome Fantasia / Público:</p>
                  <p className="font-medium">{formData.publicName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Razão Social:</p>
                  <p className="font-medium">{formData.companyName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pastor / Responsável:</p>
                  <p className="font-medium">{formData.responsibleName || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-mail Oficial:</p>
                  <p className="font-medium">{formData.email || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Telefone / Contato:</p>
                  <p className="font-medium">{formData.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Website:</p>
                  <p className="font-medium">{formData.website || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Endereço da Sede:</p>
                  <p className="font-medium">
                    {formData.address ? `${formData.address} - ` : ""}
                    {formData.city ? `${formData.city}/${formData.state}` : ""} - {formData.country}
                  </p>
                </div>
              </div>
            </div>

            {/* Seção 2: Congregações */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                2. Congregações Vinculadas ({churchInfoData.congregations.length})
              </h3>
              {churchInfoData.congregations.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">Nenhuma congregação registrada.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b">
                      <tr>
                        <th className="p-2 text-left">Nome</th>
                        <th className="p-2 text-left">Endereço</th>
                        <th className="p-2 text-left">Responsável</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {churchInfoData.congregations.map((c) => (
                        <tr key={c.id}>
                          <td className="p-2 font-medium">{c.name}</td>
                          <td className="p-2 text-muted-foreground">{c.address || "-"}</td>
                          <td className="p-2">{c.responsible || "-"}</td>
                          <td className="p-2">{c.isActive ? "Ativo" : "Inativo"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Seção 3: Ministérios */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                3. Ministérios e Departamentos ({churchInfoData.ministries.length})
              </h3>
              {churchInfoData.ministries.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">Nenhum ministério registrado.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b">
                      <tr>
                        <th className="p-2 text-left">Nome</th>
                        <th className="p-2 text-left">Líder</th>
                        <th className="p-2 text-left">Membros</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {churchInfoData.ministries.map((m) => (
                        <tr key={m.id}>
                          <td className="p-2 font-medium">{m.name}</td>
                          <td className="p-2">{m.leaderName || "-"}</td>
                          <td className="p-2">{m.memberCount}</td>
                          <td className="p-2">{m.isActive ? "Ativo" : "Inativo"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Seção 4: História da Igreja */}
            {formData.history && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                  4. História e Declaração Institucional
                </h3>
                <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                  {formData.history}
                </p>
              </div>
            )}

            {/* Rodapé da Ficha */}
            <div className="pt-6 border-t flex items-end justify-between text-xs text-muted-foreground">
              <div>
                <p>Altar Church • Sistema de Gestão Eclesiástica</p>
                <p className="text-2xs">Documento gerado eletronicamente para fins cadastrais.</p>
              </div>
              <div className="text-center">
                <div className="w-48 border-b border-foreground/40 mb-1" />
                <p className="font-medium text-foreground">{formData.responsibleName || "Liderança Pastoral"}</p>
                <p className="text-2xs">Assinatura do Responsável</p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPrintDialogOpen(false)}
            >
              Fechar
            </Button>
            <Button
              onClick={handlePrint}
              className="gradient-primary gap-1.5"
              size="sm"
            >
              <Printer className="h-4 w-4" />
              Imprimir / Salvar em PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
