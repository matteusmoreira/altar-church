# Incidente: comunicação de ministério não enviada

Data: 2026-08-11

## Sintoma

A campanha `teste de comunicação`, do ministério `232f976e-c0e0-4788-9060-d721181d824a`, permaneceu como `queued` e o WhatsApp não chegou ao destinatário.

## Evidência de produção

- Campanha: `11351fc7-6e16-4d67-8ff1-d34b3f69209f`.
- Entrega: `9a9af933-bbf0-48eb-a25a-24b7146f3f6a`.
- Estado da entrega: `pending`, zero tentativas, sem `provider_id` e sem erro.
- A credencial Uazapi da igreja existe.
- Os crons ativos processam a Edge Function genérica de integrações e o worker de voluntariado, mas nenhum deles consome `notification_deliveries`.
- O destinatário foi persistido como `22999021889`; a Uazapi exige formato internacional, como `5522999021889`.

## Causa raiz

A criação da comunicação apenas gravava a outbox. Não havia disparo imediato do worker nem cron de produção apontando para o dispatch integrado da aplicação. Assim, a Uazapi nunca era chamada.

## Correção

1. Normalizar o número no limite da Uazapi usando `toUazapiNumber`.
2. Agendar o processamento da outbox após a resposta da Server Action.
3. Expor na tela o status em português e o acesso ao detalhe das entregas/erros.
4. Apontar o cron `integration-delivery-dispatch-every-2-minutes` para `https://altarchurch.com.br/api/internal/integrations/dispatch` depois de publicar o código corrigido.

## Gate externo

O item 4 e o reprocessamento da entrega original alteram produção. Executar somente depois do deploy da correção de normalização, para não enviar o número local sem DDI.

Sequência preparada:

1. Publicar o código validado.
2. Executar `node scripts/apply-integration-cron.mjs --url=https://altarchurch.com.br/api/internal/integrations/dispatch`.
3. Confirmar que o cron chama o dispatch integrado a cada dois minutos.
4. Reprocessar a entrega original uma única vez.
5. Confirmar no banco `attempts`, `provider_id`, `response_status` e `sent_at`.
6. Manter a confirmação no aparelho como gate físico separado.

## Validação local

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: 225 testes principais e suítes adicionais passaram.
- `npm run build`: passou; 150 páginas geradas.
- `git diff --check`: passou.
