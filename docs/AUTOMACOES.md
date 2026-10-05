# Automações do Altar Church

## Cadastro pelo WhatsApp — 05/10/2026

O modelo pronto **Cadastro pelo WhatsApp** inicia com a mensagem exata `cadastro`, ignorando maiúsculas e espaços nas pontas. Selecione uma instância conectada no início, nas perguntas e na confirmação antes de publicar. A opção **Permitir contatos ainda não cadastrados** exige palavra-chave e não aceita filtros de pessoas; ela começa desativada em novos gatilhos comuns. Fluxos antigos sem palavra-chave continuam aceitando qualquer mensagem de uma pessoa identificada.

Cada bloco **Perguntar e salvar resposta** configura texto, tipo (texto, nome completo, e-mail ou congregação), variável `cadastro_*`, mensagem de correção e prazo em minutos (padrão: 1440). Conecte resposta válida, prazo vencido e erro. As respostas são persistidas separadamente; respostas inválidas repetem a pergunta. As congregações ativas da igreja são consultadas ao perguntar: até três geram botões, acima de três geram lista, e acima de dez há páginas. Uma recusa HTTP 400 do formato interativo usa opções numeradas em texto; navegue digitando “próxima” ou “anterior”. A seleção fica vinculada às opções enviadas e é revalidada antes de cadastrar.

O bloco **Cadastrar pessoa** vincula as variáveis de nome, e-mail e congregação, usa o WhatsApp privado da conversa e permite editar a senha inicial mascarada (padrão `@mudar123`). Cria pessoa ativa e acesso de membro; para pessoa já identificada pelo WhatsApp, completa apenas dados faltantes e preserva o acesso e sua senha. E-mail/WhatsApp conflitante, cadastro ambíguo, pessoa inativa e congregação indisponível não criam nem adotam outro acesso.

O registro interno por execução/bloco não guarda senha e é acessível apenas pelo servidor. Se Auth não confirmar a criação, a execução fica em revisão. Em **Execuções**, abra o registro e use **Reconciliar cadastro**: a retomada só é agendada quando a identidade estiver comprovadamente vinculada ao registro interno; a conta nunca é adotada apenas pelo e-mail. Não é possível excluir um fluxo com criação de acesso ainda pendente de reconciliação.

**Testar automação** permite escolher **Contato novo (simulado)** e completar as perguntas sem criar usuários. A confirmação é um bloco WhatsApp comum e editável. Um envio de teste exige clique explícito e usa somente o número privado informado, nunca o contato da conversa simulada.

Migration `20261005195628_automation_whatsapp_registration.sql` validada em PostgreSQL isolado (PGlite) e aplicada no projeto vinculado em 05/10/2026 durante a preparação da fila. A aplicação atualizada ainda precisa de publicação. Login no provedor e recebimento de botões/listas em aparelhos reais precisam de homologação após a publicação.

Implementação em 05/10/2026. A migration foi aplicada no banco configurado do projeto após autorização do usuário; a ativação de envios depende da homologação abaixo. Nenhum fluxo é criado/publicado automaticamente pela migration.

## Entrega

- `/automacoes`: Fluxos, Modelos prontos, Execuções, Tarefas, Configurações e Histórico arquivado.
- Editor React Flow com biblioteca, configuração, conexões por clique/toque, arraste por Pointer Events, duplicação, exclusão, desfazer/refazer, zoom, busca/localização de blocos, organização Dagre e salvamento automático de rascunhos.
- Contrato versionado e validação de publicação: campos, saídas, variáveis, ciclos, permissões e dependências. Revisão de público e prévia de mensagens separadas de teste/publicação.
- Modelos para célula semanal, aniversário, sete dias após batismo, convite para célula, visitantes, ausências, eventos e escalas. Instância/responsáveis precisam ser configurados.
- O convite cria listas paginadas a partir das células atuais (até 45 no rascunho inicial), com interesse e aviso separados por célula. Havendo mais células, ampliar o rascunho ou encaminhar a seleção à equipe. O modelo semanal começa somente com participantes de célula; seus filtros podem ser editados.
- Envios privados e para grupo vinculado, texto/mídia/botões/listas/carrosséis usando os contratos existentes. Respostas entram no fluxo pela espera de resposta e decisões/múltiplos caminhos.
- IA central no backend: gerar rascunho, escrever, classificar, extrair valores ou conversar em privado. Somente modelos autorizados, reserva de orçamento no banco e nenhuma troca automática de modelo.
- Atendimento humano no WhatsApp: tarefa, aviso ao responsável, suspensão da conversa e liberação explícita. Envio humano detectado pelo webhook suspende a automação.
- Participação no discipulado por pessoa: inscrição e conclusão de etapas no módulo Discipulado, com gatilhos transacionais.
- `baptism_date` no cadastro; pessoas anteriormente marcadas como batizadas permanecem sem data até preenchimento explícito.
- Follow-up e Trilhas deixam de ter interfaces/inscrição automática. Rotas antigas redirecionam para o arquivo. Tabelas compartilhadas e linha do tempo permanecem; as APIs de regras/trilhas antigas recusam alterações.

