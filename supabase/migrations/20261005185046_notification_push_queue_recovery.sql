-- Scoped claiming lets new campaigns and retries start without draining other tenants.
create or replace function public.claim_notification_delivery_batch(batch_size integer, campaign_id uuid, tenant_id uuid)
returns setof public.notification_deliveries
language plpgsql security definer set search_path = ''
as $$
begin
  -- A worker can disappear after claiming a batch. Never leave these items locked forever.
  update public.notification_deliveries delivery
  set status = case when delivery.attempts >= 8 then 'dead' else 'failed' end,
      locked_at = null, next_attempt_at = now(), updated_at = now(),
      last_error = 'Processamento interrompido; prazo de execução expirado'
  where delivery.status = 'processing'
    and coalesce(delivery.locked_at, delivery.updated_at) < now() - interval '15 minutes'
    and (campaign_id is null or delivery.notification_id = campaign_id)
    and (tenant_id is null or delivery.company_id = tenant_id);

  update public.notifications campaign set status = 'failed', completed_at = now(), updated_at = now()
  where campaign.deleted_at is null and campaign.status in ('queued', 'scheduled', 'processing')
    and (campaign_id is null or campaign.id = campaign_id)
    and (tenant_id is null or campaign.company_id = tenant_id)
    and exists (select 1 from public.notification_deliveries d where d.notification_id = campaign.id and d.status = 'dead')
    and not exists (select 1 from public.notification_deliveries d where d.notification_id = campaign.id and d.status in ('pending', 'processing', 'failed'));

  return query
  with eligible as (
    select delivery.id
    from public.notification_deliveries delivery
    join public.notifications campaign on campaign.id = delivery.notification_id and campaign.company_id = delivery.company_id
    where delivery.status in ('pending', 'failed') and delivery.next_attempt_at <= now() and delivery.attempts < 8
      and campaign.deleted_at is null and campaign.status not in ('canceled', 'draft')
      and (campaign_id is null or delivery.notification_id = campaign_id)
      and (tenant_id is null or delivery.company_id = tenant_id)
      and (
        select count(*) from public.notification_deliveries same_tenant
        join public.notifications other on other.id = same_tenant.notification_id and other.company_id = same_tenant.company_id
        where same_tenant.company_id = delivery.company_id
          and same_tenant.status in ('pending', 'failed') and same_tenant.next_attempt_at <= now() and same_tenant.attempts < 8
          and other.deleted_at is null and other.status not in ('canceled', 'draft')
          and (campaign_id is null or same_tenant.notification_id = campaign_id)
          and (same_tenant.next_attempt_at, same_tenant.created_at, same_tenant.id) <= (delivery.next_attempt_at, delivery.created_at, delivery.id)
      ) <= greatest(1, least(batch_size, 25))
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    for update of delivery skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_deliveries delivery
  set status = 'processing', attempts = delivery.attempts + 1, locked_at = now(), updated_at = now()
  from eligible where delivery.id = eligible.id returning delivery.*;
end;
$$;

create or replace function public.claim_notification_delivery_batch(batch_size integer default 25)
returns setof public.notification_deliveries
language sql security definer set search_path = ''
as $$ select * from public.claim_notification_delivery_batch(batch_size, null::uuid, null::uuid); $$;

revoke all on function public.claim_notification_delivery_batch(integer, uuid, uuid) from public;
grant execute on function public.claim_notification_delivery_batch(integer, uuid, uuid) to service_role;
revoke all on function public.claim_notification_delivery_batch(integer) from public;
grant execute on function public.claim_notification_delivery_batch(integer) to service_role;

-- Reuse consenting devices already registered through the volunteer portal, only for live people.
insert into public.notification_push_subscriptions(company_id, person_id, endpoint, p256dh, auth_key, user_agent, is_active)
select subscription.company_id, person.id, subscription.endpoint, subscription.p256dh, subscription.auth_key, subscription.user_agent, true
from public.volunteer_push_subscriptions subscription
join lateral (
  select p.id from public.people p
  where p.company_id = subscription.company_id and p.deleted_at is null and p.is_active = true and p.status <> 'inactive'
    and (p.profile_id = subscription.profile_id
      or p.id = (select profile.person_id from public.profiles profile where profile.id = subscription.profile_id and profile.company_id = subscription.company_id)
      or p.id = (select volunteer.person_id from public.volunteer_profiles volunteer where volunteer.id = subscription.volunteer_id and volunteer.company_id = subscription.company_id and volunteer.deleted_at is null))
  order by (p.profile_id = subscription.profile_id) desc, p.id limit 1
) person on true
where subscription.is_active = true
on conflict (endpoint) do nothing;
