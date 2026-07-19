"use client"

import type { VolunteerDashboardData, VolunteerPortalData } from "@/lib/volunteers/types"
import { VolunteerManagerV2, VolunteerPortalV2 } from "./volunteer-v2-workspace"

export function VolunteerHubClient(props: { mode: "manager"; data: VolunteerDashboardData } | { mode: "volunteer"; data: VolunteerPortalData }) {
  return props.mode === "manager"
    ? <VolunteerManagerV2 data={props.data} />
    : <VolunteerPortalV2 data={props.data} />
}
