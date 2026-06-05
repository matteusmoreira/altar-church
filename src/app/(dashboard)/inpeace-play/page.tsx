import { BarChart3, CreditCard, FileText, FolderOpen, Plus, Tag, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  saveSubscription,
  saveSubscriptionCollection,
  saveSubscriptionContent,
  saveSubscriptionPlan,
  saveSubscriptionTag,
} from "@/lib/operational/actions"
import { getInpeaceData } from "@/lib/operational/data"
import type { Subscription } from "@/lib/types"

async function saveSubscriptionPlanForm(formData: FormData) {
  "use server"
  await saveSubscriptionPlan(formData)
}

async function saveSubscriptionTagForm(formData: FormData) {
  "use server"
  await saveSubscriptionTag(formData)
}

async function saveSubscriptionForm(formData: FormData) {
  "use server"
  await saveSubscription(formData)
}

async function saveSubscriptionContentForm(formData: FormData) {
  "use server"
  await saveSubscriptionContent(formData)
}

async function saveSubscriptionCollectionForm(formData: FormData) {
  "use server"
  await saveSubscriptionCollection(formData)
}

const billingCycleLabels = {
  daily: "Dia(s)",
  monthly: "Mês(es)",
  yearly: "Ano(s)",
}

const statusLabels: Record<Subscription["status"], string> = {
  active: "Ativo",
  expired: "Expirado",
  suspended: "Suspenso",
  pending: "Pendente",
  awaiting_payment: "Aguardando pagamento",
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
}

