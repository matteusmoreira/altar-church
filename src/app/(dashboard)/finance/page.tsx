import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  DollarSign,
  Download,
  Landmark,
  Plus,
  Tag,
  Users,
  Wallet,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  saveBankAccount,
  saveCostCenter,
  saveExpense,
  saveFinancialCategory,
  saveRevenue,
  saveSupplier,
} from "@/lib/operational/actions"
import { getFinanceData } from "@/lib/operational/data"
import type { FinancialCategory } from "@/lib/types"

async function saveRevenueForm(formData: FormData) {
  "use server"
  await saveRevenue(formData)
}

async function saveExpenseForm(formData: FormData) {
  "use server"
  await saveExpense(formData)
}

async function saveFinancialCategoryForm(formData: FormData) {
  "use server"
  await saveFinancialCategory(formData)
}

async function saveCostCenterForm(formData: FormData) {
  "use server"
  await saveCostCenter(formData)
}

async function saveBankAccountForm(formData: FormData) {
  "use server"
  await saveBankAccount(formData)
}

async function saveSupplierForm(formData: FormData) {
  "use server"
  await saveSupplier(formData)
}

const paymentMethods = [
  "PIX",
  "Transferência por aplicativo",
  "Dinheiro",
  "Cartão de crédito",
  "Cartão de débito",
  "Cheque",
  "Boleto",
]

const banks = ["Banco do Brasil", "Bradesco", "Itaú", "Santander", "Caixa Econômica Federal", "Nubank", "Inter", "C6 Bank"]
const accountTypes = ["Corrente", "Poupança", "Investimento"]

function money(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
}

function formatDate(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
}

