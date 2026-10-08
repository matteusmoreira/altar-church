-- Check durable work in Postgres before starting an HTTP/serverless invocation.
-- Keep the scheduler active so new events and expired leases still wake it.
create or replace function public.automation_worker_has_work() returns boolean
language sql stable security definer set search_path = public as $$
 select
  exists(select 1 from public.automation_inbox
    where due_at <= now() and (status = 'pending' or (status = 'working' and lease_until < now())))
  or exists(select 1 from public.automation_runs r join public.automation_flows f on f.id = r.flow_id
    where f.status = 'active' and (
      (r.due_at <= now() and (r.status in ('ready','waiting') or (r.status = 'working' and r.lease_until < now())))
      or (r.status = 'waiting' and r.wait_kind = 'task' and exists(
        select 1 from public.automation_tasks t where t.run_id = r.id and t.id::text = r.context->>'task_id' and t.status = 'completed'))))
  or exists(select 1 from public.automation_flows f join public.automation_versions v on v.id = f.published_version_id
    cross join lateral jsonb_array_elements(v.definition->'nodes') n
    where f.status = 'active' and n->>'kind' = 'trigger' and (
      n->'config'->>'mode' in ('schedule','birthday','relative_date')
      or (n->'config'->>'mode' = 'event' and n->'config'->>'event' in ('event.upcoming','volunteer.upcoming'))
      or (n->'config'->>'mode' = 'event' and exists(select 1 from public.automation_events e
        where e.processed_at is null and e.company_id = f.company_id and e.created_at > f.published_at
          and e.type = n->'config'->>'event'))));
$$;
revoke all on function public.automation_worker_has_work() from public, anon, authenticated;
grant execute on function public.automation_worker_has_work() to service_role;

create or replace function public.invoke_automation_worker() returns bigint
language plpgsql security definer set search_path = public, extensions, vault, net as $$
declare endpoint text; secret text;
begin
 if not public.automation_worker_has_work() then return null; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'automation_worker_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name = 'automation_worker_secret' limit 1;
 if endpoint is null or secret is null then return null; end if;
 return net.http_post(url := endpoint, headers := jsonb_build_object('Content-Type','application/json','x-automation-worker-secret',secret), body := '{}'::jsonb, timeout_milliseconds := 55000);
end $$;
revoke all on function public.invoke_automation_worker() from public, anon, authenticated;
