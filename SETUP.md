# Setup and deployment guide

## Status and safety

This branch contains an initial functional foundation, but it has not been connected to a real Supabase project or deployed to Cloudflare from this environment. Do not invite real students until all manual checks below pass.

**Important repository warning:** the GitHub repository was observed with public visibility, and the former root question-bank.json included answer keys. The file has been deleted from the current main and development branch heads, but the prior commit remains in history. Make the repository private now, then follow GitHub's guidance for removing sensitive content from history if you need to prevent retrieval from old commits. Do not commit question answer keys again.

## 1. Prerequisites

- GitHub account and repository access
- Supabase project
- Cloudflare account with Pages enabled
- Supabase CLI installed locally
- Node.js 20 or newer for local JavaScript syntax/security checks
- Deno installed if you want to type-check Edge Functions locally

## 2. Configure Supabase

1. Create a Supabase project and keep its database password in a password manager.
2. From the repository root, log in and link the CLI:
   - supabase login
   - supabase link --project-ref YOUR_PROJECT_REF
3. Apply migrations in order:
   - supabase db push
   The migrations create profiles and roles, programme categories, tests, questions, protected answer keys, attempts and answers, study materials, announcements, site settings, audit logs, RLS policies, a private PDF bucket, the signup profile trigger, and the atomic scoring RPC.
4. In Supabase Authentication, configure your permitted sign-in methods and email confirmation behavior.
5. In Authentication URL Configuration, set your production Cloudflare Pages URL as the Site URL and add the exact local/production redirect URLs you use.
6. Configure the exact Cloudflare origin as an Edge Function secret:
   - supabase secrets set ALLOWED_ORIGIN=https://YOUR_PROJECT.pages.dev
   Replace the value with your actual production origin. If using a custom domain, use that exact origin instead. Do not include a trailing slash.
7. Supabase supplies project URL, anon/publishable key, and service-role key to Edge Functions as server environment variables. Verify the current Supabase function environment documentation for your project. Never copy the service-role key into frontend files.

## 3. Configure the public frontend

Edit public/config.js and replace:
- https://YOUR_PROJECT_REF.supabase.co with the project URL
- YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY with the publishable/anon key
- whatsappCommunityUrl with your academy's HTTPS community/channel link
- contactEmail with a monitored academy email address (leave blank until one is available)

The publishable/anon key is designed to be public. It is only safe when RLS, table grants, and storage policies are configured correctly. Never place a service-role key in this file.

## 4. Deploy Edge Functions

From the repository root, deploy the following functions:

- supabase functions deploy start-test
- supabase functions deploy save-progress
- supabase functions deploy submit-test
- supabase functions deploy my-results
- supabase functions deploy admin-results
- supabase functions deploy admin-content
- supabase functions deploy material-url

Confirm the deployment logs report success for every function. If you use a Supabase project that does not automatically provide the documented built-in environment variables, configure them through the Supabase secrets manager only.

## 5. Create the first Super Admin securely

1. Sign up through the public website using the email account that should become the first administrator, then confirm the email if required.
2. In Supabase Dashboard → SQL Editor, verify that a profile and student role were created for that authenticated user. Do not insert or modify passwords in SQL.
3. Copy that user's UUID from Authentication → Users.
4. As the project owner, run this one-time SQL statement, replacing the UUID with the actual user UUID:

   insert into public.user_roles (user_id, role)
   values ('YOUR_AUTH_USER_UUID', 'super_admin')
   on conflict (user_id, role) do nothing;

5. Sign in at /admin.html. The page will call a server function that verifies the user's role. A frontend-only role flag does not grant access.
6. Keep this administrator account protected with a unique password and multi-factor authentication where available. Grant content_manager only to trusted staff, and never grant roles through the public client.

## 6. Deploy to Cloudflare Pages

