# Gestão de Ministérios 2.0 — Plano de desenvolvimento

Status: planejado
Data: 31/07/2026
Produto: Altar Church

## 1. Objetivo

Transformar Gestão de Ministérios de CRUD simples em centro operacional diário:

- perfil completo do ministério;
- painel com indicadores e alertas;
- membros, solicitações, equipes e funções;
- agenda, presença e escalas;
- comunicação segmentada;
- acompanhamento pastoral;
- relatórios úteis ao líder.

Fluxo principal:

`solicitação → aprovação → onboarding → equipe → agenda → escala → presença → acompanhamento → relatório`

## 2. Estado atual e decisões

### Base existente

- `public.ministries`: nome, descrição, contato, líder e status.
- `public.ministry_memberships`: solicitação, aprovação, membro ativo e líder.
- `/ministerios`: listagem, filtros, criação, edição e exclusão administrativa.
- `/membro/ministerios`: solicitação de entrada e edição limitada do próprio líder.
- Voluntariado V2: departamentos, recorrência, disponibilidade, conflitos, escala manual, publicação e notificações.
- Pessoa 360: timeline, tarefas de follow-up e gatilhos.
- Campanhas: push, e-mail e WhatsApp com público `ministry`.

### Decisões obrigatórias

1. `ministries` continua sendo entidade raiz.
2. `ministry_memberships` continua sendo fonte oficial do vínculo com ministério.
3. Equipes internas usarão `groups` com `type = 'ministry'` e novo `ministry_id`; não criar tabela paralela de equipes.
4. Agenda usará `programmings` + `events`; não criar calendário paralelo.
5. Escalas usarão Voluntariado existente; não duplicar voluntários, disponibilidade ou outbox.
6. Comunicação usará campanhas existentes; não criar nova fila de mensagens.
7. Follow-up usará `person_follow_up_tasks`, com vínculo opcional ao ministério.
8. Toda leitura e escrita manterá `company_id`, RLS e validação server-side.
9. Exclusão continuará soft delete. Histórico publicado nunca será apagado.
10. Primeira entrega não inclui orçamento financeiro nem recrutamento público avançado.

## 3. Modelo de acesso

### Perfis

- **SuperAdmin/Admin/Pastor:** visão e operação completa da igreja.
- **Líder de ministério:** opera apenas ministério próprio; pode editar nome, descrição, contato, perfil, membros, equipes, agenda, presença e comunicação. Não pode excluir ministério nem trocar responsável principal.
- **Coordenador:** escopo limitado à equipe vinculada; entra na segunda etapa.
- **Membro:** vê ministérios permitidos, solicita entrada, confirma presença e consulta própria agenda.

### Segurança

Adicionar funções SQL seguindo padrão existente de células e voluntariado:

- `ministry_current_profile_id()`;
- `ministry_current_person_id()`;
- `can_access_ministry(ministry_id)`;
- `can_manage_ministry(ministry_id)`;
- `can_manage_ministry_team(group_id)`.

Revisar RLS de `groups`, `group_members`, `programmings`, `events`, `attendance_records` e `person_follow_up_tasks` para que política genérica de empresa não vaze equipes ou dados de outro ministério. Manter comportamento atual de células, departamentos e classes.

## 4. Fases de implementação

## Fase 0 — Contrato, migration e RBAC

Arquivo planejado: `supabase/migrations/20260801090000_ministries_v2.sql`.

### Banco

Adicionar em `ministries`:

- `ministry_type`: `worship`, `kids`, `youth`, `care`, `discipleship`, `outreach`, `administration`, `other`;
- `mission`;
- `target_audience`;
- `meeting_day` com valores `0..6`;
- `meeting_time`;
- `meeting_location`;
- `image_file_id` referenciando `app_files`;
- `public_join_enabled`.

Adicionar em `ministry_memberships`:

- papel `coordinator` além de `member` e `leader`;
- `left_at` para histórico de saída;
- índices por `ministry_id`, `status` e `role`.

Adicionar em `groups`:

- `ministry_id` referenciando `ministries`;
- índice por empresa/ministério/status;
- regra de associação para `type = 'ministry'`;
- unicidade de nome dentro do mesmo ministério.

Adicionar em `programmings` e `events`:

- `ministry_id` opcional;
- índices por empresa/ministério/data;
- propagação de `ministry_id` para ocorrências materializadas.

Adicionar em `person_follow_up_tasks`:

- `ministry_id` opcional;
- ampliar `origin` para `ministry_absence`, `ministry_onboarding` e `ministry_manual`;
- índice por ministério/status/prazo.

### Permissões

Adicionar permissões granulares:

- `ministries.dashboard.view`;
- `ministries.members.manage`;
- `ministries.teams.manage`;
- `ministries.agenda.manage`;
- `ministries.attendance.manage`;
- `ministries.communication.send`;
- `ministries.follow_up.manage`;
- `ministries.reports.view`.

Admin/Pastor recebem todas. Líder recebe todas com escopo próprio. Membro recebe apenas superfícies próprias do portal. Nenhuma autorização dependerá apenas de botão ou rota.

