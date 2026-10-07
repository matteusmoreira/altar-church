import type { FlowDefinition } from "./contract";
import type { UserRole } from "@/lib/types";
export type Option = { id: string; name: string };
export type FlowItem = {
  id: string;
  name: string;
  description: string;
  draft: FlowDefinition;
  revision: number;
  status: string;
  published_version_id: string | null;
  updated_at: string;
};
export type Workspace = {
  companyId: string;
  userId: string;
  role: UserRole; roles?: UserRole[];
  flows: FlowItem[];
  templates?: { id: string; name: string; definition: FlowDefinition; revision: number; deleted_at: string | null }[];
  runs: {
    id: string;
    flow_id: string;
    node_id: string;
    node_kind?: string;
    status: string;
    last_error: string | null;
    due_at: string;
    created_at: string;
    person_name: string | null;
    flow_name: string;
  }[];
  tasks: {
    id: string;
    run_id: string;
    title: string;
    kind: string;
    status: string;
    due_at: string | null;
    person_name: string | null;
    responsible_name: string | null;
  }[];
  settings: {
    timezone: string;
    quiet_start: string;
    quiet_end: string;
    allowed_models: string[];
    monthly_budget_usd: string;
    knowledge: string;
  } | null;
  archive: {
    kind: string;
    source_id: string;
    snapshot: Record<string, unknown>;
    archived_at: string;
  }[];
  instances: { id: string; name: string; status: string }[];
  people: { id: string; full_name: string; phone: string | null }[];
  cells: {
    id: string;
    name: string;
    automation_whatsapp_chat_id: string | null;
    responsible_id?:string|null;
  }[];
  responsible: { id: string; full_name: string; phone: string | null }[];
  usage: {
    model: string;
    flow_id: string | null;
    run_id: string|null;
    calls: number;
    cost: string;
  }[];
  steps: {
    id: string;
    run_id: string;
    node_id: string;
    status: string;
    detail: Record<string, unknown>;
    created_at: string;
  }[];
  deliveries: {
    id: string;
    run_id: string;
    node_id: string;
    status: string;
    last_error: string | null;
    chat_id: string;
    receipts: Record<string, { state: string; timestamp: number }>;
  }[];
  interests: { interest: string; person_name: string; created_at: string }[];
  congregations: Option[];
  ministries: Option[];
  activities: Option[];
  forms: (Option & { creates_person: boolean; slug?: string })[];
  stages: Option[];
};
