-- Remove o indice duplicado criado para o mesmo conjunto de colunas.
-- O indice volunteer_event_positions_event_idx ja existe e possui uso registrado.

drop index if exists public.volunteer_event_positions_company_event_idx;
