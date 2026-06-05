# Project: scheniders-mono

Multi-tenant e-commerce SaaS for the **Iraq** market. Turborepo monorepo, pnpm workspaces.

## ⚠️ First, always: check your skills

**Many skills are installed.** At the start of **every** new task or feature — and **every time you pivot** from one task/feature to another, whether in a fresh chat or the same one — STOP and scan the full available-skills list (in the system context) before doing anything else.

- Read the skill names/descriptions thoughtfully and ask: "does one of these fit what I'm about to do?"
- If a skill plausibly applies, use it (invoke via the Skill tool / `/name`) instead of working ad-hoc — skills encode best practices.
- When several could apply, pick the most specific. When unsure, mention the candidate skill to the user.
- This is a hard habit, not a suggestion: treat "did I check skills?" as the first step of any task.

See also [Use these skills](#use-these-skills-dont-reinvent) for the coding/DB/UI skills that map to common work here.

## Stack & architecture

- **Apps** (`apps/*`):
  - `@scheniders/platform` — primary merchant/admin SaaS app (Next.js 16 App Router, port 3000). Most work happens here.
  - `@scheniders/storefront` — customer-facing store.
  - `@scheniders/admin` — internal admin app.
- **Packages** (`packages/*`):
  - `ui` — shared React components (Radix + shadcn-style). Check here before building UI.
  - `sections` — store-builder sections.
  - `shared` — cross-app utilities (governorates, health rules, merchant codes, preview tokens…).
  - `supabase` — DB types, migrations, RLS/RBAC policies.
- **Core stack:** Next.js 16 + React 19, Supabase (SSR + RLS), TanStack Query, Zustand, Tailwind v4, Zod v4, Sentry, Upstash QStash, Storybook, Playwright + Vitest.
- **Ignore at app roots:** loose scratch files (`check-*.mjs`, `*.py`, `*.txt`, `tmp/`, `output/`, `*_plan.md`, ad-hoc `*.md` notes) are local scratch, **not source of truth**. Don't anchor on them.

## Commands (run from repo root)

- `pnpm dev:platform` — main app on :3000 (also `dev:storefront`, `dev:admin`).
- `pnpm lint` / `pnpm type-check` — turbo across the workspace.
- `pnpm test:e2e` — Playwright (platform).
- `pnpm exec vitest run <path>` — unit tests (covers `packages/shared`, storefront, platform).
- `pnpm generate-types` — regenerate Supabase TS types.
- Package manager is **pnpm** (pinned via the `packageManager` field, Corepack-managed). Never npm/yarn — only `pnpm-lock.yaml` is committed. Run `corepack enable` once so the pinned pnpm is used.

## Engineering principles

- **Fix the root cause. Never ship a workaround.** No swallowed `try/catch`, hardcoded values, sleep/retry hacks, or "temporary" patches.
- Banned unless explicitly justified in a comment: `any`, `@ts-ignore`, `eslint-disable`, non-null `!` used to silence the compiler, `// TODO fix later`.
- If a correct fix needs a larger change, say so and propose it — don't hide the problem behind a hack.
- Type external boundaries (API input, webhooks, env) with Zod and infer the types. `strict` is on for a reason.

## Done means verified

- `pnpm type-check` and `pnpm lint` pass — both are the CI gate.
- Run the relevant tests (`npx vitest run <path>` / Playwright). **CI does not run tests** — you must.
- DB changes: confirm RLS + tenant scoping before declaring done.
- No "should work." Verify the actual behavior.

## File hygiene

- New code goes in the correct app/package — never in an app root.
- No one-off scratch in committed dirs (`check-*.mjs`, `*.py`, loose `*_plan.md`). Use a gitignored `tmp/` and delete when done.
- Prefer editing an existing file over creating a new one. One component per file; colocate.
- Delete dead code — don't comment it out.
- Reuse `packages/ui` and `packages/shared` before adding a dependency or writing a util.

## Security defaults (multi-tenant)

- Every query is tenant-scoped. Never trust a client-supplied tenant id.
- The service-role key is server-only. `NEXT_PUBLIC_*` ships to the browser — never put secrets there.
- All new tables ship with RLS enabled from day one.

## Conventions

- **LTR only.** Set `<html lang>`, never `<html dir>` — the app stays LTR in every locale, including Arabic.
- **Iraq market:** currency is **IQD**; there is **no tax/VAT** — skip all tax logic.
- Don't propose or build keyboard shortcuts or keyboard-a11y sweeps unless explicitly asked.

## Use these skills (don't reinvent)

- React/Next.js work → `next-best-practices`, `vercel-react-best-practices`, `vercel-composition-patterns`.
- DB / SQL / migrations → `supabase-postgres-best-practices`.
- UI / new screens → `frontend-design` (or `impeccable`), `web-design-guidelines`.
- Debugging a failure → `systematic-debugging` before proposing a fix.
- Before declaring done → `verification-before-completion`.

## Supabase & migrations

- **Two projects exist — do not confuse them.** This repo targets **NEW** `sduvpgqwhxragxtxztur` (wired in `.mcp.json`). The **OLD** project `ibfdugifekivquwprqjc` lives in a separate codebase and is being migrated away from.
- Migrations live in `packages/supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`. Match that timestamp-prefix convention.
- Everything must be **RLS + tenant-scoped** from creation.
- Drafted migrations are applied without asking for confirmation (only stop for self-documented prerequisites or truly destructive ops).

## Knowledge Graph RAG (graphify-out)

A pre-built knowledge graph of this codebase lives at [graphify-out/](graphify-out/). Use it as a RAG system for discovery and reasoning about code structure before falling back to Glob/Grep sweeps.

**When to use it:**
- Locating where a concept lives ("where is lead conversion handled?")
- Understanding relationships between modules, components, or API routes
- Finding all files in a functional cluster (e.g. "admin leads", "storefront checkout")
- Getting a high-level map of a subsystem before editing

**Files and how to query them:**
- [graphify-out/GRAPH_REPORT.md](graphify-out/GRAPH_REPORT.md) — start here. Human-readable overview with 79 community hubs (e.g. "Admin Leads & Phone Normalization", "Storefront + Store Builder", "Admin API Routes"). Read relevant sections with Read.
- [graphify-out/graph.json](graphify-out/graph.json) — full graph: 4211 nodes, 19223 edges. Use Grep on it to find node names, edges, or symbol relationships. Nodes represent files/symbols; edges represent imports/calls/references.
- [graphify-out/manifest.json](graphify-out/manifest.json) — indexed file inventory with timestamps. Grep to confirm a file is covered.
- [graphify-out/index.scip](graphify-out/index.scip) — SCIP code index (binary). For symbol-level precision; only query if needed via scip CLI.
- [graphify-out/graph.html](graphify-out/graph.html) — visual graph (for the user, not for you).
- [graphify-out/cache/](graphify-out/cache/) — internal cache, ignore.
- `apps/platform/graphify-out/` — **stale leftover cache only** (no graph artifacts). Ignore it; it is not a second graph.

**Query workflow:**
1. Read GRAPH_REPORT.md communities to identify the relevant cluster.
2. Grep graph.json for specific node names / edge types to get exact file paths and relationships.
3. Read the resulting source files directly.

**Caveat — freshness:** the graph is a snapshot (dated 2026-04-14 in the report) and drifts as the repo evolves. Always trust live code over the graph when they conflict, and verify referenced files/symbols still exist. If the graph clearly predates recent work, re-run `/graphify` to refresh it.

## Docs & CI

- Standing audits live in [docs/audits/](docs/audits/) (production-readiness, QC matrices, builder audit).
- CI (`.github/workflows/ci.yml`) runs `turbo lint type-check build` on PRs to `main` — **tests are not in CI**, so run them locally.
