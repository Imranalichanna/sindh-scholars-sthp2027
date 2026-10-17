-- Sindh Scholars Academy: Phase 1 secure relational foundation
-- Apply in Supabase SQL Editor or with Supabase CLI. Review before production.
create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','content_manager','student');
create type public.test_status as enum ('draft','published','closed','archived');
create type public.result_policy as enum ('admin_only_until_release','personal_result','public_results_after_approval');
create type public.attempt_status as enum ('in_progress','submitted','expired','voided');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  student_id text unique,
  display_name text not null check (char_length(display_name) between 1 and 120),
  district text check (district is null or char_length(district) <= 100),
  education_level text check (education_level is null or char_length(education_level) <= 100),
  account_status text not null default 'active' check (account_status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'student',
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.exam_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  icon text not null default 'book-open',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.exam_categories(id) on delete set null,
  title text not null check (char_length(title) between 1 and 180),
  slug text not null unique,
  description text not null default '',
  instructions text not null default '',
  syllabus text not null default '',
  eligibility text not null default '',
  duration_seconds integer not null check (duration_seconds between 60 and 86400),
  total_marks numeric(8,2) not null default 0 check (total_marks >= 0),
  negative_marking boolean not null default false,
  negative_penalty numeric(6,2) not null default 0 check (negative_penalty >= 0),
  max_attempts integer not null default 1 check (max_attempts between 1 and 100),
  starts_at timestamptz,
  closes_at timestamptz,
  status public.test_status not null default 'draft',
  result_policy public.result_policy not null default 'admin_only_until_release',
  results_released boolean not null default false,
  public_leaderboard_enabled boolean not null default false,
  question_order_randomized boolean not null default true,
  option_order_randomized boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or starts_at is null or closes_at > starts_at)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 10000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 10),
  explanation text,
  subject text,
  topic text,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  marks numeric(6,2) not null default 1 check (marks >= 0),
  media_url text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private table: never grant student or anonymous access.
create table public.question_answer_keys (
  question_id uuid primary key references public.questions(id) on delete cascade,
  correct_option_index integer not null check (correct_option_index >= 0),
  updated_at timestamptz not null default now()
);

create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  score numeric(8,2),
  percentage numeric(6,2),
  correct_count integer,
  incorrect_count integer,
  unanswered_count integer,
  result_status text not null default 'pending' check (result_status in ('pending','graded','approved','voided')),
  public_name text,
  created_at timestamptz not null default now(),
  unique (test_id, user_id, attempt_number),
  check (percentage is null or percentage between 0 and 100)
);
create index test_attempts_user_test_idx on public.test_attempts(user_id, test_id, created_at desc);
create index test_attempts_test_score_idx on public.test_attempts(test_id, score desc) where status = 'submitted';

create table public.submitted_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  selected_option_index integer check (selected_option_index is null or selected_option_index >= 0),
  is_correct boolean,
  awarded_marks numeric(8,2),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '',
  category_id uuid references public.exam_categories(id) on delete set null,
  subject text,
  resource_type text not null default 'pdf' check (resource_type in ('pdf','document','link','video')),
  storage_path text,
  external_url text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes between 0 and 52428800),
  tags text[] not null default '{}',
  is_published boolean not null default false,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((storage_path is not null) or (external_url is not null))
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  body text not null,
  is_published boolean not null default false,
  publish_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or publish_at is null or expires_at > publish_at)
);

create table public.site_settings (
  key text primary key check (char_length(key) between 1 and 100),
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_activity_logs_created_at_idx on public.admin_activity_logs(created_at desc);

create or replace function public.has_role(required_role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = required_role); $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('super_admin','content_manager')); $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin'); $$;

revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- Profile creation is driven by a trusted signup flow; users cannot grant themselves roles.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.exam_categories enable row level security;
alter table public.tests enable row level security;
alter table public.questions enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.test_attempts enable row level security;
alter table public.submitted_answers enable row level security;
alter table public.study_materials enable row level security;
alter table public.announcements enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_activity_logs enable row level security;

create policy "profiles_select_own_or_staff" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_staff());
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated
using (id = auth.uid() or public.is_super_admin())
with check (id = auth.uid() or public.is_super_admin());
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "roles_select_self_or_superadmin" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());
create policy "roles_manage_superadmin" on public.user_roles for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "categories_read_published" on public.exam_categories for select to anon, authenticated
using (is_published or public.is_staff());
create policy "categories_manage_staff" on public.exam_categories for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "tests_read_published" on public.tests for select to anon, authenticated
using (status = 'published' or public.is_staff());
create policy "tests_manage_staff" on public.tests for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "questions_read_published_test" on public.questions for select to anon, authenticated
using (is_active and exists (select 1 from public.tests t where t.id = test_id and t.status = 'published') or public.is_staff());
create policy "questions_manage_staff" on public.questions for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- No student-facing policies on answer keys: only trusted service-role server code can read them.
create policy "answer_keys_manage_staff" on public.question_answer_keys for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "attempts_read_own_or_staff" on public.test_attempts for select to authenticated
using (user_id = auth.uid() or public.is_staff());
create policy "attempts_staff_update" on public.test_attempts for update to authenticated
using (public.is_staff()) with check (public.is_staff());
-- Attempt inserts/submissions are performed by trusted Edge Functions only.

create policy "answers_read_own_or_staff" on public.submitted_answers for select to authenticated
using (exists (select 1 from public.test_attempts a where a.id = attempt_id and (a.user_id = auth.uid() or public.is_staff())));
-- No direct student insert/update/delete: trusted evaluator writes answers.

create policy "materials_read_published" on public.study_materials for select to anon, authenticated
using (is_published or public.is_staff());
create policy "materials_manage_staff" on public.study_materials for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "announcements_read_published" on public.announcements for select to anon, authenticated
using (is_published and (publish_at is null or publish_at <= now()) and (expires_at is null or expires_at > now()) or public.is_staff());
create policy "announcements_manage_staff" on public.announcements for all to authenticated
using (public.is_staff()) with check (public.is_staff());

create policy "settings_read_public_or_staff" on public.site_settings for select to anon, authenticated
using (is_public or public.is_staff());
create policy "settings_manage_superadmin" on public.site_settings for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy "audit_read_superadmin" on public.admin_activity_logs for select to authenticated
using (public.is_super_admin());
-- Inserts to audit log are performed by trusted server-side operations.

-- Private bucket for PDFs. Use signed URLs or an authenticated download function for private materials.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-materials', 'study-materials', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['application/pdf'];

create policy "staff_upload_materials" on storage.objects for insert to authenticated
with check (bucket_id = 'study-materials' and public.is_staff());
create policy "staff_update_materials" on storage.objects for update to authenticated
using (bucket_id = 'study-materials' and public.is_staff())
with check (bucket_id = 'study-materials' and public.is_staff());
create policy "staff_delete_materials" on storage.objects for delete to authenticated
using (bucket_id = 'study-materials' and public.is_staff());
create policy "staff_read_materials" on storage.objects for select to authenticated
using (bucket_id = 'study-materials' and public.is_staff());

-- Public content should be exposed only through the published rows above. Keep answer keys private.
