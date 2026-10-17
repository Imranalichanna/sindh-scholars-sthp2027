-- Assign stable, unique-looking academy IDs to existing and future student profiles.
update public.profiles
set student_id = 'SSA-' || upper(substr(replace(id::text, '-', ''), 1, 12))
where student_id is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare display text;
begin
  display := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(coalesce(new.email, 'student'), '@', 1));
  insert into public.profiles(id, student_id, display_name)
  values (new.id, 'SSA-' || upper(substr(replace(new.id::text, '-', ''), 1, 12)), left(display,120))
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;
