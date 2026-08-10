create index if not exists auth_password_reset_company_idx
  on public.auth_password_reset_challenges(company_id);

drop policy if exists "Password reset challenges deny clients" on public.auth_password_reset_challenges;
create policy "Password reset challenges deny clients"
on public.auth_password_reset_challenges
for all
to anon, authenticated
using (false)
with check (false);

revoke all on public.auth_password_reset_challenges from public, anon, authenticated;
