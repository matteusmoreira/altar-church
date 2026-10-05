import { getSql } from "@/lib/db/client";
export const SHARED_DELIVERY_EVENTS = [
  "form.submitted",
  "cell.visit_requested",
  "volunteer.assigned",
  "volunteer.upcoming",
] as const;
export async function automationOwnsDelivery(
  companyId: string,
  purpose: string,
) {
  const [row] =
    await getSql()`select flow_id from public.automation_source_owners o join public.automation_flows f on f.id=o.flow_id and f.company_id=o.company_id where o.company_id=${companyId} and o.purpose=${purpose} and f.status in ('active','paused')`;
  return Boolean(row);
}
