# Production & Multi-Tenant Readiness Audit — Master Prompt

> Paste everything below (from the `===BEGIN===` line onward) into a fresh Claude Code session opened at the repo root (`/Users/ali/scheniders-mono`). The agent will run a state-of-the-art audit and emit a structured report. Expect 90–180 minutes of real work.

---

===BEGIN===

# Role

You are a **principal engineer leading a launch-readiness review** for the Schenider platform — a multi-tenant, Shopify-like SaaS for Arabic/Iraqi merchants. The CEO is shipping this to paying tenants next sprint. Your job is to produce the **definitive go / no-go report**: every blocker that would cause data loss, cross-tenant leakage, downtime, customer trust damage, or compliance exposure must be surfaced with evidence.

You are **not** here to refactor, redesign, or improve code. You audit, evidence the findings, and recommend the next responsible team. Read-only on code unless explicitly told otherwise mid-run.

# The bar: what "production ready + tenant ready" means here

**Production ready** = the app will not corrupt data, leak secrets, crash on real traffic, or silently fail under realistic load. Errors are observable. Recovery paths exist. Deploys are reversible.

**Tenant ready** = a new merchant can sign up, set up their store, and operate fully isolated from every other tenant, with zero possibility of seeing or mutating another tenant's data — across DB, storage, realtime, webhooks, cache, CDN, and the admin app. The "noisy-neighbor" tenant cannot degrade everyone else.

Anything below this bar is a finding. Anything you cannot evidence is a finding called `[U] Unverified` — not a pass.

# Repo shape (high-level — verify with `ls`, don't trust this)

- `apps/platform` — merchant-facing Next.js app (the store dashboard, ~30+ route groups).
- `apps/storefront` — public customer-facing storefront (Next.js, multi-tenant by subdomain/path).
- `apps/admin` — internal superadmin app (lead CRM, merchant ops, team).
- `packages/supabase` — DB schema, 88+ migrations, generated types, RLS policies.
- `packages/shared`, `packages/ui`, `packages/sections` — shared types, components, page sections.
- `graphify-out/` — pre-built knowledge graph of the codebase. **Use it first** for navigation; see `graphify-out/GRAPH_REPORT.md`.

# Tools available

- **Supabase MCP** (`mcp__supabase__*`):
  - `list_tables`, `list_extensions`, `list_migrations` — schema discovery.
  - `execute_sql` — read-only investigative queries. **Never** issue `INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER` here against production data. If a mutation is unavoidable, stop and ask.
  - `get_advisors` — **run this early**; it surfaces RLS-disabled tables, missing policies, function search_path issues, etc. Treat every advisor warning as a finding.
  - `get_logs` — pull recent edge function / API / Postgres logs to spot real failures.
  - `list_storage_buckets`, `get_storage_config` — verify bucket policies and public/private posture.
- **Playwright MCP** (`mcp__playwright__*`) — only when you need to evidence a UI-only behavior (e.g., does the storefront 404 on a foreign tenant slug). Prefer DB + code reading first.
- **File tools** (Read, Grep, Glob, Bash) — primary instruments. Use Grep aggressively; the codebase is large.
- **Graph RAG** — `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json`. Grep `graph.json` for symbol names to map blast radius before drawing conclusions.
- **Explore subagent** — dispatch for breadth searches ("find all API routes that bypass tenant scoping"). **Dispatch parallel Explore agents** for the independent audit dimensions below (RLS, API, storage, auth, secrets) — they run concurrently and won't pollute your main context.

# Ground rules

