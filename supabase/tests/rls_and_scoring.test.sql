begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok((select relrowsecurity from pg_class where oid='public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.test_attempts'::regclass), 'attempts has RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.submitted_answers'::regclass), 'submitted answers have RLS enabled');
select ok(not has_table_privilege('anon','public.question_answer_keys','SELECT'), 'anonymous visitors cannot select answer keys');
select ok(not has_table_privilege('authenticated','public.question_answer_keys','SELECT'), 'students cannot select answer keys directly');
select ok(not has_table_privilege('authenticated','public.test_attempts','INSERT'), 'students cannot create trusted attempt records directly');
select ok(not has_table_privilege('authenticated','public.submitted_answers','INSERT'), 'students cannot insert scored answer records directly');
select ok(has_function_privilege('service_role','public.submit_test_attempt(uuid,uuid,jsonb,boolean)','EXECUTE'), 'service role can call trusted scoring RPC');
select ok(not has_function_privilege('authenticated','public.submit_test_attempt(uuid,uuid,jsonb,boolean)','EXECUTE'), 'browser-authenticated users cannot call trusted scoring RPC');

-- Integration fixture: 2 MCQs, one correct and one incorrect, 0.25 negative penalty.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
values ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','ssa-test@example.invalid','',now(),now(),now(),'{"display_name":"SSA Test Student"}'::jsonb)
on conflict (id) do nothing;

insert into public.exam_categories(id,slug,name,is_published)
values ('e2000000-0000-4000-8000-000000000001','ssa-test-category','SSA Test Category',true)
on conflict (id) do nothing;

insert into public.tests(id,category_id,title,slug,duration_seconds,total_marks,negative_marking,negative_penalty,max_attempts,status,results_released)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','SSA scoring integration test','ssa-scoring-integration-test',3600,2,true,0.25,1,'published',false)
on conflict (id) do nothing;

insert into public.questions(id,test_id,statement,options,marks,position)
values
('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','One plus one?','["1","2","3","4"]'::jsonb,1,1),
('e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000001','Two plus two?','["3","5","4","6"]'::jsonb,1,2)
on conflict (id) do nothing;

insert into public.question_answer_keys(question_id,correct_option_index)
values ('e4000000-0000-4000-8000-000000000001',1),('e4000000-0000-4000-8000-000000000002',2)
on conflict (question_id) do update set correct_option_index=excluded.correct_option_index;

insert into public.test_attempts(id,test_id,user_id,attempt_number,status,started_at)
values ('e5000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',1,'in_progress',now())
on conflict (id) do nothing;

create temporary table ssa_eval_result as
select public.submit_test_attempt(
 'e5000000-0000-4000-8000-000000000001',
 'e1000000-0000-4000-8000-000000000001',
 '[{"questionId":"e4000000-0000-4000-8000-000000000001","selectedOptionIndex":1},{"questionId":"e4000000-0000-4000-8000-000000000002","selectedOptionIndex":0}]'::jsonb,
 false
) as result;

select is((select (result->>'score')::numeric from ssa_eval_result),0.75::numeric,'server scoring applies the configured negative penalty');
select is((select (result->>'correctCount')::integer from ssa_eval_result),1,'server counts correct answers');
select is((select (result->>'incorrectCount')::integer from ssa_eval_result),1,'server counts incorrect answers');
select throws_ok(
 $$select public.submit_test_attempt(
 'e5000000-0000-4000-8000-000000000001',
 'e1000000-0000-4000-8000-000000000001',
 '[]'::jsonb,
 false)$$,
 '55000',
 'attempt_already_submitted',
 'duplicate submissions are rejected'
);

select * from finish();
rollback;
