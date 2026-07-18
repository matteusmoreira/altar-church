-- Vincula cada credencial de retirada a um responsável ainda autorizado.
alter table public.kid_pickup_credentials
  add column if not exists guardian_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'kid_pickup_credentials_guardian_id_fkey'
  ) then
    alter table public.kid_pickup_credentials
      add constraint kid_pickup_credentials_guardian_id_fkey
      foreign key (guardian_id) references public.kid_guardians(id) on delete restrict;
  end if;
end $$;

update public.kid_pickup_credentials credential
set guardian_id = (
  select linked.id
  from public.kid_guardians linked
  where linked.kid_id = credential.kid_id
    and linked.company_id = credential.company_id
    and linked.can_checkout = true
    and linked.deleted_at is null
  order by linked.is_primary desc, linked.created_at, linked.id
  limit 1
)
where credential.guardian_id is null
  and exists (
    select 1 from public.kid_guardians linked
    where linked.kid_id = credential.kid_id
      and linked.company_id = credential.company_id
      and linked.can_checkout = true
      and linked.deleted_at is null
  );

create index if not exists kid_pickup_credentials_guardian_idx
  on public.kid_pickup_credentials(guardian_id, status)
  where guardian_id is not null;
