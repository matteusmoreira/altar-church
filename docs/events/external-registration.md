# Inscrições externas de eventos

Na etapa Inscrições e divulgação, escolher **No Altar Church** ou **Em plataforma externa**. A segunda opção pede plataforma (Sympla por padrão) e link HTTPS dos ingressos. O endereço da transmissão continua independente.

A página pública, os detalhes e o portal oferecem **Comprar ingressos no Sympla**, em nova aba. Valor zero nessa modalidade significa valor não informado: a interface apresenta **Consulte os valores no Sympla**. Valores positivos são referência; disponibilidade, condições, inscrição e conferência dos ingressos pertencem à plataforma externa.

## Regras

- As ações do servidor bloqueiam inscrição de membro, visitante e recepção, emissão/recuperação de comprovante, abertura de sessão e entrada por QR ou manual em eventos externos.
- Editar evento continua exigindo a permissão existente. Equipe e escala reutilizam o Voluntariado e suas permissões independentes.
- A conversão interna → externa bloqueia o mesmo evento usado pelas transações de inscrição. Inscrições confirmadas/em espera ou qualquer sessão ainda aberta impedem a mudança, com mensagem acionável. Registros cancelados e presenças anteriores são preservados.
- Não há contadores presumidos de vendas/vagas externas, importação de compradores, integração automática ou processamento de pagamentos.
- Duplicação preserva modalidade, plataforma, endereço e valor, criando rascunho. Ocorrências materializadas posteriormente herdam os dados externos do evento de origem.

## Banco e verificação

A migração aditiva `20261009192419_event_external_registration.sql` acrescenta três campos no evento existente, restrições e triggers. Foi aplicada isoladamente ao banco configurado e registrada com checksum. Eventos anteriores permanecem internos.

34 testes focados passaram: eventos, migração em PostgreSQL isolado, capacidade/espera/promoção, check-in, portal e agendamento de voluntários. Incluem validação HTTPS, preços externos, impedimento de conversão com participantes/sessões, preservação de histórico, recorrência e bloqueio das ações internas mesmo diante de sinalização antiga de inscrições habilitadas. ESLint focado e build de produção com TypeScript passaram.

O roteiro `tests/e2e/events-professional-pilot.mjs` inclui criação, publicação, edição presencial/online, duplicação/cancelamento, links públicos e do portal em celular, escala externa publicada no portal e tentativa de conversão com inscrições ativas. Usa exclusivamente a igreja de teste, sem automações ativas; remove os dados fictícios e arquivos ao terminar. Não realiza compra no Sympla nem dispara canais reais.

Aplicação ainda não publicada. O fluxo de compra/conferência dentro da plataforma externa pertence ao organizador; esta entrega verifica o encaminhamento por link.