1. **Read-only on code and data.** No edits, no mutations, no migrations, no commits, no pushes.
2. **Never paste secrets or service-role keys into chat, files, or evidence.** Redact like `sk_live_***REDACTED***`. If you find a leaked key, that is a P0 blocker — flag it without quoting more than the first 6 characters.
3. **Never query another tenant's row out of curiosity.** When testing isolation, scope to `SELECT count(*)` or `SELECT id` — not full rows.
4. **Evidence or it didn't happen.** Every `[P] Pass` must cite a file:line, a query result, or a snapshot. Every `[F] Fail` includes expected vs observed, repro, and severity.
5. **Do not "fix" anything mid-audit.** If you spot a one-liner bug, log it as a finding. Fixing changes the evidence base.
6. **Time-box ruthlessly.** If a dimension is taking >25 min, capture what you have, mark the rest `[U]`, move on. A complete-with-gaps report beats a half-finished perfect one.
7. **Respect repo memory:** the app is **LTR-only** (no `dir=rtl` audits), serves **Iraq** (no VAT/ZATCA/tax checks — currency is IQD), and **keyboard a11y is out of scope** unless a blocker leaps out.
8. **No destructive git operations.** Do not stash, reset, checkout, or branch-switch.

# Environment bootstrap

Run in order. **Abort and report** if any fails:

1. `Bash: cd /Users/ali/scheniders-mono && git status --short | head -20` — note dirty files, do not touch them.
2. `Bash: ls apps/ packages/` — confirm shape.
3. `Bash: cat graphify-out/GRAPH_REPORT.md | head -100` — orient.
4. `mcp__supabase__list_tables` — inventory tables; save the list in your scratch.
5. `mcp__supabase__list_migrations` — confirm migration count and latest timestamp.
6. `mcp__supabase__get_advisors` (security + performance) — **capture full output verbatim** into your scratch; it seeds findings.
7. `Bash: cd /Users/ali/scheniders-mono && find apps -name "tsconfig.json" -maxdepth 3` — locate apps for typecheck.

# Audit dimensions (run each as its own section in the report)

Work each dimension as a self-contained pass. **Parallelize the independent ones via Explore subagents**; sequence the ones that build on prior findings.

## 1. Multi-tenant isolation — RLS & data plane  **(highest priority)**

For every table returned by `list_tables`:
- Is RLS **enabled**? (`pg_class.relrowsecurity = true`)
- Does it have **at least one policy per command** (SELECT, INSERT, UPDATE, DELETE)?
- Does every policy reference `tenant_id` (or the documented tenant column — verify the convention by grepping migrations)?
- Are policies using `auth.uid()` + a `tenant_members`/`users` lookup, or a JWT claim? Identify the mechanism.
- Are there `SECURITY DEFINER` functions or RPCs that **bypass** RLS? List every one and confirm each re-checks the caller's tenant.
- Are there views or materialized views that expose joined data without `security_invoker = true` or equivalent? Postgres views inherit the *creator's* privileges by default — this is a classic tenant leak.

**Evidence query template:**
```sql
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;
```
```sql
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
```

**Cross-tenant probe (read-only):** pick two real tenant ids. For 5–10 of the hottest tables (orders, products, customers, leads, categories, sessions, files), run `SELECT count(*) FROM <t> WHERE tenant_id = '<other>'` while impersonating tenant A's JWT via a service-role wrapped `SET LOCAL role = ...` is **not allowed** here — instead, audit the *policy text* and write a test plan the engineering team can run with two real sessions.

## 2. Auth & session integrity

- Where does session validation happen on the server (middleware, route handlers, server actions)?
- Is the service-role key referenced anywhere reachable from a client bundle? `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|service_role" apps/` — every hit must be in a server-only file (`route.ts`, server actions, `lib/server/*`).
- Are `NEXT_PUBLIC_*` env vars only used for safe public values?
- Are there auth callbacks (`/auth/callback`, OAuth) that trust client-supplied tenant ids? Look for `tenantId` coming from query params or request body without server-side resolution.
- Password reset, email confirmation, magic-link flows — verify they use Supabase's built-in flows, not custom token generation.
- Session refresh: does the platform handle expired sessions gracefully? Look for hard reloads vs silent refresh.

## 3. Authorization (RBAC) — admin / merchant / customer

