import { notFound } from "next/navigation";
import { AutomationWorkspace } from "@/components/automations/automation-workspace";
import { TEMPLATES } from "@/lib/automations/templates";
import type { Workspace } from "@/lib/automations/workspace-types";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Prévia de Automações",
  robots: { index: false, follow: false },
};
export default function AutomationsPreview() {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.E2E_AUTOMATIONS_PREVIEW !== "1"
  )
    notFound();
  const workspace: Workspace = {
    companyId: "10000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000001",
    role: "admin",
    flows: TEMPLATES.slice(0, 4).map((t, i) => ({
      id: `60000000-0000-4000-8000-00000000000${i + 1}`,
      name: t.name,
      description: t.description,
      draft: t.definition,
      revision: 0,
      status: "draft",
      published_version_id: null,
      updated_at: "2026-10-05T12:00:00Z",
    })),
    runs: [],
    tasks: [],
    settings: {
      timezone: "America/Sao_Paulo",
      quiet_start: "08:00",
      quiet_end: "20:00",
      allowed_models: ["modelo-de-demonstracao"],
      monthly_budget_usd: "5",
      knowledge: "Cultos aos domingos às 19h.",
    },
    archive: [],
    instances: [
      {
        id: "50000000-0000-4000-8000-000000000001",
        name: "WhatsApp da igreja",
        status: "connected",
      },
    ],
    people: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        full_name: "Ana Silva",
        phone: null,
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        full_name: "João Santos",
        phone: null,
      },
    ],
    cells: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        name: "Célula Esperança",
        automation_whatsapp_chat_id: null,
      },
    ],
    responsible: [],
    usage: [],
    steps: [],
    deliveries: [],
    interests: [],
    congregations: [],
    ministries: [],
    activities: [],
  };
  return (
    <main className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
      <AutomationWorkspace workspace={workspace} preview />
    </main>
  );
}
