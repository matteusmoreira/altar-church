# Integrações externas (webhooks + API keys)

Plataforma multi-tenant para sistemas externos (ex.: automação WhatsApp).

## Onde configurar

| Onde | O quê |
|------|--------|
| **Configurações → Integrações** | Webhooks **globais** da igreja, API keys, log de entregas |
| **Formulários → [form] → Webhooks** | Endpoints **só daquele formulário** (além dos globais) |
| OpenAPI | `GET /api/v1/openapi` |

## Fluxo lead → WhatsApp

1. Admin cria webhook com evento `form.submitted` e URL HTTPS da automação.
2. Copia o **secret** (exibido uma vez).
3. No form, mapeia telefone com `map_to: person_phone`.
4. Lead envia o form público `/f/{slugIgreja}/{slugForm}`.
5. Altar Church grava submission + CRM e enfileira outbox.
6. Worker faz `POST` assinado na URL; a automação dispara o WhatsApp.

### Payload (resumo)

```json
{
  "id": "<delivery-uuid>",
  "type": "form.submitted",
  "apiVersion": "2026-07-15",
  "createdAt": "...",
  "company": { "id": "...", "slug": "...", "name": "..." },
  "data": {
    "submissionId": "...",
    "form": { "id": "...", "title": "...", "slug": "..." },
    "crmCard": { "id": "...", "stageId": "..." },
    "person": { "id": "...", "name": "...", "email": null, "phone": "+55..." },
    "fields": { "nome": "...", "telefone": "..." },
    "source": "Formulário: ..."
  }
}
```

### Headers

| Header | Descrição |
|--------|-----------|
| `X-Altar-Event` | Ex.: `form.submitted` |
| `X-Altar-Delivery-Id` | ID da entrega (idempotência) |
| `X-Altar-Timestamp` | Unix seconds |
| `X-Altar-Signature` | `sha256=<hmac_hex>` |

**Assinatura:** `HMAC-SHA256(secret, \`${timestamp}.${rawBody}\`)`.

Rejeite se `|now - timestamp| > 300` segundos.

### Eventos

| Evento | Quando |
|--------|--------|
| `form.submitted` | Envio de formulário público |
| `crm.card.created` / `crm.card.updated` | Card Kanban |
| `person.created` / `person.updated` | Pessoa |
| `integration.test` | Botão “Testar” na UI |

## API keys (REST inbound)

Formato: `ack_live_…`  
Header: `Authorization: Bearer ack_live_…`

Scopes comuns: `forms:read`, `crm:read`, `people:read`, `webhooks:manage`, `*`.

```bash
curl -H "Authorization: Bearer ack_live_…" \
  "https://seu-dominio/api/v1/forms"

curl -H "Authorization: Bearer ack_live_…" \
  "https://seu-dominio/api/v1/forms/{id}/submissions"
```

Criar/revogar keys: só pela UI/sessão (não via API key).

## Worker de retry (outbox)

Despacho imediato tenta rodar após o evento (`after()`). Falhas reentram no outbox com backoff.

### Manual / cron HTTP

```bash
curl -X POST "https://seu-dominio/api/internal/integrations/dispatch" \
  -H "Content-Type: application/json" \
  -H "x-integration-worker-secret: $INTEGRATION_WORKER_SECRET" \
  -d "{\"batchSize\":25}"
```

Env local: `INTEGRATION_WORKER_SECRET` no `.env.local`.

### Scripts

```bash
# Verifica tabelas/função no Postgres
npm run integrations:verify

# Despacha outbox via HTTP (precisa app no ar + BASE_URL)
npm run integrations:dispatch

# Receptor local de teste (valida HMAC)
npm run integrations:echo -- --secret=SEU_SECRET --port=8787
```

### pg_cron (produção / Supabase)

Worker preferido: função SQL `process_integration_deliveries` (HMAC + `pg_net`), agendada a cada 2 minutos.

```bash
# aplica migration do worker SQL + agenda o cron
npm run db:migrate
# se o job já existir e precisar reapontar:
node scripts/reschedule-integration-sql-cron.mjs
```

SQL manual: `scripts/setup-integration-cron.sql`.

Alternativa (Edge Function `integration-delivery-worker`): requer token Supabase com permissão de deploy (`sbp_…` clássico). Código em `supabase/functions/integration-delivery-worker/`.

## Segurança

- Secret do webhook e API key plaintext só na criação.
- Em produção, URLs de webhook devem ser HTTPS (`INTEGRATION_WEBHOOK_HTTPS_ONLY=1`).
- Hosts privados bloqueados fora de `NODE_ENV=development`.
- Nunca commitar `.env.local`.

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| Outbox fica `pending` | App precisa processar: abra a UI “Testar”, ou `npm run integrations:dispatch`, ou cron |
| Status `failed` | Veja `last_error` em Entregas; confira URL/firewall |
| Status `dead` | 8 tentativas; use “Reenviar” na UI |
| 401 no dispatch | Header `x-integration-worker-secret` ≠ env |
| API key 403 | Scope insuficiente para a rota |
