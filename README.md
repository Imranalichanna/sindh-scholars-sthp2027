# Sindh Scholars Academy

**Tagline:** Learn for Free. Practice with Purpose. Achieve More.

A responsive educational platform starter for free scholarship preparation, university admission practice, study materials, and updates for students across Sindh and Pakistan.

## Current implementation branch

The active development branch is [phase-1-foundation](https://github.com/Imranalichanna/sindh-scholars-sthp2027/tree/phase-1-foundation). It adds a public website, student authentication, an examination interface, private Supabase schema and RLS migrations, server-side scoring functions, an initial staff workspace, and deployment documentation.

**This is not yet a verified production deployment.** Supabase credentials, migrations, Edge Functions, Cloudflare Pages settings, administrator role assignment, end-to-end checks, and security review still need to be completed in your own services.

## Stack

- Static frontend: HTML, CSS, vanilla JavaScript in the public directory
- Auth, PostgreSQL, RLS, and private file storage: Supabase
- Trusted assessment and administrative operations: Supabase Edge Functions
- Hosting: Cloudflare Pages connected to GitHub

## Repository structure

- public/index.html — public academy homepage
- public/app.js and public/styles.css — public content, sign-in, test-taking, and student history interface
- public/admin.html, public/admin.js, public/admin.css — staff workspace
- public/config.js — public Supabase URL/key placeholders only; safe for a publishable/anon key when RLS is correctly configured
- public/privacy.html and public/terms.html — policy drafts that require operator review
- supabase/migrations/ — relational schema, RLS policies, signup profile trigger, and atomic scoring RPC
- supabase/functions/ — test start, answer autosave, secure submission, personal history, content management, admin results, and signed material URL functions
- tests/ — automated validation scripts (expand before production)

## Security rules

- Never put a Supabase service-role key, database password, or other secret in public assets, public/config.js, GitHub, or browser code.
- Correct answers are stored in question_answer_keys; student-facing question reads do not have column permission for the explanation field, and answer keys are not granted to authenticated browser clients.
- Students retrieve result history through my-results; admin exports use the super-admin-protected admin-results function.
- Staff operations are checked server-side by admin-content and database policies.
- PDFs use a private study-materials bucket and short-lived signed links.
- The answer-key file previously committed at the repository root has been removed from the current branch heads. Because the repository was observed as public, its historical contents may still be accessible through Git history or existing copies. **Change repository visibility and purge sensitive history if needed before using real exam content.**

## Quick start

Read SETUP.md for step-by-step Supabase configuration, secure first-admin setup, Edge Function deployment, Cloudflare Pages deployment, and manual verification.

## Known gaps before production

- The application has not been connected to your actual Supabase project or deployed from this branch to Cloudflare Pages.
- No live authentication, database, Storage, or Edge Function request has been tested from this environment.
- The staff workspace is an initial content-management MVP; question editing, bulk CSV import, role administration, public approved leaderboard, richer student profile editing, and full site-settings editor remain to be implemented.
- Automated end-to-end tests, rate limiting/bot protection, backups/restore rehearsal, privacy/legal review, accessibility audit, and penetration testing are still required.
- The initial question builder supports four-option MCQs. Validate every question and answer before publication.

Do not invite real students until the required setup and acceptance tests in SETUP.md pass.
