# Revisão: agenda de ministérios no Portal do Membro

## Atualização — 06/10/2026

- Botão com ícone de informações abre um modal responsivo com descrição completa, horário, local, links, participantes e escala publicada. Funções, instruções, horários e pessoas escaladas ficam visíveis, com destaque para a própria função. Escalas em rascunho permanecem ocultas.
- Capacidade zero é apresentada como sem limite, eliminando o indicador `0/0`.
- Líderes e coordenadores ativos abrem a mesma gestão de ministério do administrador em `/membro/ministerios/[id]`, inicialmente em Configurações. A autorização continua restrita ao ministério vinculado; responsável principal e controles administrativos mantêm suas permissões existentes.
- O formulário reduzido e sua ação de servidor foram substituídos pela gestão existente. A navegação permanece no portal após salvar ou voltar.
- RSVP prioriza a inscrição ativa quando há histórico cancelado; a leitura da agenda seleciona uma única inscrição própria, evitando cartões e contagens duplicados. Falhas de conexão na ação exibem feedback.

Validação desta atualização:

- 21 testes focados passaram, incluindo PostgreSQL PGlite isolado para escala, instruções, rascunhos, confirmação idempotente, capacidade, espera, promoção, cancelamento, reconfirmação e isolamento de acesso.
- TypeScript, lint dos arquivos alterados e build de produção passaram.
- Consulta real da agenda e confirmação/cancelamento no banco remoto passaram em transação integralmente revertida, sem persistir presença ou automação.
- Playwright autenticado em tenant `status='test'`: agenda em 360 px, confirmação/cancelamento/reconfirmação e persistência após reload passaram; os dois perfis de líder abriram Configurações, Agenda e Escalas na nova rota. Fixtures de evento e ministério são temporários e removidos após os testes.
- Nenhuma migration necessária. A aplicação ainda precisa ser publicada para refletir esta atualização no site.

## História

O administrador cria uma atividade na Agenda de um Ministério. A ocorrência materializada deve aparecer apenas para membros ativos desse ministério, com descrição, data, local, pessoas confirmadas e ação para confirmar ou cancelar a própria presença.

## Falhas encontradas

- O estado `activityForm.description` já era enviado ao servidor, mas o formulário não oferecia um campo para preencher a descrição.
- Ocorrências materializadas de programações de ministério mantinham `events.registration_enabled = false`, bloqueando o RSVP no portal.
- A consulta do portal retornava apenas a quantidade de confirmações, sem os nomes.
- A ação de RSVP validava igreja e evento, mas não repetia no servidor a autorização de membro ativo do ministério.

## Correção

- Expor e exibir a descrição na gestão da agenda.
- Permitir editar a atividade/programação já existente para preencher a descrição ausente sem recriar a agenda.
- Atualizar também título, descrição, tipo e local de ocorrências com escala já publicada, sem alterar datas ou a escala existente.
- Ativar RSVP automaticamente somente em eventos materializados de ministério e corrigir ocorrências futuras já existentes.
- Retornar e renderizar os nomes dos membros confirmados.
- Exigir vínculo ativo com o ministério na ação de confirmação.

## Validação

- `node --test tests/member-portal.test.mjs tests/ministries-v2.test.mjs`: 13/13.
- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm test`: 225 testes-base e 21 testes auxiliares passaram.
- `npm run build`: build Next.js de produção passou, incluindo `/membro/agenda` e `/ministerios/[id]`.
- Playwright autenticado, Chrome desktop, fluxo de páginas do membro incluindo `/membro/agenda`: 1/1 passou.
- `git diff --check`: passou.
- Banco remoto `zsldqioutjxchgmmwtfi`: migration `20260811150000` aplicada e alinhada com o histórico local.
- `supabase db lint --level error --fail-on error`: zero erros.
- Prova SQL remota: migration, função e trigger presentes; zero eventos materializados de ministério com RSVP pendente.

## Gate externo restante

- Banco remoto: GO.
- A nova interface e as validações de servidor ainda exigem publicar a aplicação para aparecerem no ambiente online.
