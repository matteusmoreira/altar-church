-- Rate limit de autenticação (login e cadastro).
--
-- Objetivo: conter força bruta e abuso de criação de contas sem introduzir
-- dependência externa (Redis). Usa janela fixa com contador atômico no Postgres.
--
-- A tabela é acessada apenas pela conexão de serviço (getSql). Nenhuma policy é
-- criada de propósito: anon/authenticated não devem ler nem escrever aqui.

create table if not exists public.auth_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table public.auth_rate_limits enable row level security;

revoke all on public.auth_rate_limits from anon, authenticated;

create index if not exists auth_rate_limits_window_start_idx
  on public.auth_rate_limits(window_start);

-- Consome uma unidade da janela e informa se a requisição está liberada.
-- Atômico: o INSERT ... ON CONFLICT resolve a corrida entre requisições concorrentes.
create or replace function public.consume_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_key is null or p_key = '' then
    return true;
  end if;

  insert into public.auth_rate_limits (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case
          when auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else auth_rate_limits.hits + 1
        end,
        window_start = case
          when auth_rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else auth_rate_limits.window_start
        end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Evita crescimento indefinido da tabela. Pode ser chamada pelo cron existente.
create or replace function public.prune_auth_rate_limits(p_older_than_seconds integer default 86400)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits
  where window_start < now() - make_interval(secs => p_older_than_seconds);
$$;

revoke all on function public.prune_auth_rate_limits(integer) from public, anon, authenticated;

-- Agenda a limpeza diária quando pg_cron está disponível.
-- Guardado por bloco de exceção: se a extensão não existir, a migration aplica
-- normalmente e apenas registra um aviso — o rate limit continua funcionando.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    delete from cron.job where jobname = 'auth-rate-limit-prune-daily';

    perform cron.schedule(
      'auth-rate-limit-prune-daily',
      '17 3 * * *',
      $cron$select public.prune_auth_rate_limits(86400);$cron$
    );

    raise notice 'auth-rate-limit-prune-daily agendado';
  else
    raise notice 'pg_cron indisponivel: prune de rate limit nao agendado';
  end if;
exception
  when others then
    raise notice 'falha ao agendar prune de rate limit: %', sqlerrm;
end;
$$;
