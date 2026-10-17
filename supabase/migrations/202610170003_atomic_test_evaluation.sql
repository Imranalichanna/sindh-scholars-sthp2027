-- Atomic trusted evaluation RPC. Edge Functions call this with service-role credentials only.
create or replace function public.submit_test_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_answers jsonb,
  p_timed_out boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.test_attempts%rowtype;
  t public.tests%rowtype;
  q record;
  answer_item jsonb;
  selected_idx integer;
  correct_idx integer;
  q_count integer := 0;
  correct_total integer := 0;
  incorrect_total integer := 0;
  unanswered_total integer := 0;
  earned numeric(8,2) := 0;
  possible numeric(8,2) := 0;
  pct numeric(6,2) := 0;
  elapsed integer := 0;
begin
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'answers_must_be_array' using errcode = '22023';
  end if;

  select * into a from public.test_attempts where id = p_attempt_id for update;
  if not found then raise exception 'attempt_not_found' using errcode = 'P0002'; end if;
  if a.user_id <> p_user_id then raise exception 'attempt_forbidden' using errcode = '42501'; end if;
  if a.status <> 'in_progress' then raise exception 'attempt_already_submitted' using errcode = '55000'; end if;

  select * into t from public.tests where id = a.test_id;
  if not found then raise exception 'test_not_found' using errcode = 'P0002'; end if;

  elapsed := greatest(0, floor(extract(epoch from (now() - a.started_at)))::integer);
  if elapsed < t.duration_seconds and p_timed_out then
    -- Client timeout flags are untrusted; only accept early timeout after server time has elapsed.
    raise exception 'test_time_not_expired' using errcode = '22023';
  end if;
  if elapsed >= t.duration_seconds then p_timed_out := true; end if;

  if exists (
    select 1 from jsonb_array_elements(p_answers) item
    where not exists (
      select 1 from public.questions qx
      where qx.id = nullif(item->>'questionId','')::uuid and qx.test_id = a.test_id and qx.is_active
    )
  ) then raise exception 'answer_contains_unknown_question' using errcode = '22023'; end if;

  for q in
    select qx.id, qx.options, qx.marks, ak.correct_option_index
    from public.questions qx
    join public.question_answer_keys ak on ak.question_id = qx.id
    where qx.test_id = a.test_id and qx.is_active
    order by qx.position, qx.id
  loop
    q_count := q_count + 1;
    possible := possible + q.marks;
    answer_item := null;
    select item into answer_item from jsonb_array_elements(p_answers) item
      where item->>'questionId' = q.id::text limit 1;
    selected_idx := null;
    if answer_item is not null and answer_item->>'selectedOptionIndex' is not null
      and answer_item->>'selectedOptionIndex' <> 'null' then
      begin
        selected_idx := (answer_item->>'selectedOptionIndex')::integer;
      exception when others then
        raise exception 'selected_option_invalid' using errcode = '22023';
      end;
      if selected_idx < 0 or selected_idx >= jsonb_array_length(q.options) then
        raise exception 'selected_option_out_of_range' using errcode = '22023';
      end if;
    end if;
    correct_idx := q.correct_option_index;
    if selected_idx is null then
      unanswered_total := unanswered_total + 1;
      insert into public.submitted_answers(attempt_id,question_id,selected_option_index,is_correct,awarded_marks)
      values (a.id,q.id,null,false,0) on conflict (attempt_id,question_id) do update set selected_option_index = null, is_correct = false, awarded_marks = 0;
    elsif selected_idx = correct_idx then
      correct_total := correct_total + 1;
      earned := earned + q.marks;
      insert into public.submitted_answers(attempt_id,question_id,selected_option_index,is_correct,awarded_marks)
      values (a.id,q.id,selected_idx,true,q.marks) on conflict (attempt_id,question_id) do update set selected_option_index = excluded.selected_option_index, is_correct = true, awarded_marks = excluded.awarded_marks;
    else
      incorrect_total := incorrect_total + 1;
      if t.negative_marking then earned := earned - t.negative_penalty; end if;
      insert into public.submitted_answers(attempt_id,question_id,selected_option_index,is_correct,awarded_marks)
      values (a.id,q.id,selected_idx,false,case when t.negative_marking then -t.negative_penalty else 0 end) on conflict (attempt_id,question_id) do update set selected_option_index = excluded.selected_option_index, is_correct = false, awarded_marks = excluded.awarded_marks;
    end if;
  end loop;

  if q_count = 0 then raise exception 'test_has_no_answerable_questions' using errcode = '22023'; end if;
  if q_count <> (select count(*) from public.questions where test_id = a.test_id and is_active) then
    raise exception 'answer_key_missing_for_question' using errcode = '22023';
  end if;
  earned := greatest(0, earned);
  if possible > 0 then pct := round((earned / possible) * 100, 2); end if;

  update public.test_attempts set
    status = case when p_timed_out then 'expired'::public.attempt_status else 'submitted'::public.attempt_status end,
    submitted_at = now(),
    duration_seconds = least(elapsed,t.duration_seconds),
    score = earned,
    percentage = pct,
    correct_count = correct_total,
    incorrect_count = incorrect_total,
    unanswered_count = unanswered_total,
    result_status = 'graded'
  where id = a.id;

  return jsonb_build_object(
    'success', true,
    'attemptId', a.id,
    'questionCount', q_count,
    'resultPolicy', t.result_policy,
    'resultsReleased', t.results_released,
    'score', earned,
    'percentage', pct,
    'correctCount', correct_total,
    'incorrectCount', incorrect_total,
    'unansweredCount', unanswered_total
  );
end;
$$;

revoke all on function public.submit_test_attempt(uuid,uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.submit_test_attempt(uuid,uuid,jsonb,boolean) to service_role;
