# Altar Church

Plataforma administrativa multi-tenant para igrejas. O app usa Next.js App Router, React, Supabase Auth/SSR, Postgres, Server Components para leitura inicial e Server Actions para mutações auditadas.

## Estado de producao

O sistema está pronto para homologação/staging com base real. As rotas operacionais do dashboard não usam mock, as migrations foram aplicadas no Supabase apontado por `POSTGRES_URL`, uploads/Auth administrativos estão implementados e exports CSV auditados estão disponíveis. Produção comercial só deve acontecer após o gate em `docs/roadmap-producao.md`: CI verde, E2E Chrome contra staging final, smoke autenticado, secrets configurados/rotacionados e decisão sobre integrações externas.

## Requisitos

- Node.js compatível com o projeto.
- Google Chrome para Playwright E2E.
- Acesso ao Postgres/Supabase correto.
- Variáveis de ambiente locais em `.env.local`.

## Ambiente

Variáveis mínimas:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
POSTGRES_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY` é preferível para `npm run e2e:setup`. `SUPABASE_ACCESS_TOKEN` só deve existir em secret manager/ambiente, nunca em arquivo solto. Se qualquer segredo vazou em arquivo local, rotacione no provedor, remova o arquivo e atualize `.env.local` ou os secrets da plataforma.

## API REST (`/api/v1`)

Camada HTTP oficial sobre os services/actions existentes. Multi-tenant por `company_id`.

**Auth**
- Sessão Supabase (cookies SSR), ou
- API key: `Authorization: Bearer ack_live_…` (Configurações → Integrações)

- Spec OpenAPI: `docs/api/openapi.yaml` ou `GET /api/v1/openapi`
- Envelope de sucesso: `{ "data": ..., "meta"?: { total, page, pageSize, pageCount } }`
- Envelope de erro: `{ "error": { "code", "message", "details"? } }`
- Helpers em `src/lib/api/*` (`requireApiUser`, `requireApiAuth`, `jsonOk`, …)
- Escopo: auth, people, forms/submissions, congregations, church-info, groups, pastoral, content, público, events, attendance, CRM, prayer, reading-plans, announcements, notifications, finance, donations, subscriptions, volunteers, settings, **integrations** (webhooks, deliveries, api-keys), files, admin e exports CSV

Exemplos:

```bash
# sessão no browser (cookie)
GET /api/v1/auth/me
GET /api/v1/people?page=1&pageSize=20&q=maria
POST /api/v1/people  # JSON body (mesmos campos das Server Actions)
GET /api/v1/public/churches/{slug}  # sem auth

# API key
curl -H "Authorization: Bearer ack_live_…" https://seu-dominio/api/v1/forms
curl -H "Authorization: Bearer ack_live_…" https://seu-dominio/api/v1/forms/{id}/submissions
```

### Integrações / webhooks outbound

UI: **Configurações → Integrações** (globais) e **Formulário → aba Webhooks** (por form).

Quando um lead envia o formulário público, o sistema enfileira `form.submitted` (e eventos de pessoa/CRM relacionados) e faz `POST` assinado para as URLs cadastradas.

Headers: `X-Altar-Event`, `X-Altar-Delivery-Id`, `X-Altar-Timestamp`, `X-Altar-Signature`  
Assinatura: `HMAC-SHA256(secret, `${timestamp}.${rawBody}`)` com prefixo `sha256=`.

Worker/cron (retry):

```bash
curl -X POST https://seu-dominio/api/internal/integrations/dispatch \
  -H "x-integration-worker-secret: $INTEGRATION_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batchSize":25}'
```

Env: `INTEGRATION_WORKER_SECRET`, `INTEGRATION_WEBHOOK_HTTPS_ONLY`.

Guia completo: [`docs/integrations.md`](docs/integrations.md).

```bash
npm run integrations:verify    # schema no Postgres
npm run integrations:dispatch  # processa outbox (app no ar)
npm run integrations:echo -- --secret=... --port=8787  # receptor local de teste
npm run db:migrate             # aplica migrations pendentes
```

Rotas legadas (`/api/auth/me`, `/api/*/export`, webhooks Resend) permanecem ativas.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Use `npm run dev:turbo` quando quiser testar Turbopack explicitamente. O `next.config.ts` mantém `turbopack.root` para resolver corretamente a subpasta do projeto.

## Validação local

```bash
npm run typecheck
npm run lint
node --test tests/*.test.mjs
npm run build
npm run e2e:setup
npm run test:e2e
npm audit --audit-level=moderate
```

Os testes E2E usam Chrome (`channel: "chrome"`). As contas locais ficam em `docs/testing/e2e-accounts.local.md`, arquivo ignorado pelo git.

## Banco e migrations

- Confirme que `POSTGRES_URL` aponta para o projeto Supabase correto antes de aplicar migrations.
- Migrations ficam em `supabase/migrations`.
- Toda tabela operacional nova deve ter `company_id`, RLS, índices por tenant e policies compatíveis com `public.is_company_member(company_id)` e `public.is_superadmin()`.
- Mutação crítica deve usar Zod, permissão server-side, `company_id`, auditoria em `audit_logs` e `revalidatePath`.

## CI

O workflow `.github/workflows/ci.yml` executa:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `node --test tests/*.test.mjs`
- `npm run build`
- `npm run e2e:setup`
- `npm run test:e2e`
- `npm audit --audit-level=moderate`

Configure estes secrets no repositório/plataforma antes de exigir CI verde: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `POSTGRES_URL`, `SUPABASE_SERVICE_ROLE_KEY` e, se necessário, `SUPABASE_ACCESS_TOKEN`.

## Deploy

### Vercel

O projeto está pronto para Git deploy na Vercel como app Next.js. Use:

- Framework Preset: `Next.js`.
- Root Directory: raiz do repositório.
- Install Command: `npm ci`.
- Build Command: `npm run build`.
- Node.js Version: `24.x` (também fixado em `package.json`).

Configure em Production e Preview:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
POSTGRES_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_ACCESS_TOKEN` só é necessário para automações de setup/migrations fora do runtime web. Não coloque esse token no cliente.

Checklist:

1. Rode a validação local completa.
2. Aplique migrations somente no Supabase confirmado.
3. Configure env vars na Vercel antes do primeiro deploy.
4. Conecte o repositório GitHub `matteusmoreira/altar-church`.
5. Gere preview pela Vercel e rode `npm run e2e:setup` e `npm run test:e2e` contra staging usando `E2E_BASE_URL`.
6. Promova para produção só após smoke autenticado e verificação do gate de produção.

## Rollback

1. Reverter para o deployment anterior na plataforma.
2. Se houve migration incompatível, restaurar snapshot/backup antes de tráfego voltar para a versão antiga.
3. Conferir login, `/dashboard`, `/members`, `/groups`, `/content` e `/admin`.
4. Registrar incidente e ação corretiva no runbook operacional.

## Restore

1. Identificar backup/snapshot do Postgres.
2. Restaurar em staging primeiro.
3. Rodar migrations pendentes, se aplicável.
4. Executar `npm run e2e:setup` e `npm run test:e2e`.
5. Trocar produção para a base restaurada somente depois do smoke passar.

## Roadmap

- Produto: `docs/roadmap-gestao-igreja.md`
- Produção: `docs/roadmap-producao.md`
- E2E: `docs/testing/e2e-testing.md`