## Arquitetura e comportamento

O estado reside no PostgreSQL/Supabase, com RLS, auditoria e eventos gravados na mesma transação do módulo de origem. Cada execução aponta para uma versão publicada imutável. `claim_automation_runs` usa bloqueio/lease de cinco minutos e `SKIP LOCKED`; uma chamada processa até 25 etapas dentro de 45 segundos. Esperas persistem `due_at`, sem processo aberto. O worker é acionado a cada minuto por `pg_cron`, passa pela Edge Function `automation-worker` e executa o motor na rota Node.js protegida por segredo. Essa ponte permite reutilizar banco, arquivos, autorização e contratos da aplicação sem duplicar o motor no Deno.

Pausar bloqueia novos inícios, processamento e próximos envios; retomar preserva a versão das execuções existentes. Arquivar cancela pendências. Entregas incertas são mantidas para revisão, sem reenvio automático. Os estados distinguem aceitação pela API, envio, entrega e leitura. Recibos individuais de participantes do grupo são armazenados separadamente e não comprovam que todos leram.

Datas/agenda usam o fuso da igreja (inicialmente `America/Sao_Paulo`), envios proativos de 08h a 20h e aniversário de 29/02 em 28/02 nos anos comuns. O público é consultado novamente antes do envio. `SAIR`/`PARAR` interrompem conversas/envios; em grupo, o descadastro pertence ao remetente, não ao grupo inteiro. Contatos desconhecidos ou ambíguos não iniciam fluxos pessoais. Em grupos, respostas exigem autor identificado e participante ativo da célula.

Eventos de Kids são direcionados ao responsável com autorização de comunicação vigente, novamente verificada antes do envio. Dados privados de oração, Kids e finanças não entram no contexto da IA. Fluxos financeiros só permitem tarefas e avisos internos, sem alteração financeira. Alteração de cadastro utiliza lista explícita de campos e valida telefone/email no servidor.

Integrações de formulário, visita à célula e escalas/lembretes do voluntariado mantêm sua operação por padrão. Publicação de fluxo equivalente exige selecionar a responsabilidade do envio. Ao transferir, a finalidade inteira daquela igreja passa a um único fluxo, inclusive durante sua pausa. Arquivar libera a finalidade para a integração anterior. Email/push do voluntariado são preservados.

## Configuração de homologação

1. Usar banco/tenant de teste com destinatários autorizados e instância Uazapi de teste. Revisar backup e contagem dos registros antigos antes de aplicar `20261005140000_automations.sql`, pois ela arquiva/desativa as regras antigas em todas as igrejas daquele banco. O teste PGlite valida o SQL isoladamente e não substitui essa homologação.
2. Disponibilizar aplicação e `volunteer-delivery-worker` atualizados na mesma entrega; aplicar a migration antes de expor as telas novas.
3. Implantar a função `automation-worker`. `supabase/config.toml` desativa a verificação JWT apenas nessa função; o segredo dedicado é obrigatório.
4. Configurar, sem imprimir valores:
   - Aplicação: `AUTOMATION_WORKER_SECRET` e `APP_URL` canônica HTTPS. Cadastre a chave central no painel `/admin`, aba **OpenRouter / IA**; `OPENROUTER_API_KEY` continua como alternativa quando nenhuma chave foi cadastrada no painel.
   - Edge Function: `AUTOMATION_WORKER_SECRET` com o mesmo valor e `AUTOMATION_DISPATCH_URL` apontando para `https://<app>/api/internal/automations/dispatch`.
   - Supabase Vault: `automation_worker_url` apontando para `https://<project>.supabase.co/functions/v1/automation-worker` e `automation_worker_secret` com o mesmo segredo.
