-- Give ministry-created communications an immutable ministry scope so they
-- can be managed without guessing from the recipient snapshot.
alter table public.notifications
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;

update public.notifications notification
set ministry_id = notification.audience_ref_id
where notification.ministry_id is null
  and notification.audience_kind = 'ministry'
  and notification.audience_ref_id is not null;

update public.notifications notification
set ministry_id = team.ministry_id
from public.groups team
where notification.ministry_id is null
  and notification.audience_kind = 'ministry_team'
  and notification.audience_ref_id = team.id
  and team.type = 'ministry';

create index if not exists notifications_company_ministry_created_idx
  on public.notifications(company_id, ministry_id, created_at desc)
  where deleted_at is null and ministry_id is not null;