function formatDate(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

function reportStatus(status: Subscription["status"]) {
  if (status === "active") return "Pago"
  if (status === "pending" || status === "awaiting_payment") return "Aguardando"
  return "Cancelado"
}

export default async function InPeacePlayPage() {
  const data = await getInpeaceData()
  const totalSubscriptions = data.subscriptions.reduce((sum, subscription) => sum + subscription.price, 0)
  const activeSubscriptions = data.subscriptions.filter((subscription) => subscription.status === "active").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">InPeace Play</h1>
        <p className="text-muted-foreground">Assinaturas, conteúdos e coleções persistidos.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Planos" value={data.plans.length.toString()} icon={CreditCard} />
        <Metric title="Assinaturas Ativas" value={activeSubscriptions.toString()} icon={Users} />
        <Metric title="Conteúdos" value={data.contents.length.toString()} icon={FileText} />
        <Metric title="Receita Assinaturas" value={`R$ ${money(totalSubscriptions)}`} icon={BarChart3} />
      </div>

      <Tabs defaultValue="planos">
        <TabsList>
          <TabsTrigger value="planos">
            <CreditCard className="h-4 w-4" />
            Planos
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="h-4 w-4" />
            Tags
          </TabsTrigger>
          <TabsTrigger value="assinaturas">
            <Users className="h-4 w-4" />
            Assinaturas
          </TabsTrigger>
          <TabsTrigger value="conteudos">
            <FileText className="h-4 w-4" />
            Conteúdos
          </TabsTrigger>
          <TabsTrigger value="coletaneas">
            <FolderOpen className="h-4 w-4" />
            Coletâneas
          </TabsTrigger>
          <TabsTrigger value="relatorio">
            <BarChart3 className="h-4 w-4" />
            Relatório
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planos" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Novo Plano
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSubscriptionPlanForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input id="code" name="code" required placeholder="BASIC" />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="billingCycle">Ciclo</Label>
                  <Select name="billingCycle" defaultValue="monthly">
                    <SelectTrigger id="billingCycle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(billingCycleLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Valor *</Label>
                  <Input id="price" name="price" type="number" step="0.01" min="0" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="signupFee">Taxa</Label>
                  <Input id="signupFee" name="signupFee" type="number" step="0.01" min="0" />
                </div>
                <div className="grid gap-2 lg:col-span-6">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" rows={2} />
                </div>
                <div className="flex items-center gap-4 lg:col-span-6">
                  <input type="hidden" name="active" value="true" />
                  <input type="hidden" name="autoRenew" value="true" />
                  <input type="hidden" name="discountType" value="none" />
                  <Button type="submit" className="gradient-primary">Criar Plano</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Código", "Nome", "Ciclo", "Valor", "Ativo"]}
            rows={data.plans.map((plan) => [plan.code, plan.name, billingCycleLabels[plan.billingCycle], `R$ ${money(plan.price)}`, plan.active ? "Sim" : "Não"])}
          />
        </TabsContent>

        <TabsContent value="tags" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Nova Tag</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSubscriptionTagForm} className="flex flex-col gap-3 sm:flex-row">
                <Input name="name" placeholder="Nome da tag" required />
                <Button type="submit" className="gradient-primary">
                  Criar
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            {data.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="gap-1 py-1 px-2">
                <Tag className="h-3 w-3" />
                {tag.name}
              </Badge>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assinaturas" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Nova Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSubscriptionForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="userName">Usuário</Label>
                  <Input id="userName" name="userName" />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="planName">Plano</Label>
                  <Input id="planName" name="planName" list="plans" />
                  <datalist id="plans">
                    {data.plans.map((plan) => (
                      <option key={plan.id} value={plan.name} />
                    ))}
                  </datalist>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subscriptionPrice">Valor *</Label>
                  <Input id="subscriptionPrice" name="price" type="number" step="0.01" min="0" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue="active">
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Início *</Label>
                  <Input id="startDate" name="startDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endDate">Fim</Label>
                  <Input id="endDate" name="endDate" type="date" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="gradient-primary">Criar Assinatura</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Usuário", "Plano", "Valor", "Início", "Fim", "Status"]}
            rows={data.subscriptions.map((subscription) => [
              subscription.userName || "-",
              subscription.planName || "-",
              `R$ ${money(subscription.price)}`,
              formatDate(subscription.startDate),
              formatDate(subscription.endDate),
              statusLabels[subscription.status],
            ])}
          />
        </TabsContent>

        <TabsContent value="conteudos" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Novo Conteúdo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSubscriptionContentForm} className="grid gap-4 lg:grid-cols-6">
                <ContentFields />
                <div className="lg:col-span-6">
                  <Button type="submit" className="gradient-primary">Criar Conteúdo</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Título", "Tipo", "Tags", "Ano", "Mídia", "Ativo"]}
            rows={data.contents.map((content) => [
              content.title,
              content.contentType,
              content.tags.join(", ") || "-",
              content.productionYear || "-",
              content.coverImage || content.highlightImage ? "Sim" : "Não",
              content.active ? "Sim" : "Não",
            ])}
          />
        </TabsContent>

        <TabsContent value="coletaneas" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Nova Coletânea
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSubscriptionCollectionForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="collectionTitle">Título *</Label>
                  <Input id="collectionTitle" name="title" required />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="collectionTags">Tags</Label>
                  <Input id="collectionTags" name="tags" placeholder="Separe por vírgula" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="collectionHighlightFile">Destaque</Label>
                  <Input id="collectionHighlightFile" name="highlightFile" type="file" accept="image/png,image/jpeg,image/webp" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="collectionCoverFile">Capa</Label>
                  <Input id="collectionCoverFile" name="coverFile" type="file" accept="image/png,image/jpeg,image/webp" />
                </div>
                <div className="grid gap-2 lg:col-span-6">
                  <Label htmlFor="collectionDescription">Descrição</Label>
                  <Textarea id="collectionDescription" name="description" rows={2} />
                </div>
                <div className="flex flex-wrap items-center gap-4 lg:col-span-6">
                  <input type="hidden" name="active" value="true" />
                  <label className="flex items-center gap-2 text-sm">
                    <input name="isFeatured" type="checkbox" className="h-4 w-4 rounded border-border" />
                    Destaque
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input name="isComingSoon" type="checkbox" className="h-4 w-4 rounded border-border" />
                    Em breve
                  </label>
                  <Button type="submit" className="gradient-primary">Criar Coletânea</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Título", "Tags", "Mídia", "Destaque", "Em breve", "Ativo"]}
            rows={data.collections.map((collection) => [
              collection.title,
              collection.tags.join(", ") || "-",
              collection.coverImage || collection.highlightImage ? "Sim" : "Não",
              collection.isFeatured ? "Sim" : "Não",
              collection.isComingSoon ? "Sim" : "Não",
              collection.active ? "Sim" : "Não",
            ])}
          />
        </TabsContent>

        <TabsContent value="relatorio" className="mt-4">
          <Card className="glass overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Relatório financeiro de assinaturas</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Número do pedido</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>{formatDate(subscription.createdAt.slice(0, 10))}</TableCell>
                    <TableCell className="font-medium">SUB-{subscription.id.slice(0, 8)}</TableCell>
                    <TableCell>{subscription.userName || "-"}</TableCell>
                    <TableCell>{subscription.planName || "Assinatura"}</TableCell>
                    <TableCell className="font-semibold">R$ {money(subscription.price)}</TableCell>
                    <TableCell>
                      <Badge>{reportStatus(subscription.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Metric({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <Card className="glass py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ContentFields() {
  return (
    <>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="contentTitle">Título *</Label>
        <Input id="contentTitle" name="title" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="productionYear">Ano</Label>
        <Input id="productionYear" name="productionYear" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="contentType">Tipo</Label>
        <Select name="contentType" defaultValue="youtube">
          <SelectTrigger id="contentType">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="vimeo">Vimeo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="contentCode">Código</Label>
        <Input id="contentCode" name="contentCode" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="highlightFile">Destaque</Label>
        <Input id="highlightFile" name="highlightFile" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="coverFile">Capa</Label>
        <Input id="coverFile" name="coverFile" type="file" accept="image/png,image/jpeg,image/webp" />
      </div>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="tags">Tags</Label>
        <Input id="tags" name="tags" placeholder="Separe por vírgula" />
      </div>
      <div className="grid gap-2 lg:col-span-6">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      <div className="flex flex-wrap items-center gap-4 lg:col-span-6">
        <input type="hidden" name="active" value="true" />
        <label className="flex items-center gap-2 text-sm">
          <input name="isDraft" type="checkbox" className="h-4 w-4 rounded border-border" />
          Rascunho
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="isFeatured" type="checkbox" className="h-4 w-4 rounded border-border" />
          Destaque
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input name="isComingSoon" type="checkbox" className="h-4 w-4 rounded border-border" />
          Em breve
        </label>
      </div>
    </>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Card className="glass overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.join("-") || index}>
              {row.map((cell, cellIndex) => (
                <TableCell key={`${index}-${cellIndex}`}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
