# Desafios conhecidos

- A validacao SQL local depende dos containers do Supabase; sem o container `supabase_db_altar-church`, `supabase status` nao consegue validar a migration. Manter a prova local de codigo separada da aplicacao da migration em staging/producao.

- E2E pode travar ao reutilizar um servidor `next dev` antigo durante recompilação de rota. Para prova confiável, usar `next start` novo em porta isolada e limpar o processo ao final.

- PowerShell desta máquina pode exibir arquivos UTF-8 como mojibake quando `Get-Content` é usado sem `-Encoding utf8`. Usar leitura UTF-8 explícita antes de diagnosticar ou editar texto em português.

- A Supabase CLI 2.113.0 rejeita tokens versionados no formato `sbp_v0_...`; para operações de banco, usar conexão PostgreSQL SSL direta com a senha fornecida ou solicitar um PAT no formato `sbp_...`, sem persistir credenciais no projeto.

- Preferências de visualização persistidas em Client Components devem usar `useSyncExternalStore` com snapshot do servidor; o lint `react-hooks/set-state-in-effect` rejeita hidratação via `setState` síncrono em `useEffect`.

## Auditoria 360 — 12/09/2026

- O harness E2E ainda usa fallback `c1`/primeiro tenant ativo; sem tenant `status = 'test'`, não executar E2E/canário em produção.
- O checkout exige Node 24.x; Node 25 local e artefatos `.next.stale-*` contaminam o gate de lint.
- Migrations, headers CSP e commit publicado precisam de parity externa antes do GO; a API Vercel retornou 403.
- A suíte local mistura testes read-only com integrações que escrevem no banco remoto; manter unit/integration/E2E separados e identificar mutações.
- Após as correções, `health` é liveness barato e `ready` é o gate profundo; a divergência remota de migrations mantém readiness não autorizável até aplicação controlada.
- O limitador público depende de headers saneados pelo proxy; confirmar `x-real-ip`/egress/DNS no provedor antes de considerar antiabuso e SSRF encerrados.
- O checkout local recebeu guards de tenant, Kids, CSV, E2E e CI; migrations/RLS/trigger SQL continuam deliberadamente fora do patch por dependerem de autorização e ambiente remoto.
- Segunda rodada aplicada: isolamento tenant do Volunteer V2 e origem Supabase do E2E foram endurecidos; SSRF ganhou loopback IPv6 expandido e revalidação DNS; rate limit público exige proxy confiável explícito e falha fechado em produção. Ainda falta confirmar o valor do proxy no provedor, DNS rebinding/egress real e o worker SQL.
- Aplicação remota concluída no projeto correto: migrations 76/76, FK/RLS sem gaps e Edge Functions `integration-delivery-worker` v4 e `volunteer-delivery-worker` v5 ACTIVE. Cron `auth-rate-limit-prune-daily` também ativo via Management API (`jobid=9`, `17 3 * * *` UTC); falta confirmar a primeira execução em `cron.job_run_details`.

## Prévia do voluntariado — 15/09/2026

- Usar `playwright.volunteers-preview.config.ts` para a prévia fictícia, sem setup de usuários ou integrações remotas. As ações são bloqueadas nessa rota; os testes visuais não comprovam gravação autenticada ou entrega nos provedores.
- `next dev` pode reescrever o `AGENTS.md` automaticamente. Conferir o diff e preservar as instruções originais do projeto.

## Polimento de layout e design system — 21/09/2026

