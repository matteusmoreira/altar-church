# Gestão dos ministérios — 08/10/2026

## Comportamento entregue

- Visão geral com quatro indicadores clicáveis, prioridades com ações específicas, próximas atividades, gráfico de presença por atividade e resumo das equipes.
- Aba, buscas, filtros e identificadores de atividade/equipe/pessoa/caso persistidos na URL. Os atalhos abrem os formulários nas abas correspondentes.
- Detalhes do integrante carregam histórico do ministério sob demanda, incluindo funções, presença e acompanhamentos autorizados.
- Cópia de até 100 escalas de origem recentes, incluindo as históricas, para um destino sem estrutura. Copia funções, instruções e integrantes elegíveis em transação, sempre como rascunho. Pessoas omitidas aparecem em aviso. Meses já publicados permanecem bloqueados, seguindo a regra do gerador existente e evitando expor rascunhos no painel de membros.
- Gestão de acompanhamentos com responsável, prazo no fuso da igreja, próxima ação, prioridade e situação. A pessoa do caso permanece fixa durante a edição para preservar referências do histórico.
- Comunicação apresenta público, canal, destinatários, envios, confirmações de entrega, falhas e pendências quando os registros existem. Não transforma envio ao provedor em prova de recebimento.
- Chat abre mensagens fixadas no histórico e oferece acesso à primeira mensagem não lida registrada ao abrir a conversa.
- Relatórios são carregados sob demanda, com períodos de 30/90 dias ou personalizado. Exportações usam os mesmos limites e permitem liderança autorizada. Indicadores atuais ficam separados dos resultados do período.
- “Presença entre registros” usa presentes / (presentes + ausentes + justificativas); nenhuma presença registrada aparece como ausência de dados. Horas são previstas nos turnos; o percentual de integrantes com mais de 30 dias de vínculo não representa retenção histórica.

## Banco e compatibilidade

A migration `20261008210000_ministry_management_followups.sql` acrescenta `next_action` nullable e uma política restritiva para casos com `ministry_id`. O código anterior continua compatível com a coluna adicional; a leitura dos casos do ministério passa a exigir gestão, inclusive pela Data API. Casos gerais sem ministério mantêm as políticas anteriores.

A migration foi aplicada isoladamente no banco configurado e verificada pelo script abaixo. Nenhuma migration alheia foi aplicada.

```powershell
npx --yes --package=node@24 node --env-file=.env.local scripts/verify-ministry-management.mjs
```

## Validação

- Typecheck, lint dos arquivos alterados e build de produção com Node 24.
- 13 testes relevantes, incluindo consultas reais em PGlite, permissões de administrador/líder/coordenador, bloqueios de membros e outros ministérios, RLS, rollback da cópia, integrantes inativos, prazos e relatórios por período.
- Interface real com dados fictícios e ações simuladas em desktop/celular, claro/escuro: quatro cenários passaram, com navegação por teclado, filtros na URL, ausência de overflow e recuperação dos formulários.
- Dois testes E2E autenticados com Supabase e banco reais, exclusivamente na igreja `status='test'` das contas E2E: cópia e publicação, criação/início/conclusão de acompanhamento, exportação por período e acesso do líder pelo portal no celular; navegação até a primeira mensagem não lida e uma mensagem fixada fora das 50 mensagens inicialmente carregadas. Dados dos testes removidos ao final.
- Regressões da interface existente passaram em desktop e celular, incluindo abas, listas, grades, filtros e formulários. Regressões do chat também passaram. Não houve envio de campanhas a pessoas reais nem validação de recebimento físico de notificações.

```powershell
npx --yes --package=node@24 node --test --test-concurrency=1 tests/ministry-management-database.test.mjs tests/ministries-v2.test.mjs tests/ministry-scale-profile.test.mjs tests/ministry-chat-database.test.mjs tests/ministry-chat.test.ts
npx --yes --package=node@24 node tests/e2e/ministry-management-isolated.mjs
# Com servidor local de produção na porta 3191:
npx --yes --package=node@24 node --env-file=.env.local scripts/run-ministry-management-e2e.mjs
```

O runner determina a igreja pela conta E2E administrativa identificada e verifica `status='test'`; não seleciona a primeira igreja do banco. As credenciais vêm somente do ambiente local. Capturas com dados fictícios ficam em `artifacts/ministry-management/`.

Commit, push e publicação do código em produção não fazem parte desta entrega.
