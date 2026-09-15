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