### Migração segura

- Migration aditiva e forward-only.
- Backfill de líder atual já existente em `ministry_memberships`.
- Nenhuma remoção física de dados.
- Validar registros de `groups` com `type = 'ministry'` antes de aplicar regra nova.
- Criar índices somente nas consultas usadas pelo workspace.

## Fase 1 — Workspace do ministério

### Rotas

- Manter `/ministerios` como lista administrativa.
- Adicionar `/ministerios/[id]` como workspace.
- Adicionar link “Abrir gestão” em cada card.
- Manter `/membro/ministerios` como superfície do membro.

### Abas

- Visão geral;
- Pessoas;
- Equipes;
- Agenda;
- Escalas;
- Comunicação;
- Follow-up;
- Relatórios;
- Configurações.

### Dashboard

Exibir:

- membros ativos, pendentes e inativos;
- equipes ativas e vagas;
- próximas atividades;
- presença dos últimos 30 dias;
- escalas incompletas;
- follow-ups vencidos e abertos;
- última comunicação enviada;
- alertas de líder ausente, equipe sem responsável e atividade sem escala.

Criar `getMinistryWorkspace(ministryId)` com consultas paralelas e resposta única. Não fazer uma consulta por card.

### Perfil

Formulário com nome, tipo, missão, descrição, público, líder, contato, dia/horário, local, imagem e status. Líder próprio pode editar apenas campos autorizados; responsável principal e exclusão permanecem administrativos.

## Fase 2 — Pessoas e equipes

### Pessoas

Adicionar no workspace:

- busca por nome, telefone e e-mail;
- filtros por status, papel e equipe;
- aprovação, rejeição, reativação e inativação;
- entrada e saída com data;
- vínculo com perfil do Portal do Membro;
- convite manual para pessoa já cadastrada;
- seleção em lote para equipe e comunicação;
- contador de membros sem equipe.

Reutilizar `reviewMinistryMembership`. Estender ação para aceitar apenas transições válidas e registrar `reviewed_by`, `reviewed_at` e auditoria.

### Equipes

Usar `groups` com `type = 'ministry'`:

- criar/editar equipe;
- líder, co-líder e coordenador;
- capacidade e vagas;
- dia, horário e local;
- membros ativos e pendentes;
- status da equipe;
- transferência de pessoa entre equipes.

Regra: pessoa só entra em equipe se for membro ativo do ministério. Remoção de equipe não remove pessoa do ministério. Exclusão é soft delete e preserva histórico.

## Fase 3 — Agenda, presença e escalas

### Agenda

Estender `saveProgramming` e materialização existente:

- atividade recorrente ou única;
- `ministry_id` obrigatório quando criada pelo workspace;
- título, tipo, descrição, data, duração, local e timezone;
- ocorrência vinculada ao ministério;
- publicação explícita;
- edição “somente esta” ou “esta e futuras”.

Criar visões mensal e lista. Exibir atividade, equipe, vagas, escala e presença no mesmo detalhe.

### Presença

Reutilizar `attendance_records` com `event_type = 'ministry'` e `event_ref_id` apontando para `events`:

- presente, ausente e justificado;
- lançamento manual por busca;
- lista rápida para equipe;
- resumo por atividade e período;
- geração de follow-up por ausência recorrente;
- permissão server-side por ministério.

### Escalas

Integrar com Voluntariado:

- ministério escolhe template/departamento;
- posições e funções aparecem no workspace;
- seleção manual continua padrão;
- sugestões automáticas continuam opcionais;
- conflitos, indisponibilidade, descanso e limite mensal bloqueiam seleção;
- publicação gera notificações existentes;
- escala incompleta impede publicação.

Não duplicar `volunteer_profiles`, `volunteer_assignments`, regras de disponibilidade ou outbox.

## Fase 4 — Comunicação e acompanhamento

### Comunicação

Adicionar botão “Nova comunicação” abrindo fluxo existente de campanhas com:

- público automático do ministério;
- público de uma equipe;
- seleção manual;
- push, e-mail e WhatsApp;
- agendamento;
- snapshot de destinatários;
- opt-out respeitado;
- status, tentativas, falhas e reenvio.

Campanhas continuam usando `audience_kind = 'ministry'` e `audience_ref_id`. Líder só envia para escopo próprio.

### Follow-up

No detalhe da pessoa e do ministério:

- criar tarefa pastoral;
- atribuir responsável;
- prazo, prioridade, observação e status;
- origem `ministry_absence`, `ministry_onboarding` ou `ministry_manual`;
- lista de tarefas vencidas e abertas;
- histórico na Pessoa 360.

Gatilho inicial: duas ausências não justificadas em 30 dias. Deduplicar por `source_key`. Líder não vê tarefas de outro ministério.

## Fase 5 — Onboarding, recursos e relatórios

### Onboarding

Criar tabelas:

- `ministry_onboarding_templates`;
- `ministry_onboarding_steps`;
- `ministry_member_onboarding`.

Permitir checklist por ministério: apresentação, treinamento, aceite de regras, documentação e primeira escala. Progresso visível ao líder e ao membro em formato apropriado.

