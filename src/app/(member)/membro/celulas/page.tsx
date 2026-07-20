import { CellFeaturesClient } from "@/app/(dashboard)/celulas/cell-features-client"
import { getCellFeaturesData } from "@/lib/cells/data"

export default async function MemberCellsPage() {
  return (
    <div className="lg:pt-12">
      <CellFeaturesClient data={await getCellFeaturesData()} />
    </div>
  )
}
