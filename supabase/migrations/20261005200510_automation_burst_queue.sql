create table public.automation_inbox (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.companies(id),
 instance_id uuid not null references public.uazapi_instances(id),
 event_key text not null, chat_id text not null, event jsonb,
 status text not null default 'pending' check(status in ('pending','working','processed','failed')),
 attempts integer not null default 0, due_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, last_error text,
 created_at timestamptz not null default now(), processed_at timestamptz,
 unique(instance_id,event_key)
);
create index automation_inbox_due on public.automation_inbox(due_at,id) where status in ('pending','working');
create index automation_inbox_chat on public.automation_inbox(instance_id,chat_id,id) where status<>'processed';
create table public.automation_send_slots (
 instance_id uuid primary key references public.uazapi_instances(id), next_at timestamptz not null
);
alter table public.automation_inbox enable row level security;
alter table public.automation_send_slots enable row level security;
revoke all on public.automation_inbox,public.automation_send_slots from public,anon,authenticated;
grant all on public.automation_inbox,public.automation_send_slots to service_role;
grant usage,select on sequence public.automation_inbox_id_seq to service_role;

create or replace function public.claim_automation_inbox()
returns setof public.automation_inbox language sql security definer set search_path=public as $$
 update public.automation_inbox r set status='working',attempts=r.attempts+1,
 lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
 where r.id in (
  select q.id from public.automation_inbox q
  where q.due_at<=now() and (q.status='pending' or (q.status='working' and q.lease_until<now()))
  and not exists(select 1 from public.automation_inbox previous
    where previous.instance_id=q.instance_id and previous.chat_id=q.chat_id
    and previous.id<q.id and previous.status<>'processed')
  -- Consume one answer at a time. The run must reach its next wait before the next answer.
  and not (
   q.event->>'type' like '%message%' and not coalesce((q.event->>'fromMe')::boolean,false)
   and coalesce(q.event->>'status','')='' and lower(trim(q.event->>'text')) not in ('sair','parar')
   and exists(select 1 from public.automation_conversations c join public.automation_runs a on a.id=c.run_id
     where c.instance_id=q.instance_id and c.chat_id=q.chat_id and a.status in ('ready','working'))
  )
  order by q.id for update of q skip locked limit 1
 ) returning r.*;
$$;
revoke all on function public.claim_automation_inbox() from public,anon,authenticated;
grant execute on function public.claim_automation_inbox() to service_role;

-- Activation requires a successful health probe against the updated application.
-- Preserve the current scheduler until that deployment is ready.
do $$ declare job_id bigint; begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  job_id:=cron.schedule('automation-worker-burst','10 seconds','select public.invoke_automation_worker();');
  perform cron.alter_job(job_id,active:=false);
 end if;
end $$;
