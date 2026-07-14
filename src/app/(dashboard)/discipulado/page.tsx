import { BookOpen, CheckCircle2, FilePen, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteReadingPlan,
  deleteReadingPlanStep,
  saveReadingPlan,
  saveReadingPlanStep,
} from "@/lib/operational/actions"
import { listReadingPlans } from "@/lib/operational/data"

async function saveReadingPlanForm(formData: FormData) {
  "use server"
  await saveReadingPlan(formData)
}

async function deleteReadingPlanForm(formData: FormData) {
  "use server"
  await deleteReadingPlan(formData)
}

async function saveReadingPlanStepForm(formData: FormData) {
  "use server"
  await saveReadingPlanStep(formData)
}

async function deleteReadingPlanStepForm(formData: FormData) {
  "use server"
  await deleteReadingPlanStep(formData)
}

export default async function ReadingPlansPage() {
  const plans = await listReadingPlans()
  const published = plans.filter((plan) => plan.status === "published").length
  const drafts = plans.filter((plan) => plan.status === "draft").length
  const totalSteps = plans.reduce((sum, plan) => sum + plan.steps.length, 0)
  const defaultPlanId = plans[0]?.id ?? ""

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Planos de Leitura / Discipulado</h1>
        <p className="text-muted-foreground">Planos e etapas diárias persistidos para leitura e discipulado.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Metric title="Total de Planos" value={plans.length} icon={BookOpen} />
        <Metric title="Publicados" value={published} icon={CheckCircle2} />
        <Metric title="Rascunhos" value={drafts} icon={FilePen} />
        <Metric title="Etapas" value={totalSteps} icon={Plus} />
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Novo Plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveReadingPlanForm} className="grid gap-4 lg:grid-cols-6">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="name">Nome *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="period">Período</Label>
              <Input id="period" name="period" placeholder="30 dias" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetAudience">Público alvo</Label>
              <Input id="targetAudience" name="targetAudience" placeholder="Novos convertidos" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="draft">
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="coverFile">Capa</Label>
              <Input id="coverFile" name="coverFile" type="file" accept="image/png,image/jpeg,image/webp" />
            </div>
            <div className="grid gap-2 lg:col-span-6">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" name="description" rows={3} />
            </div>
            <div className="grid gap-2 lg:col-span-6">
              <Label htmlFor="objectives">Objetivos</Label>
              <Input id="objectives" name="objectives" placeholder="Separe os objetivos por vírgula" />
            </div>
            <div className="lg:col-span-6">
              <input type="hidden" name="active" value="true" />
              <Button type="submit" className="gradient-primary">
                Criar Plano
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            Nova etapa do plano
          </CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Crie um plano antes de adicionar etapas.</p>
          ) : (
            <form action={saveReadingPlanStepForm} className="grid gap-4 lg:grid-cols-6">
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="planId">Plano *</Label>
                <Select name="planId" defaultValue={defaultPlanId} required>
                  <SelectTrigger id="planId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dayNumber">Dia *</Label>
                <Input id="dayNumber" name="dayNumber" type="number" min="1" defaultValue="1" required />
              </div>
              <div className="grid gap-2 lg:col-span-2">
                <Label htmlFor="stepTitle">Título *</Label>
                <Input id="stepTitle" name="title" required placeholder="Leitura do dia" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scriptureRef">Referência</Label>
                <Input id="scriptureRef" name="scriptureRef" placeholder="João 3:16" />
              </div>
              <div className="grid gap-2 lg:col-span-6">
                <Label htmlFor="stepContent">Conteúdo</Label>
                <Textarea id="stepContent" name="content" rows={3} placeholder="Orientação, reflexão ou texto" />
              </div>
              <div className="lg:col-span-6">
                <Button type="submit" className="gradient-primary">
                  Salvar etapa
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="glass overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Público alvo</TableHead>
              <TableHead>Objetivos</TableHead>
              <TableHead>Etapas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>{plan.period || "-"}</TableCell>
                <TableCell>{plan.targetAudience || "-"}</TableCell>
                <TableCell>{plan.objectives.join(", ") || "-"}</TableCell>
                <TableCell>{plan.steps.length}</TableCell>
                <TableCell>
                  <Badge variant={plan.status === "published" ? "default" : "secondary"}>
                    {plan.status === "published" ? "Publicado" : "Rascunho"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <form action={deleteReadingPlanForm}>
                    <input type="hidden" name="id" value={plan.id} />
                    <Button type="submit" variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {plans.map((plan) =>
        plan.steps.length === 0 ? null : (
          <Card key={`${plan.id}-steps`} className="glass overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base">Etapas — {plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Dia</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Conteúdo</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.steps.map((step) => (
                    <TableRow key={step.id}>
                      <TableCell className="font-medium">{step.day}</TableCell>
                      <TableCell>{step.title}</TableCell>
                      <TableCell>{step.scriptureRef || "-"}</TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">{step.content || "-"}</TableCell>
                      <TableCell>
                        <form action={deleteReadingPlanStepForm}>
                          <input type="hidden" name="id" value={step.id} />
                          <Button type="submit" variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
    <Card className="glass">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
