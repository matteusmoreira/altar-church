import {
  INTEGRATION_API_VERSION,
  INTEGRATION_EVENTS,
  type IntegrationEventEnvelope,
  type IntegrationEventType,
} from "./types"

export const EVENT_CATALOG: Record<
  IntegrationEventType,
  { label: string; description: string }
> = {
  "form.submitted": {
    label: "Formulário enviado",
    description: "Lead preencheu um formulário público.",
  },
  "crm.card.created": {
    label: "Card CRM criado",
    description: "Novo card no Kanban (form ou manual).",
  },
  "crm.card.updated": {
    label: "Card CRM atualizado",
    description: "Card do Kanban alterado (ex.: estágio).",
  },
  "person.created": {
    label: "Pessoa criada",
    description: "Novo cadastro em Pessoas.",
  },
  "person.updated": {
    label: "Pessoa atualizada",
    description: "Cadastro de pessoa alterado.",
  },
  "integration.test": {
    label: "Teste de webhook",
    description: "Evento sintético para validar a URL.",
  },
}

export function isIntegrationEventType(value: string): value is IntegrationEventType {
  return (INTEGRATION_EVENTS as readonly string[]).includes(value)
}

export function buildEventEnvelope<T extends Record<string, unknown>>(input: {
  deliveryId: string
  type: IntegrationEventType
  company: { id: string; slug?: string; name?: string }
  data: T
  createdAt?: string
}): IntegrationEventEnvelope<T> {
  return {
    id: input.deliveryId,
    type: input.type,
    apiVersion: INTEGRATION_API_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    company: input.company,
    data: input.data,
  }
}
