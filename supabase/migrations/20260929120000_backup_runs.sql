-- Registro de execucoes de backup verificadas (heartbeat).
-- Cada linha e escrita pelo endpoint interno POST /api/internal/ops/backup-heartbeat
-- (autenticado por BACKUP_HEARTBEAT_SECRET) apos confirmacao de snapshot/PITR no provedor.
-- O /api/ready continua lendo BACKUP_LAST_RUN_AT por compatibilidade, mas esta
-- tabela e a fonte auditavel: quem executou, quando e qual snapshot.
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  snapshot_id text,
  status text not null default 'ok' check (status in ('ok', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);

alter table public.backup_runs enable row level security;

-- Sem policy de leitura/escrita para anon/authenticated: acesso so via service_role (server).
-- Nenhuma policy = negacao implicita com RLS ativo.

create index if not exists backup_runs_created_idx
  on public.backup_runs (created_at desc);
