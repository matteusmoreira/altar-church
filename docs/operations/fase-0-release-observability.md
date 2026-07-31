# Fase 0 — release e observabilidade

Status: implementada localmente e verificada contra o projeto Supabase configurado no ambiente atual.  
Data da verificação: 31/07/2026.

## Escopo entregue

- `/api/health`: health check público, sem segredos, para banco, Storage, Auth e endpoints dos workers.
- `/api/ready`: readiness estrito; retorna `200` somente quando os checks de infraestrutura estão saudáveis.
- `/api/v1/operations/health`: painel de saúde autorizado por sessão com `settings.manage_settings` ou API key com `webhooks:manage`.
- `/configuracoes/operacao`: painel web com migrations, cron, filas, dead letters, atraso de fila, uso por tenant, backup e saúde de Uazapi/Resend/Web Push.
- Probes de Uazapi e Resend são somente leitura. Probe de worker envia chamada sem segredo e espera `401`; não processa outbox.
- Reuso das tabelas/outboxes existentes. Nenhuma migration nova foi criada porque o banco já estava alinhado.

## Ambientes

| Ambiente | Identificação | Regra |
| --- | --- | --- |
| local | `APP_ENV=local` | Pode usar `.env.local`; nunca publicar segredo no Git. |
| staging | `APP_ENV=staging` | Projeto Supabase separado; smoke autenticado e E2E antes de produção. |
| produção | `APP_ENV=production` | Só publicar após migration parity, backup/restore e smoke aprovado. |

O alvo confirmado nesta rodada foi o projeto cujo host termina em `zsldqioutjxchgmmwtfi.supabase.co`. A confirmação ocorreu por host, sem registrar valores de token ou senha.

## Release

Executar no diretório raiz do repo:

```powershell
npm run db:migrate
npm run db:audit
npm run typecheck
npm run lint
npm test
npm run build
```

Health externo:

```powershell
curl.exe -i https://SEU-DOMINIO/api/health
curl.exe -i https://SEU-DOMINIO/api/ready
```

`/api/health` é diagnóstico. `/api/ready` deve ser usado pelo deploy/load balancer para retirar instância não pronta.

## Leitura do painel

- `Migrations`: compara arquivos locais com `supabase_migrations.schema_migrations` por timestamp.
- `Fila operacional`: soma pendentes, processando e falhas retryáveis.
- A fila também mostra tarefas abertas/em andamento de follow-up pastoral, além dos outboxes de entrega.
- `Dead letters`: itens que exigem reenvio ou investigação manual.
- `Crons`: mostra schedule, ativo, última execução e status reportado pelo `cron.job_run_details`.
- `Uso por tenant`: pessoas, pessoas ativas, grupos e entregas, sempre agrupados por `company_id`.
- `Backup`: usa `BACKUP_LAST_RUN_AT`, `BACKUP_PROVIDER` e opcionalmente `BACKUP_MAX_AGE_HOURS` (padrão: 36h). Sem esses valores, aparece `Não verificado`; isso não é prova de backup.

## Rollback e restore

Migrations são forward-only. Não executar `DROP`, `down migration` ou reset no banco compartilhado para desfazer release.

1. Reverter aplicação para último deployment conhecido saudável.
2. Manter migration aplicada; corrigir comportamento com migration aditiva.
3. Se houver corrupção ou perda, restaurar backup em projeto isolado.
4. Validar schema, RLS, contagens e smoke autenticado no restore.
5. Fazer cutover somente com aprovação operacional e backup atual preservado.

Restore ainda precisa de prova operacional com backup real; o painel marca essa ausência explicitamente quando `BACKUP_LAST_RUN_AT` não está configurado.

Auditoria SQL desta rodada encontrou PostgreSQL saudável (cache hit aproximado de 99,9975%, zero deadlocks, zero índices inválidos, zero índices duplicados e zero queries longas). A tabela legada `public.healthcheck` continua como única lacuna de RLS sem policy; ela não contém dados de tenant e permanece explicitamente fora do escopo operacional. O relatório também apontou FKs sem índice em várias tabelas; não foi criado índice em massa, pois cada índice precisa ser validado pelo caminho de consulta antes de consumir recursos do plano.

## Rotação de secrets

Rotacionar qualquer credencial que tenha aparecido fora do secret manager, nesta ordem:

1. senha do banco e `POSTGRES_URL`;
2. token Management do Supabase;
3. service role/anon conforme política do projeto;
4. segredos dos workers e Vault;
5. Uazapi, Resend, VAPID e Vercel.