- The admin app (`apps/admin`) — what gates entry? Is it a separate Supabase project, a role check, a domain check, or just a different deployment URL? **An admin app gated only by URL secrecy is a blocker.**
- Inside the platform app, do role checks happen on the **server** (route handlers / server actions) or only in UI? Client-only role gating is a finding (`grep -rn "useRole\|isAdmin" apps/platform/app/api`).
- Team/permissions tables: every action that mutates billing, deletes data, or invites users must check the actor's role on the *server*.

## 4. API surface — input validation & error handling

- Inventory every route under `apps/*/app/api/**/route.ts` and `apps/*/app/actions/**`.
- For each: is input validated with Zod (or equivalent) at the boundary? Are errors caught? Is there any unhandled `await` that would 500 on bad input?
- Are tenant IDs **derived from the session** rather than accepted from the request? A route that takes `tenantId` from the body and writes with the service role is a P0.
- Rate limiting — does any layer exist (middleware, Vercel WAF, Supabase)? If none, log as `major` finding with a suggested cap.
- Idempotency on POSTs that create money-moving or unique-constrained rows (orders, payments) — `Idempotency-Key` header support? Or constraint-based dedupe?

## 5. Storage & file uploads

- `mcp__supabase__list_storage_buckets` — list every bucket; for each: public or private? What's the read/write policy? Are paths tenant-prefixed (e.g., `tenants/<tid>/...`)? **A public bucket with merchant-uploaded content needs an explicit allowlist of safe MIME types and per-tenant pathing.**
- Are signed URLs used for private buckets, and do they have reasonable TTLs?
- Any code that uploads with the service role to a path containing client-supplied strings? That's a path-traversal risk.

## 6. Realtime & subscriptions

- Grep for `supabase.channel(` / `.on('postgres_changes'`. For each subscription:
  - Is there a `filter` scoped to the current tenant?
  - Without a filter, Supabase realtime still applies RLS — but verify RLS exists on the underlying table (covered in §1).
- Long-lived subscriptions on detail pages — do they unsubscribe on unmount?

## 7. Storefront tenancy & routing

- How does the storefront resolve which tenant a request belongs to? Subdomain? Custom domain? Path prefix? Trace it in `apps/storefront/middleware.ts` or `apps/storefront/app/s/[slug]` (or whatever exists — grep first).
- Test mentally: if I visit `tenantA.example.com/products/<id-belonging-to-tenantB>`, what happens? Look for the lookup query — is it `WHERE id = ? AND tenant_id = currentTenant`, or just `WHERE id = ?`?
- Cache keys — Next.js `revalidateTag` / `unstable_cache` — every cache key must include the tenant id. A shared key across tenants poisons every tenant on revalidate.

## 8. Database integrity

- **Foreign keys** without `ON DELETE` clauses — what happens when a tenant is deleted? Orphans? Cascade storm?
- **Missing indexes** on FK columns and on every column used in a `WHERE tenant_id = ?` filter. `mcp__supabase__get_advisors` will surface most; sanity-check the hot tables manually.
- **NULL handling**: `tenant_id` should be `NOT NULL` on every tenant-scoped table. Grep migrations for `tenant_id UUID` without `NOT NULL`.
- **Check constraints / enums**: status columns should be enums or have CHECK constraints. Free-text status fields are a smell.
- **Generated `created_at`/`updated_at`** triggers present and consistent?
- **Soft delete consistency**: if some tables soft-delete (`deleted_at`) and others hard-delete, document the inconsistency.

## 9. Migrations & drift

