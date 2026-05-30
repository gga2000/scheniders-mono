# Production Readiness — Fix Plan

**Companion to:** [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md)
**Date:** 2026-05-18
**Goal:** clear every P0 blocker, then the P1s that gate scale. Result: GO.
**Total estimated effort:** 8–11 engineer-days across DB, backend, and platform. Phases 0–3 are launch-critical (~5 days); Phases 4–6 should follow in the same sprint.

---

## Sequencing rationale

The plan is ordered to **shrink the blast radius before each risky migration**. Specifically:

- **Phase 0 happens first** because the leaked anon key (F-14) makes every other RLS gap exploitable from outside. Once rotated, attackers can no longer enumerate from the committed credential.
- **Phase 1 (admin RBAC) is second** because once anon is rotated, the still-open admin surface is the next-easiest unauthenticated path to wallet data.
- **Phase 2 (atomic RPCs + REVOKE) is third** because it's a *minimal SQL change* per function — no policy churn — and it shuts the wallet-drain RPC vector immediately.
- **Phase 3 (rewriting JWT-claim + always-true policies)** is the largest DB change set and goes after Phases 1–2 so that even if Phase 3 introduces a regression, the rest of the system is no longer wide open.
- **Phases 4–6** are storage, storefront, and scale hardening — each independent of the others.

**Every DB phase ships a forward migration AND a documented rollback** (either a `DROP POLICY` / `REVOKE` script or a single `git revert` of the migration file). Migrations are written so the *previous* code path keeps working until the *next* code change ships — i.e., no atomic deploys required between API code and DB.

---

## Pre-flight (before Phase 0)

1. **Reconcile migration drift (F-21).** Before adding new migrations on top of a divergent state.
   - `supabase migration list` to confirm current applied state.
   - For the 17 untimestamped legacy files, decide per-file: rename with timestamp + `supabase migration repair --status applied <ts>` if already applied to prod, or delete if obsolete.
   - For the ~18 unapplied timestamped files: run `supabase migration list --linked` to see drift, then either apply (`supabase db push`) on staging first or `repair --status reverted`.
   - **Owner:** DB lead. **Effort:** 0.5 day. **Blocks:** Phases 2 and 3 (which add migrations).
2. **Verify staging mirrors production** schema after step 1. All later phases ship to staging first.
3. **Snapshot prod DB** via Supabase point-in-time recovery — confirm PITR is enabled before touching anything.

---

## Phase 0 — Rotate the leaked anon key (30 min)

**Closes:** B-14 (F-14)

**Why first:** the committed anon key is a working credential against everything that's currently broken. Rotating it doesn't fix the underlying RLS gaps, but it forces every attacker back to needing a real session — buying time for the rest of the plan.

**Steps:**
1. In Supabase dashboard → Settings → API → **Reset JWT secret**. This invalidates the old anon and service-role JWTs.
2. Copy new `anon` and `service_role` keys.
3. Update env vars in Vercel for all three apps (platform, admin, storefront) — production and preview environments.
4. Update `.env.local` for each engineer.
5. Replace real values in `apps/platform/env.example` and `apps/storefront/.env.example` with placeholders (`https://your-project.supabase.co`, `your-anon-key`, `your-service-role-key`). Commit.
6. Verify all three apps boot against the new keys (Vercel preview redeploy).

**Risk:** every existing user session is invalidated — users must re-login. Communicate via banner or off-hours rollout.
**Rollback:** Supabase keeps the previous JWT secret for ~24h — revert by clicking "Use previous secret." Restore env vars.
**Verification:** `curl '<project>.supabase.co/rest/v1/seed_customers' -H "apikey: <OLD-ANON-FROM-GIT>"` should now return 401.

---

## Phase 1 — Admin RBAC (1 day)

**Closes:** B-01 (F-01), B-09 (F-09), B-10 (F-10), F-27 (audit log on admin actions), F-39

**Why this phase exists:** admin app is currently a soft target. Login gate is `getUser()`-only; 20 of 56 admin API routes use the service-role client with no auth check. Closing this is one PR + one middleware change.