- Sintoma exato do item acima sobre `next dev` antigo: quando o WebSocket de HMR falha (`ERR_INVALID_HTTP_RESPONSE`), a página carrega e renderiza o HTML, mas os Client Components **não hidratam** — nenhum `useEffect` roda. Na landing, que usa `<Reveal>` com `IntersectionObserver`, isso deixa todas as seções abaixo do hero em `opacity-0` e a página parece vazia, sem nenhum erro no console. Diagnosticar comparando com um `next start` novo em porta isolada antes de acusar regressão de layout.
- Existe um `playwright.volunteers-preview.config.ts` para a prévia fictícia. Reusar essa config em vez de criar outra paralela para screenshots de verificação.
- Um template literal dentro de um atributo JSX de um elemento que já está dentro de outro atributo (`actions={ <div>…</div> }` no `PageHeader`) quebra o parser do TypeScript (`TS2657` / `TS1003` / `TS17002`) — mesmo com JSX válido. Isolado com a API do compilador: reescrever o bloco na forma `children` zera os `parseDiagnostics`. Documentado em `DESIGN.md` §4.1.
- `.glass` / `.glass-strong` / `.glass-subtle` desenham **apenas** fundo + blur. Se voltarem a declarar `border`, todo `<Card className="glass">` exibe borda dupla de 2 px, porque o `Card` já desenha `ring-1`.
- Testes de contrato de fonte (`tests/*.test.mjs`) travam strings literais de classes e rótulos. Mover um literal de um ramo de código para um array de opções (ex.: `viewMode === "list"` para dentro das opções do `ViewToggle`) exige atualizar a asserção junto com o comportamento.

## CI: instalação de dependências e gate de lint — 21/09/2026

- O CI ficou 4 pushes sem rodar nenhum gate porque `npm ci` aborta em `Install dependencies`: o `package-lock.json` estava sem as dependências **opcionais** (`canvas`, `@emnapi/core`, `@emnapi/runtime`, `@csstools/css-tokenizer`, `@csstools/css-parser-algorithms`). Nenhuma dependência direta mudou — o que mudou foi a versão do Node: no Node 25 o npm não resolve esses pacotes (vários declaram `engines` que exclui o 25, ex.: `mute-stream@4.0.0` pede `^22.22.2 || ^24.15.0 || >=26.0.0`) e reporta "up to date" com o lock defasado. **Regenerar o lock exige Node 24** (`npm install --package-lock-only`); com Node 25 o comando não faz nada e dá falso verde.
- Node 24 portátil sem admin: baixar `node-v24.20.0-win-x64.zip` de `nodejs.org/dist`, extrair fora do repo e prefixar o `PATH`. É a forma de reproduzir o ambiente do CI (Node 24.20.0 + npm 11.19.0) nesta máquina, que só tem Node 25.
- O job `validate` do CI **não** define `POSTGRES_URL`, então os testes de integração que leem o schema no Supabase remoto fazem `skip` lá. Rodando local com `.env.local`, eles executam e podem falhar com `EMAXCONNSESSION: max clients are limited to pool_size: 15` — o pooler em modo sessão tem 15 slots compartilhados com a aplicação em produção. Essa falha é de capacidade externa, não regressão de código.
- **Causa concreta do `EMAXCONNSESSION` nas rodadas locais:** um `next start` deste projeto segura ~5 conexões do pooler. Com dois servidores no ar (10 de 15 slots), `npm test` falha nos testes de banco (p95, kids e p10). **Parar os servidores antes de rodar `npm test`.** Além disso, `Stop-Process` no processo do wrapper `next start` **não** mata o `next-server` filho, que continua segurando as conexões — matar pelo `CommandLine` correspondente (`Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*next start -p 3457*' }` retorna o filho; o wrapper some, o filho fica).

## Job E2E: tenant de teste, secrets vencidos e o rate limit do login — 21/09/2026

O job `E2E (tenant de teste)` usa `environment: e2e` e só roda em push para `master`. Ele ficou meses sem executar (o `npm ci` quebrava antes) e, ao ser destravado, falhou em três camadas em sequência. Estado final: **seed verde no CI**, specs executando (42 passam, 61 falham por rate limit — último item abaixo).

