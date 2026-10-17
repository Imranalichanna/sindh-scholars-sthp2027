-- The auth signup trigger creates profiles. Students may only update non-privileged fields.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, district, education_level) on public.profiles to authenticated;
grant select on public.profiles to authenticated;
drop policy if exists "profiles_insert_own" on public.profiles;
