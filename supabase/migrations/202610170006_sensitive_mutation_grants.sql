-- Route sensitive assessment mutations through role-checked Edge Functions.
-- Without these grant restrictions, a staff client could bypass publish validation or release results directly.
revoke insert, update, delete on public.exam_categories from anon, authenticated;
revoke insert, update, delete on public.tests from anon, authenticated;
revoke insert, update, delete on public.questions from anon, authenticated;

drop policy if exists "attempts_staff_update" on public.test_attempts;
revoke insert, update, delete on public.test_attempts from anon, authenticated;
revoke insert, update, delete on public.submitted_answers from anon, authenticated;

-- Result-release changes must go through admin-content, which explicitly requires super_admin.
-- Direct browser writes to result-release fields are not permitted.