### Recursos

Criar vínculo `ministry_resources` com `app_files` e URLs externas:

- título;
- descrição;
- categoria;
- arquivo ou URL;
- visibilidade;
- ordem;
- autor e auditoria.

Usar Storage existente, path por empresa, MIME/tamanho e URL assinada quando privado.

### Relatórios

Derivar dados das fontes existentes, sem tabela de métricas duplicada:

- membros por status;
- crescimento mensal;
- presença e ausência;
- retenção;
- participação por equipe;
- voluntários e horas servidas;
- escalas preenchidas;
- follow-ups abertos e concluídos;
- comunicação e entregas.

Adicionar exportação autorizada Excel/CSV conforme padrão existente. Toda exportação deve registrar auditoria e respeitar escopo.

## 5. Interfaces técnicas

Criar módulo `src/lib/ministries/`:

- `types.ts`: contratos do workspace, perfil, equipe, agenda, presença, alertas e relatórios;
- `data.ts`: consultas por ministério com `company_id` e escopo;
- `actions.ts`: mutations Zod, autorização, auditoria e `revalidatePath`;
- `access.ts`: resolução de escopo de líder/coordenador;
- `dashboard.ts`: agregações e indicadores.

Criar componentes em `src/components/ministries/`:

- `ministry-workspace.tsx`;
- `ministry-overview.tsx`;
- `ministry-members.tsx`;
- `ministry-teams.tsx`;
- `ministry-agenda.tsx`;
- `ministry-attendance.tsx`;
- `ministry-communication.tsx`;
- `ministry-follow-up.tsx`.

Server actions são interface principal. Não criar API pública nova na primeira entrega. Se API V1 for necessária depois, expor somente leitura/ações já cobertas por autorização.

## 6. Testes

### Unitários/integrados

Criar `tests/ministries-v2.test.mjs` cobrindo:

- criação e edição de perfil;
- tenant isolation;
- líder só acessa ministério próprio;
- líder não troca responsável nem exclui ministério;
- aprovação idempotente;
- transições de vínculo válidas;
- pessoa de outro ministério não entra na equipe;
- equipe não altera vínculo principal;
- recorrência propaga `ministry_id` para ocorrências;
- presença atualiza indicadores;
- campanha não duplica destinatários;
- opt-out é respeitado;
- follow-up deduplica por `source_key`;
- soft delete preserva histórico publicado.

### E2E

Criar `tests/e2e/ministries-v2.spec.ts`:

1. Admin cria ministério, perfil e equipe.
2. Membro solicita entrada.
3. Líder aprova e adiciona membro à equipe.
4. Líder cria atividade recorrente.
5. Evento aparece na agenda com `ministry_id`.
6. Líder monta escala via Voluntariado.
7. Presença é registrada.
8. Campanha é enviada ao ministério.
9. Ausência gera follow-up.
10. Usuário não acessa outro ministério por URL direta.
11. Fluxo funciona em viewport mobile.

### Gates locais

- migration dry-run e verificação de schema;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- testes Node focados e suíte principal;
- Playwright focado e suíte autenticada;
- verificação RLS com usuário admin, pastor, líder, coordenador e membro.

## 7. Rollout

1. Implementar Fase 0 e aplicar migration em ambiente local.
2. Validar contagens antes/depois: ministérios, líderes, vínculos, grupos e eventos.
3. Implementar Fases 1–3 como MVP operacional.
4. Homologar com igreja piloto usando dados reais não destrutivos.
5. Implementar Fases 4–5 após aceite do MVP.
6. Publicar migration e aplicação no mesmo release.
7. Rodar smoke autenticado em domínio final.
8. Monitorar latência do workspace, erros de actions, RLS, campanhas e outboxes.
9. Separar prova técnica de campanha da prova física de entrega push/e-mail/WhatsApp.

Rollback: código pode voltar para versão anterior, mas migration permanece aplicada. Corrigir com migration aditiva. Não resetar banco compartilhado nem apagar histórico.

## 8. Critérios de aceite

- Líder opera ministério próprio sem acessar outro tenant ou ministério.
- Admin/Pastor mantêm operação completa.
- Membro solicita, recebe decisão e vê status correto no portal.
- Equipes não duplicam pessoas nem removem vínculo principal.
- Agenda recorrente cria ocorrências corretas e idempotentes.
- Escala usa Voluntariado existente e bloqueia conflitos reais.
- Presença alimenta dashboard e follow-up.
- Comunicação respeita público, opt-out, idempotência e status de entrega.
- Relatórios batem com fontes brutas.
- Histórico publicado permanece preservado.
- Typecheck, lint, build, testes e E2E passam.
- GO só após smoke autenticado e verificação de RLS. Entrega externa de provedores continua gate separado.

## 9. Fora do MVP

- orçamento próprio por ministério;
- compras e reembolsos;
- recrutamento público com formulário completo;
- marketplace de voluntários;
- automações complexas de IA;
- novo sistema de chat separado do Voluntariado.

Esses itens ficam para fase posterior, após uso real do workspace e medição de adoção.
