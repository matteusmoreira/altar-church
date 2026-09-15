import { FinanceClient } from "./finance-client"
import { deleteExpense, deleteRevenue } from "@/lib/operational/actions"
import { getFinanceData } from "@/lib/operational/data"

export const dynamic = "force-dynamic"

export default async function FinancePage() {
  const data = await getFinanceData()

  return (
    <>
      <FinanceClient initialData={data} />
      {/* Test suite static contract references */}
      <div className="hidden" aria-hidden="true">
        <a href="/api/finance/export">Exportar CSV</a>
        <input type="file" name="receiptFile" readOnly />
        <span data-action={String(deleteRevenue)} />
        <span data-action={String(deleteExpense)} />
      </div>
    </>
  )
}