**1. Tenant de teste inexistente (resolvido).** `scripts/ensure-e2e-users.mjs` procura `public.companies where legacy_id = $1 and status = 'test' and active = true` e aborta se não achar ("o setup não escolhe tenant por fallback"). O banco tinha **uma única** empresa, `Dignus Est` (`legacy_id = NULL`, `status = 'active'`, dado real da igreja) e zero linhas `status = 'test'`. O `c1` de `docs/testing/e2e-accounts.local.md` é herança de uma migration (`20260529124259`, "Igreja Batista Central") que nunca foi aplicada neste banco — publicá-lo só mudaria a mensagem de erro. Criado em 21/09/2026 o tenant `legacy_id = 'e2e'`, slug `e2e-test`, `status = 'test'`, `active = true`, via `npm run e2e:tenant` (`scripts/ensure-test-tenant.mjs`, idempotente: só cria, nunca altera empresa fora de `status='test'`, e recusa slug ocupado). Os módulos e o resto do bootstrap ficam por conta do próprio seed.
- Antes disso foi preciso **mover 7 perfis `e2e.*`** que estavam vinculados ao tenant de produção para o novo: o seed aborta com `E-mail E2E ... já pertence a outro tenant`. Escopo estrito (só os e-mails documentados do harness) e a linha de `people` antiga ficou como estava — ela já estava soft-deleted.
- `docs/testing/e2e-accounts.local.md` (ignorado pelo git) foi atualizado de `c1` para `e2e` para o local e o CI usarem o mesmo tenant. Ele é lido pelo seed **e** pelos specs quando existe; no CI ele não existe e o documento é montado a partir dos secrets.

**2. Secrets vencidos (resolvido).** `E2E_COMPANY_LEGACY_ID` não existia no escopo `e2e`. Com ele publicado, o passo de seed falhou com `password authentication failed for user "postgres"`: o secret **repo-level** `POSTGRES_URL` (de 08/06/2026) estava inválido — não é falha de rede, é credencial. Substituído pelo valor do `.env.local` (pooler `aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`), que é o mesmo banco que a aplicação usa. Sintoma para reconhecer: erro de autenticação citando `user "postgres"` **sem** o sufixo do project ref indica string direta/antiga, não o pooler.

**3. O rate limit do próprio login derruba a suíte (em aberto).** Sintoma no CI: `expect(page).toHaveURL(/\/dashboard/)` recebe `http://localhost:3000/login` (44 tentativas de polling sem sair da tela) e as specs falham de forma intermitente — a mesma spec passa em um projeto (desktop) e falha no outro. Causa: `src/lib/auth/login-actions.ts` aplica `LOGIN_RATE_LIMITS` = **30 logins/15 min por IP** e **8 logins/15 min por identificador**, contados no Postgres (`public.consume_rate_limit`, tabela `auth_rate_limits`) e **antes** da autenticação. A suíte faz ~70 logins em 32 min, todos do mesmo IP (`localhost`) e ~46 deles com a mesma conta (`accounts.admin`) → a partir do 31º login da janela toda tentativa devolve "Muitas tentativas..." e não navega. Evidências: `enforceRateLimits` consome as duas regras por tentativa e aborta na primeira negada (por isso contas que só falharam na regra de IP **não têm** linha em `auth_rate_limits`, ex. `e2e.lider-voluntario`); as contagens finais da tabela são pequenas porque a janela de 15 min zera o contador — o histórico não fica consultável.
- Consequência prática: **não dá para deixar a suíte verde só mexendo em secrets**. As saídas são (a) reaproveitar sessão autenticada nos specs (`storageState`, 1 login por conta em vez de ~70), (b) tornar os limites configuráveis por env e afrouxar só no job de E2E, ou (c) limpar `auth_rate_limits` antes da suíte — que **não** resolve, porque a suíte dura mais que a janela de 15 min.
- Vale a pergunta de produto: 30 logins/15 min por IP é agressivo para igreja com Wi-Fi compartilhado (uma NAT pode ter dezenas de pessoas logando num culto).
- **Não há artefatos no CI**: o workflow não faz `upload-artifact`, então screenshot/vídeo/trace das falhas (que o Playwright gera) são descartados. Sem isso, diagnosticar spec quebrada no CI é arqueologia de log.
- **GitHub mascara o valor de qualquer secret no log**, inclusive strings curtas: como `E2E_COMPANY_LEGACY_ID=e2e`, todo `tests/e2e/...` aparece como `tests/***/...` e `npm run e2e:setup` vira `npm run ***:setup`. Não é corrupção do log nem mascaramento de nome de arquivo.


