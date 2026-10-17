-- Create a least-privilege student profile and role at auth signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare display text;
begin
  display := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email, 'student'), '@', 1));
  insert into public.profiles(id, display_name)
  values (new.id, left(display,120))
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_ssa on auth.users;
create trigger on_auth_user_created_ssa after insert on auth.users
for each row execute procedure public.handle_new_user();