5. Confirmar `pg_cron`, `pg_net`, Vault e o job `automation-worker-minute`, com execução bem-sucedida. Se `pg_cron` não estiver instalado, a migration não cria o job; habilitar a extensão e cadastrar o agendamento durante a configuração de homologação.
6. Na aba **OpenRouter / IA** do painel `/admin`, o superadmin cadastra/substitui a chave central, seleciona a igreja e salva os modelos autorizados e seu orçamento mensal em US$. O catálogo lista somente modelos compatíveis com respostas estruturadas. A chave cadastrada fica no Supabase Vault (`altar_church_openrouter_api_key`), tem prioridade sobre a variável de ambiente e nunca é devolvida ao navegador. Não é necessário reiniciar a aplicação ao substituir a chave. A igreja configura horários, contexto público, instâncias e grupos em `/automacoes?tab=Configurações`.
7. Conectar o webhook adicional pela interface. Isso preserva os webhooks existentes. Se houver timeout na configuração, revisar os webhooks da instância antes de repetir. Tratar URLs do webhook como credenciais e evitar logs com seu caminho/segredo.
8. Criar rascunhos, revisar configurações e público, publicar explicitamente e testar com destinatário controlado em igreja cujo `status` é `test`. Nenhuma publicação de rascunho por IA ocorre sozinha.

