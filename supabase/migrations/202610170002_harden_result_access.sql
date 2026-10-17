-- Defense-in-depth: students must use controlled Edge Functions for result access.
-- PostgreSQL grants are column/table-level as well as row-level; RLS alone cannot hide columns.
revoke select on public.questions from anon, authenticated;
grant select (id, test_id, statement, options, subject, topic, difficulty, marks, media_url, position, is_active, created_at, updated_at)
on public.questions to anon, authenticated;

drop policy if exists "attempts_read_own_or_staff" on public.test_attempts;
create policy "attempts_staff_read_only" on public.test_attempts for select to authenticated
using (public.is_staff());

drop policy if exists "answers_read_own_or_staff" on public.submitted_answers;
create policy "answers_staff_read_only" on public.submitted_answers for select to authenticated
using (public.is_staff());

-- No client-facing insert/delete policies for attempts, answers, or answer keys.
revoke all on public.question_answer_keys from anon, authenticated;
revoke insert, update, delete on public.test_attempts from anon, authenticated;
revoke insert, update, delete on public.submitted_answers from anon, authenticated;

-- Explanations can reveal correct answers, so they are returned only by a trusted
-- result endpoint after the test's result policy permits them.
revoke select (explanation) on public.questions from anon, authenticated;

-- Student result/history queries must go through my-results Edge Function.
-- Public leaderboard queries must use an explicitly curated, approved dataset in a future migration.
