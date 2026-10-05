# Revisão de erros e bugs — Altar Church — 05/10/2026

> Registro da auditoria inicial. As correções e sua validação estão em [CORRECOES-BUGS-2026-10-05.md](CORRECOES-BUGS-2026-10-05.md).

## Resultado

Foram encontrados **8 bugs: 5 de alta prioridade (P1) e 3 de prioridade média (P2)**. A revisão abrange o checkout atual, incluindo alterações preexistentes sem commit, o banco configurado localmente e a aplicação executada a partir de um build de produção local. Não comprova que o mesmo código esteja publicado em produção.

Não foram aplicadas correções funcionais, migrations ou deploys. Foram criados apenas este relatório, evidências e reproduções da auditoria; as alterações preexistentes foram preservadas.

## Validação executada

| Verificação | Resultado |
|---|---|
| `npm run test` | Passou, incluindo testes existentes que consultam o banco e testes transacionais |
| `npm run typecheck` | Passou |
| `npm run lint` | 0 erros; 29 warnings |
| `npm run build` | Passou; 149 páginas geradas |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas nas dependências de produção |
| `npm run secrets:check` | Nenhum segredo detectado nos arquivos rastreados |
| `git diff --check` | Passou |
| Chrome real, build local | 59 endereços distintos examinados, entre páginas e APIs; navegação administrativa, pública e portais |
| Papéis autenticados | Admin, superadmin, membro, voluntário e líder de ministério; também visitante anônimo |
| Mobile | Viewport 390 × 844, páginas públicas e telas centrais; nenhuma rolagem horizontal indevida observada |
| Banco remoto | 150 tabelas públicas; 87 migrations locais e 86 remotas; 1 pendente |
| Reproduções adicionais | 4 testes isolados passaram comprovando os comportamentos defeituosos; banco/storage simulados nesses testes |

Ambiente de execução desta máquina: Node 25.1.0. O projeto/CI pede Node 24.x; estes resultados não equivalem a uma rodada de CI em Node 24. Não foi reinstalado o ambiente.

Foram examinados autenticação, autorização por papel/igreja, Pessoas, follow-up e trilhas, Células, Ministérios, Congregações, Eventos, Financeiro, Doações, Conteúdo, Formulários, CRM, Kids, Voluntariado, Comunicação, Notificações, Intercessão, Discipulado, Relatórios, Configurações e saúde operacional. A navegação não substitui a execução de cada combinação de CRUD. A suíte Playwright completa de CRUD não foi executada nesta revisão; foram usados os testes existentes e sondas dirigidas no Chrome.

## Bugs de alta prioridade

### 1. Valores com centavos são multiplicados por 100

**Código:** `src/lib/operational/actions.ts:28`, `:149`, `:1570`, `:1601`, `:1720`, `:1896`, `:1916`.

Os formulários de receitas/despesas usam `input type="number"`, cujo valor enviado usa ponto decimal. O servidor remove todos os pontos antes de converter o valor. A mesma regra aparece na validação e na persistência.

- Chrome: digitar `10.50` em Nova Receita gera `FormData.amount = "10.50"`.
- Função real extraída do código: `10.50 → 1050`, `0.01 → 1`, `100.99 → 10099`.
- Afeta receitas, despesas, saldo inicial de conta bancária, doações e recorrências.

**Impacto:** lançamentos e totais financeiros incorretos. Não foi gravado um lançamento real para provar este caso. A consulta feita no banco encontrou zero receitas/despesas ativas; isso não prova ausência de impacto em doações ou outros ambientes.

**Correção recomendada:** tratar o valor canônico do input/API como decimal com ponto; reconhecer formato brasileiro apenas quando realmente informado como tal. Usar a mesma conversão na validação e persistência e cobrir centavos, inteiros e separadores em regressão.

**Evidências:** `artifacts/review-20261005-browser-first.json`, item `number-input-money`; `artifacts/review-20261005-probes.json`, seção `money`.

### 2. Gestão de Voluntariado não abre com o banco atual

**Código:** `src/lib/volunteers/v2-data.ts:119`; migration `supabase/migrations/20261005120000_volunteer_programming_options.sql`.

A consulta pede `programming_kinds` e `programming_locations`, mas as colunas ainda não existem no banco configurado. A migration que as cria é a única pendente: 87 arquivos locais, 86 versões remotas.

- `/voluntariado`: erro de renderização para admin e superadmin.
- `/programacao`: redireciona para a mesma tela com erro.
- `/api/v1/volunteers/dashboard`: HTTP 500.
- Log do servidor: `column "programming_kinds" does not exist`.
- `/api/ready`: HTTP 503, com migrations degradadas e banco/Auth/Storage/workers respondendo normalmente.

**Correção recomendada:** alinhar essa migration no ambiente correto antes de liberar o código dependente e verificar a tela/API após o alinhamento. A aplicação da migration não foi feita nesta revisão.

