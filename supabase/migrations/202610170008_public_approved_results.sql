-- Curated, explicitly approved public result rows. Never include emails, phone numbers, or answers.
create table public.public_result_entries (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  attempt_id uuid not null unique references public.test_attempts(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  score numeric(8,2) not null,
  percentage numeric(6,2) not null check (percentage between 0 and 100),
  is_published boolean not null default false,
  published_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index public_result_entries_test_score_idx on public.public_result_entries(test_id, score desc, published_at asc);

alter table public.public_result_entries enable row level security;
create policy "public_approved_results_read" on public.public_result_entries for select to anon, authenticated
using (
  is_published
  and exists (
    select 1 from public.tests t
    where t.id = test_id
      and t.result_policy = 'public_results_after_approval'
      and t.results_released = true
      and t.public_leaderboard_enabled = true
  )
);
revoke all on public.public_result_entries from anon, authenticated;
grant select (id, test_id, display_name, score, percentage, published_at, is_published) on public.public_result_entries to anon, authenticated;