### 1.1 Add a server-side role gate to admin middleware

**File:** `apps/admin/middleware.ts`
- Keep the existing `getUser()` redirect.
- After confirming `user`, fetch the user's role via the existing pattern (`supabase.from('user_profiles').select('role').eq('id', user.id).single()`).
- If role is not in `['super_admin', 'support_staff']`, redirect to `/login?error=forbidden` and clear the session.
- For `/api/*` requests, return 403 JSON instead of redirecting (middleware redirects don't work on fetch/XHR — see F-09 finding).
- Whitelist `/login`, `/api/auth/*`, `/api/health`.

**Performance note:** middleware will now hit the DB on every request. Mitigate with a short JWT-cached role claim later (P1 cleanup), or accept the +10–20ms for now since admin traffic is low.

### 1.2 Wrap every admin API route in `requireAdmin()`

**Pattern:** the helper already exists at `apps/admin/lib/admin-supabase.ts:38`. Apply to the 20 unwrapped routes listed in F-01 / F-09:

```
apps/admin/app/api/settings/route.ts
apps/admin/app/api/trials/route.ts
apps/admin/app/api/bulk/route.ts
apps/admin/app/api/seed-automation/route.ts
apps/admin/app/api/activity/route.ts
apps/admin/app/api/usage/route.ts
apps/admin/app/api/merchants/route.ts
apps/admin/app/api/admin-users/route.ts
apps/admin/app/api/export/route.ts
apps/admin/app/api/revenue/route.ts
apps/admin/app/api/impersonate/route.ts
apps/admin/app/api/billing/route.ts
apps/admin/app/api/trials/extend/route.ts
apps/admin/app/api/admin/last-actors/route.ts
apps/admin/app/api/admin/watchlist/route.ts
apps/admin/app/api/merchants/[id]/route.ts
apps/admin/app/api/merchants/stats/route.ts
apps/admin/app/api/dashboard/v2/route.ts
```

For each:
- Extract the bearer token from `request.headers.get('authorization')`.
- Call `const { user, role } = await requireAdmin(token);` at the top.
- 401 if the helper throws.
- Pass the validated `user.id` into any subsequent audit-log insert (fixes F-39).

**Skip:** `/api/health` (intentionally public for monitoring) and `/api/auth/callback` (auth flow).

### 1.3 Distinguish `super_admin` vs `support_staff` for sensitive routes

Use the existing `hasPermission(role, action)` from `apps/admin/lib/admin-permissions.ts`. Specifically:
- `impersonate`, `top_up_wallet`, `adjust_balance`, `change_plan`, `suspend_tenant`, `bulk_action`, `update_settings` → require `super_admin`.
- Add explicit `if (!hasPermission(role, '<action>')) return 403`.

**Verification:**
- Curl every protected route without an Authorization header → expect 401.
- Curl with a `support_staff` token to a `super_admin`-only route → expect 403.
- Add 2–3 Playwright tests that log in as each role and walk one happy path + one denial path.

**Rollback:** revert the PR. Middleware change is one file; the route wraps are mechanical.

**Effort:** ~6 hours coding + 2 hours testing. **One engineer.**

---

## Phase 2 — DB: SECURITY DEFINER lockdown (0.5 day)

**Closes:** B-02 (F-02), B-15 (F-15), F-29 (calculate_lead_score)

**Why this phase exists:** three RPCs let any caller — including anon — write to any tenant's wallet/orders. This is the wallet-drain vector. Fix is small and surgical.

### 2.1 Single migration: add tenant guard + revoke EXECUTE

**File:** `packages/supabase/migrations/<ts>_security_definer_lockdown.sql`

```sql
-- 2.1.1 — Add tenant membership guard to wallet/order RPCs.
-- Pattern: re-CREATE with the same signature and body prefixed by the guard.

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
  END IF;
  IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;
  -- ... rest of existing body verbatim ...
END;
$$;

-- Same pattern for:
--   public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb, _tenant_id uuid)
--   public.charge_wallet_atomic(_tenant_id uuid, _amount numeric, _description text, _order_id text)
--   public.calculate_lead_score(p_lead_id uuid)  -- guard via the lead's tenant_id

-- 2.1.2 — Revoke EXECUTE from anon on every SECURITY DEFINER function that shouldn't be public.
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(jsonb)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.charge_wallet_atomic(uuid, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_lead_score(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_order_usage(uuid)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_usage_tracking(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_customer_aggregates()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_seed_automation(boolean)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_seed_automation(boolean)         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.progress_seed_orders()                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.progress_seed_orders()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_seed_orders()                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_seed_orders()                  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_seed_automation_status()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.tenant_block_active(uuid, text)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_tenant_id()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_tenant_ids()                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.qc_log_status_change()                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_order_last_actor()               FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_product_block()                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_storefront_writes_block()       FROM anon;

-- 2.1.3 — Customer-aggregate RPCs that the storefront/anon does NOT need.
REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(text, text, text, text, boolean, integer, integer, bigint, bigint, ...) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_dashboard_stats()          FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_percentile(text, text)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_score_audit_log(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_trust_history(text, integer) FROM anon;
```

### 2.2 Storefront `submitCheckout` still works

The storefront `submitCheckout` action uses the **service-role client**, not the anon role — so revoking from anon doesn't break it. But the guard added in 2.1.1 (`_tenant_id IN get_user_tenant_ids()`) will reject service-role calls because there's no `auth.uid()` in that context. Two options:

- **Option A (preferred):** service role bypasses the guard naturally — check by adding `IF current_setting('role', true) = 'service_role' THEN /* skip guard */ END IF;` at the top. Service role is trusted server code.
- **Option B:** introduce a second RPC `create_order_atomic_storefront(_order_data, _tenant_id)` that only the storefront uses, with no guard but with explicit tenant validation already done in storefront code.

**Pick A** — fewer code paths, the existing guard pattern already used in `tenant_aware_atomic_functions` for service role.

### 2.3 Verification

- `psql` as anon role: `SELECT charge_wallet_atomic('<any-tenant>', 1000, 'x', NULL);` → expect `permission denied for function` or `Unauthorized`.
- As a real tenant user via REST API: charge attempt against their *own* tenant succeeds; against another tenant returns 42501.
- Storefront checkout end-to-end still works (manual test on staging).
- `mcp__supabase__get_advisors security` → `anon_security_definer_function_executable` count drops from 26 to ≤5.

**Rollback:** one migration file; `git revert` and re-apply the old `CREATE OR REPLACE FUNCTION` bodies. Document the inverse `GRANT EXECUTE` commands in the migration's header comment.

**Effort:** 3 hours writing + 1 hour testing.

---

## Phase 3 — DB: RLS policy rewrites (2 days)

**Closes:** B-03 (F-03), B-04 (F-04), B-05 (F-05), B-06 (F-06), B-12 (F-12), F-19 (nullable tenant_id), F-29 (`mv_customer_aggregates`)

**Why this phase exists:** the policies in place fail open. This is the largest change set in the plan because it touches ~50 policy definitions and 4 views.

**Critical:** each migration in this phase is *additive then destructive* — first the new policy is created, then the old one is dropped — so there is no window with no policy at all.

### 3.1 Migration A: replace JWT-claim policies on 13 product/inventory tables (F-03)

**File:** `packages/supabase/migrations/<ts>_replace_jwt_claim_policies.sql`

For each of: `product_options`, `product_tiered_pricing`, `product_order_bumps`, `product_related`, `product_features`, `product_faqs`, `product_testimonials`, `product_reviews`, `inventory_history`, `product_suppliers`, `product_activity_log`, `product_price_history`, `product_bundle_items`:

```sql
-- 1. Create the new policy alongside the old one.
CREATE POLICY "tenant_isolation_v2" ON public.<table>
  FOR ALL
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- 2. Drop the JWT-claim policy.
DROP POLICY IF EXISTS "tenant_isolation" ON public.<table>;
-- and the inconsistent variant for product_bundle_items:
DROP POLICY IF EXISTS "<other-name>" ON public.product_bundle_items;
```

**Verify:** before merging, list all existing policies on each of the 13 tables with `SELECT * FROM pg_policies WHERE tablename = '<t>'` — make sure the names matched in `DROP POLICY` actually exist, otherwise the drop is a no-op and you'll have two overlapping policies.

### 3.2 Migration B: replace 33 always-true policies (F-06)

**File:** `packages/supabase/migrations/<ts>_replace_always_true_policies.sql`

Group by table. For each affected (table, command) from the advisor output:

```sql
DROP POLICY "<old-always-true-policy>" ON public.<table>;
CREATE POLICY "<new-name>_<cmd>" ON public.<table>
  FOR <cmd>
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
```

Tables (33 policies across these): `community_ratings`, `customer_links`, `customer_trust`, `customer_trust_audit_log`, `customer_voice_notes`, `inventory_alerts`, `newsletter_subscribers`, `product_batches`, `product_options`, `product_storage`, `product_tag_assignments`, `product_tags`, `purchase_order_items`, `purchase_orders`, `qc_quarantine_events`, `security_logs`, `smart_collections`, `stock_take_items`, `stock_takes`, `storage_locations`.

**Special cases:**
- `newsletter_subscribers` INSERT: the storefront subscribes anonymous customers — keep INSERT open but **require `tenant_id` in the row** to match the storefront's resolved tenant. Add a CHECK that the storefront's service-role insert always sets `tenant_id`.
- `security_logs` INSERT: tighten further — only the trusted server should write. Restrict to service-role via `WITH CHECK (false)` and have logs come from server code only.
- `community_ratings`: if this is genuinely a public-write table (anyone can rate), document the design and split into a SELECT-only policy + a restricted INSERT.

### 3.3 Migration C: enable RLS on the two ERROR-level tables (F-04)

```sql
-- seed_customers and order_generation_config — both seed data with no tenant column.
-- Two options:
-- Option 1: drop them entirely (preferred — they shouldn't be in prod).
DROP TABLE IF EXISTS public.seed_customers;
DROP TABLE IF EXISTS public.order_generation_config;
-- Option 2: lock down if still needed.
-- ALTER TABLE public.seed_customers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "deny_all" ON public.seed_customers FOR ALL USING (false);
-- (same for order_generation_config)
```

**Confirm with team** which option — `seed_customers` has 200 rows of test data; if these are referenced in dev seeding workflows, go with Option 2 and move the dev seeding to a non-public schema.

### 3.4 Migration D: rebuild `mv_customer_aggregates` + `get_paginated_customers` (F-05)

This is the trickiest one because the materialized view is queryable by anon and the function bypasses RLS.

```sql
-- 1. Recreate the materialized view WITH a tenant_id column.
DROP MATERIALIZED VIEW IF EXISTS public.mv_customer_aggregates CASCADE;
-- (CASCADE drops dependent functions including get_paginated_customers — we'll recreate.)

CREATE MATERIALIZED VIEW public.mv_customer_aggregates AS
SELECT
    o.tenant_id,                                    -- NEW: tenant column
    o.phone AS customer_phone,
    -- ... rest of existing aggregation, but grouped by (tenant_id, phone) instead of just phone ...
FROM public.orders o
LEFT JOIN ...
GROUP BY o.tenant_id, o.phone, ...;

CREATE UNIQUE INDEX ON public.mv_customer_aggregates (tenant_id, customer_phone);
CREATE INDEX ON public.mv_customer_aggregates (tenant_id);

-- 2. Revoke anon/authenticated access to the materialized view.
REVOKE ALL ON public.mv_customer_aggregates FROM anon, authenticated;

-- 3. Recreate get_paginated_customers with tenant filter + revoke from anon.
CREATE OR REPLACE FUNCTION public.get_paginated_customers(
    _tenant_id uuid,                                 -- NEW: required parameter
    -- ... existing params ...
)
RETURNS TABLE (...) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ... FROM public.mv_customer_aggregates c
  WHERE c.tenant_id = _tenant_id
    AND ...; -- rest of existing filter logic
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_paginated_customers(uuid, ...) FROM anon;

-- 4. Recreate similar sibling functions with same pattern.
-- get_customer_dashboard_stats() → take _tenant_id parameter, check membership.
-- get_customer_percentile(...), get_customer_score_audit_log(...), get_customer_trust_history(...)
```

**Code change required:** all callers of `get_paginated_customers` etc. must now pass `_tenant_id`. Grep for these in `apps/platform/` and update — these are likely in the customers dashboard. **Ship the migration and the code change together** (one PR).

### 3.5 Migration E: fix `employee_stats` views (F-12)

```sql
DROP VIEW IF EXISTS public.employee_stats CASCADE;
DROP VIEW IF EXISTS public.employee_stats_weekly CASCADE;
DROP VIEW IF EXISTS public.employee_stats_monthly CASCADE;

CREATE VIEW public.employee_stats WITH (security_invoker = true) AS
SELECT tenant_id, user_id, user_email, COUNT(*) AS total_actions, ...
FROM public.activity_logs
WHERE user_id IS NOT NULL
  AND tenant_id IN (SELECT public.get_user_tenant_ids())
GROUP BY tenant_id, user_id, user_email;

-- Repeat for weekly/monthly.
-- No GRANT — security_invoker means the view inherits RLS from activity_logs.
```

**Note:** the view source `activity_logs` must have a `tenant_id` column. Verify before running. If it doesn't, this is also a F-19-class issue and requires backfill first.

### 3.6 Migration F: backfill + NOT NULL on 5 tables (F-19)

```sql
-- For each of product_variants, customer_metadata, customer_notes,
-- customer_tags, customer_tag_assignments:

-- 1. Backfill from a related row (usually products.tenant_id or customer phone lookup).
UPDATE public.product_variants pv
SET tenant_id = p.tenant_id
FROM public.products p
WHERE pv.product_id = p.id AND pv.tenant_id IS NULL;
-- (similar for the others — needs review per table for the source of truth)

-- 2. If any rows remain with NULL, document and delete or assign to a "orphan" tenant.
SELECT COUNT(*) FROM public.product_variants WHERE tenant_id IS NULL;
-- Stop here and investigate if >0.

-- 3. Lock it down.
ALTER TABLE public.product_variants ALTER COLUMN tenant_id SET NOT NULL;
-- (repeat for the other 4)
```

### 3.7 Verification (after all 6 migrations)

- `mcp__supabase__get_advisors security` — `rls_policy_always_true` should drop from 33 to ≤2 (only intentional public-read ones), `rls_disabled_in_public` to 0, `materialized_view_in_api` to 0.
- Two-session test: log in as two different tenants on staging. From tenant A, try every spread of read/write on the affected tables for tenant B's ids. Expect 0 rows returned, write attempts fail.
- Smoke-test the platform UI: products list, inventory, customer dashboard, smart collections, purchase orders.

**Rollback:** each migration is independent and reversible by dropping the new policy/view/function and recreating the old one. Keep the original SQL in a sibling `*_rollback.sql` file per migration so the rollback is a single `psql -f` away.

**Effort:** 2 days (1 day writing migrations + 1 day staging verification across the touched UI surfaces). **DB engineer + 1 reviewer.**

---

## Phase 4 — Storage lockdown (0.5 day)

**Closes:** B-07 (F-07), B-08 (F-08), F-22, F-23, F-24, F-37

**Why this phase exists:** one bucket is undeclared in migrations, one is wide-open public, one has cross-tenant access, and one allows stored XSS. Independent of DB phases.

### 4.1 Migration: declare `tenant-assets`, lock down `qc-evidence`, scope `vault_backups`

```sql
-- 4.1.1 — Declare tenant-assets to match live config + tighten MIME (drop SVG).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-assets', 'tenant-assets', true, 524288,
        ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'],
  file_size_limit = 524288;

CREATE POLICY "tenant_assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_member_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids())
  );
CREATE POLICY "tenant_assets_member_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "tenant_assets_member_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()));

-- 4.1.2 — qc-evidence: add limits, make private, scope to tenant.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,                                -- 10MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'qc-evidence';

DROP POLICY "Public read qc-evidence" ON storage.objects;
DROP POLICY "Authenticated upload to qc-evidence" ON storage.objects;
DROP POLICY "Authenticated delete qc-evidence" ON storage.objects;

CREATE POLICY "qc_evidence_tenant_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'qc-evidence'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY "qc_evidence_tenant_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qc-evidence'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()));
-- (similar for UPDATE, DELETE)

-- 4.1.3 — vault_backups: enforce tenant prefix.
DROP POLICY "Allow authenticated full access to vault_backups" ON storage.objects;

CREATE POLICY "vault_backups_tenant_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'vault_backups'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (bucket_id = 'vault_backups'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_user_tenant_ids()));

-- 4.1.4 — product-images: stop accepting anonymous uploads.
DROP POLICY "Allow Uploads to Product Images" ON storage.objects;
CREATE POLICY "product_images_member_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'gallery'
    -- (consider tightening further once paths are tenant-prefixed in code)
  );
```

### 4.2 Code change: tenant-prefix the upload paths

Files to update:
- `apps/platform/components/products/qc/qc-photo-uploader.tsx:35` — prepend `${tenantId}/` to path.
- `apps/platform/components/products/product-gallery-section.tsx:96` — prepend `${tenantId}/`.
- `apps/platform/components/products/product-image-upload.tsx:33-57` — prepend `${tenantId}/`.
- `apps/platform/app/api/cron/backup/route.ts:104-109` — backups are cron-driven; either include `tenant_id` in the path or move to a service-role-only bucket.
- `apps/platform/lib/vault-utils.ts:334-336` — same as above.
- `apps/platform/hooks/use-voice-notes.ts:36-44` — `customer-voice-notes` bucket also undeclared; add a migration to create it with tenant scoping or repurpose to `tenant-assets`.

**Sequence:** ship the code change first (paths now include `${tenantId}/`), wait a day for existing uploads to flush, then ship the migration that enforces the path prefix. This avoids a window where old code uploads to the wrong path and is rejected.

### 4.3 Verification

- Try uploading from a logged-in user A's session to a path beginning with user B's tenant id — expect 403.
- `mcp__supabase__get_advisors security` — `public_bucket_allows_listing` count drops.
- Existing `tenant-assets` images still render in storefronts.

**Rollback:** revert the migration (drop new policies, recreate old ones). Code change is a forward-only revert.

**Effort:** 4 hours.

---

## Phase 5 — Storefront price re-verification (0.5 day)

**Closes:** B-11 (F-11), partial F-26 (idempotency)

**Why:** the storefront checkout passes client-supplied `items[].price` straight into the order. Trivial $0.01 attack.

### 5.1 Add server-side price recomputation in `submitCheckout`

**File:** `apps/storefront/app/actions/checkout.ts`

Insert between tenant validation and the `create_order_atomic` call:

```typescript
// 1. Fetch the canonical price for every (product_id, variant_id) in the cart.
const productIds = [...new Set(payload.items.map(i => i.product_id))];
const { data: products, error: pErr } = await supabase
  .from("products")
  .select("id, tenant_id, price, website_price")
  .in("id", productIds)
  .eq("tenant_id", payload.tenantId)
  .eq("is_visible", true)
  .eq("is_archived", false);
if (pErr || !products || products.length !== productIds.length) {
  return { success: false, error: "One or more products are unavailable" };
}
const productMap = new Map(products.map(p => [p.id, p]));

// 2. For variant-priced items, fetch the variant.
const variantIds = payload.items.map(i => i.variant_id).filter((v): v is string => !!v);
let variantMap = new Map<string, { id: string; price: number; product_id: string }>();
if (variantIds.length) {
  const { data: variants, error: vErr } = await supabase
    .from("product_variants")
    .select("id, product_id, price, tenant_id")
    .in("id", variantIds)
    .eq("tenant_id", payload.tenantId);
  if (vErr || !variants) {
    return { success: false, error: "One or more variants are unavailable" };
  }
  variantMap = new Map(variants.map(v => [v.id, v]));
}

// 3. Recompute prices on the server.
const verifiedItems = payload.items.map(i => {
  const product = productMap.get(i.product_id);
  if (!product) throw new Error(`Product ${i.product_id} not in tenant`);
  let unitPrice: number;
  if (i.variant_id) {
    const variant = variantMap.get(i.variant_id);
    if (!variant || variant.product_id !== i.product_id) {
      throw new Error(`Variant ${i.variant_id} mismatch`);
    }
    unitPrice = variant.price;
  } else {
    unitPrice = product.website_price ?? product.price;
  }
  return { ...i, price: unitPrice };          // overwrite client-supplied price
});

const totalPrice = verifiedItems.reduce((s, i) => s + i.price * i.quantity, 0);
// ...continue with create_order_atomic using verifiedItems and totalPrice.
```

### 5.2 Add idempotency key to checkout (F-26)

Add `payload.idempotencyKey: string` (UUID generated by the client at first submit attempt). Before insert, `SELECT id FROM orders WHERE tenant_id = ? AND idempotency_key = ?` — return the existing order if found. Requires a new migration adding `idempotency_key` column + unique index on `(tenant_id, idempotency_key)`.

### 5.3 Verification

- Manual test: in the browser, intercept the action payload, change a price from 50,000 to 100. Expect the server to override and place the order at the real price.
- Cart with a variant that doesn't belong to the chosen product → expect error, no order created.
- Submit the same idempotency key twice rapidly → expect single order returned both times.

**Effort:** 3 hours.

---

## Phase 6 — P1 scale & ops hardening (2 days)

These are independent and can land any time after Phase 3.

### 6.1 Mandatory webhook signatures (F-16, F-17) — 1 hour
- `apps/platform/app/api/webhooks/lightfunnels/route.ts` and `interakt/route.ts`: turn the `if (expectedSecret)` into `if (!expectedSecret) throw` at module load.
- Remove the `|| env.NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback in the Interakt webhook — fail loudly if service-role isn't set.

### 6.2 Rate limiting (F-18) — 4 hours
- Add `@upstash/ratelimit` middleware to `apps/platform/middleware.ts` (once restored — Phase 6.7) and `apps/admin/middleware.ts`.
- Tiers: 5 req/min on `/api/auth/*`, 30 req/min on `/api/store/generate-copy`, 60 req/min default per IP.

### 6.3 Index 73 unindexed FKs (F-20) — 2 hours
- One migration: `CREATE INDEX CONCURRENTLY` on each. Each FK list is in the report's F-20 evidence.
- Use `CONCURRENTLY` to avoid locks on `orders` / `order_status_history` (24k rows but growing).

### 6.4 Consolidate multi-permissive policies (F-31) — 2 hours
- Tables: `tenants`, `tenant_members`, `user_profiles`, `customer_trust`.
- Merge the two SELECT policies into one with `USING (cond_a OR cond_b)`.

### 6.5 Wrap auth.uid() in initplan (F-32) — 1 hour
- 17 policies. Mechanical `auth.uid()` → `(SELECT auth.uid())`. One migration.

### 6.6 Sentry on admin + storefront (F-25) — 2 hours
- Copy `apps/platform/sentry.*.config.ts` to admin and storefront with their own DSN; add `instrumentation.ts`.

### 6.7 Restore platform middleware (F-13) — 4 hours
- Migrate platform from `@supabase/supabase-js` localStorage sessions to `@supabase/ssr` cookies. Use the admin middleware as template.
- Larger work; can defer to after launch IF every platform `/api/*` route is independently audited and gated.

### 6.8 Enable HaveIBeenPwned (F-30) — 5 minutes
- Supabase dashboard → Authentication → Settings → enable "Leaked password protection."

### 6.9 Health endpoints (F-38) — 30 minutes
- `/api/health/route.ts` returning `{ ok: true, ts: Date.now() }` in platform and storefront.

### 6.10 Empty-state guards (F-34) — 1 hour
- Add `?.` / fallback to the listed `data[0]` accesses.

**Total Phase 6:** ~2 days.

---

## What ships when

| Phase | Dur | Ships to staging | Ships to prod | Blocks launch |
|------:|----:|------------------|---------------|:--------------|
| Pre-flight | 0.5d | day 1 | day 1 | YES — blocks every later phase |
| 0 — Anon key rotation | 0.5h | day 1 | day 1 (after-hours) | YES |
| 1 — Admin RBAC | 1d | day 2 | day 3 | YES |
| 2 — RPC lockdown | 0.5d | day 3 | day 3 | YES |
| 3 — RLS rewrites | 2d | day 4–5 | day 6 (after staging verify) | YES |
| 4 — Storage | 0.5d | day 7 | day 7 | YES |
| 5 — Storefront price | 0.5d | day 7 | day 7 | YES |
| **— LAUNCH GATE — re-run advisors, two-tenant probe, full smoke test — — — — — — — — — — — — —** | | | | |
| 6 — P1 hardening | 2d | post-launch sprint | post-launch | NO |

**Total to GO:** ~6 working days end-to-end with one DB engineer + one backend engineer working in parallel (DB on Phases 2/3, backend on Phase 1/5).

---

## Verification gate before launch

After Phases 0–5 ship to production, run a final verification pass:

1. **Re-run `mcp__supabase__get_advisors`** for both `security` and `performance`.
   - Expected: `rls_disabled_in_public` = 0; `rls_policy_always_true` ≤ 2 (intentional public-read only); `materialized_view_in_api` = 0; `anon_security_definer_function_executable` ≤ 5 (intentional storefront-facing only); `public_bucket_allows_listing` ≤ 1.
2. **Two-tenant cross-access probe.** Create two test tenants (A, B) on prod, log in as each in separate browsers, attempt:
   - From A's session, call `charge_wallet_atomic` against B → expect 42501.
   - From A's session, `select` on every `product_*` table filtered to B's tenant → expect 0 rows.
   - From A's session, upload to `tenant-assets/<B>/` → expect 403.
   - Browse admin URL from a regular tenant user — expect redirect or 403.
   - Hit every previously unprotected admin API without a token — expect 401.
3. **Storefront checkout tamper test.** Override `items[0].price = 1` client-side; order should land at real price.
4. **Smoke test the platform UI** for each major surface: orders list, products list, customers dashboard, store builder, settings, billing. Confirm nothing broke from the policy rewrites.
5. **Sign-off:** DB lead, backend lead, and CEO each acknowledge the verification output before flipping launch flag.

---

## Out of scope for launch (acknowledged debt)

- Tenant deletion / GDPR runbook — needs a written procedure but no blocking code change.
- Data export feature for merchants.
- Realtime subscription audit — deferred until usage justifies it.
- Cache-key tenancy audit — current `unstable_cache` usage not surveyed.
- Index pruning of 87 unused indexes — slight write-amplification cost but no correctness risk.
- 29 functions with mutable search_path — hardening, not exploitable in current state.
- Migration system rebuild — Phase pre-flight reconciles state; long-term migrate to a single migration tool.

These are real but not blockers. Schedule into the post-launch sprint.

---

## Risks to this plan

- **Phase 3 is the biggest source of risk** — policy rewrites can lock out the very admin tools that staff need to operate. Mitigation: ship to staging first, two engineers review each policy diff, never drop the old policy in the same transaction as creating the new one (always additive then destructive in separate statements, ideally separate migrations).
- **Phase 2's storefront compatibility** depends on the service-role bypass pattern (option A in 2.2). If `current_setting('role', true)` doesn't return what we expect inside SECURITY DEFINER, fall back to option B (separate storefront RPC).
- **The `mv_customer_aggregates` rebuild** is the most invasive single migration — it drops the view and recreates with a new column. Customer dashboard code must ship in the same release.
- **Anon key rotation invalidates all sessions.** Communicate beforehand. Schedule for low-traffic window.
- **Auto-applied feedback loop:** if any phase breaks production, the rollback is git-revert of the PR + `supabase migration repair --status reverted <ts>` + redeploy. Each phase is designed to be independently revertible.