**Evidências:** `artifacts/review-20261005-probes.json`, logs do servidor e navegadores, `artifacts/review-20261005-readiness.json`.

### 3. Páginas públicas de Kids e Eventos são bloqueadas pelo login

**Código:** `src/lib/supabase/proxy.ts:8`; `src/lib/navigation/routes.ts`, lista `protectedDashboardPrefixes`.

O middleware considera todo caminho começando com `/kids/` ou `/eventos/` protegido. Isso inclui páginas explicitamente implementadas em `(public)`.

Sem cookies, houve HTTP 307 para `/login?next=...` em:

- `/kids/cadastro/dignus-est`;
- `/eventos/publico/<token>`;
- `/eventos/inscricao/<token>`;
- `/eventos/check-in/<token>`.

O teste de Eventos usou um UUID sintético: comprovou que o middleware intercepta o caminho antes de a página validar o token; não comprovou uma inscrição em evento real. O cadastro Kids foi também verificado no Chrome anônimo.

**Impacto:** visitantes não conseguem abrir o cadastro público Kids, os convites de eventos, a confirmação/cancelamento público ou o check-in por esses links sem conta.

**Correção recomendada:** declarar exceções precisas para as rotas públicas antes da regra de proteção, mantendo protegidas as telas administrativas. Cobrir essas exceções em testes anônimos.

**Evidências:** `artifacts/review-20261005-public-redirects.log`, `artifacts/review-20261005-public-portals.json`.

### 4. Erro de comprovante deixa o lançamento gravado e permite duplicação

**Código:** `src/lib/operational/actions.ts:1566`, `:1588`, `:1597`, `:1618`, `:1903`; upload em `src/lib/files/server.ts`.

Receitas, despesas e doações são inseridas antes de validar/enviar o comprovante. Se o arquivo for rejeitado ou o Storage falhar, a action devolve erro após a gravação já ter ocorrido. Não há transação/compensação ou chave de idempotência que proteja a nova tentativa.

**Reprodução isolada:** executada a implementação real de `saveRevenue`, com SQL/storage simulados. Um comprovante inválido retornou erro com uma receita já persistida no simulador; repetir produziu uma segunda inserção.

**Impacto:** a interface diz que falhou, mas o lançamento existe. Reenviar pode duplicar receitas/despesas/doações.

**Correção recomendada:** validar o arquivo antes de inserir, definir tratamento consistente para falha de upload e proteger nova tentativa contra duplicação. Como Storage e PostgreSQL são sistemas distintos, uma transação SQL isolada não resolve toda a operação.

**Evidências:** `artifacts/review-20261005-reproductions.test.mjs` e `.log`.

### 5. Edição de follow-up aceita responsável de outra igreja

**Código:** `src/lib/people/follow-up-actions.ts:103`.

A criação verifica se o responsável pertence à igreja e está ativo. A edição recebe `responsibleProfileId` e atualiza a tarefa sem repetir essa validação. O filtro `company_id` protege a tarefa, mas não o perfil referenciado.

A inspeção do banco confirmou FK simples para `profiles(id)`, sem chave composta de igreja e sem trigger de validação dessa relação. O único trigger não interno da tabela atualiza `updated_at`.

**Reprodução isolada:** a action devolveu sucesso e enviou à consulta o UUID de um responsável arbitrário, sem qualquer consulta de validação. Não foi criado vínculo entre dados de igrejas reais.

**Impacto:** inconsistência entre igrejas e atribuição de tarefas a um perfil externo/inativo; o join filtrado de leitura pode ocultar o responsável indevido.

**Correção recomendada:** validar UUID, igreja, atividade e exclusão do perfil na atualização; manter o filtro de igreja da tarefa. Uma proteção de integridade no banco pode complementar essa validação.

**Evidências:** reproduções isoladas; seções `foreignKeyScope` e `followUpTriggers` em `artifacts/review-20261005-probes.json`.

## Bugs de prioridade média

### 6. API de Pessoas aceita a chave e depois exige sessão

**Código:** `src/app/api/v1/people/route.ts:14`; `src/lib/api/auth.ts`, `requireApiListContext`; `src/lib/people/data.ts:229`, `:980`.

A rota GET autoriza API key com `people:read` e resolve a igreja, mas chama `listPeople`. Essa função exige `getCurrentUser()` e `requirePermission`, que dependem de cookie de sessão. Portanto, uma integração só com chave é negada depois da autorização.

**Prova:** rastreamento da chamada e reprodução isolada de `listPeople({companyId})` sem sessão, que lança `Acesso negado`. Não foi criada ou usada uma chave real para esta prova.

**Correção recomendada:** separar leitura já autorizada por igreja da leitura que faz autorização de sessão, como a rota de Formulários já faz. Não remover a autorização das funções chamadas diretamente pelas telas.

### 7. Arrays da API são convertidos em JSON incompatível com FormData

