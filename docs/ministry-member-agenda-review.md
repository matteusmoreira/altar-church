# Revisão: agenda de ministérios no Portal do Membro

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
