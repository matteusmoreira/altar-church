# Consumo da Vercel — 08/10/2026

Projeto verificado: `matteusmoreira/altar-church` (`prj_Z7EVERIXLxRLh3hiPBzbAtQB94Ru`).

## Diagnóstico confirmado

A captura mostra **120 GB-h de memória provisionada** no ciclo iniciado em 06/10. Essa medida é memória alocada multiplicada pelo tempo de atendimento, incluindo espera pelo banco; não significa 120 GB de RAM ocupados simultaneamente.

Na janela de 24 horas consultada durante o diagnóstico:

| Rota | Evidência |
| --- | --- |
| `/api/internal/automations/dispatch` | 1.481 respostas HTTP 504; média de aproximadamente 59,9 segundos; 50,52 GB-h |
| `/` | média de aproximadamente 280 ms; 0,0073 GB-h |
| `/api/v1/ministries/[id]/chat` | média de aproximadamente 135 ms; 0,0050 GB-h |
| `/api/v1/ministries/chats` | média de aproximadamente 64 ms; 0,0037 GB-h |

As consultas ocorreram em instantes próximos, com janelas móveis; os totais podem variar ligeiramente. A métrica por rota é evidência de diagnóstico, não substitui a fatura, que consolida o tempo das instâncias com concorrência Fluid.

O banco confirmou **zero execuções de automação, zero mensagens no inbox e apenas dois fluxos em rascunho**. O cron `automation-worker-minute` estava ativo, a cada minuto. O cron `automation-worker-burst`, a cada 10 segundos, estava **desativado**. Das respostas HTTP recentes do pg_net, 59 estavam expiradas na janela de uma hora. O status `succeeded` do cron só comprovava o agendamento da chamada, não o sucesso do endpoint.

## Causa e correções

1. **Pipeline no pool de transações:** quatro consultas autocommit simultâneas reproduziram o travamento com `postgres.js` 3.4.9 e Supavisor na porta 6543. Com `max_pipeline: 0`, terminaram. Entretanto, essa versão do driver não reserva corretamente `sql.begin` com pipeline zero. O cliente agora usa um pool sem pipeline para consultas avulsas e cria um pool exclusivo para `begin` somente quando necessário, com pipeline 1. Ambos usam pool de transações na Vercel, limites baixos e o mesmo timeout de consultas. O encerramento fecha ambos. O limite `POSTGRES_POOL_MAX` passa a ser por pool; o padrão é até duas conexões em cada um, abertas sob demanda.
2. **Chamadas HTTP sem trabalho:** a migration `20261008174420_vercel_idle_automation_worker.sql` verifica a fila no PostgreSQL antes de invocar o worker. Não altera a frequência nem desativa o cron. Filas vazias e fluxos de eventos sem eventos correspondentes ficam sem chamadas à Vercel; inbox devido, execuções prontas, leases vencidos, tarefas concluídas e gatilhos de calendário preservam o despertar automático.
3. **Consulta da audiência dentro da transação:** a distribuição de eventos usa a conexão da transação já aberta para selecionar as pessoas. Isso evita consultas fora do contexto transacional e disputa desnecessária pelo outro pool.

A migration foi aplicada e verificada no banco remoto: `has_work=false`, `invocation=null`; o cron de um minuto continuou ativo e o de 10 segundos continuou desativado. `anon` e `authenticated` não podem executar as funções internas.

## Validação

- 32 testes do motor, contrato, banco isolado, gestão, cadastro, segurança por igreja e recuperação passaram.
- 5 testes da fila passaram, incluindo workers sobrepostos, ritmo de envio, HTTP, deduplicação e recuperação. O teste de 1.500 cadastros não foi repetido nesta mudança.
- O novo teste do agendador comprovou ausência de HTTP com fila vazia, despertar por eventos da igreja correta, retries futuros, leases, execuções e gatilhos de calendário.
- Dois testes do cliente passaram também no banco real em modo Vercel/porta 6543: oito consultas simultâneas, transações simultâneas, consultas paralelas dentro de transação, consultas externas concomitantes, commit e rollback. As consultas remotas desse teste são somente leitura.
- Typecheck e lint dos arquivos alterados passaram.
- Build local e remoto de produção passaram. No total, 40 testes focados passaram.

## Publicação e medição após a correção

Deployment `dpl_BGwi1jAPfg4r5So8cG9cX7X4K4sZ`, READY, promovido ao domínio `altarchurch.com.br`. A publicação partiu do commit de produção `b84c293` e incluiu somente os arquivos desta otimização, em um checkout isolado; alterações paralelas do projeto foram preservadas.

O POST autenticado do worker retornou HTTP 200 com `processed: 0`: **393 ms** na versão preparada e **177 ms** no domínio de produção após promoção. O GET autenticado retornou HTTP 200 e confirmou a fila vazia e o schema pronto. A latência dessa amostra caiu mais de 99% em relação aos aproximadamente 60 segundos anteriores; isso não é uma garantia de redução percentual da fatura mensal.

Na janela de 17:50 a 17:54 UTC (14:50 a 14:54 em São Paulo), a consulta de métricas do worker não retornou novas invocações. Essa janela curta pode sofrer atraso de ingestão. A prova independente no banco mostrou o cron ativo e `invoke_automation_worker()` retornando null com a fila vazia. Os probes manuais subsequentes são chamadas deliberadas de validação, não tráfego do cron.

Em produção, `/`, `/login`, `/api/health` e `/api/ready` retornaram 200; `/dashboard` redirecionou sem sessão e `/api/v1/people` retornou 401. A consulta dos logs de erro da nova versão retornou zero entradas na janela verificada. Essas verificações não enviaram mensagens, criaram contas ou publicaram fluxos; entrega real a provedores não foi parte desta validação.

## Custo e limites da conclusão

Na tabela pública consultada, São Paulo cobra US$ 0,0183/GB-h de memória provisionada. Portanto, os 120 GB-h da captura equivalem a aproximadamente **US$ 2,20 de memória**, antes de créditos do plano e separados de CPU, invocações, transferência e demais serviços. A consulta de billing retornou cerca de US$ 2,17 de memória e US$ 2,56 de consumo total do projeto na janela consultada, com custo faturado praticamente zero naquele momento. A janela do CLI usa os limites de data do fuso de Los Angeles, enquanto a captura do painel usa seu próprio período.

Eliminar os timeouts e invocações vazias deve remover a maior parte do desperdício observado. A economia mensal real depende do tráfego e dos fluxos publicados; não se deve extrapolar uma janela curta como garantia. Gatilhos ativos de calendário ainda precisam de verificações periódicas. Não foram alterados região, memória, cache de dados privados, autenticação ou regras de envio aos provedores.

Documentação oficial: [cobrança Fluid da Vercel](https://vercel.com/docs/functions/usage-and-pricing), [Supabase Cron](https://supabase.com/docs/guides/cron).
