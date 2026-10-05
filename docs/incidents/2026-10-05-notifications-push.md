# Notificações e push — 05/10/2026

## Diagnóstico confirmado

- `notification_deliveries` tinha uma entrega WhatsApp de 11/08/2026 pendente, com zero tentativas. O cron de integrações chama uma Edge Function que não processa campanhas.
- O endpoint publicado `https://altarchurch.com.br/api/internal/notifications/dispatch` retorna HTTP 500, `Worker de notificações não configurado`, inclusive com um segredo inválido; o backend não tem o segredo exigido por essa versão.
- Zero dispositivos em `notification_push_subscriptions`. O único dispositivo ativo em `volunteer_push_subscriptions` está vinculado a uma pessoa excluída; não foi reaproveitado nem houve restauração da pessoa.
- Token local Vercel: HTTP 403. Conector Vercel: reautenticação necessária. A publicação está bloqueada por acesso, não concluída.

## Correções

- Ativação de push em Notificação e nas preferências do membro, com chave pública obtida do backend, suporte a cadastro existente, mudança de chave, permissão bloqueada e navegadores incompatíveis.
- Inscrições feitas pelo voluntariado também são cadastradas para campanhas quando a pessoa está ativa. Nenhum dispositivo de pessoa excluída é inscrito por essa sincronização.
- Formulários exibem resultados/erros e a criação bem-sucedida abre os detalhes. Páginas atualizam a fila a cada 15 segundos enquanto há envios abertos.
- Criação e reenvio disparam processamento após a resposta, limitado à campanha e à igreja. Agendamento usa o fuso da igreja. Reenvio zera tentativas; campanhas canceladas/excluídas não são reativadas.
- Claim recupera processamento interrompido após 15 minutos, respeita agenda, campanha, tenant e cancelamentos. Apenas o worker pode executar a função.
- Push tem timeout de 15 segundos e TTL de um dia; respostas 404/410 desativam endpoints inválidos. A preferência de bloqueio é reconferida antes do envio.
- Service worker aceita mensagens de texto e utiliza ícones existentes.
- Endpoint de notificações separado de envios de formulários; diagnóstico autenticado GET/`dryRun` consulta a fila sem consumir mensagens.

## Banco e mensagem autorizada

Aplicadas somente as migrations `20261005185046_notification_push_queue_recovery` e `20261005185525_notification_worker_execute_permissions`, em transações, com registro e checksum. Verificados `anon_can_claim=false`, `authenticated_can_claim=false`, `worker_can_claim=true`.

O usuário autorizou expressamente o envio da mensagem antiga. A execução do worker local foi limitada a essa campanha: `processed=1`, `sent=0`, `failed=1`. A entrega tem uma tentativa e erro `Igreja sem instância Uazapi conectada`, sem identificador do provedor ou comprovante de envio. As instâncias existentes estão inativas. Não houve envio ao destinatário.

## Conclusão operacional pendente

1. Restabelecer acesso à Vercel e publicar as alterações de notificações com as três variáveis VAPID já existentes e segredo do worker. Não regenerar o par VAPID.
2. Definir `NOTIFICATIONS_DISPATCH_URL=https://altarchurch.com.br/api/internal/notifications/dispatch` e executar `scripts/setup-notification-cron.mjs` com ambiente local carregado. Sem `--apply`, ele apenas verifica `dryRun` e `pushConfigured`; com `--apply`, instala o cron de minuto usando Vault. O cron só é instalado após diagnóstico positivo.
3. Ativar/conectar a instância correta da igreja em Configurações antes de reenviar o WhatsApp autorizado; não reativar instâncias antigas automaticamente.
4. Um destinatário ativo deve autorizar push no próprio aparelho. Testes com provedor simulado e um build não comprovam o recebimento físico.

## Validação

Seis testes isolados em PGlite/provedor simulado passaram: recuperação/escopo/agenda/cancelamento/permissões; reenvio após esgotamento; entrega push/TTL/timeout/opt-out/expiração; service worker com conteúdo não JSON; cadastro de dispositivos exige pessoa ativa no tenant autenticado; diagnóstico exige autenticação e não dispara entregas. TypeScript, lint dos arquivos de notificações e build de produção com Node 24/Turbopack passaram, usando cópia temporária isolada para preservar os servidores de outras sessões. O backend compilado respondeu 401 sem segredo válido e 200 no GET autenticado, com dryRun=true, pushConfigured=true e a mesma entrega WhatsApp em failed. Nenhuma mensagem de teste foi enviada aos membros.
