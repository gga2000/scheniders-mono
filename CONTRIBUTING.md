# Contributing

This app runs real merchants' stores, orders and money. `main` deploys straight
to production, so nothing reaches `main` without a pull request, green CI and a
review from @gga2000.

## The flow

1. Pull the latest `main` and branch from it: `git switch -c fix/short-name`
   (prefixes: `feat/`, `fix/`, `chore/`, `docs/`).
2. Keep the change small and about one thing. Large features go in as a series
   of PRs, each one safe to ship on its own.
3. Push the branch and open a pull request into `main`. Fill in the template.
4. CI runs lint, type-check, tests and build. Vercel does not build PR previews
   (the Hobby plan caps deployments at 100 per day); test on production.
5. @gga2000 reviews. Address comments with new commits on the same branch;
   a new push resets the approval, so the final version is always the one reviewed.
6. Only @gga2000 merges. Merging to `main` does not deploy; production deploys
   from the `release` branch. See "Shipping to production".

Never push to `main`, force-push a shared branch, or merge your own PR. The
branch rules on `main` block these anyway.

## Shipping to production

Vercel's production branch is `release`. Merges to `main` collect there and
deploy nothing. When @gga2000 says "ship", fast-forward `release` to `main`
(`git push origin origin/main:release`): that is one deploy per app, instead of
one per merge. Each app's `ignoreCommand` skips the build when nothing it
depends on changed.

## Setup

- Node 20 (Node 24 breaks `pnpm install`). Run `corepack enable` once.
- pnpm only, never npm or yarn: `pnpm install`.
- Copy `apps/<app>/.env.example` to `apps/<app>/.env.local` and point it at
  **your own development Supabase project** (see below), never production.
- `pnpm dev:platform` starts the merchant app on :3000.

Read [CLAUDE.md](CLAUDE.md) before your first change. Its rules (LTR only,
IQD whole numbers, no tax logic, no `any` or `@ts-ignore`, every query
tenant-scoped) apply to everyone, not just AI sessions.

## Production access

Contributors do not get production database access, production environment
variables, or Vercel/Supabase dashboard access. That is deliberate, not a
matter of trust: it means a mistake on a branch can never touch a live store.
If you need data shaped like production to reproduce a bug, ask and you will
get a sanitized example.

## Database changes

- Write the migration as a file in `packages/supabase/migrations/`, named
  `YYYYMMDDHHMMSS_description.sql` (UTC timestamp).
- Every new table enables RLS in the same migration and is scoped by
  `tenant_id`. Every `SECURITY DEFINER` function checks the caller's tenant.
- Test it against your own development project, not production.
- Do not apply migrations to production. @gga2000 applies them after review,
  and the PR says in its description whether the SQL must run before or after
  the code deploys.
- Prefer additive changes (new column, new function). Dropping or renaming
  anything that live code still reads must happen in a later PR, after the
  code that reads it is gone.

## Before you ask for review

- `pnpm type-check` and `pnpm lint` pass. These are the CI gate.
- Run the tests for what you touched: `pnpm exec vitest run <path>`.
- Check the change on the Vercel preview link (or locally) on a phone-sized
  screen, in Arabic, and include screenshots for UI changes.
- No secrets in code, commits or PR text. `NEXT_PUBLIC_*` variables ship to
  the browser, so they can never hold a secret.
