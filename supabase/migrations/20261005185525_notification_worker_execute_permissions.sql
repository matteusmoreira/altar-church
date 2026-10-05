-- Supabase default privileges can grant anon/authenticated directly, independent of PUBLIC.
revoke all on function public.claim_notification_delivery_batch(integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_notification_delivery_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_delivery_batch(integer, uuid, uuid) to service_role;
grant execute on function public.claim_notification_delivery_batch(integer) to service_role;
