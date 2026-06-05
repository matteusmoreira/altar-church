import { BookOpen, CheckCircle2, FilePen, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { deleteReadingPlan, saveReadingPlan } from "@/lib/operational/actions"
import { listReadingPlans } from "@/lib/operational/data"

async function saveReadingPlanForm(formData: FormData) {
  "use server"
  await saveReadingPlan(formData)
}

async function deleteReadingPlanForm(formData: FormData) {
  "use server"
  await deleteReadingPlan(formData)
}

export default async function ReadingPlansPage() {
  const plans = await listReadingPlans()
  const published = plans.filter((plan) => plan.status === "published").length
  const drafts = plans.filter((plan) => plan.status === "draft").length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Planos de Leitura / Discipulado</h1>
        <p className="text-muted-foreground">Planos persistidos para leitura e discipulado.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Total de Planos" value={plans.length} icon={BookOpen} />
        <Metric title="Publicados" value={published} icon={CheckCircle2} />
        <Metric title="Rascunhos" value={drafts} icon={FilePen} />
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
