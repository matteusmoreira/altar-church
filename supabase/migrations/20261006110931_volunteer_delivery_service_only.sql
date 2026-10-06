-- CREATE OR REPLACE preserva grants explícitos de versões anteriores.
revoke all on function public.prepare_volunteer_delivery() from anon, authenticated;
grant execute on function public.prepare_volunteer_delivery() to service_role;
