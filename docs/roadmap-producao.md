# Roadmap de Produção - EcclesiaHub

Status validado em 05/06/2026.

## Veredito

O core do sistema está pronto para homologação/staging com base real. Produção comercial depende apenas do gate operacional: segredos rotacionados, secrets configurados na plataforma, smoke autenticado no ambiente final e decisão sobre integrações externas.

Para uso comercial com pagamento, push, e-mail ou WhatsApp automáticos, ainda é obrigatório conectar provedores reais com filas, retries, logs e rollback. O código atual mantém esses fluxos como operação manual/persistida.

## Evidência desta rodada

- `npm run typecheck`: passou.
- `node --test tests/*.test.mjs`: passou com 43 testes.
- Migrations remotas aplicadas no Supabase apontado por `POSTGRES_URL`: 11 versões, até `20260605140000_p5_operational_media_files`.
- Uploads reais implementados com `app_files`, Storage `church-assets`, MIME/tamanho, path por empresa e URL assinada.
- Auth de usuários pelo SuperAdmin com convite/vínculo, reset de senha e bloqueio para perfil inativo.
- Server Actions P4 validadas com Zod, permissão server-side, tenant e auditoria.
- Exportação CSV auditada em relatórios, financeiro e doações.

## Entregue

- Next.js App Router com Supabase Auth/SSR e Postgres.
- Proxy de sessão para rotas protegidas.
- Guard server-side por módulo/permissão nas rotas de dashboard.
- SuperAdmin para empresas, planos, módulos e perfis.
- Tabelas SaaS base: `system_plans`, `system_modules`, `companies`, `profiles`, `plan_modules`, `company_modules`.
- P0: `audit_logs`, `app_files`, bucket `church-assets`, RLS e policies de Storage.
- P1: pessoas, congregações, perfil da igreja, links sociais, campos extras, atividades, jornadas, duplicidades e visitantes.
- P2: categorias de conteúdo, posts, banners e portal público `/church/[slug]`.
- P3: grupos, GCEUs/células, participantes, reuniões, estudos, hierarquia, coordenadores, templates e multiplicações.
- P4: eventos, presença, CRM, pedidos de oração, planos de leitura, avisos, notificações, financeiro, doações e InPeace Play.
- P5: uploads reais para logo/capa da igreja, conteúdo, banners, comprovantes financeiros, planos de leitura e mídia premium.
- P6: Auth administrativo com convite, vínculo `profiles.auth_user_id`, reset e bloqueio.
- P7: CSV server-side auditado para relatórios, financeiro e doações.

## Bloqueios para produção comercial

1. **Segredos**
   - Rotacionar qualquer credencial que tenha existido fora de secret manager.
   - Remover arquivo local sensível, se ainda existir.
   - Configurar secrets na plataforma de deploy.

2. **Staging final**
   - Rodar migrations no banco de staging/produção confirmado.
   - Rodar `npm run e2e:setup` e `npm run test:e2e` contra o domínio final usando `E2E_BASE_URL`.
   - Fazer smoke autenticado em SuperAdmin, dashboard, membros, grupos, conteúdo, financeiro, doações e exports.

3. **Integrações externas**
   - Push/e-mail/WhatsApp, gateway de pagamento e billing real ainda dependem de contratos, credenciais, webhooks, retry e observabilidade.
   - Sem isso, o sistema deve operar esses fluxos manualmente.

4. **PDF**
   - CSV está implementado sem dependência nova.
   - PDF deve ser tratado como integração/gerador posterior para não inventar biblioteca sem decisão técnica.

## Gate de produção

Só promover quando estes itens estiverem verdadeiros:

- Nenhuma rota operacional usando mock.
- Todas as migrations aplicadas no projeto Supabase correto.
- Todas as tabelas operacionais com RLS e índice por `company_id`.
- Todas as leituras administrativas filtradas por tenant no servidor.
- Todas as mutações críticas com Zod, permissão e auditoria.
- Upload real validado por MIME, tamanho, owner e path por empresa.
- Usuário criado/vinculado no Supabase Auth, não só em `profiles`.
- CSV auditado disponível para relatórios/financeiro/doações.
- CI passando em branch protegida.
- Staging com base limpa e E2E Chrome passando após migrations.
- Segredos rotacionados e fora do repositório/pastas soltas.
- Runbook de deploy, rollback e restore validado.
