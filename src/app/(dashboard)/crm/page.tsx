import { CrmClient } from "./crm-client"
import { listCrmCards, listCrmStages, listPeopleDirectory } from "@/lib/operational/data"

export default async function CRMPage() {
  const [stages, cards, people] = await Promise.all([
    listCrmStages(),
    listCrmCards(),
    listPeopleDirectory(),
  ])

  return <CrmClient stages={stages} cards={cards} people={people} />
}
