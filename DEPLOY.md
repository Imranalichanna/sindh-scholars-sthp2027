# Deployment checklist — Cloudflare Pages + Supabase

This file documents the manual steps and required repository secrets to deploy the site from the phase-1-foundation branch.

Prerequisites (local):
- A Cloudflare account with Pages enabled.
- A Supabase project for the application data and Edge Functions.
- GitHub repository access with permission to add repository Secrets.
- (Optional) supabase CLI installed: https://supabase.com/docs/guides/cli

Required GitHub repository secrets (add these in Settings → Secrets → Actions):
- CF_API_TOKEN — Cloudflare API token with Pages and Account read/write permissions (scoped to the target account)
- CF_ACCOUNT_ID — Cloudflare account ID (numeric or hex string)
- CF_PAGES_PROJECT_NAME — Cloudflare Pages project name (the Pages project already created in Cloudflare)
- SUPABASE_URL — your Supabase project URL (https://...)
- SUPABASE_ANON_KEY — Supabase anon/public key for client-side access
- SUPABASE_SERVICE_ROLE (optional/required for server-side deployments) — Supabase service role key (store securely; do NOT put it in public files)

High-level automated deploy flow (what the included workflow does):
1. On push to branch `phase-1-foundation` the workflow checks out the repo.
2. It runs any build hooks (none required for the static public/ site by default).
3. It calls Cloudflare Pages action to publish the contents of the `public/` directory.

Supabase setup (manual steps you must complete once):
1. Create a Supabase project and note the Project URL and ANON/SERVICE_ROLE keys.
2. Run the repository migrations to create the database schema and RLS policies. Example using the supabase CLI:

   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push --file supabase/migrations

   (If your workflow uses a different migration process, follow that project's SETUP.md.)

3. Deploy Edge Functions from the `supabase/functions/` directory if you use them:

   supabase functions deploy <function-name> --project-ref <your-project-ref>

4. Configure Storage buckets (study-materials, etc.) inside the Supabase dashboard and set any required CORS or signed-URL settings.

Cloudflare Pages setup (two options):
- Option A — GitHub integration (recommended):
  1. In Cloudflare Pages, create a new Pages site and connect your GitHub repository and the `phase-1-foundation` branch.
  2. Set the build output directory to `public` and set any build commands if needed (none by default).
  3. Add the same repository secrets to GitHub (CF_API_TOKEN, CF_ACCOUNT_ID, CF_PAGES_PROJECT_NAME) if you want the workflow to run from GitHub Actions instead of Cloudflare's GitHub integration.

- Option B — Use the GitHub Actions workflow added to this branch:
  1. Add the repository Secrets listed above.
  2. Push to `phase-1-foundation` and the workflow will publish `public/` to your Pages project.

Post-deploy checks
- Visit the Pages URL once the workflow finishes and verify the homepage (public/index.html) loads.
- Test sign-in flows against the Supabase project (use a test student account).
- Verify that Edge Functions and private storage signed URLs work by exercising the features used by the site (start test, submit answers, download study material via signed link).

Security reminders
- Never commit any Supabase service role key or other secrets to the repository. Store them only in GitHub Secrets or your deployment platform's secret store.
- Review SETUP.md for additional safety steps and the administrator bootstrap procedure.

If you want, I can:
- Add automatic supabase migration/deploy steps to the workflow (needs SUPABASE_SERVICE_ROLE secret and the supabase CLI installed in the job).
- Connect Cloudflare Pages from here if you provide the Cloudflare account/project details or grant the API token.

