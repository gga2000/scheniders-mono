# Dashboard Page Launch Fixes — Round 1 (SEC-D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close SEC-D1 — stop `public.mv_customer_aggregates` from being readable by the anonymous internet role and by authenticated users of *other* tenants, without breaking the Customers surface.

**Architecture:** Materialized views cannot carry RLS, so the matview is taken out of the PostgREST-reachable privilege set entirely (`REVOKE ALL … FROM anon, authenticated`) and replaced, for client use, by a plain **tenant-scoped view** `public.customer_aggregates`. A plain (non-`security_invoker`) view reads its base object with the **view owner's** privileges, so it can still read the locked-down matview, while its `WHERE tenant_id IN (SELECT public.get_user_tenant_ids())` predicate resolves against the *caller's* JWT (`get_user_tenant_ids()` is `STABLE SECURITY DEFINER` and keys off `auth.uid()`). `security_barrier = true` prevents a leaky user-supplied predicate (the `ilike` searches in two call sites) from being pushed below the tenant filter. The three `SECURITY DEFINER` functions that read the matview (`get_paginated_customers`, `get_customer_dashboard_stats`, `refresh_customer_aggregates` — all owned by `postgres`) are unaffected by the revoke. All six direct client call sites are repointed at the new view.

**Tech Stack:** Postgres 15 (Supabase), PostgREST, Next.js 16 App Router, TanStack Query, Vitest.

**Scope guard:** Round 1 covers **SEC-D1 only**. Every other finding in `DASHBOARD_PAGE_APPROVAL_LEDGER.md` stays PENDING and is not touched. The migration is written but **NOT applied** until the user gives the approval sentence for that specific migration (audit prompt Phase 3 §8).

**Disclosed side effect — this fix changes visible numbers.** None of the six call sites filters by tenant today, so the Customers page KPIs are currently computed over **all 12 tenants**. Making them correct will make them *smaller*. Measured on tenant `b5c4f2d4` (Scheniders Iraq):

| Customers-page figure | Shows today | Will show after | Change |
|---|---|---|---|
| Total customers | 5,875 | 4,169 | −29% |
| Total customer revenue | 718,616,650 IQD | 174,599,650 IQD | −76% (was 4.1× overstated) |

That is the correction, not a regression. It must be communicated to the user before deploy.

**Regression history — read before editing.** `packages/supabase/migrations/20260518000002_lockdown_customer_matview.sql` already performed this REVOKE. It was undone when `20260629140000` / `20260629170000` ran `DROP MATERIALIZED VIEW … CREATE MATERIALIZED VIEW …`, because a newly created object in `public` picks up Supabase's default grants to `anon`/`authenticated`. **Any future migration that recreates this matview must re-run the revoke in the same file.** Task 1 adds a `COMMENT` on the matview saying so.

---

## Task 1: The migration (write only — DO NOT APPLY)