Atualizar plataforma/Vault, republicar workers e aplicação, depois validar `/api/health`, `/api/ready`, cron e outboxes. Nunca salvar valores no repo, documentação ou logs.

## Gates restantes

- staging Supabase separado ainda precisa ser criado/configurado;
- E2E autenticado em staging ainda precisa ser executado;
- backup/restore real e alerta externo ainda precisam de prova;
- entrega física de WhatsApp, e-mail e push continua separada do health check técnico.

## Fase 1 — notificações multicanal

Implementação local adicionada em 31/07/2026:

- `notifications` permanece campanha compatível e agora registra público, agendamento e snapshot.
- `notification_deliveries` guarda uma linha por destinatário/canal, com `pending`, `processing`, `sent`, `failed`, `canceled` e `dead`.
- Claim SQL usa `FOR UPDATE SKIP LOCKED`, até oito tentativas, backoff exponencial e limite por tenant.
- Push usa `notification_push_subscriptions`; endpoints 404/410 são desativados.
- E-mail usa Resend com `Idempotency-Key`; WhatsApp usa instância Uazapi por `company_id` com `track_id` da entrega.
- Opt-out fica em `notification_channel_preferences` e é aplicado no snapshot, antes da campanha entrar na fila.
- `/api/internal/notifications/dispatch` aceita `x-notification-worker-secret`; o dispatch integrado também processa a fila de notificações.
- Portal do membro ganhou `/membro/preferencias` e a API V1 `/api/v1/notifications/preferences`.

Gate separado: provider real, secrets configurados, cron chamando dispatch, entrega física nos três canais, retry observado e isolamento entre dois tenants em staging.

## Fase 2 — Pessoa 360 e follow-up pastoral

Implementação local adicionada em 31/07/2026:

- Detalhe de pessoa ganhou linha do tempo consolidada de cadastro, presença, célula, ministério, Kids, voluntariado, CRM, oração, comunicação e auditoria; mensagens de oração e dados clínicos não são exibidos.
- `person_follow_up_tasks` registra responsável, prazo, prioridade, status, origem, observação, auditoria e vínculo opcional com o card CRM existente.
- `person_follow_up_triggers` configura novo visitante, visitante sem contato, ausência recorrente, pedido de oração, pessoa sem célula e membro sem acesso ao portal.
- O worker executa os gatilhos com `source_key` único; repetição não cria tarefa duplicada. O dispatch integrado também executa o worker.
- `/pessoas/follow-up` possui filtros por status da tarefa, célula, responsável e jornada; `/configuracoes/follow-up` permite configurar e executar os gatilhos.

Gate separado: E2E autenticado de edição, cenário com dois tenants, execução de cron real e validação operacional em staging ainda precisam ser executados.

## Fase 3 — Portal do membro 2.0

Implementação local adicionada em 31/07/2026:

- `/membro/agenda` lista eventos públicos futuros e persiste RSVP `going`, `waitlisted` ou `canceled`.
- A reserva bloqueia a linha do evento dentro de transação antes de contar capacidade; isso evita overbooking em concorrência.
- `/membro/oracao` cria pedido privado auditado; `/membro/perfil` permite editar somente campos próprios; `/membro/preferencias` mantém opt-out e push.
- Identidade canônica usa `people.profile_id`, com fallback legado somente para renderizar vínculos órfãos sem ampliar escopo.

Gate separado: E2E de dois perfis/tenants, staging, migração reversível e confirmação de capacidade real ainda precisam ser executados.

## Fase 4 — Saúde das células

Implementação local adicionada em 31/07/2026:

- `/celulas/saude` calcula presença 7/30 dias, capacidade, novos participantes, ausência, pedidos de oração, relatórios pendentes, última comunicação e crescimento.
- Escopo server-side respeita tenant, administrador/supervisor e célula permitida; configurações têm RLS, auditoria e limites.
- `/api/v1/cells/health/export` exporta o recorte autorizado em CSV.

Gate separado: série histórica real, dois tenants, alerta externo e E2E de supervisor em staging.

## Pacote público e aquisição

Implementação local adicionada em 31/07/2026:

- O calendário público lê somente eventos `is_public = true` e `published`.
- `public_acquisition_events` persiste page views, envios e conversões por origem/UTM, sempre com `company_id`, RLS para leitura administrativa e índices de FK.
- O beacon público não guarda IP; a sessão é anônima e a chave evita contagem duplicada da mesma página na sessão.
- O formulário público cria atribuição e tarefa idempotente de primeiro contato; o relatório `/relatorios/aquisicao` fica protegido por `reports.view`.

Gate separado: links reais de campanha/QR, volume externo, conversão em staging e prova de isolamento entre dois tenants.
