# Voluntariado: gestão e portal simplificados

## Navegação

- Gestão: Escalas, Equipes, Voluntários e Comunicados. Relatórios e Configurações são acessos secundários.
- Escalas: lista mensal cronológica, calendário opcional e um único painel para planejar, escolher pessoas, publicar e acompanhar trocas.
- Portal: Minhas escalas, Disponibilidade e Comunicados. Confirmação em destaque; roteiro, conversa, troca e presença dentro da escala.
- `area`, `month`, `view` e `scale` preservam o contexto na URL. A troca de mês na gestão recarrega os dados do servidor.

## Contratos preservados e ajustes

- Sem novas tabelas, migrações ou provedores. Eventos, programações, funções, modelos, permissões e histórico existentes continuam sendo usados.
- `generateSmartVolunteerSchedule(scheduleId, eventId?)` aceita um evento opcional. O painel passa o evento aberto; sugestões não substituem escolhas, recusas ou remoções manuais.
- `saveVolunteerProgramming` retorna o primeiro `eventId` materializado para abrir a montagem após salvar.
- `reviewVolunteerSwap(swapId, approve, replacementVolunteerId?)` permite ao gestor escolher um substituto elegível. A escolha manual não equivale à confirmação do voluntário: o ajuste precisa ser publicado e respondido.
- Publicação, fila de envio, entrega e confirmação têm indicadores separados. O resumo não expõe telefones, endereços ou erros brutos do provedor.
- Rascunhos não aparecem no portal e não podem ser confirmados antecipadamente.

## Prévia local

Com Node 24, iniciar `npm run dev -- --hostname 127.0.0.1 --port 3107`.

- Gestão: `/dev/voluntariado?month=2026-09`
- Voluntário: `/dev/voluntariado?mode=volunteer`
- Primeiro acesso: `/dev/voluntariado?empty=1&month=2026-09`

Usa os componentes reais com dados fictícios. As ações do cliente são interceptadas nessa rota antes de chamar o servidor; não há gravações ou envios. A rota responde 404 quando `NODE_ENV` não é `development`.

## Validação

- Testes de regras e regressão: arquivos `volunteer-*.test.*`, `p9-volunteers.test.mjs` e `p10-volunteers-v2.test.mjs`.
- Prévia: `npx playwright test --config=playwright.volunteers-preview.config.ts`. Configuração separada dos testes autenticados, sem setup de usuários ou banco remoto. Cobertura em 1280 px e 390 px.
- Verificar TypeScript, lint dos arquivos alterados e build com Node 24.
- O lint geral ainda contém erros em outros módulos. Não confundir esses erros com o resultado do lint do voluntariado.

A prévia comprova renderização e navegação; não comprova gravações autenticadas, recebimento em WhatsApp/e-mail, câmera física ou produção. Esses fluxos precisam de validação em ambiente de teste antes da publicação.