## Erros de lint pré-existentes (28) — resolvidos em 21/09/2026

Todos os 28 erros foram corrigidos em código, sem rebaixar regra para warning. `npx eslint .` agora sai com 0 erros e 25 warnings (todos pré-existentes ou órfãos herdados). Padrões usados, para reutilizar:

- **`react-hooks/set-state-in-effect`** (12 ocorrências) — três receitas, todas lint-limpas neste repo:
  1. **Espelhar prop no estado, durante o render** (idioma oficial do React "adjusting state when a prop changes"): guardar o último valor sincronizado num `useState` e comparar antes de commit (`if (cards !== syncedCards) { setSyncedCards(cards); setCardsList(cards) }`). Serve para crm, members-client (3 listas num único objeto sincronizado), ministries (aba vinda da URL) e activity-members-sheet (reset de busca/seleção ao abrir) e journey-builder-sheet.
  2. **`useSyncExternalStore`** para estado client-only persistido: `finance-client` (flag de hidratação, com `subscribe` no-op) e os modos de visualização de visitantes/gceus (`altar_visitors_view_mode`, `altar_cells_view_mode`) e `altar_cells_map_show_pois`. Manter o literal da chave e o valor do snapshot do servidor idênticos ao comportamento anterior, porque os testes de contrato assertam essas strings.
  3. **IIFE `async` dentro do efeito** quando o efeito só dispara carga de dados: `void (async () => { await fetchMembers() })()`. O lint **rastreia** chamada direta a função do componente que faz `setState` síncrono (`void load(id)` é erro), mas **não** rastreia dentro de uma closure `async` própria. Foi verificado com arquivo-sonda.
- **`prefer-const`** (7) e parte de `no-unescaped-entities` (4) — `npx eslint <arquivo> --fix`.
- **`no-explicit-any`** (4) — guard de tipo compartilhado (`isFollowUpPriority` em `src/lib/people/types.ts`), `Record<string, unknown>` + `typeof` para os campos de `config` jsonb, e no mapa 3D o evento do Mapbox com `(event.error as Error & { status?: number }).status`.
- **`react-hooks/refs`** (1) — escrever `ref.current = valor` durante o render vira um `useEffect` de sincronização declarado **antes** do efeito que consome o ref (a ordem importa: o consumo no mount precisa ler o valor novo; `useSyncExternalStore` já entrega o valor do cliente antes disso).

## Verificação visual em navegador — armadilhas — 21/09/2026

- **Porta ocupada por outro projeto**: `next start -p 3210` anunciou "Ready", mas a porta já era do `convex dev` de outro projeto — as requisições respondiam 404 com corpo "This Convex deployment is running." Sempre validar a porta com `curl` (`/` e uma rota real) e checar `netstat -ano | grep LISTENING` antes de acusar a aplicação.
- **Porta ≠ sessão**: o cookie de sessão ignora a porta. Trocar de `:3457` para `:3458` mantém o login (`e2e.admin@altar-church.test`, senha em `E2E_DEFAULT_PASSWORD` do `.env.local`), o que permite rodar build antigo e novo lado a lado sem novo login.
- **A/B para suspeita de regressão**: `git stash push` → `npm run build` → `next start` em outra porta → comparar a mesma tela. Foi o que provou que `/eventos` e `/pessoas/follow-up` ficam presos no skeleton de carregamento **também no código anterior** (não é regressão das mudanças de lint). Vale medir por `document.body.innerText.length` + contagem de `[class*="animate-pulse"]`, porque a árvore ARIA pode vir vazia durante o carregamento e dar falso diagnóstico.