Referências de contrato: [Uazapi](https://docs.uazapi.com/llms.txt), [recibos](https://docs.uazapi.com/reference/webhooks/messages_update.md), [OpenRouter](https://openrouter.ai/docs/guides/features/structured-outputs).

## Evidência local e pendências externas

Banco configurado verificado em 05/10/2026: 89/89 migrations, sem deriva dos arquivos já aplicados; `20261005140000_automations.sql` aplicada em transação. Backup local ignorado no Git dos seis conjuntos legados; 84 registros arquivados e os registros de origem mantidos. As 19 tabelas novas têm RLS. Cadastro fictício no tenant de teste gerou `person.created` na mesma transação, integralmente revertida. Não foram criados fluxos, execuções ou entregas. Cron `automation-worker-minute` ativo a cada minuto; URL/segredo no Vault ainda não configurados, portanto o motor não é invocado externamente.

Os testes de automações executam a migration e o código real do motor em PostgreSQL isolado (PGlite), com HTTP simulado. Validam arquivo, eventos de gravações reais dos módulos, rollback, tenant/RLS, leases, orçamento/modelos, espera persistente, saída da célula antes do envio, sete dias após batismo/sem data, aniversário, recorrência/deduplicação, respostas, descadastro, humano e entrega ambígua sem reenvio. IA é verificada sem chamadas pagas: sem autorização/orçamento, sem crédito, saída inválida, reconciliação de custo e remoção de contexto privado.

`npm run test:automations`, typecheck, lint e build são verificações locais. A suíte ampla local evita quatro arquivos que carregam credenciais de `.env.local` e escrevem em banco real; a suíte de ministérios também pula seu caso externo sem `POSTGRES_URL`. A prévia fictícia `/dev/automacoes` permite verificar editor/abas/duplicação/desfazer/refazer/simulação no desktop e por toque. Ela não grava nem envia e fica indisponível em produção, exceto quando `E2E_AUTOMATIONS_PREVIEW=1` é definido expressamente para E2E.

Ainda exigem prova em homologação: reinício e concorrência com execuções pendentes, webhooks públicos, formatos interativos/mídias em aparelhos, grupos e recibos, resposta humana na instância, conexão desconectada, consumo real OpenRouter e autorização de dados sensíveis. Ativação para membros reais somente após essa validação e revisão/publicação explícitas dos fluxos.

## Configuração do worker — atualização em 05/10/2026

Após autorização, `automation_worker_url` e `automation_worker_secret` foram configurados no Vault do projeto correto, sem imprimir ou versionar o segredo. O cron está pausado até concluir a publicação da Edge Function e configurar o mesmo segredo no backend da aplicação. Os tokens locais Vercel/Supabase retornaram HTTP 403; o conector Vercel exige reautenticação e o conector Supabase disponível aponta para outro projeto. Retomar com acessos válidos para publicação de funções/segredos no Supabase e variáveis/deploy no Vercel, reaproveitando o segredo do Vault em memória. Validar a chamada autenticada e o cron antes de reativar o job. Nenhum fluxo está publicado.

Atualização após novo acesso Vercel: `AUTOMATION_WORKER_SECRET` configurado como variável sensível somente em produção, reaproveitando o segredo do Vault em memória; `APP_URL=https://altarchurch.com.br`. Republicação do mesmo commit `870cb75` solicitada. A rota pública retornou 401 sem segredo e 200 com o segredo correto, `processed: 0`, mantendo zero entregas. O novo plugin Supabase está instalado, mas retorna `USER_NOT_LOGGED_IN`; a publicação da Edge Function e seus segredos permanecem pendentes. A Service Role e a senha do banco não substituem acesso à Management API.
### Confirmação do deploy do worker — 05/10/2026

O redeploy de produção `dpl_jajDQggyGDicJrzKvfjcVJYw39mb`, vinculado ao commit `870cb75dada4d8607edc87ca098512d6dfb037bb`, foi confirmado como `READY`. O teste direto do backend retornou zero etapas e zero envios.

### Configuração concluída após conexão do Supabase — 05/10/2026

O plugin confirmou o projeto `zsldqioutjxchgmmwtfi` (Altar Church, `ACTIVE_HEALTHY`). A Edge Function `automation-worker`, versão 1, foi publicada com autenticação pelo segredo dedicado. Seus dois segredos foram configurados no painel autenticado, sem registrar os valores em arquivos ou saídas. O segredo foi transferido do Vault em memória, preservando o mesmo valor da aplicação.

A função rejeitou chamadas sem segredo ou com segredo incorreto (401) e aceitou a chamada correta (200, `processed: 0`). A invocação pelo PostgreSQL/`pg_net` também retornou 200, sem timeout ou erro, com zero etapas. O job `automation-worker-minute` foi reativado para `* * * * *`; a execução agendada às 16:54 UTC foi confirmada como `succeeded`, com respostas HTTP 200. Nenhum fluxo está ativo e a contagem de entregas permanece zero; essa configuração não comprova envio real pela Uazapi nem consumo OpenRouter.


## Formulários, Kanban e teste de rascunhos — 05/10/2026

- Em **Início → Evento do sistema → Formulário enviado**, selecione o formulário. Ele precisa criar/vincular pessoa (`create_person`) ou criar conta após o envio. A publicação valida essa configuração. O gatilho reage somente à inserção da resposta, leva os IDs do formulário/resposta/card ao fluxo e não repete ao editar a resposta.
- Novos fluxos e republicações exigem um formulário específico. Versões antigas continuam interpretadas como antes. A responsabilidade pelo envio direto é transferida somente para o formulário selecionado; um fluxo legado que controla todos precisa ser arquivado antes dessa transferência.
- **Mover no Kanban** usa o card daquela resposta; sem esse contexto, usa o card ativo mais recente da pessoa. Sem card, cria um. Colunas e cards são validados na mesma igreja; o registro por execução/bloco impede repetir a operação e o marcador transacional impede eventos recursivos.
- **Enviar WhatsApp** permite configurar botões, rodapé, seções/itens da lista e cartões antes de enviar imagens. Botões, itens, seções e cartões podem ser ordenados; imagens dos cartões podem ser substituídas. Os limites são três botões, dez itens no total da lista e dez cartões.
- **Testar automação** funciona no rascunho: selecione uma pessoa para contexto e avance pelos blocos. Respostas, conclusão/expiração de tarefas, esperas e resultados de IA são informados/simulados sem alterar cadastros ou chamar IA paga.
- Cada mensagem visitada oferece **Enviar ao WhatsApp de teste**. Informe o número e selecione a instância conectada. Mesmo mensagens destinadas a grupos usam somente esse número privado. É necessário possuir `automations.operate`, `communication.send` e as permissões dos módulos do fluxo.
- Os envios reais de teste são registrados em `automation_test_deliveries`, separados das execuções de produção. O mesmo identificador de solicitação não envia duas vezes. Retornos incertos ficam registrados, sem repetição automática. Aceite pelo provedor não comprova recebimento no celular.

Migration incremental: `20261005184126_automation_form_kanban_testing.sql`. Nesta entrega ela foi validada apenas em PostgreSQL isolado (PGlite), com HTTP simulado. A aplicação remota e a publicação estão fora do escopo. A prévia `/dev/automacoes` continua fictícia e bloqueia uploads/envios reais.

### Aplicação da migration — 05/10/2026

Após autorização, `20261005184126_automation_form_kanban_testing.sql` foi aplicada em transação no Supabase Altar Church (`zsldqioutjxchgmmwtfi`), com trava consultiva e registro no histórico. SHA-256 confirmado: `db2cd77c40bbd7996dce066425b151159d9785d885b1ac517ce3ef652e9e113e`.

A verificação remota confirmou as duas tabelas com RLS, leitura autenticada condicionada à igreja e sem escrita para usuários autenticados ou acesso anônimo. Foram conferidos a unicidade por execução/bloco, as referências do Kanban e a captura de formulário somente na inserção, com contexto e proteção contra recursão. As tabelas novas permanecem vazias. Esta aplicação não inclui publicação da aplicação nem envio real de WhatsApp.


## Fila para picos de cadastro — 05/10/2026

O webhook público autentica a instância e salva somente o evento normalizado em `automation_inbox` antes de responder HTTP 200. Falha ao salvar retorna 503 para permitir nova entrega pelo provedor. O segredo não é armazenado no evento. Duplicatas são reconhecidas; o recibo e o início/retomada da conversa são gravados na mesma transação, eliminando o intervalo que podia consumir uma mensagem sem iniciar seu fluxo.

O processador publicado deve consumir até 500 mensagens e 500 etapas por chamada, com quatro consumidores. Claims possuem token, expiração e `SKIP LOCKED`; mensagens de uma conversa mantêm a ordem e aguardam a execução chegar à próxima pergunta. Mensagens não processadas recebem até oito tentativas com espera progressiva; após esse limite ficam registradas para revisão e bloqueiam respostas posteriores da mesma conversa. Ao processar, o conteúdo da entrada é apagado, preservando apenas o recibo para deduplicação. Consultas de público dentro de uma transação reutilizam sua conexão, evitando esgotar o pool.

`automation_send_slots` controla o intervalo entre envios de uma instância em todos os processadores. Padrão: `AUTOMATION_SEND_INTERVAL_MS=250` (até quatro inícios de envio por segundo; configuração limitada entre 100 e 60.000 ms). Uma espera por velocidade não consome o limite de etapas nem causa falha no fluxo. HTTP 429 pausa a instância e agenda nova tentativa com `Retry-After`/espera progressiva, até cinco tentativas por entrega. O texto original da pergunta é preservado. Timeout/resultado incerto continua exigindo revisão, sem reenvio automático. Não interpretar o padrão como limite homologado do provedor: ajustar após medição real.

Com o padrão de quatro envios/s, 1.500 primeiras perguntas exigem pelo menos 6min15s de capacidade de envio de um único número; as quatro mensagens por cadastro somam pelo menos 25 minutos de capacidade. Consultas, chamadas externas, agendamento e respostas humanas aumentam o tempo. O teste sem espera não é uma previsão desse tempo e não comprova capacidade do Supabase Free.

### Evidência e estado da entrega

- `tests/automations-queue.test.mjs`: 1.500 conversas, 6.000 entradas únicas e 12.000 recebimentos com duplicatas; 1.500 pessoas/acessos e 1.500 confirmações simuladas, nenhum cadastro duplicado e vínculos individuais conferidos. PostgreSQL local PGlite executa SQL e runtime reais; Auth, WhatsApp e passagem do intervalo de envio são simulados nesse teste. O controle de intervalo foi testado separadamente com dois processadores simultâneos.
- Testes adicionais: falha após registrar recibo com rollback, recuperação de lease expirado, respostas consecutivas, 429, envio incerto, reconexão, permissões e rotas HTTP (persistência antes da confirmação; 503 se o banco falhar). Suíte de automações, typecheck, lint dos arquivos alterados e build de produção passaram.
- Evidência local, sem credenciais: `.codex-local/automation-queue/load-result.json`. Resultados são da máquina local, não do Supabase hospedado.
- O rascunho **Cadastro pelo WhatsApp — culto**, ID `da4fce9d-a05e-416f-8386-0ad762eecb88`, foi salvo na Dignus Est com a instância conectada selecionada e duas congregações ativas. Ele não está publicado.
- As migrations de cadastro e `20261005200510_automation_burst_queue.sql` foram aplicadas no projeto `zsldqioutjxchgmmwtfi`, com checksum registrado e validação de RLS/permissões. O job `automation-worker-burst` está preparado para dez segundos e **pausado**. O agendamento anterior permanece intacto.
- A publicação vigente respondeu HTTP 405 ao GET de saúde do novo processador, portanto ainda não contém essa versão. O script `scripts/setup-automation-cron.mjs` valida GET autenticado, schema e configuração antes de ativar o novo job e remover o antigo; reaproveita o segredo do Vault em memória quando não existe variável local. Configurar a URL canônica, publicar a aplicação atualizada, executar o probe e só então ativar o job. Não há envio durante o probe.
- A publicação da aplicação, a ativação do novo agendamento e um piloto autorizado com WhatsApps reais continuam pendentes. Nenhum dos 1.500 cadastros simulados foi criado na igreja real e nenhuma mensagem real foi enviada nesta verificação.
