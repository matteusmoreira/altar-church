# Automações do Altar Church

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
   - Aplicação: `AUTOMATION_WORKER_SECRET`, `OPENROUTER_API_KEY` central e `APP_URL` canônica HTTPS.
   - Edge Function: `AUTOMATION_WORKER_SECRET` com o mesmo valor e `AUTOMATION_DISPATCH_URL` apontando para `https://<app>/api/internal/automations/dispatch`.
   - Supabase Vault: `automation_worker_url` apontando para `https://<project>.supabase.co/functions/v1/automation-worker` e `automation_worker_secret` com o mesmo segredo.
5. Confirmar `pg_cron`, `pg_net`, Vault e o job `automation-worker-minute`, com execução bem-sucedida. Se `pg_cron` não estiver instalado, a migration não cria o job; habilitar a extensão e cadastrar o agendamento durante a configuração de homologação.
6. Superadmin define modelos compatíveis com respostas estruturadas e orçamento da igreja. A igreja configura horários, contexto público, instâncias e grupos. A chave central não é solicitada/mostrada na interface.
7. Conectar o webhook adicional pela interface. Isso preserva os webhooks existentes. Se houver timeout na configuração, revisar os webhooks da instância antes de repetir. Tratar URLs do webhook como credenciais e evitar logs com seu caminho/segredo.
8. Criar rascunhos, revisar configurações e público, publicar explicitamente e testar com destinatário controlado em igreja cujo `status` é `test`. Nenhuma publicação de rascunho por IA ocorre sozinha.

Referências de contrato: [Uazapi](https://docs.uazapi.com/llms.txt), [recibos](https://docs.uazapi.com/reference/webhooks/messages_update.md), [OpenRouter](https://openrouter.ai/docs/guides/features/structured-outputs).

## Evidência local e pendências externas

Banco configurado verificado em 05/10/2026: 89/89 migrations, sem deriva dos arquivos já aplicados; `20261005140000_automations.sql` aplicada em transação. Backup local ignorado no Git dos seis conjuntos legados; 84 registros arquivados e os registros de origem mantidos. As 19 tabelas novas têm RLS. Cadastro fictício no tenant de teste gerou `person.created` na mesma transação, integralmente revertida. Não foram criados fluxos, execuções ou entregas. Cron `automation-worker-minute` ativo a cada minuto; URL/segredo no Vault ainda não configurados, portanto o motor não é invocado externamente.

Os testes de automações executam a migration e o código real do motor em PostgreSQL isolado (PGlite), com HTTP simulado. Validam arquivo, eventos de gravações reais dos módulos, rollback, tenant/RLS, leases, orçamento/modelos, espera persistente, saída da célula antes do envio, sete dias após batismo/sem data, aniversário, recorrência/deduplicação, respostas, descadastro, humano e entrega ambígua sem reenvio. IA é verificada sem chamadas pagas: sem autorização/orçamento, sem crédito, saída inválida, reconciliação de custo e remoção de contexto privado.

`npm run test:automations`, typecheck, lint e build são verificações locais. A suíte ampla local evita quatro arquivos que carregam credenciais de `.env.local` e escrevem em banco real; a suíte de ministérios também pula seu caso externo sem `POSTGRES_URL`. A prévia fictícia `/dev/automacoes` permite verificar editor/abas/duplicação/desfazer/refazer/simulação no desktop e por toque. Ela não grava nem envia e fica indisponível em produção, exceto quando `E2E_AUTOMATIONS_PREVIEW=1` é definido expressamente para E2E.

Ainda exigem configuração/prova em homologação: implantação da Edge Function, URL/segredo no Vault e na aplicação, worker executando por cron, reinício e concorrência entre invocações reais, webhooks públicos, formatos interativos/mídias em aparelhos, grupos e recibos, resposta humana na instância, conexão desconectada, consumo real OpenRouter e autorização de dados sensíveis. Ativação para membros reais somente após essa validação e revisão/publicação explícitas dos fluxos.

## Configuração do worker — atualização em 05/10/2026

Após autorização, `automation_worker_url` e `automation_worker_secret` foram configurados no Vault do projeto correto, sem imprimir ou versionar o segredo. O cron está pausado até concluir a publicação da Edge Function e configurar o mesmo segredo no backend da aplicação. Os tokens locais Vercel/Supabase retornaram HTTP 403; o conector Vercel exige reautenticação e o conector Supabase disponível aponta para outro projeto. Retomar com acessos válidos para publicação de funções/segredos no Supabase e variáveis/deploy no Vercel, reaproveitando o segredo do Vault em memória. Validar a chamada autenticada e o cron antes de reativar o job. Nenhum fluxo está publicado.

Atualização após novo acesso Vercel: `AUTOMATION_WORKER_SECRET` configurado como variável sensível somente em produção, reaproveitando o segredo do Vault em memória; `APP_URL=https://altarchurch.com.br`. Republicação do mesmo commit `870cb75` solicitada. A rota pública retornou 401 sem segredo e 200 com o segredo correto, `processed: 0`, mantendo zero entregas. O novo plugin Supabase está instalado, mas retorna `USER_NOT_LOGGED_IN`; a publicação da Edge Function e seus segredos permanecem pendentes. A Service Role e a senha do banco não substituem acesso à Management API.
### Confirmação do deploy do worker — 05/10/2026

O redeploy de produção `dpl_jajDQggyGDicJrzKvfjcVJYw39mb`, vinculado ao commit `870cb75dada4d8607edc87ca098512d6dfb037bb`, foi confirmado como `READY`. A publicação da Edge Function e seus segredos permanece pendente de conexão do plugin Supabase ou acesso à Management API. O cron continua pausado até validar o caminho completo; o teste direto do backend retornou zero etapas e zero envios.
