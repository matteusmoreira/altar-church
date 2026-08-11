-- Criação opcional de conta de membro após o envio de um formulário público.

alter table public.forms
  add column if not exists create_account_after_submit boolean not null default false;

comment on column public.forms.create_account_after_submit is
  'Cria ou reutiliza uma conta member vinculada ao nome e telefone do envio público.';

create index if not exists forms_company_account_creation_idx
  on public.forms(company_id, create_account_after_submit)
  where deleted_at is null;