**Código:** `src/lib/api/form-data.ts:20`; `src/lib/operational/actions.ts:428`; API de Eventos usa o adaptador de actions.

`objectToFormData({recurrenceWeekdays:[0,3]})` gera uma entrada `"[0,3]"`. A action espera múltiplas entradas numéricas de `FormData.getAll`, converte a string em `NaN` e descarta os dias. Uma recorrência semanal válida enviada em JSON acaba rejeitada por falta de dias.

**Prova:** reprodução isolada com o adaptador real: array enviado `[0,3]`, dias lidos `[]`.

**Correção recomendada:** adaptar arrays dos campos que usam `getAll` para entradas repetidas. Preservar objetos JSON nos campos que esperam JSON; a mudança precisa considerar cada contrato.

### 8. Linha do tempo atribui participação em célula sem presença registrada

**Código:** `src/lib/people/follow-up.ts:87`.

O evento “Participação em célula” vem de todas as reuniões da célula associada a um vínculo atualmente ativo. A consulta não exige presença da pessoa, não limita pela data de ingresso e não exclui reuniões futuras.

**Prova:** consulta somente de leitura com o mesmo join encontrou 2 entradas candidatas à linha do tempo, ambas sem presença registrada em `attendance_records`. Isso não afirma que essas pessoas faltaram; comprova que o sistema não possui o registro exigido para atribuir participação.

**Correção recomendada:** usar as presenças efetivas para registrar participação; se o objetivo for mostrar agenda da célula, dar outro rótulo e separar agenda de histórico pessoal.

**Evidências:** `artifacts/review-20261005-probes.json`, seção `cellTimeline`.

## Outros pontos que precisam de atenção

- **Concorrência em RSVP:** confirmação bloqueia evento e depois RSVP; cancelamento bloqueia RSVP e depois evento (`src/lib/member/portal-actions.ts:26`, `:47`, `:84`, `:90`). Duas chamadas simultâneas sobre o mesmo RSVP podem formar um ciclo de locks. É um risco identificado no código; não foi provocado um deadlock no banco real. Padronizar a ordem dos locks e testar concorrência em banco de teste isolado.
- **Saúde operacional lenta:** `/configuracoes/operacao` levou aproximadamente 28 s para admin e 20 s para superadmin no build local. `cronSummaries` faz consultas sequenciais por job; `tenantUsage` junta três relações de um-para-muitos e depois usa `count(distinct ...)`, com possibilidade de multiplicação de linhas. A causa exata da latência não foi isolada; medir por consulta antes de corrigir.
- **9 FKs sem índice de suporte:** `cell_visit_requests` (3), `cell_whatsapp_deliveries` (3), `cell_whatsapp_settings` (1), `person_journey_enrollments` (2). São oportunidades concretas de desempenho, não prova de lentidão observada em cada tabela.
- **RLS:** o scanner listou `backup_runs` e `global_rate_limits` com RLS ativo e zero políticas. Esse estado nega acesso pelas roles sujeitas a RLS; não foi classificado como vazamento. As tabelas são usadas pelo backend.
- **Resposta indevida da API de portal:** líder sem perfil de voluntário ativo recebeu HTTP 500 em `/api/v1/volunteers/portal`. A tela fez o redirecionamento esperado. Traduzir a condição de domínio para 403/404 em vez de falha interna.
- **Lint:** 29 warnings, entre imports/variáveis sem uso, dependências de hooks e navegação interna por `window.location`. Não foram tratados como 29 bugs funcionais.
- **Testes E2E:** a spec chamada “superadmin sem igreja atribuída” em `authenticated-smoke.spec.ts` herda o storageState de admin; `gotoAuthenticated` não troca sessão se já estiver autenticado. Essa spec não prova o papel anunciado. A revisão independente fez login explícito como superadmin.

## Limites e próximos passos

As provas de navegação se referem a `http://localhost:3465`, com o build deste checkout e o banco configurado em `.env.local`. A identidade do tenant de teste foi validada como `legacy_id=e2e`, `status=test`, `active=true`. A navegação como superadmin também lê a igreja padrão configurada pela aplicação.

Não foram disparados envios reais de WhatsApp/e-mail/push, realizadas operações de cobrança, executado ciclo físico de check-in/retirada Kids, testada restauração de backup ou comprovado deploy publicado. O scanner de segredos cobre arquivos rastreados; não certifica todos os arquivos locais.

Recomenda-se corrigir primeiro valores financeiros, bloqueio de páginas públicas, gravação parcial do financeiro, validação do responsável e compatibilidade de Voluntariado. Depois corrigir os três bugs médios, adicionar regressões de comportamento e executar a suíte E2E completa em ambiente de teste alinhado.

As evidências estão em `artifacts/review-20261005-*`. As quatro reproduções afirmam os comportamentos defeituosos atuais, portanto “passaram” significa que reproduziram os bugs; não são provas de correção.
