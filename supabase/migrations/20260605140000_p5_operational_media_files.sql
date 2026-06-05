alter table public.reading_plans
add column if not exists cover_file_id uuid references public.app_files(id) on delete set null;

alter table public.subscription_contents
add column if not exists highlight_file_id uuid references public.app_files(id) on delete set null,
add column if not exists cover_file_id uuid references public.app_files(id) on delete set null;

alter table public.subscription_collections
add column if not exists highlight_file_id uuid references public.app_files(id) on delete set null,
add column if not exists cover_file_id uuid references public.app_files(id) on delete set null;

create index if not exists reading_plans_cover_file_id_idx
on public.reading_plans(cover_file_id)
where cover_file_id is not null;

create index if not exists subscription_contents_highlight_file_id_idx
on public.subscription_contents(highlight_file_id)
where highlight_file_id is not null;

create index if not exists subscription_contents_cover_file_id_idx
on public.subscription_contents(cover_file_id)
where cover_file_id is not null;

create index if not exists subscription_collections_highlight_file_id_idx
on public.subscription_collections(highlight_file_id)
where highlight_file_id is not null;

create index if not exists subscription_collections_cover_file_id_idx
on public.subscription_collections(cover_file_id)
where cover_file_id is not null;
