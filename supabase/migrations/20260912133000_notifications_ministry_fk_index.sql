-- Índice da coluna filha usada pela FK notifications.ministry_id.
-- O índice composto por (company_id, ministry_id) não atende a verificação
-- da FK porque ministry_id não é a primeira coluna.
create index if not exists notifications_ministry_id_idx
  on public.notifications(ministry_id);
