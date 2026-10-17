-- Public result tests remain readable by title after closing only when their approved public list is released.
drop policy if exists "tests_read_published" on public.tests;
create policy "tests_read_published" on public.tests for select to anon, authenticated
using (
  status = 'published'
  or (result_policy = 'public_results_after_approval' and results_released = true and public_leaderboard_enabled = true)
  or public.is_staff()
);