**Files:**
- Create: `packages/supabase/migrations/20260905153132_customer_aggregates_tenant_scoped_view.sql` (**Part 1 — safe to apply any time**: creates + grants the view, changes no existing privilege)
- Create: `packages/supabase/migrations/20260905153138_customer_aggregates_revoke_matview_grants.sql` (**Part 2 — DEPLOY-COUPLED**: the revokes; applying before the code deploy breaks the currently-deployed Customers page with 42501)

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- SEC-D1 — mv_customer_aggregates is readable by anon and by every authenticated
-- user regardless of tenant.
-- ============================================================================
-- EVIDENCE (live DB, 2026-09-02):
--   * pg_class.relacl on public.mv_customer_aggregates =
--       {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--        authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--     i.e. the anonymous role holds FULL privileges, and the matview lives in the
--     API-exposed `public` schema, so PostgREST serves it at
--     /rest/v1/mv_customer_aggregates to anyone holding the publishable anon key.
--   * `SET LOCAL ROLE anon; SELECT count(*) FROM mv_customer_aggregates` -> 5875 rows
--     across 12 tenants: customer_phone, latest_secondary_phone, latest_name,
--     latest_city, latest_address_details, total_orders, total_spent.
--   * Materialized views do NOT enforce RLS, and none of the six client call sites
--     chained an .eq("tenant_id", ...) filter, so authenticated users of one tenant
--     were reading (and aggregating) every other tenant's customer book.
--
-- WHY A PLAIN VIEW AND NOT security_invoker:
--   security_invoker=true would check the *caller's* privileges on the base matview,
--   which this migration revokes -- the view would fail for every user. A plain view
--   reads the base object as the view OWNER (postgres) while the tenant predicate
--   still resolves against the caller's JWT, because get_user_tenant_ids() is
--   STABLE SECURITY DEFINER over auth.uid().
--
-- security_barrier = true: two call sites push user-controlled ILIKE predicates into
-- this view. Without the barrier, Postgres may evaluate a leaky operator before the
-- tenant filter and leak rows through error messages or timing.
--
-- REGRESSION NOTE: 20260518000002 already did this REVOKE; 20260629140000 and
-- 20260629170000 then DROP+CREATEd the matview, which restored Supabase's default
-- grants to anon/authenticated. Any future migration that recreates this matview
-- MUST repeat the REVOKE below.
--
-- DOWN MIGRATION (documented, deliberately not executed):
--   DROP VIEW IF EXISTS public.customer_aggregates;
--   GRANT SELECT ON public.mv_customer_aggregates TO anon, authenticated;
--   -- and revert the six client call sites to .from("mv_customer_aggregates")
-- ============================================================================

-- Step 1: tenant-scoped read path for clients.
CREATE OR REPLACE VIEW public.customer_aggregates
WITH (security_barrier = true) AS
SELECT *
FROM public.mv_customer_aggregates
WHERE tenant_id IN (SELECT public.get_user_tenant_ids());

COMMENT ON VIEW public.customer_aggregates IS
    'Tenant-scoped read path for mv_customer_aggregates. Clients MUST use this view; '
    'the underlying matview cannot enforce RLS and is not granted to anon/authenticated. '
    'See SEC-D1 in docs/audits/DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md.';

-- The view is owned by postgres, so it reads the matview as owner. Grant the view
-- to authenticated only -- anon has no legitimate use for customer aggregates.
GRANT SELECT ON public.customer_aggregates TO authenticated;
REVOKE ALL ON public.customer_aggregates FROM anon;

-- Step 2: close the direct path. service_role (server-side) keeps access; the three
-- SECURITY DEFINER functions that read the matview run as postgres and are unaffected.
REVOKE ALL ON public.mv_customer_aggregates FROM anon;
REVOKE ALL ON public.mv_customer_aggregates FROM authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_customer_aggregates IS
    'NOT tenant-safe on its own: materialized views cannot enforce RLS. Never GRANT to '
    'anon or authenticated. Clients read public.customer_aggregates instead. If you '
    'DROP+CREATE this matview, re-run the REVOKEs in '
    '20260905153132_customer_aggregates_tenant_scoped_view.sql -- default grants come back.';
```

- [ ] **Step 2: STOP. Do not apply.**

Present the exact SQL above to the user and request the approval sentence for **this specific migration**. Applying it without that sentence violates audit prompt §0.5 / Phase 3 §8.

- [ ] **Step 3 (only after the migration-specific approval): apply and verify**

Apply via `mcp__supabase__apply_migration`, then run each verification in §Verification below and paste the real output.

## Task 2: Repoint the six client call sites

Each is a one-line change: `.from("mv_customer_aggregates")` -> `.from("customer_aggregates")`. No other logic changes; the tenant filter now lives in the database, which is the point.

**Files:**
- Modify: `apps/platform/app/customers/[phone]/page.tsx:49`
- Modify: `apps/platform/components/customers/modals/link-customers-modal.tsx:37`
- Modify: `apps/platform/hooks/use-customer-segments.ts:20`
- Modify: `apps/platform/hooks/use-customer-growth.ts:12`
- Modify: `apps/platform/hooks/use-business-metrics.ts:37`
- Modify: `apps/platform/hooks/use-customer-links.ts:87`

- [ ] **Step 1: Apply the six edits**

```bash
cd /Users/ali/scheniders-mono/apps/platform
for f in "app/customers/[phone]/page.tsx" \
         components/customers/modals/link-customers-modal.tsx \
         hooks/use-customer-segments.ts \
         hooks/use-customer-growth.ts \
         hooks/use-business-metrics.ts \
         hooks/use-customer-links.ts; do
  perl -pi -e 's/\.from\("mv_customer_aggregates"\)/.from("customer_aggregates")/' "$f"
done
```

- [ ] **Step 2: Verify no direct matview reads remain in app code**

Run: `grep -rn 'from("mv_customer_aggregates")' apps/platform --include='*.ts' --include='*.tsx'`
Expected: no output.

## Task 3: Pinning test — no client may query the matview directly

This is the regression pin. The bug being fixed has already recurred once (20260518000002 -> 20260629170000). A test that fails the moment any file reaches for the raw matview is the cheapest guard.

**Files:**
- Create: `apps/platform/lib/customer-aggregates-access.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

/**
 * SEC-D1 pin. `mv_customer_aggregates` is a materialized view, so it cannot enforce
 * RLS: any client that queries it directly reads every tenant's customer book.
 * Clients must go through the tenant-scoped view `customer_aggregates` (or a
 * SECURITY DEFINER RPC). This has regressed once already -- see
 * packages/supabase/migrations/20260905153132_customer_aggregates_tenant_scoped_view.sql
 */
describe("customer aggregates access path", () => {
    it("no client module queries mv_customer_aggregates directly", () => {
        const appRoot = path.resolve(__dirname, "..");
        // grep exits 1 when there are no matches, which is the passing case.
        const hits = execSync(
            `grep -rn 'from("mv_customer_aggregates")' ${JSON.stringify(appRoot)} ` +
                `--include='*.ts' --include='*.tsx' ` +
                `--exclude-dir=node_modules --exclude-dir=.next || true`,
            { encoding: "utf8" },
        ).trim();

        expect(hits).toBe("");
    });
});
```

- [ ] **Step 2: Run it BEFORE Task 2's edits to confirm it fails**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/customer-aggregates-access.test.ts`
Expected: FAIL, listing the six call sites.

- [ ] **Step 3: Run it after Task 2's edits**

Run: `pnpm --filter @scheniders/platform exec vitest run lib/customer-aggregates-access.test.ts`
Expected: PASS.

## Task 4: Regenerate database types

The new view must exist in `Database["public"]["Views"]` or the repointed `.from("customer_aggregates")` calls will not type-check.

**Files:**
- Modify: `packages/supabase/src/database.types.ts` (generated)

- [ ] **Step 1 (only after the migration is applied):** run `pnpm generate-types` from the repo root.
- [ ] **Step 2:** confirm `customer_aggregates` appears under `Views` in `packages/supabase/src/database.types.ts`.
- [ ] **Step 3:** `pnpm --filter @scheniders/platform exec tsc --noEmit` -> 0 errors.

---

## Verification (end of round, before declaring done)

Database (run read-only after the migration is applied; paste real output):

- [ ] Anon is locked out:
```sql
BEGIN; SET LOCAL ROLE anon;
SELECT count(*) FROM public.mv_customer_aggregates;  -- expect ERROR 42501
ROLLBACK;
```
- [ ] Authenticated is locked out of the raw matview:
```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"94d3e409-52c2-447d-88af-8aff3758f622","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.mv_customer_aggregates;  -- expect ERROR 42501
ROLLBACK;
```
- [ ] The view returns exactly one tenant's rows (the numbers from the disclosure table):
```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"94d3e409-52c2-447d-88af-8aff3758f622","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT count(*) AS customers, count(DISTINCT tenant_id) AS tenants, sum(total_spent)::bigint AS spent
FROM public.customer_aggregates;   -- expect 4169 / 1 / 174599650
ROLLBACK;
```
- [ ] The RPC path still works (it is what the Customers table itself uses):
```sql
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"94d3e409-52c2-447d-88af-8aff3758f622","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.get_customer_dashboard_stats() IS NOT NULL AS ok;  -- expect true
ROLLBACK;
```
- [ ] `mcp__supabase__get_advisors(security)` -> the `materialized_view_in_api` warning for `mv_customer_aggregates` is gone.

Code gates (paste real output):

- [ ] `pnpm --filter @scheniders/platform exec tsc --noEmit` -> 0 errors
- [ ] `pnpm --filter @scheniders/platform lint` -> 0 errors (warning count must not exceed the 1163 baseline)
- [ ] `pnpm --filter @scheniders/platform exec vitest run` -> 676 passed (675 baseline + the new pin)
- [ ] `superpowers:verification-before-completion`
- [ ] `/code-review high` on the diff; fix what it finds

Live browser pass (blocked on credentials — see the audit's [U] note): load `/customers`, confirm the KPI strip shows the tenant-correct figures from the disclosure table and the link-customer search returns only own-tenant customers.

## Self-review notes

- Spec coverage: SEC-D1 = Task 1 (revoke + scoped view) + Task 2 (repoint) + Task 3 (pin) + Task 4 (types). No other ledger finding is touched. ✓
- No placeholders: every SQL statement, edit command, and test body is written out in full. ✓
- Naming consistency: the view is `public.customer_aggregates` in the migration, the six edits, the test, and the verification queries. ✓
- Down-migration documented in the migration header, as required by Phase 3 §8. ✓
