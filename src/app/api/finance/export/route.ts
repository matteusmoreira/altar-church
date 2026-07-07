import type { NextRequest } from "next/server"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"
import { getFinanceData } from "@/lib/operational/data"

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "finance.export")
    const data = await getFinanceData(companyId)

    const rows: CsvCell[][] = [
      ["Tipo", "Data", "Descrição", "Categoria", "Subcategoria", "Pessoa/Fornecedor", "Método", "Centro de custo", "Conta", "Valor", "Status", "Observações"],
      ...data.revenues.map((revenue) => [
        "Receita",
        revenue.paymentDate,
        revenue.description,
        revenue.category,
        revenue.subcategory,
        revenue.receivedFromName,
        revenue.paymentMethod,
        revenue.costCenter,
        revenue.bankAccount,
        revenue.amount,
        revenue.received ? "Recebido" : "Aberto",
        revenue.notes,
      ]),
      ...data.expenses.map((expense) => [
        "Despesa",
        expense.paymentDate,
        expense.description,
        expense.category,
        expense.subcategory,
        expense.paidToName,
        expense.paymentMethod,
        expense.costCenter,
        expense.bankAccount,
        expense.amount,
        expense.paid ? "Pago" : "Aberto",
        expense.notes,
      ]),
      [],
      ["Cadastro", "Nome", "Tipo", "Ativo"],
      ...data.categories.map((category) => ["Categoria", category.name, category.type === "revenue" ? "Receita" : "Despesa", category.active ? "Sim" : "Não"]),
      ...data.costCenters.map((center) => ["Centro de custo", center.title, center.responsible, center.active ? "Sim" : "Não"]),
      ...data.bankAccounts.map((account) => ["Conta bancária", account.description, account.accountType, account.active ? "Sim" : "Não"]),
      ...data.suppliers.map((supplier) => ["Fornecedor", supplier.name, supplier.document, supplier.active ? "Sim" : "Não"]),
    ]

    await auditExport("finance.export", "finance", companyId)
    return csvResponse(`financeiro-${todayStamp()}.csv`, rows)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
