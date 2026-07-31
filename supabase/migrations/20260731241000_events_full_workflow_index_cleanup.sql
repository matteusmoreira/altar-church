-- Remove índices redundantes: os índices únicos parciais já cobrem estas FKs.
drop index if exists public.event_attendee_tokens_member_fk_idx;
drop index if exists public.event_attendee_tokens_guest_fk_idx;

analyze public.event_attendee_tokens;