1. Ensure your repository's production branch is the branch you intend to deploy. Current implementation work is on phase-1-foundation; it has not been merged to main.
2. In Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git, select this GitHub repository and the intended branch.
3. Framework preset: None.
4. Build command: leave empty for the static HTML project.
5. Build output directory: public.
6. Save and deploy. After the first deployment, set the ALLOWED_ORIGIN Supabase secret to the exact deployed origin, redeploy Edge Functions if required by your workflow, and retest.
7. Set a custom domain only after the pages.dev deployment works. Add the custom domain as the exact allowed origin in Supabase.

## 7. Add a test and questions

1. Sign in as Super Admin at /admin.html.
2. Create and publish a programme category.
3. Create a test draft. Set duration, maximum attempts, schedule, negative marking, and result policy. The default recommended policy is admin_only_until_release.
4. Add four-option MCQs using the Question bank tab. Correct answers are sent to the protected admin-content function and stored in question_answer_keys.
5. Check question wording, options, correct answers, marks, start/end time, and negative penalty.
6. Use Validate & publish. The server checks that the test has active questions and every active question has a correct answer key; it calculates total marks.
7. Open the public homepage in a separate student account and attempt the test.

The initial admin workspace supports adding questions but does not yet include bulk CSV import or full question editing. Do not use it to publish a large question bank until those features and validation checks have been added.

## 8. Upload a PDF

1. Sign in as an authorized staff member at /admin.html.
2. Open PDF Library, provide title/description/programme/subject, select a PDF under 50 MB, and choose whether to publish it.
3. The file is uploaded to the private study-materials bucket. A database record points to the storage path.
4. Public visitors see published resource metadata; the material-url function generates a short-lived signed URL only for a published resource.
5. Verify an unpublished file cannot be opened through the public site and a student cannot upload or delete storage objects.

## 9. Publish results

1. The evaluator stores results in PostgreSQL. Student clients do not have direct read permission on test_attempts or submitted_answers.
2. Open Admin → Results as Super Admin to view the private result list and export a CSV.
3. Review records before publication.
4. Use Release results only when authorized to make students' personal results visible. Use Hide results to revoke student visibility.
5. The public approved leaderboard is not implemented in this phase. Do not publish private result tables as public files or expose student emails, phone numbers, or private answers.

## 10. Run available checks

From the repository root:

- npm test
- npm run check

These validate public JavaScript syntax and basic repository security invariants. They do not replace live database tests, Edge Function authorization tests, or end-to-end tests.

For Edge Function type checking, install Deno and run:
- deno check supabase/functions/start-test/index.ts
- deno check supabase/functions/save-progress/index.ts
- deno check supabase/functions/submit-test/index.ts
- deno check supabase/functions/my-results/index.ts
- deno check supabase/functions/admin-results/index.ts
- deno check supabase/functions/admin-content/index.ts
- deno check supabase/functions/material-url/index.ts

For database integration tests, start your local Supabase stack and run:
- supabase start
- supabase test db

The SQL tests cover key RLS grants and atomic scoring/duplicate submission behavior. They have not been executed against your live project from this environment.

Then manually verify each item:
- Register, confirm email if enabled, log in, log out, and refresh the page.
- Confirm the signup trigger creates only a student role.
- Confirm a normal student receives 403 from admin-content and admin-results.
- Confirm anonymous users cannot start, save, or submit a test.
- Confirm correct answers and explanations are absent from public question API responses.
- Confirm attempts and submitted answers cannot be read directly by a student, including another student's records.
- Confirm timer expiry is checked by the server, duplicate submissions are rejected, and attempts persist after refresh.
- Confirm scores are hidden until release and become visible only according to the configured policy.
- Confirm a private PDF is inaccessible without a short-lived signed URL and students cannot upload/delete files.
- Export a test result list and verify no email addresses or private answers are included.
- Test mobile and desktop layouts and keyboard navigation.

## 11. Backups and operations

Before real use, configure Supabase backups appropriate to your plan, export a database snapshot before migrations, test restoring into a separate project, define a data retention period, and document who can access exports. Add rate limiting/bot protection and monitoring before advertising a high-volume exam.
