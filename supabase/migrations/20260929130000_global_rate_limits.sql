-- Rate limit global (rotas utilitarias sem tenant: /api/geocode, /api/cep).
-- Escopo por (ip_hash, scope, window_start); janela de 1h, prune de 24h.
create table if not exists public.global_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  scope text not null default 'global',
  window_start timestamptz not null default date_trunc('hour', now()),
  submission_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_rate_limits_count_check check (submission_count > 0),
  constraint global_rate_limits_unique unique (ip_hash, scope, window_start)
);

alter table public.global_rate_limits enable row level security;

-- Sem policies: acesso so via service_role (server).

create index if not exists global_rate_limits_window_idx
  on public.global_rate_limits (window_start);
