"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Building2, Calendar, Image as ImageIcon, MapPin, Music, Upload, Users } from "lucide-react"
import { toast } from "sonner"
import { saveChurchInfo, uploadChurchProfileAsset } from "./actions"
import type { ChurchInfoData, SocialLinkItem } from "@/lib/church-info/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
}

function statusBadge(active: boolean) {
  return (
    <Badge className={active ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
      {active ? "Ativo" : "Inativo"}
    </Badge>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-lg border border-border/40 p-6 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function AssetUploadField({
  id,
  label,
  currentFileName,
  disabled,
  onUpload,
}: {
  id: string
  label: string
  currentFileName: string
  disabled: boolean
  onUpload: (file: File | null) => void
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <Label htmlFor={id}>{label}</Label>
      </div>
      <Input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(event) => onUpload(event.currentTarget.files?.[0] ?? null)}
      />
      <p className="text-xs text-muted-foreground">
        {currentFileName ? `Arquivo atual: ${currentFileName}` : "Nenhum arquivo enviado"}
      </p>
    </div>
  )
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
    toast.success("Arquivo enviado")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Informações da Igreja</h1>
        <p className="text-muted-foreground">Gerencie dados públicos e operacionais da igreja.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4" />
            Informações Gerais
          </TabsTrigger>
          <TabsTrigger value="ministries">
            <Users className="h-4 w-4" />
            Ministérios
          </TabsTrigger>
          <TabsTrigger value="programming">
            <Calendar className="h-4 w-4" />
            Programação
          </TabsTrigger>
          <TabsTrigger value="worship">
            <Music className="h-4 w-4" />
            Louvor
          </TabsTrigger>
          <TabsTrigger value="congregations">
            <MapPin className="h-4 w-4" />
            Congregações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Informações Gerais</CardTitle>
              <CardDescription>Dados principais usados nas páginas públicas e internas.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Nome da igreja</Label>
                    <Input value={formData.companyName} disabled placeholder="Nome da igreja" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Nome público *</Label>
                    <Input
                      value={formData.publicName}
                      onChange={(event) => setFormData({ ...formData, publicName: event.target.value })}
                      placeholder="Nome exibido publicamente"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Responsável</Label>
                    <Input
                      value={formData.responsibleName}
                      onChange={(event) => setFormData({ ...formData, responsibleName: event.target.value })}
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>E-mail *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="email@igreja.com.br"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      placeholder="(11) 3456-7890"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Website</Label>
                    <Input
                      value={formData.website}
                      onChange={(event) => setFormData({ ...formData, website: event.target.value })}
                      placeholder="https://www.igreja.com.br"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Endereço</Label>
                    <Input
                      value={formData.address}
                      onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                      placeholder="Endereço completo"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Cidade</Label>
                    <Input
                      value={formData.city}
                      onChange={(event) => setFormData({ ...formData, city: event.target.value })}
                      placeholder="Cidade"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Estado</Label>
                    <Input
                      value={formData.state}
                      onChange={(event) => setFormData({ ...formData, state: event.target.value.toUpperCase() })}
                      placeholder="SP"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>País</Label>
                    <Input
                      value={formData.country}
                      onChange={(event) => setFormData({ ...formData, country: event.target.value })}
                      placeholder="Brasil"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Fuso horário</Label>
                    <Select
                      value={formData.timezone}
                      onValueChange={(value) => value && setFormData({ ...formData, timezone: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Sao_Paulo">America/São Paulo</SelectItem>
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
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-primary" />
                    <Label>Identidade visual</Label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AssetUploadField
                      id="churchLogoFile"
                      label="Logo"
                      currentFileName={assetFiles.logo}
                      disabled={uploadingAsset === "church-logo"}
                      onUpload={(file) => handleAssetUpload("church-logo", file)}
                    />
                    <AssetUploadField
                      id="churchCoverFile"
                      label="Capa"
                      currentFileName={assetFiles.cover}
                      disabled={uploadingAsset === "church-cover"}
                      onUpload={(file) => handleAssetUpload("church-cover", file)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Redes sociais</Label>
                  <div className="grid gap-3">
                    {socialLinks.map((link, index) => (
                      <div key={`${link.platform}-${index}`} className="grid gap-2 sm:grid-cols-[140px_1fr] sm:items-center">
                        <span className="text-sm font-medium">{link.platform}</span>
                        <Input
                          value={link.url}
                          onChange={(event) => updateSocialLink(index, event.target.value)}
                          placeholder={`URL do ${link.platform}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>História da igreja</Label>
                  <Textarea
                    value={formData.history}
                    onChange={(event) => setFormData({ ...formData, history: event.target.value })}
                    placeholder="Conte um pouco da história da igreja..."
                    rows={5}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isSaving} className="gradient-primary">
                    {isSaving ? "Salvando..." : "Salvar alterações"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ministries" className="mt-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Ministérios</CardTitle>
              <CardDescription>Ministérios cadastrados na igreja.</CardDescription>
            </CardHeader>
            <CardContent>
              {churchInfoData.ministries.length === 0 ? (
                <EmptyState label="Nenhum ministério cadastrado." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Líder</TableHead>
                      <TableHead>Membros</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churchInfoData.ministries.map((ministry) => (
                      <TableRow key={ministry.id}>
                        <TableCell className="font-medium">{ministry.name}</TableCell>
                        <TableCell>{ministry.leaderName || "-"}</TableCell>
                        <TableCell>{ministry.memberCount}</TableCell>
                        <TableCell>{statusBadge(ministry.isActive)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programming" className="mt-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Programação</CardTitle>
              <CardDescription>Programações cadastradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {churchInfoData.programmings.length === 0 ? (
                <EmptyState label="Nenhuma programação cadastrada." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Ao vivo</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churchInfoData.programmings.map((programming) => (
                      <TableRow key={programming.id}>
                        <TableCell className="font-medium">{programming.title}</TableCell>
                        <TableCell>{formatDate(programming.startsAt)}</TableCell>
                        <TableCell>{statusBadge(programming.isLive)}</TableCell>
                        <TableCell>{statusBadge(programming.isActive)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="worship" className="mt-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Louvor</CardTitle>
              <CardDescription>Músicas cadastradas.</CardDescription>
            </CardHeader>
            <CardContent>
              {churchInfoData.songs.length === 0 ? (
                <EmptyState label="Nenhuma música cadastrada." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Autor</TableHead>
                      <TableHead>Tema</TableHead>
                      <TableHead>Tom</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churchInfoData.songs.map((song) => (
                      <TableRow key={song.id}>
                        <TableCell className="font-medium">{song.title}</TableCell>
                        <TableCell>{song.author || "-"}</TableCell>
                        <TableCell>{song.theme || "-"}</TableCell>
                        <TableCell>{song.tone || "-"}</TableCell>
                        <TableCell>{statusBadge(song.isActive)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="congregations" className="mt-6">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Congregações</CardTitle>
              <CardDescription>Congregações vinculadas à igreja.</CardDescription>
            </CardHeader>
            <CardContent>
              {churchInfoData.congregations.length === 0 ? (
                <EmptyState label="Nenhuma congregação cadastrada." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Endereço</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churchInfoData.congregations.map((congregation) => (
                      <TableRow key={congregation.id}>
                        <TableCell className="font-medium">{congregation.name}</TableCell>
                        <TableCell>{congregation.address || "-"}</TableCell>
                        <TableCell>{congregation.responsible || "-"}</TableCell>
                        <TableCell>{statusBadge(congregation.isActive)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
