# Portal e caixa pessoal de notificações

As migrations `20261009112359`, `20261009120448` e `20261009120849` devem ser aplicadas antes do código. A caixa pessoal não altera campanhas existentes e não importa histórico de eventos.

O botão **Informações** carrega descrição, liderança, contato e próximas ocorrências reais de `events`, com as atribuições publicadas de `volunteer_assignments`. A agenda usa cursor de data/id. A ausência é uma transação com bloqueio da escala e da atribuição, valida igreja, pessoa ativa, vínculo, publicação, status e início futuro; grava `declined`, motivo opcional de até 500 caracteres e resposta. A mesma ação atende agenda e portal de voluntariado. Reenvio preserva a resposta original. A liderança pode preencher a vaga ou devolver a atribuição; o membro não se reinscreve automaticamente.

## Eventos

Triggers no banco cobrem mensagens de ministério/voluntariado/Kids; pedidos e decisões de participação em ministérios, voluntariado e células; publicação/mudanças/ausências/trocas de escala; inscrições e alterações/cancelamentos de eventos publicados; respostas de formulário; ocorrências/retirada/equipe Kids; tarefas/execuções com intervenção; pedidos/respostas de oração e comunicados; falhas definitivas de envios e integrações. As gravações de APIs e workers usam os mesmos triggers. Edições comuns de cadastro não geram eventos.

Somente administração e liderança responsável recebem chat, excluindo o autor. Os papéis acumulados são considerados. A caixa e o worker revalidam igreja, destinatário e acesso atual à origem. Conteúdo de Kids, oração e financeiro usa texto genérico no push. Assuntos Kids e cancelamentos têm uma tela autenticada própria quando o destinatário não pode entrar no dashboard.

## API e atualização

- `GET /api/v1/notifications/inbox`: `module`, `unread`, `cursor`; retorna itens, contador exato, próximo cursor e limite `through`.
- `POST /api/v1/notifications/inbox`: `{action:'read',id}` ou `{action:'read-all',through}`. Exige sessão e verifica a origem; o limite protege avisos chegados depois da listagem.
- `GET /api/v1/member/ministries/:id/details`: detalhes e agenda paginada, identificador real da atribuição, resposta pessoal e elegibilidade para ausência.

O sininho não marca a lista ao abrir. Realtime, reconexão, foco e consulta a cada 30 segundos enquanto a página está visível recuperam mudanças. A leitura é persistente e compartilhada entre sessões. O cadastro push exige ativação explícita do dispositivo e reutiliza VAPID, preferências e inscrições existentes.

## Worker

`POST /api/internal/notifications/dispatch`, autenticado pelo segredo do worker, processa campanhas e caixa pessoal independentemente. A fila tem deduplicação por aviso/dispositivo, lease recuperável, concorrência limitada, retentativas com espera crescente e desativação em HTTP 404/410. O banco bloqueia o enfileiramento antigo de novas mensagens para impedir push duplicado; filas anteriores podem terminar seu processamento.

Comunicados agendados são verificados em cada execução. Tarefas, receitas e despesas pendentes vencidas são detectadas uma vez por dia e deduplicadas por pendência/vencimento, no fuso da igreja (padrão `America/Sao_Paulo`). O cron existente pode chamar o endpoint; `scripts/setup-notification-cron.mjs --apply` valida configuração e agenda uma execução por minuto sem expor o segredo.

## Evidências e limites

`tests/notification-inbox-database.test.mjs` aplica as migrations reais em PostgreSQL isolado e testa escopo, eventos, ausência, rollback, leitura, paginação, revogação e fila com provedor simulado. `tests/e2e/notification-inbox-pilot.mjs` exige igreja com status `test`, sem automações nem dispositivos push ativos; usa sessões reais e remove dados fictícios no `finally`. Testa modal, ausência/reload, destinatários, chat, leitura/link, celular/desktop, temas, teclado, perda do Realtime e concorrência com substituição.

Build, fila processada e aceitação pelo provedor não comprovam recebimento físico. A confirmação em um dispositivo real ativado é uma validação separada.

### Entrega validada em 09/10/2026

- 33 testes focados aprovados; TypeScript, lint, diff check e build aprovados.
- Piloto com banco/sessões reais passou localmente e em https://altarchurch.com.br: ausência confirmada com justificativa, persistência, destinatários exatos, chat/sininho/leitura/link, celular/desktop, temas, teclado, recuperação sem Realtime e concorrência. Papéis acumulados membro/admin também foram confirmados na versão publicada, restaurando o perfil de teste ao final.
- Três migrations aplicadas e checksums conferidos; RLS/SELECT próprio e publicação Realtime verificados. Deployment final: dpl_AfJAYX6u1pzxdaz7PbqhmNaqMGcx (READY, produção).
- Worker dedicado a cada minuto ativo; respostas HTTP 200 do cron e dispatch verificadas; fila pessoal vazia na conferência final. Dados fictícios, avisos, auditoria, vínculos e aliases de teste removidos.
- Pendente exclusivamente a confirmação de recebimento do novo push em dispositivo físico explicitamente ativado; o piloto não cadastrou dispositivos nem disparou avisos fictícios a pessoas reais.