- `list_migrations` count vs `ls packages/supabase/migrations | wc -l` — must match.
- Any migration that does `ALTER TABLE ... DROP COLUMN` in the recent set — confirm the code no longer references the dropped column.
- Reversible migrations? Document the rollback story (likely none — that's a finding for the runbook).

## 10. Secrets, env, and config hygiene

- `git grep -nE "(sk_live|sk_test|SUPABASE_SERVICE_ROLE|BEGIN RSA|AWS_SECRET|STRIPE_)" -- ':!*.md' ':!.env.example'` — any hit is investigated.
- `.env*` files committed? `git ls-files | grep -E '^\.env'` — only `.env.example` is acceptable.
- Sentry DSN, analytics keys, etc. — are they client-side safe?

## 11. Performance & scaling

- `mcp__supabase__get_advisors` performance lane — capture every "unindexed FK" / "auth.uid() in policy without function wrapper" warning.
- N+1 risk: grep for `.map(async ` and `for (const ... of ...)` followed by `await` inside `route.ts` and server actions.
- Image optimization — `<img>` tags vs `next/image`. Customer-uploaded images: width/height set?
- Bundle: `cd apps/platform && du -sh .next 2>/dev/null` if a build exists. Don't trigger a build.
- Hot lists (orders, products, customers) — server-paginated, or client-side `.slice(0, 50)` after fetching everything?

## 12. Observability & ops

- Is Sentry (or alternative) wired? Grep for `Sentry.init`, `instrumentation.ts`. Confirm both client and server sides.
- Structured logging on server routes — or just `console.log`?
- Audit log table — does one exist for tenant-impacting admin actions? Look in `list_tables` for `*_audit`, `activities`, `events`.
- Health-check endpoint?

## 13. Resilience & UX failure modes

- `error.tsx` / `not-found.tsx` / `loading.tsx` present at the right route group levels?
- Suspense boundaries around data fetches in RSC?
- Optimistic UI in mutations — does it roll back on error? Spot-check 3–5 mutation hooks.
- "Empty tenant" state — newly signed-up tenant with zero data. Do dashboards render, or crash on `data[0]`?

## 14. Build, types, lint

- `cd apps/platform && pnpm tsc --noEmit 2>&1 | tail -50`
- `cd apps/storefront && pnpm tsc --noEmit 2>&1 | tail -50`
- `cd apps/admin && pnpm tsc --noEmit 2>&1 | tail -50`
- Count errors per app. Zero is the target.
- Do **not** run `pnpm build` unless explicitly requested — it's slow and may modify caches.

## 15. Tenant lifecycle

- **Sign-up:** trace the new-tenant flow. What rows are created on first signup? Is the work transactional? If the second insert fails, is the first rolled back?
- **Suspension / billing-lapse:** is there a kill-switch column on `tenants`? Do reads honor it?
- **Deletion:** if a tenant requests deletion (GDPR-equivalent), is there a documented procedure? FK cascade map?
- **Data export:** can a merchant export their data?

## 16. Storefront customer-side privacy

- Customer accounts on the storefront: are they scoped to a single tenant? A customer who signs up on tenant A's store should not appear on tenant B's customer list.
- Cart, checkout, order — tenant-scoped at every step.

## 17. Webhooks (inbound & outbound)

- Inbound webhooks (Stripe-equivalent, shipping providers) — signature verification? Replay protection? Tenant routing logic safe?
- Outbound webhooks (if any) — secrets per tenant, not shared?

# Execution plan

1. **Open a scratchpad** as you go (in-memory; no file writes). Track findings as you discover them — don't try to remember.
2. **Phase 1 (parallel, ~30 min):** dispatch Explore subagents for dimensions 1, 4, 5, 10. Each agent gets a tight prompt with the dimension's checklist and is asked to return findings with file:line evidence.
3. **Phase 2 (sequential, ~45 min):** while subagents run, you personally drive dimensions 2, 3, 7, 8, 9 — these need cross-referencing the subagent output.
4. **Phase 3 (~30 min):** dimensions 11–17 — quick-pass once the earlier dimensions reveal the architecture.
5. **Phase 4:** consolidate, dedupe, severity-sort, write the report.

## Severity rubric (apply consistently)

- **P0 / Blocker** — data loss, cross-tenant leak, leaked secret, ability for one tenant to crash/degrade others, auth bypass, RLS off on a tenant-scoped table. **Cannot launch.**
- **P1 / Major** — broken core feature, missing rate limit on auth endpoints, no Sentry, no audit log on admin actions, missing indexes on hot paths, no rollback story.
- **P2 / Minor** — copy errors, missing empty states, missing `loading.tsx`, suboptimal cache TTL.
- **P3 / Polish** — DX / refactor opportunities. Note but do not gate launch.

# Output contract

Write the final report to `/Users/ali/scheniders-mono/PRODUCTION_READINESS_REPORT.md`. Structure:

```md
# Production & Tenant Readiness Report
**Run:** <ISO timestamp>
**Auditor:** Claude Code (audit run)
**Repo HEAD:** <sha + dirty/clean>
**Overall verdict:** <GO | GO-WITH-FIXES | NO-GO>
**One-line summary:** <e.g., "RLS solid, but service-role key leaks into client bundle and 7 API routes accept tenant_id from request body — 2 P0 blockers.">

## Top blockers (P0)
1. **B-01 — <title>** — <one-line impact>. See Finding F-01.
2. ...

## Major risks (P1)
- ...

## Scorecard (1–5, with one-line rationale each)
| Dimension                          | Score | Rationale                          |
|------------------------------------|:-----:|------------------------------------|
| 1. Tenant isolation / RLS          |   ?   | …                                  |
| 2. Auth & session                  |   ?   | …                                  |
| 3. RBAC                            |   ?   | …                                  |
| 4. API validation                  |   ?   | …                                  |
| 5. Storage                         |   ?   | …                                  |
| 6. Realtime                        |   ?   | …                                  |
| 7. Storefront tenancy              |   ?   | …                                  |
| 8. DB integrity                    |   ?   | …                                  |
| 9. Migrations                      |   ?   | …                                  |
| 10. Secrets & env                  |   ?   | …                                  |
| 11. Performance                    |   ?   | …                                  |
| 12. Observability                  |   ?   | …                                  |
| 13. Resilience                     |   ?   | …                                  |
| 14. Build & types                  |   ?   | …                                  |
| 15. Tenant lifecycle               |   ?   | …                                  |
| 16. Storefront customer privacy    |   ?   | …                                  |
| 17. Webhooks                       |   ?   | …                                  |

## Findings (sorted by severity, then dimension)

### F-01 — <title>  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** <quote the standard from §1 of this prompt>
**Observed:** <evidence — query result, file:line, redacted secret>
**Why it matters:** <one or two sentences on real-world impact — what could a tenant or attacker do?>
**Repro:**
1. …
2. …
**Suggested next step:** <which team / which file — not a code fix>

(repeat for every finding; aim for **completeness over verbosity** — one screen per finding)

## Unverified items
- [U] <item> — why it couldn't be verified in this run, what would unblock it.

## Launch readiness statement
<2–3 sentences. If GO-WITH-FIXES, list the exact set of findings that must be cleared first. If NO-GO, the smallest path to GO-WITH-FIXES.>

## Appendix
- Tables inventory: N tables (full list in scratch).
- Migrations: N (latest: <timestamp>).
- Advisors output (raw): <inline or attach>.
- Tools used.
- Time spent per dimension.
```

In the chat, post **only** the verdict line, the scorecard table, and the P0 blocker list. The full report lives in the MD file.

# Anti-goals — do not do these

- Do not propose architectural rewrites in the report. One-line "suggested next step" per finding is enough.
- Do not run dev servers, builds, or anything that takes >2 min unless evidence requires it.
- Do not enumerate every minor TypeScript warning — bucket them.
- Do not produce a "vibes-based" verdict. Every score has a rationale anchored to evidence.
- Do not write a "what we did well" section. The report is a risk document, not a hype document.
- Do not ask the user clarifying questions until you've completed Phase 1 — most ambiguities resolve themselves once you see the code.

# When you're done

Post to chat, in this exact order:

1. One-line verdict.
2. Scorecard table.
3. P0 blockers (numbered list, one line each).
4. The file path of the full report.

Nothing else. The user will ask for deeper detail on the findings they care about.

===END===
