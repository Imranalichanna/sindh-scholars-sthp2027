# Sindh Scholars Academy — STHP 2027 Online Test Portal

## Project status
This package includes:
- Your uploaded academy logo in `public/logo.jpg`
- Responsive student test interface
- Exactly 40 English, 40 Mathematics, and 20 IQ questions
- Question bank in `question-bank.json` (includes answer key for the owner/developer)
- Public question list without answer keys in `public/questions.json`
- Supabase schema with admin-only result reading
- Secure Edge Function starter for server-side marking and saving
- Admin-results Edge Function starter

**Important:** This is a source package, not a live website. The public frontend still needs to be wired to the Edge Functions before it can store real submissions. The admin dashboard UI and secure admin login page also need to be completed before real student use. Do not publish as a real test until you finish the checklist below.

## 1. Free-tier services
- GitHub: https://github.com/
- Supabase: https://supabase.com/
- Cloudflare Pages: https://pages.cloudflare.com/

Free plans can have quotas and inactivity restrictions. Check current pricing and limits before opening the test to a large cohort.

## 2. Deploy frontend
1. Create a GitHub repository, e.g. `sindh-scholars-sthp2027`.
2. Upload the contents of this project.
3. In Cloudflare Pages, create a project connected to that GitHub repository.
4. Set the output/build directory to `public` and use a no-build static setup if prompted.
5. Deploy and record the provided `*.pages.dev` URL.
6. The frontend will show the student interface, but it will not store real attempts until step 4 is completed.

## 3. Configure Supabase
1. Create a Supabase project.
2. In SQL Editor, run `supabase/migrations/001_schema.sql`.
3. In Authentication, create an administrator user with a strong password.
4. Copy the admin user's UUID.
5. Run: `insert into public.admins(user_id) values ('YOUR-ADMIN-UUID');`
6. Install/configure the Supabase CLI or deploy the functions using the current Supabase Edge Functions deployment workflow.
7. Set secrets on the server only:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANSWER_KEY_JSON`
   - `ALLOWED_ORIGIN` (your exact Cloudflare Pages domain)
8. `ANSWER_KEY_JSON` must be a JSON array of exactly 100 answer indices, each 0=A, 1=B, 2=C, 3=D. The answer key is in `question-bank.json` under `answerIndex`. Do not upload this file to the public `public/` folder.
9. Deploy `submit-test` and `admin-results` functions.
10. Wire the frontend submit handler to send the selected answer index for all 100 questions to `submit-test`. The endpoint should return only a neutral confirmation, never marks.

## 4. Before public use — REQUIRED
- Complete the admin sign-in page and dashboard UI using Supabase Auth.
- Wire the dashboard to call `admin-results` with the authenticated admin session.
- Wire the student submit flow to the `submit-test` function.
- Add server-side rate limiting / bot protection appropriate for the test.
- Confirm unique Student ID policy and whether one attempt per ID is appropriate.
- Check the questions and answer key with a subject expert. In particular, review every calculation, wording and distractor before using this as a competitive mock test.
- Test unauthorized access: anonymous visitors must not read `attempts`; student requests must not receive scores; non-admin users must get 403 from `admin-results`.
- Test 100-question scoring and all 3 section boundaries.
- Run a test with dummy student records on mobile and desktop.
- Export a sample result list and confirm emails are excluded from public collective results.

## 5. Result privacy and collective result
Private dashboard fields: name, Student ID, email, district, English /40, Mathematics /40, IQ /20, total /100, percentage, submission timestamp.
Public collective result should be separately generated and should not include email addresses. Publish only fields that students have agreed to share.

## 6. Answer-key JSON generation
The answer key array must preserve question order:
- positions 0–39: English
- positions 40–79: Mathematics
- positions 80–99: IQ

Generate server secret from `question-bank.json`'s `answerIndex` values. Never expose answer indices in the public frontend or public repository.

## 7. Known limitations
This deliverable is a starter implementation, not a finished audited production application. The static test UI is functional for navigation, but the submit handler currently deliberately stops before saving anything. This prevents falsely claiming private results are being stored when the backend is not connected.
