-- A tabela é usada apenas pela conexão de serviço. A policy explícita torna
-- o deny-by-default auditável sem conceder acesso a anon/authenticated.
create policy auth_rate_limits_deny_public
  on public.auth_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);
