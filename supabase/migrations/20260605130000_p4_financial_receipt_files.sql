alter table public.revenues
add column if not exists receipt_file_id uuid references public.app_files(id) on delete set null;

alter table public.expenses
add column if not exists receipt_file_id uuid references public.app_files(id) on delete set null;

alter table public.donations
add column if not exists receipt_file_id uuid references public.app_files(id) on delete set null;

create index if not exists revenues_receipt_file_id_idx
on public.revenues(receipt_file_id)
where receipt_file_id is not null;

create index if not exists expenses_receipt_file_id_idx
on public.expenses(receipt_file_id)
where receipt_file_id is not null;

create index if not exists donations_receipt_file_id_idx
on public.donations(receipt_file_id)
where receipt_file_id is not null;