function CategorySelect({ categories, name }: { categories: FinancialCategory[]; name: string }) {
  return (
    <Select name={name}>
      <SelectTrigger>
        <SelectValue placeholder="Selecione" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.name}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default async function FinancePage() {
  const data = await getFinanceData()
  const totalRevenues = data.revenues.reduce((sum, revenue) => sum + revenue.amount, 0)
  const totalExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const balance = totalRevenues - totalExpenses
  const revenueCategories = data.categories.filter((category) => category.type === "revenue")
  const expenseCategories = data.categories.filter((category) => category.type === "expense")

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Financeiro</h1>
          <p className="text-muted-foreground">Receitas, despesas e cadastros financeiros persistidos.</p>
        </div>
        <a href="/api/finance/export" className={buttonVariants({ variant: "outline" })}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="Total Receitas" value={`R$ ${money(totalRevenues)}`} icon={ArrowUpRight} tone="success" />
        <Metric title="Total Despesas" value={`R$ ${money(totalExpenses)}`} icon={ArrowDownRight} tone="destructive" />
        <Metric title="Saldo" value={`R$ ${money(balance)}`} icon={DollarSign} tone={balance >= 0 ? "success" : "destructive"} />
        <Metric title="Contas Ativas" value={data.bankAccounts.filter((account) => account.active).length.toString()} icon={Wallet} />
      </div>

      <Tabs defaultValue="receitas">
        <TabsList>
          <TabsTrigger value="receitas">
            <ArrowUpRight className="h-4 w-4" />
            Receitas
          </TabsTrigger>
          <TabsTrigger value="despesas">
            <ArrowDownRight className="h-4 w-4" />
            Despesas
          </TabsTrigger>
          <TabsTrigger value="categorias">
            <Tag className="h-4 w-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="centros">
            <Building2 className="h-4 w-4" />
            Centros
          </TabsTrigger>
          <TabsTrigger value="contas">
            <Landmark className="h-4 w-4" />
            Contas
          </TabsTrigger>
          <TabsTrigger value="fornecedores">
            <Users className="h-4 w-4" />
            Fornecedores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receitas" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Nova Receita
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveRevenueForm} className="grid gap-4 lg:grid-cols-6">
                <MoneyFields categories={revenueCategories} categoryName="category" />
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="receivedFromName">Recebido de</Label>
                  <Input id="receivedFromName" name="receivedFromName" />
                </div>
                <input type="hidden" name="receivedFrom" value="person" />
                <input type="hidden" name="received" value="true" />
                <Submit label="Registrar Receita" />
              </form>
            </CardContent>
          </Card>
          <FinanceTable
            rows={data.revenues.map((revenue) => ({
              id: revenue.id,
              date: revenue.paymentDate,
              description: revenue.description,
              category: revenue.category,
              account: revenue.bankAccount,
              amount: revenue.amount,
              party: revenue.receivedFromName,
            }))}
            amountClass="text-success"
          />
        </TabsContent>

        <TabsContent value="despesas" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Nova Despesa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveExpenseForm} className="grid gap-4 lg:grid-cols-6">
                <MoneyFields categories={expenseCategories} categoryName="category" />
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="paidToName">Pago para</Label>
                  <Input id="paidToName" name="paidToName" />
                </div>
                <input type="hidden" name="paid" value="true" />
                <Submit label="Registrar Despesa" />
              </form>
            </CardContent>
          </Card>
          <FinanceTable
            rows={data.expenses.map((expense) => ({
              id: expense.id,
              date: expense.paymentDate,
              description: expense.description,
              category: expense.category,
              account: expense.bankAccount,
              amount: expense.amount,
              party: expense.paidToName,
            }))}
            amountClass="text-destructive"
          />
        </TabsContent>

        <TabsContent value="categorias" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Nova Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveFinancialCategoryForm} className="grid gap-4 sm:grid-cols-4">
                <div className="grid gap-2">
                  <Label htmlFor="categoryName">Nome *</Label>
                  <Input id="categoryName" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="categoryType">Tipo</Label>
                  <Select name="type" defaultValue="revenue">
                    <SelectTrigger id="categoryType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Receita</SelectItem>
                      <SelectItem value="expense">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="color">Cor</Label>
                  <Input id="color" name="color" type="color" defaultValue="#10b981" />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="gradient-primary">Criar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Nome", "Tipo", "Ativo"]}
            rows={data.categories.map((category) => [category.name, category.type === "revenue" ? "Receita" : "Despesa", category.active ? "Sim" : "Não"])}
          />
        </TabsContent>

        <TabsContent value="centros" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Novo Centro de Custo</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveCostCenterForm} className="grid gap-4 lg:grid-cols-5">
                <div className="grid gap-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input id="title" name="title" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="responsible">Responsável</Label>
                  <Input id="responsible" name="responsible" />
                </div>
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" rows={2} />
                </div>
                <div className="flex items-end">
                  <input type="hidden" name="active" value="true" />
                  <Button type="submit" className="gradient-primary">Criar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Título", "Responsável", "Ativo"]}
            rows={data.costCenters.map((center) => [center.title, center.responsible || "-", center.active ? "Sim" : "Não"])}
          />
        </TabsContent>

        <TabsContent value="contas" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Nova Conta Bancária</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveBankAccountForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="accountDescription">Descrição *</Label>
                  <Input id="accountDescription" name="description" required />
                </div>
                <SelectField label="Banco" name="bank" options={banks} />
                <SelectField label="Tipo" name="accountType" options={accountTypes} />
                <div className="grid gap-2">
                  <Label htmlFor="initialBalance">Saldo inicial</Label>
                  <Input id="initialBalance" name="initialBalance" type="number" step="0.01" min="0" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="agency">Agência</Label>
                  <Input id="agency" name="agency" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="account">Conta</Label>
                  <Input id="account" name="account" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="digit">Dígito</Label>
                  <Input id="digit" name="digit" />
                </div>
                <div className="flex items-end">
                  <input type="hidden" name="active" value="true" />
                  <Button type="submit" className="gradient-primary">Criar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Descrição", "Banco", "Tipo", "Saldo inicial", "Ativo"]}
            rows={data.bankAccounts.map((account) => [account.description, account.bank, account.accountType, `R$ ${money(account.initialBalance)}`, account.active ? "Sim" : "Não"])}
          />
        </TabsContent>

        <TabsContent value="fornecedores" className="mt-4 space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base">Novo Fornecedor</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveSupplierForm} className="grid gap-4 lg:grid-cols-6">
                <div className="grid gap-2 lg:col-span-2">
                  <Label htmlFor="supplierName">Nome *</Label>
                  <Input id="supplierName" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="document">Documento</Label>
                  <Input id="document" name="document" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="supplierResponsible">Responsável</Label>
                  <Input id="supplierResponsible" name="responsible" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" name="email" type="email" />
                </div>
                <div className="flex items-end">
                  <input type="hidden" name="active" value="true" />
                  <Button type="submit" className="gradient-primary">Cadastrar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <SimpleTable
            headers={["Nome", "Documento", "Responsável", "Telefone", "Ativo"]}
            rows={data.suppliers.map((supplier) => [supplier.name, supplier.document || "-", supplier.responsible || "-", supplier.phone || "-", supplier.active ? "Sim" : "Não"])}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Metric({ title, value, icon: Icon, tone = "primary" }: { title: string; value: string; icon: React.ElementType; tone?: "primary" | "success" | "destructive" }) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[tone]

  return (
    <Card className="glass py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MoneyFields({ categories, categoryName }: { categories: FinancialCategory[]; categoryName: string }) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="amount">Valor *</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={categoryName}>Categoria</Label>
        <CategorySelect categories={categories} name={categoryName} />
      </div>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="description">Descrição *</Label>
        <Input id="description" name="description" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="paymentDate">Pagamento *</Label>
        <Input id="paymentDate" name="paymentDate" type="date" defaultValue={today} required />
      </div>
      <SelectField label="Método" name="paymentMethod" options={paymentMethods} />
      <div className="grid gap-2">
        <Label htmlFor="costCenter">Centro de custo</Label>
        <Input id="costCenter" name="costCenter" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bankAccount">Conta</Label>
        <Input id="bankAccount" name="bankAccount" />
      </div>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="notes">Observação</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <div className="grid gap-2 lg:col-span-2">
        <Label htmlFor="receiptFile">Comprovante</Label>
        <Input id="receiptFile" name="receiptFile" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" />
      </div>
    </>
  )
}

function SelectField({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name}>
        <SelectTrigger id={name}>
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Submit({ label }: { label: string }) {
  return (
    <div className="flex items-end">
      <Button type="submit" className="gradient-primary">
        {label}
      </Button>
    </div>
  )
}

function FinanceTable({
  rows,
  amountClass,
}: {
  rows: { id: string; date: string; description: string; category: string; account: string; amount: number; party: string }[]
  amountClass: string
}) {
  return (
    <Card className="glass overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Contraparte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatDate(row.date)}</TableCell>
              <TableCell className="font-medium">{row.description}</TableCell>
              <TableCell>{row.category ? <Badge variant="outline">{row.category}</Badge> : "-"}</TableCell>
              <TableCell>{row.account || "-"}</TableCell>
              <TableCell className={`font-semibold ${amountClass}`}>R$ {money(row.amount)}</TableCell>
              <TableCell>{row.party || "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
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
