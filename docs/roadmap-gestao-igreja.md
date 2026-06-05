# Roadmap de Produto - Sistema Completo de Gestão de Igreja

Status validado em 05/06/2026.

## Diagnóstico atual

O sistema tem backend real para os módulos principais, migrations aplicadas no Supabase apontado por `POSTGRES_URL`, uploads gerenciados, Auth administrativo, validação Zod no P4 e exportações CSV auditadas.

Validação desta rodada:

- `npm run typecheck`: passou.
- `node --test tests/*.test.mjs`: passou com 43 testes.
- Migrations remotas: 11 versões aplicadas, até `20260605140000_p5_operational_media_files`.

## Arquitetura mantida

- Next.js App Router.
- Supabase Auth/SSR.
- Postgres com RLS por `company_id`.
- Server Components para leitura inicial.
- Server Actions para mutações de formulário.
- Route Handlers para exportação CSV e endpoints públicos.
- Services por módulo para evitar queries espalhadas em páginas.
- Auditoria em ações críticas.
- Storage Supabase para logo, capa, banners, mídia e comprovantes.

## Concluído

### P0 - Fundação

- `audit_logs`.
- `app_files` e bucket `church-assets`.
- Guards server-side por módulo/permissão.
- Dependências legadas SQLite/auth própria removidas.
- README operacional.
- CI com typecheck, lint, testes Node, build, E2E e audit.

### P1 - Pessoas e igreja

- `people`, congregações, perfil da igreja e links sociais.
- Campos customizados, atividades, jornadas e duplicidades.
- Visitantes persistidos em `people`.
- Ministério, programação e músicas sem mock.
- Server Actions auditadas.

### P2 - Conteúdo e comunicação pública

- `content_posts`, `content_categories`, `banners`.
- CRUD real de conteúdo.
- Upload real para capas e banners.
- Portal público `/church/[slug]` lendo dados reais.

### P3 - GCEUs, células e grupos

- `groups`, `group_members`, `group_categories`.
- `group_meetings`, `group_studies`.
- Hierarquia, coordenadores, templates e multiplicações.
- Tela de grupos e células usando dados reais.

### P4 - Módulos operacionais

- `events`.
- `attendance_records`.
- `crm_cards`.
- `prayer_requests`.
- `reading_plans` e `reading_plan_steps`.
- `announcements`.
- `notifications` e `notification_groups`.
- `financial_categories`, `cost_centers`, `bank_accounts`, `suppliers`, `revenues`, `expenses`.
- `donations` e `donation_recurrences`.
- `subscription_plans`, `subscription_tags`, `subscriptions`, `subscription_contents`, `subscription_collections`, `subscription_settings`.
- Dashboard e relatórios sem mock, usando agregados reais disponíveis.
- Validação Zod nas Server Actions P4.

### P5 - Uploads reais

- Logo e capa da igreja.
- Imagens de conteúdo e banners.
- Comprovantes de receitas, despesas e doações.
- Capa de planos de leitura.
- Destaque/capa de conteúdos e coletâneas premium.
- Metadados em `app_files`.
- Validação de MIME, tamanho, owner e path por empresa.

### P6 - Auth e SuperAdmin

- Convites Supabase Auth.
- Criação/vínculo de usuário em `profiles.auth_user_id`.
- Reset de senha.
- Bloqueio efetivo quando perfil fica inativo.
- Auditoria de ações administrativas.

### P7 - Exportações

- CSV auditado para relatórios.
- CSV auditado para financeiro.
- CSV auditado para doações.
- Permissão server-side por `reports.export`, `finance.export` e `donation.export`.

## Fora do core entregue

- Push/e-mail/WhatsApp automáticos.
- Gateway de pagamento.
- Billing SaaS real com faturas e bloqueio operacional.
- PDF gerado no servidor.

Esses itens dependem de provedor, credenciais, contratos de webhook, fila/retry e decisão de biblioteca/serviço. Até lá, o sistema suporta operação manual/persistida e exportação CSV.

## Definition of Done por módulo

Módulo pronto deve ter:

- tabela real com `company_id`;
- RLS ativa;
- índices principais;
- leitura server-side;
- criação, edição ou remoção quando aplicável;
- validação Zod no servidor para mutações críticas;
- guard de permissão no servidor;
- auditoria em ação crítica;
- estados de loading, erro e vazio;
- busca/filtros quando o volume justificar;
- testes mínimos de service/permissão;
- nenhuma dependência de mock.

## Próxima etapa operacional

1. Rodar validação completa local.
2. Rodar `npm run e2e:setup` e `npm run test:e2e` contra staging final.
3. Rotacionar segredos e configurar secret manager/plataforma.
4. Publicar em staging.
5. Fazer smoke autenticado.
6. Só então promover produção.
