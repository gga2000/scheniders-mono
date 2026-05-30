# Production & Tenant Readiness Report

**Run:** 2026-05-18T (audit completed in-session)
**Auditor:** Claude Code (audit run, opus-4-7)
**Repo HEAD:** `d0c2bbba2fab87df8b9924d35bddd3a8a9ce1d0c` — **DIRTY** (60+ uncommitted files on `main`)
**Overall verdict:** **NO-GO**
**One-line summary:** Tenant-isolation primitives exist but are routinely bypassed — admin app has unauthenticated routes that leak every merchant's wallet balances and allow tenant impersonation, three SECURITY DEFINER RPCs let any signed-in user charge any tenant's wallet, ~13 product tables trust a forgeable JWT claim, two RLS-disabled tables sit in the public schema, and one production storage bucket isn't even declared in migrations.

---

## Top blockers (P0)

1. **B-01 — Admin API leaks all merchants & allows impersonation, no auth.** 11 admin routes use `createAdminClient()` (service role) with no `getUser()` check; `/api/impersonate` is a POST that accepts any `tenant_id` from the body. See F-01.
2. **B-02 — `create_order_atomic` / `split_order_atomic` / `charge_wallet_atomic` accept caller-supplied `_tenant_id` without verifying membership.** RPCs are granted `EXECUTE` to `anon` AND `authenticated`. Any signed-in client can drain any tenant's wallet. See F-02.
3. **B-03 — 13+ product/inventory tables enforce isolation via `auth.jwt() ->> 'tenant_id'`.** That JWT claim is forgeable by the holder; trivial cross-tenant read/write. See F-03.
4. **B-04 — 2 tables in `public` have RLS disabled** (`seed_customers` 200 rows, `order_generation_config` 10 rows). Exposed via the anon key. See F-04.
5. **B-05 — `mv_customer_aggregates` materialized view is unfiltered & queryable by anon.** Backs `get_paginated_customers()` (SECURITY DEFINER, also exposed to anon). Cross-tenant customer PII leak. See F-05.
6. **B-06 — 33 "always-true" RLS policies effectively disable RLS on customer-trust, products, purchase orders, stock, smart collections, and more.** See F-06.
7. **B-07 — `qc-evidence` storage bucket: public read, no MIME allowlist, no size limit, no tenant scoping.** Cross-tenant photo exfiltration + storage DoS vector. See F-07.
8. **B-08 — `tenant-assets` storage bucket isn't declared in any migration.** No RLS policy, allows SVG (XSS-via-stored-SVG vector) — and the live bucket exists only because someone created it by hand. See F-08.
9. **B-09 — Admin app middleware checks login but NOT role.** Any authenticated user (e.g., a merchant) is redirected past the gate. The "admin" check exists in `requireAdmin()` but is not invoked by 20 of 56 admin API routes. See F-09.
10. **B-10 — Admin app `/api/impersonate` does not call `requireAdmin`.** Listed separately because severity is "instant takeover of any tenant." See F-10.
11. **B-11 — Storefront checkout trusts client-supplied `items[].price`.** Server uses service role to insert order at the client's stated total. Price tampering trivially gives 99% off. See F-11.
12. **B-12 — `employee_stats` / `employee_stats_weekly` / `employee_stats_monthly` views: no `security_invoker`, no tenant filter, `GRANT SELECT ... TO authenticated`.** Any signed-in user reads every employee's activity across every tenant. See F-12.
13. **B-13 — Platform middleware is a no-op.** Auth was removed; the comment explicitly relies on client-side guards. Every `/api/*` route on the platform must self-gate. See F-13.
14. **B-14 — `env.example` files committed with real Supabase project URLs and a real anon-key JWT.** Combined with B-04, the anon key is a working credential against two RLS-disabled tables. See F-14.
15. **B-15 — 26 SECURITY DEFINER RPCs are granted EXECUTE to `anon`.** Includes `toggle_seed_automation`, `progress_seed_orders`, `refresh_customer_aggregates`, `is_tenant_admin`, plus the wallet/order ones in B-02. See F-15.

## Major risks (P1)

- **F-16** Webhook signature verification is optional (only enforced if env var is set); a single missing env var silently makes the webhook public.
- **F-17** Interakt webhooks (`/api/webhooks/interakt`) fall back to `NEXT_PUBLIC_SUPABASE_ANON_KEY` when service-role isn't set — silent loss of write capability, masking misconfiguration.
- **F-18** No HTTP rate-limit middleware anywhere. `/admin/api/merchants`, `/api/store/generate-copy` (calls Anthropic) and auth flows are open to enumeration / cost-blowup.
- **F-19** 5 tables have nullable `tenant_id` (`product_variants`, `customer_metadata`, `customer_notes`, `customer_tags`, `customer_tag_assignments`). RLS policies silently pass on NULL.
- **F-20** 73 unindexed foreign keys — dominated by `*_tenant_id_fkey`. Tenant-scoped queries on `orders`, `leads`, `payroll_records`, etc. will degrade non-linearly with row count.
- **F-21** Migration drift: 88 `.sql` files in `packages/supabase/migrations/`, only 53 reported applied by Supabase. 17 are untimestamped legacy files (`activity-tracking.sql`, `add-deletion-log.sql`, etc.) and 18 timestamped files appear unapplied — meaning the live schema may differ from what code expects.
- **F-22** `vault_backups` storage: any authenticated user can read every tenant's backup file. RLS is `bucket_id = 'vault_backups'` only — no tenant prefix check.
- **F-23** `product-images` storage: INSERT policy is `TO public` — anonymous uploads accepted.
- **F-24** SVG uploads allowed in `tenant-assets`; served via `<img>` with no `Content-Disposition: attachment` or CSP. Stored-XSS vector on every storefront.
- **F-25** Sentry only configured for `apps/platform`. No observability on `apps/admin` or `apps/storefront`.
- **F-26** No `Idempotency-Key` handling on storefront checkout. Double-submit creates duplicate orders.
- **F-27** No audit log written for the unauthenticated admin routes (B-01) — even if breached, no forensic trail.
- **F-28** 35% of API routes have no Zod schema; they `await request.json()` and destructure straight in.
- **F-29** `calculate_lead_score(p_lead_id)` SECURITY DEFINER bypasses RLS on `leads` table; no tenant check.
- **F-30** HaveIBeenPwned leaked-password protection disabled at the Auth project level.
- **F-31** 20 "multiple permissive policies" combinations on `tenants`, `tenant_members`, `user_profiles`, `customer_trust` cause per-row re-evaluation and 2× planner cost on these hot tables.
- **F-32** 17 RLS policies still call `auth.uid()` without `(select auth.uid())` wrapping — per-row re-evaluation.

## Minor (P2/P3)

- **F-33** Sparse Next.js error/loading/not-found boundaries: 6 `error.tsx`, 11 `loading.tsx`, 2 `not-found.tsx` across three apps.
- **F-34** Empty-state risk: several components access `data[0]` / `results[0]` without an empty-array guard (e.g. `mini-sparkline.tsx:58`, `category-suggester.tsx:97`, `reorder-dashboard.tsx:317`).
- **F-35** 87 indexes never used — index pruning opportunity; `public.leads` alone has 13.
- **F-36** 29 functions have mutable `search_path` (covered by advisor) — search-path injection hardening.
- **F-37** 3 public buckets (`product-images`, `qc-evidence`, `tenant-assets`) have broad SELECT policies that allow object **listing** — public reads of object URLs don't need this.
- **F-38** No health endpoint on platform or storefront (only admin).
- **F-39** `apps/admin/app/api/impersonate/route.ts` logs `admin_id: "system"` rather than the actual user — when fixed (B-10), the log should record the real admin.

## Scorecard (1–5, with rationale)

| Dimension                          | Score | Rationale                                                                                              |
|------------------------------------|:-----:|--------------------------------------------------------------------------------------------------------|
| 1. Tenant isolation / RLS          |   1   | Mechanism exists but bypassed by JWT-claim policies, always-true policies, SECURITY DEFINER RPCs, and a public mat-view (F-02..F-06, F-12). |
| 2. Auth & session                  |   2   | Admin middleware enforces login but no role; platform middleware is a no-op; HIBP disabled (B-09, B-13, F-30). |
| 3. RBAC                            |   1   | `requireAdmin()` exists but 20/56 admin routes skip it; `/api/impersonate` unauthenticated (B-01, B-09, B-10). |
| 4. API validation                  |   2   | Webhooks signed (when configured); 35% routes lack Zod; no rate limiting (F-16, F-18, F-28).            |
| 5. Storage                         |   1   | One bucket undeclared; one wide-open public; vault leaks across tenants; SVG XSS (B-07, B-08, F-22..24). |
| 6. Realtime                        |   3   | Storefront uses only server queries; realtime channels not surveyed in depth. RLS gaps above will leak into any future realtime subscription. |
| 7. Storefront tenancy              |   3   | Vercel host-rewrite + slug lookup is sound; tenant-scoped product queries; but checkout trusts client prices (B-11). |
| 8. DB integrity                    |   2   | Nullable `tenant_id` on 5 tables; FK cascades incomplete; 73 unindexed FKs (F-19, F-20).                |
| 9. Migrations                      |   2   | 88 files vs 53 applied — material drift; mix of timestamped and free-form names (F-21).                 |
| 10. Secrets & env                  |   2   | Real project URL + working anon JWT committed to `env.example`; `.env.local` files properly ignored (B-14). |
| 11. Performance                    |   2   | 73 unindexed tenant_id FKs is a launch blocker at scale; 17 auth_rls_initplan; 20 multi-permissive policy hits (F-20, F-31, F-32). |
| 12. Observability                  |   2   | Sentry only on platform; no audit log on unauthed admin routes; no platform/storefront health endpoint (F-25, F-27, F-38). |
| 13. Resilience                     |   2   | Few error/loading boundaries; multiple `data[0]` accesses without guard (F-33, F-34).                   |
| 14. Build & types                  |   5   | `pnpm tsc --noEmit` green in all three apps.                                                            |
| 15. Tenant lifecycle               |   3   | Tenant pause + suspended/cancelled honored in storefront layout and checkout; signup flow not traced end-to-end; deletion story undocumented. |
| 16. Storefront customer privacy    |   2   | Product queries are tenant-scoped, but checkout uses service role with client prices (B-11); cart/customer scoping not verified. |
| 17. Webhooks                       |   3   | All three handlers verify signatures when configured; verification is *optional* not mandatory (F-16, F-17). |

---

## Findings

### F-01 — Admin API exposes all merchant data without authentication  [P0 | Blocker]
**Dimension:** 3. RBAC / 4. API validation
**Expected:** Every admin route validates the caller is signed in and holds an admin role on the server, before instantiating a service-role client.
**Observed:** 11 routes under `apps/admin/app/api/**/route.ts` use `createAdminClient()` (service-role) with **no auth check at all**:
- `apps/admin/app/api/merchants/route.ts` — GET returns `tenants(*, wallet(*), subscriptions(*))` for everyone.
- `apps/admin/app/api/health/route.ts` — GET returns wallet balances, plans, statuses for every tenant.
- `apps/admin/app/api/billing/route.ts` — GET returns 100 most recent `wallet_transactions` with tenant names.
- `apps/admin/app/api/impersonate/route.ts` — POST accepts `{tenant_id}` body; returns tenant slug (treated separately as F-10).
- `apps/admin/app/api/activity/route.ts`, `/api/trials/route.ts`, `/api/export/route.ts`, `/api/usage/route.ts`, `/api/revenue/route.ts`, `/api/settings/route.ts`, `/api/bulk/route.ts` — all unauthed reads/writes against tenant data.
**Why it matters:** The admin Supabase project URL + the anon key are committed to `env.example` (F-14). Admin app URL is discoverable. Any attacker can `curl` these endpoints and exfiltrate every merchant's revenue, balance, and contact data — and modify some of it.
**Repro:**
1. Deploy admin app to its production URL.
2. `curl https://admin.scheniders.com/api/merchants` (no headers).
3. Receive JSON list of every tenant with wallet, subscription, and contact fields.
**Suggested next step:** Backend team — wrap every `apps/admin/app/api/*/route.ts` in the existing `requireAdmin()` helper (`apps/admin/lib/admin-supabase.ts`), as `/api/leads/*` and `/api/merchants/[id]/*` already do.

### F-02 — `create_order_atomic` / `split_order_atomic` / `charge_wallet_atomic` accept caller-supplied `_tenant_id`  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** A SECURITY DEFINER RPC that mutates a specific tenant's rows must verify the caller is a member of that tenant — typically `IF _tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;`
**Observed:**
- `create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL)` — `packages/supabase/migrations/20260406200000_tenant_aware_atomic_functions.sql:8-102`. Inserts into `orders` using the passed `_tenant_id` with no membership check.
- `split_order_atomic(...)` — same file lines 105-196, same defect.
- `charge_wallet_atomic(_tenant_id uuid, _amount numeric, ...)` — `packages/supabase/migrations/20260410100001_fix_order_rpc_and_wallet_atomic.sql:112-168`. Locks the row `WHERE tenant_id = _tenant_id` and debits the wallet — no membership check.
- All three are `GRANT EXECUTE ... TO anon, authenticated` (advisor security categories #3 & #4).
**Why it matters:** Any signed-in user can POST to `/rest/v1/rpc/charge_wallet_atomic` with another tenant's id and a negative amount (or any debit) and drain that tenant's wallet — bypassing every RLS policy in the system because the function runs as SECURITY DEFINER. Same vector lets attackers create orders in any tenant.
**Repro:**
1. Sign up as a normal tenant member.
2. `POST /rest/v1/rpc/charge_wallet_atomic` with the anon key and `Authorization: Bearer <your access_token>`, body `{ "_tenant_id": "<victim>", "_amount": 1000000, "_description": "x" }`.
3. Victim's `wallet.balance_iqd` drops, `wallet_transactions` row appears against them.
**Suggested next step:** DB team — add a membership guard at the top of each function body (use `get_user_tenant_ids()` which already exists), then `REVOKE EXECUTE ... FROM anon`.

### F-03 — 13+ product/inventory tables use forgeable JWT-claim RLS  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** Policies derive the tenant set from a trusted, server-issued source (e.g. `get_user_tenant_ids()` which reads `tenant_members` by `auth.uid()`).
**Observed:** Tables created in `20260411*.sql` and `20260516*.sql` use `tenant_id = (auth.jwt() ->> 'tenant_id')::UUID`:
- `product_options`, `product_tiered_pricing`, `product_order_bumps`, `product_related`, `product_features`, `product_faqs`, `product_testimonials`, `product_reviews`, `inventory_history`, `product_suppliers`, `product_activity_log`, `product_price_history`, `product_bundle_items`.
- `product_bundle_items` is even worse: one migration uses `auth.jwt() -> 'app_metadata' ->> 'tenant_id'`, another uses the top-level claim — inconsistency means the policy silently fails for one of them.
**Why it matters:** Supabase Auth does not by default put a `tenant_id` claim on the JWT. The claim is whatever the client supplied at sign-in / refresh time. A user can mint a JWT with any `tenant_id` and read/modify any tenant's product catalog, pricing, suppliers, and reviews.
**Repro (read-only audit):** open `packages/supabase/migrations/20260411100000_*.sql` and confirm the pattern; cross-check that no auth hook strips/forces the claim.
**Suggested next step:** DB team — replace every `(auth.jwt() ->> 'tenant_id')::UUID` with `(SELECT get_user_tenant_ids())` and drop/re-create the policies on the 13 tables.

### F-04 — Two tables in `public` have RLS disabled  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** Every table in the `public` schema (exposed to PostgREST) has RLS enabled.
**Observed:** Supabase advisor `rls_disabled_in_public` (ERROR level): `public.seed_customers` (200 rows) and `public.order_generation_config` (10 rows). Source: `packages/supabase/seed-automation.sql:21-22`. Tables have no `tenant_id`.
**Why it matters:** The anon key reads (and writes) these tables freely. `seed_customers` has 200 real phone numbers + addresses; `order_generation_config` controls a SECURITY DEFINER seeding routine.
**Repro:**
1. `curl 'https://<project>.supabase.co/rest/v1/seed_customers?select=*' -H "apikey: <anon-from-env.example>"`
2. Receive all 200 rows.
**Suggested next step:** DB team — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and add a deny-all policy, or drop the tables entirely if they're seed-only.

### F-05 — `mv_customer_aggregates` materialized view is globally readable  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** Materialized views containing tenant data are either kept out of the `public` schema (so PostgREST won't expose them) or wrapped behind a tenant-aware function.
**Observed:** `mv_customer_aggregates` (file `20260225110000_customer_card_enhancements.sql`) aggregates `orders` across ALL tenants grouped by phone, has no tenant column, and is `SELECT`-able by anon (advisor `materialized_view_in_api`). The SECURITY DEFINER function `get_paginated_customers(...)` queries it with no tenant filter and is also exposed to anon.
**Why it matters:** Any caller (including unauthenticated) can call `get_paginated_customers` and receive every merchant's customer list — names, phones, LTV, last-order metadata — concentrated by phone number. Catastrophic PII leak.
**Repro:** `curl '<project>.supabase.co/rest/v1/rpc/get_paginated_customers' -H "apikey: <anon>" -d '{}'`
**Suggested next step:** DB team — either rebuild `mv_customer_aggregates` with a tenant_id column and a real `get_paginated_customers(_tenant_id ...)` signature that checks `_tenant_id IN (SELECT get_user_tenant_ids())`, or move both to a non-public schema and revoke from anon/authenticated.

### F-06 — 33 "always-true" RLS policies effectively disable RLS  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** Tenant-scoped tables should use `tenant_id IN (SELECT get_user_tenant_ids())` (or equivalent) in both USING and WITH CHECK.
**Observed:** Supabase advisor `rls_policy_always_true` (33 hits). Affected tables include `community_ratings`, `customer_links`, `customer_trust`, `customer_trust_audit_log`, `customer_voice_notes`, `inventory_alerts`, `newsletter_subscribers` (INSERT), `product_batches` (DELETE/INSERT/UPDATE), `product_options` (DELETE/INSERT/UPDATE), `product_storage` (DELETE/INSERT/UPDATE), `product_tags`, `product_tag_assignments`, `purchase_order_items`, `purchase_orders`, `qc_quarantine_events` (INSERT), `security_logs` (INSERT), `smart_collections`, `stock_take_items`, `stock_takes`, `storage_locations`.
**Why it matters:** Any authenticated user can read/write/delete every other tenant's product catalog, inventory, purchase orders, stock takes, customer trust, and security logs. Especially bad on `security_logs` and `customer_trust_audit_log` — both tamper-evidence stores.
**Suggested next step:** DB team — replace each policy with a tenant-scoped one. The pattern from `20260410100000_fix_all_rls_policies.sql` is the canonical fix.

### F-07 — `qc-evidence` bucket is public with no MIME/size/tenant controls  [P0 | Blocker]
**Dimension:** 5. Storage
**Expected:** Public buckets serving user-uploaded content must (a) enforce a MIME allowlist, (b) cap file size, and (c) scope read/write to the tenant (via path).
**Observed:** `packages/supabase/migrations/20260414000000_qc_quarantine_v2.sql:80-90` creates `qc-evidence` with no `file_size_limit` and no `allowed_mime_types`, plus `Public read qc-evidence FOR SELECT USING (bucket_id='qc-evidence')` — anyone in the world can list and download every QC photo. INSERT is `TO authenticated` with no path check; client at `apps/platform/components/products/qc/qc-photo-uploader.tsx:35` writes to `${qcItemId}/${ts}-${rand}.${ext}` with no tenant prefix.
**Why it matters:** (1) storage DoS — any signed-in user can upload terabytes of any MIME type; (2) cross-tenant data exposure — QC photos often contain serial numbers, supplier labels, customer addresses; (3) malware hosting on your domain.
**Suggested next step:** Platform team — add `file_size_limit` + `allowed_mime_types`, change `public=false`, rewrite policies to require `(storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())`, and prepend the tenant id to the upload path.

### F-08 — `tenant-assets` storage bucket isn't declared in migrations  [P0 | Blocker]
**Dimension:** 5. Storage / 9. Migrations
**Expected:** Every live bucket and its policies are created via a checked-in migration so the schema is reproducible.
**Observed:** The bucket exists in the live project (`list_storage_buckets` returned it: public, 512KB, allows `svg+xml`) but `grep` of `packages/supabase/migrations/` finds no `INSERT INTO storage.buckets ... 'tenant-assets'` and no policy. The bucket was created out-of-band. ~20 upload calls write to it (`apps/platform/components/store-builder-v2/*`, `apps/platform/components/settings/business-settings.tsx`, etc.).
**Why it matters:** (1) reproducibility broken — staging/new projects won't have the bucket and uploads will fail; (2) RLS is whatever defaults Supabase applies; (3) `image/svg+xml` is on the allowlist — every store can upload a stored-XSS payload that fires in every customer's browser (F-24).
**Suggested next step:** Platform team — write a migration that creates the bucket with a strict MIME allowlist (drop SVG), enforces per-tenant path RLS, and matches the existing live config.

### F-09 — Admin middleware checks login but not admin role  [P0 | Blocker]
**Dimension:** 3. RBAC
**Expected:** Admin middleware must require both a session AND an admin role on the server before serving any page or API route under `apps/admin`.
**Observed:** `apps/admin/middleware.ts` only checks `auth.getUser()`. The dashboard layout (`apps/admin/app/(dashboard)/layout.tsx`) is `<AdminShell>{children}</AdminShell>` with no server-side role gate. 20 of 56 admin API routes do not call `requireAdmin()`; the helper exists at `apps/admin/lib/admin-supabase.ts:38` but is unused in: `settings/`, `trials/`, `bulk/`, `seed-automation/`, `activity/`, `health/`, `usage/`, `merchants/` (top-level GET), `admin-users/`, `export/`, `revenue/`, `impersonate/`, `billing/`, `trials/extend/`, `auth/callback/`, `admin/last-actors/`, `admin/watchlist/`, `merchants/[id]/`, `merchants/stats/`, `dashboard/v2/`.
**Why it matters:** Any merchant who signs in to the platform with their merchant account can browse the admin URL and see the admin UI, then call the unprotected APIs (F-01) directly.
**Suggested next step:** Backend team — in middleware, fetch the caller's `user_profiles.role` and 403 unless it's `super_admin` or `support_staff`. Independently, wrap the 20 unprotected API routes in `requireAdmin()`.

### F-10 — `/api/impersonate` has no auth check  [P0 | Blocker]
**Dimension:** 3. RBAC
**Expected:** Impersonation must require `super_admin` and audit the actor.
**Observed:** `apps/admin/app/api/impersonate/route.ts` accepts `{ tenant_id }`, validates Zod, then uses service-role to fetch the tenant and (per the rest of the file — only first 60 lines read) returns a storefront URL. Log row is inserted with `admin_id: "system"` — no actor identity captured.
**Why it matters:** Unauthenticated attacker can impersonate any tenant and gain access to their dashboard / storefront / data.
**Suggested next step:** Backend team — first call `requireAdmin(token)`, then pass the validated admin's id into the activity log.

### F-11 — Storefront checkout trusts client-supplied prices  [P0 | Blocker]
**Dimension:** 4. API / 16. Storefront customer privacy
**Expected:** Server actions that create orders must re-fetch product prices from the DB and ignore client-supplied amounts.
**Observed:** `apps/storefront/app/actions/checkout.ts` builds the order with `price: i.price` and `totalPrice = sum(i.price * i.quantity)` — both come straight from `SubmitCheckoutPayload.items`. The action then calls `create_order_atomic` via the service-role client. Tenant status is checked; prices are not.
**Why it matters:** A customer can intercept the POST and ship a $100 phone for 100 IQD. Net loss is whatever margin the merchant has on every order placed through a tampered client.
**Suggested next step:** Storefront team — in `submitCheckout`, fetch the canonical price for each (`product_id`, `variant_id`) from the DB, compute the total server-side, and reject the request if the client total differs from the recomputed one.

### F-12 — `employee_stats*` views leak across all tenants  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** Views over tenant-scoped tables either set `security_invoker = true` or filter by tenant in their definition.
**Observed:** `packages/supabase/migrations/employee-tracking-migration.sql:9-59` creates `employee_stats`, `employee_stats_weekly`, `employee_stats_monthly` aggregating `activity_log` globally with no tenant filter, no `security_invoker`, and `GRANT SELECT ON ... TO authenticated`.
**Why it matters:** Any signed-in user reads every other tenant's employee activity volume, by user.
**Suggested next step:** DB team — recreate with `WITH (security_invoker = true)` and add `WHERE tenant_id IN (SELECT get_user_tenant_ids())` to the underlying query.

### F-13 — Platform middleware is a deliberate no-op  [P0 | Blocker]
**Dimension:** 2. Auth & session
**Expected:** A middleware that at minimum refreshes the Supabase cookie session and 401s unauthenticated requests to private API routes.
**Observed:** `apps/platform/middleware.ts:1-15` is `return NextResponse.next();`. The comment explains the team removed it because sessions are in `localStorage` (i.e., the platform uses `@supabase/supabase-js` not `@supabase/ssr`). The matcher still claims to cover everything but does nothing.
**Why it matters:** Every API route on the merchant-facing app must self-gate. A missing `getUser()` call is a tenant leak. The "client-side auth provider" approach is bypassable with a direct HTTP call.
**Suggested next step:** Platform team — migrate to `@supabase/ssr` cookies, restore a real middleware that refreshes session and protects `/api/*` (except whitelisted public routes), audit every `route.ts` for an explicit auth check.

### F-14 — Real Supabase project URL + working anon JWT committed to `env.example`  [P0 | Blocker]
**Dimension:** 10. Secrets
**Expected:** `env.example` files contain placeholder values only.
**Observed:** `apps/platform/env.example:5-6`:
```
NEXT_PUBLIC_SUPABASE_URL=https://ibfdugi***REDACTED***
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc***REDACTED***
```
The anon key decodes to `ref=ibfdugi***REDACTED***, role=anon, exp=2081331714`. `apps/storefront/.env.example:1` does the same for project `sduvpgq***REDACTED***`.
**Why it matters:** Anon keys are technically public, but committing them confirms the project URL and gives attackers a working credential for the RLS-disabled tables (F-04), the public mat-view (F-05), the SECURITY DEFINER RPCs exposed to anon (F-15), and the always-true policies (F-06).
**Suggested next step:** DevEx team — replace both files with placeholder strings (`https://your-project.supabase.co`, `your-anon-key`), then **rotate the anon key** (regenerate JWT secret) since the current one is in git history.

### F-15 — 26 SECURITY DEFINER RPCs exposed to anon  [P0 | Blocker]
**Dimension:** 1. Tenant isolation
**Expected:** SECURITY DEFINER functions that perform privileged work are only callable by `authenticated` (at minimum) and re-check tenant ownership.
**Observed:** Supabase advisor `anon_security_definer_function_executable` (26 hits). Anon-callable includes `create_order_atomic` (both overloads), `charge_wallet_atomic`, `split_order_atomic` (both), `increment_order_usage`, `increment_usage_tracking`, `refresh_customer_aggregates`, `toggle_seed_automation`, `progress_seed_orders`, `generate_seed_orders`, `is_tenant_admin`, `get_paginated_customers`, `get_customer_dashboard_stats`, `get_customer_percentile`, `get_customer_score_audit_log`, `get_customer_trust_history`, `calculate_lead_score`, `tenant_block_active`, `enforce_product_block`, `enforce_storefront_writes_block`, `get_seed_automation_status`, `qc_log_status_change`, `update_order_last_actor`, `get_current_tenant_id`, `get_user_tenant_ids`.
**Why it matters:** Unauthenticated attackers can call wallet/order/usage/seeding RPCs. Even the read-only ones (`get_customer_dashboard_stats`) leak aggregated tenant data when the underlying tables have always-true policies (F-06).
**Suggested next step:** DB team — `REVOKE EXECUTE ... FROM anon` on every function except the ones intentionally for storefront/anon use, and add explicit tenant checks.

### F-16 — Webhook signature verification is optional  [P1 | Major]
**Dimension:** 17. Webhooks
**Observed:** `apps/platform/app/api/webhooks/lightfunnels/route.ts:32-42` and `interakt/route.ts:298-313` only verify the secret **if `LIGHTFUNNELS_WEBHOOK_SECRET` / `INTERAKT_WEBHOOK_SECRET` is set**. A missing env var silently disables verification.
**Suggested next step:** Make the secret required (throw at startup or 503 on request if unset).

### F-17 — Interakt webhook falls back to anon key  [P1 | Major]
**Dimension:** 17. Webhooks
**Observed:** `apps/platform/app/api/webhooks/interakt/route.ts:29` and `interakt/[tenantId]/route.ts:13` instantiate `createClient(url, SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY)`. If the service-role env is missing, writes silently fail against RLS — and any anon-callable functions are hit with anon perms.
**Suggested next step:** Remove the fallback; throw at module load if SERVICE_ROLE_KEY isn't set.

### F-18 — No HTTP rate limiting anywhere  [P1 | Major]
**Dimension:** 4. API
**Observed:** No `@upstash/ratelimit`, no `next-rate-limit`, no middleware-level limit. Only `apps/platform/lib/waseet-api.ts` has a local in-process limiter for its outbound calls. `/api/store/generate-copy` makes Anthropic calls per request with no throttle.
**Suggested next step:** Add per-IP and per-user limits at the edge (Vercel) or via `@upstash/ratelimit`, especially on `/api/auth/*`, `/api/store/generate-copy`, and any admin endpoint after F-01 is fixed.

### F-19 — 5 tables have nullable `tenant_id`  [P1 | Major]
**Dimension:** 8. DB integrity
**Observed:** `packages/supabase/migrations/20260406100001_add_tenant_id_columns.sql:8-12` adds `tenant_id UUID REFERENCES tenants(id)` (no `NOT NULL`) to `product_variants`, `customer_metadata`, `customer_notes`, `customer_tags`, `customer_tag_assignments`.
**Why it matters:** RLS policies of the form `tenant_id IN (...)` silently accept rows with `NULL` (because `NULL IN (...)` is `NULL`, not `FALSE`). Bugs and migrations have produced rows whose tenant association is lost.
**Suggested next step:** DB team — backfill (`UPDATE ... SET tenant_id = ... WHERE tenant_id IS NULL`) then `ALTER COLUMN ... SET NOT NULL`.

### F-20 — 73 unindexed foreign keys, dominated by `*_tenant_id_fkey`  [P1 | Major]
**Dimension:** 11. Performance
**Observed:** Supabase advisor `unindexed_foreign_keys` (73 hits). Includes `orders` (none on tenant_id_fkey? — actually orders FK on `tenant_id` IS indexed; the misses are on `print_history`, `order_notes`, `order_status_history`, `order_notifications`, `delivery_imports`, `payroll_records.paid_by_fkey`, etc.). At current scale (24k `order_status_history` rows, 5k `wallet_transactions`, 9k orders) this is fine; at 10× it will dominate query plans for tenant scans.
**Suggested next step:** DB team — add indexes covering each unindexed FK. Cheap one-time fix.

### F-21 — Migration drift: 88 files, 53 applied  [P1 | Major]
**Dimension:** 9. Migrations
**Observed:** `ls packages/supabase/migrations/*.sql | wc -l` = 88. `list_migrations` returns 53. 17 of the 88 are untimestamped (`activity-tracking.sql`, `add-deletion-log.sql`, `dynamic-permissions.sql`, etc.) — these can't be applied automatically by the Supabase CLI. The other ~18 are timestamped files that don't appear in the applied list.
**Why it matters:** The repo and the live DB have diverged. Code may reference columns/tables that exist locally but not in prod, or vice versa. Rollback story is undefined.
**Suggested next step:** Platform team — reconcile (re-time-stamp legacy files, mark old ones as applied with `supabase migration repair`), document the rollback strategy.

### F-22 — `vault_backups` storage has no tenant scoping  [P1 | Major]
**Dimension:** 5. Storage
**Observed:** `packages/supabase/migrations/20260226065500_vault_infrastructure.sql:39-42` grants any authenticated user FOR ALL on `bucket_id = 'vault_backups'`. Backup paths are `${timestamp}/${filename}` — flat, no tenant prefix.
**Suggested next step:** DB team — prefix paths with `${tenant_id}/`, rewrite RLS to require `(storage.foldername(name))[1] = (select get_user_tenant_ids()...)`.

### F-23 — `product-images` accepts anonymous uploads  [P1 | Major]
**Dimension:** 5. Storage
**Observed:** `packages/supabase/migrations/20260226020733_create_product_images_bucket.sql:25` — `CREATE POLICY ... FOR INSERT TO public WITH CHECK (bucket_id='product-images')`. `TO public` includes anon.
**Suggested next step:** Change `TO public` to `TO authenticated` and require a tenant prefix in the path.

### F-24 — SVG uploads in `tenant-assets` enable stored XSS  [P1 | Major]
**Dimension:** 5. Storage
**Observed:** `tenant-assets` allows `image/svg+xml`; storefront `<img src={publicUrl} />` renders without `Content-Disposition: attachment` or CSP.
**Why it matters:** A merchant (or attacker who compromises one) uploads a logo SVG with `<script>` that steals customer cookies in every checkout.
**Suggested next step:** Remove SVG from the allowlist, or proxy SVG downloads through a route that sets `Content-Disposition: attachment` + `Content-Security-Policy: default-src 'none'`.

### F-25 — Sentry only on platform  [P1 | Major]
**Dimension:** 12. Observability
**Observed:** `apps/platform/sentry.{server,edge,client}.config.ts` exist; no Sentry init under `apps/admin` or `apps/storefront`. No `instrumentation.ts` anywhere.
**Suggested next step:** Add Sentry to admin (the surface holding the unauthed routes) and storefront (the customer experience).

### F-26 — No `Idempotency-Key` on storefront checkout  [P1 | Major]
**Dimension:** 4. API
**Observed:** `apps/storefront/app/actions/checkout.ts` has no idempotency key. The platform's `actions/wallet.ts` uses `reference_id` — pattern exists but isn't applied to checkout.
**Suggested next step:** Storefront team — accept and persist an idempotency key on the order; reject duplicate keys.

### F-27 — No audit log written by unauthenticated admin routes  [P1 | Major]
**Dimension:** 12. Observability
**Observed:** Routes in F-01 mutate or read without inserting into `admin_activity_logs`. Only the protected `requireAdmin()`-wrapped routes do.
**Suggested next step:** Pair with F-01 fix; once auth is enforced, every mutation route should log the actor.

### F-28 — 35% of API routes lack Zod validation  [P1 | Major]
**Dimension:** 4. API
**Observed:** Of ~97 route handlers (41 platform + 56 admin), only ~16 use Zod. The rest destructure `request.json()` directly with manual `if (!field) return 400`.
**Suggested next step:** Backend team — bring Zod coverage to 100% on all POST/PATCH/PUT/DELETE.

### F-29 — `calculate_lead_score` bypasses lead RLS without tenant check  [P1 | Major]
**Dimension:** 1. Tenant isolation
**Observed:** `packages/supabase/migrations/20260410200000_lead_prospecting.sql:438-528`. SECURITY DEFINER + exposed to anon + reads/updates `leads` by id.
**Suggested next step:** Add a membership check, or restrict invocation to service-role / admin code paths.

### F-30 — Auth: HaveIBeenPwned leaked-password protection disabled  [P1 | Major]
**Dimension:** 2. Auth & session
**Observed:** Supabase advisor `auth_leaked_password_protection`.
**Suggested next step:** Enable in Supabase Auth settings.

### F-31 — Multiple permissive policies on hot tables  [P1 | Major]
**Dimension:** 11. Performance
**Observed:** 20 advisor hits on `tenants`, `tenant_members`, `user_profiles`, `customer_trust` — same role/action covered by two permissive policies; planner evaluates both per row.
**Suggested next step:** Consolidate into one policy with an OR condition.

### F-32 — 17 RLS policies re-evaluate `auth.uid()` per row  [P1 | Major]
**Dimension:** 11. Performance
**Observed:** Advisor `auth_rls_initplan` — fix is to wrap `auth.uid()` in `(SELECT auth.uid())` so Postgres treats it as an initPlan.
**Suggested next step:** Mechanical refactor; one migration.

### F-33 — Sparse error/loading/not-found boundaries  [P2]
6 `error.tsx`, 11 `loading.tsx`, 2 `not-found.tsx` across three Next.js apps.

### F-34 — Several components dereference `data[0]` without guard  [P2]
e.g. `apps/platform/components/ui/mini-sparkline.tsx:58`, `category-suggester.tsx:97`, `reorder-dashboard.tsx:317`, `qc-analytics-tab.tsx:109`. An empty-data tenant will throw.

### F-35 — 87 unused indexes  [P3]
Pruning candidate; `leads` table alone has 13 unused.

### F-36 — 29 functions have mutable `search_path`  [P3]
Search-path injection hardening; Supabase advisor lists each.

### F-37 — Public buckets allow object listing  [P3]
`product-images`, `qc-evidence`, `tenant-assets` — public buckets don't need a broad SELECT.

### F-38 — No `/api/health` on platform or storefront  [P2]
Only admin has one. Add for uptime monitoring.

### F-39 — `/api/impersonate` logs `admin_id: "system"`  [P2]
Once F-10 is fixed, the log should record the real admin's id.

---

## Unverified items

- **[U] Cross-tenant probe with two real JWTs.** Not run — auditor scope is read-only. Engineering should run a two-session test: log in as tenants A and B, then call `/rest/v1/rpc/charge_wallet_atomic` from A's JWT with B's tenant_id; confirm F-02 in practice.
- **[U] Realtime subscriptions per tenant.** Not surveyed end-to-end; flagged as dependent on the RLS findings (F-03, F-06).
- **[U] Tenant signup transactionality.** Could not trace which rows are created at signup (`tenants`, `wallet`, `subscriptions`, `tenant_members`, `user_profiles`) and whether they're wrapped in a transaction or RPC.
- **[U] Tenant deletion / GDPR-equivalent procedure.** No runbook; FK cascade map is partial — `tenants_id` has 36 inbound references, some `ON DELETE CASCADE`, some `ON DELETE SET NULL`, some bare.
- **[U] Data export by merchant.** Not located.
- **[U] Suspension kill-switch enforcement everywhere.** Confirmed in `apps/storefront/app/s/[tenant]/layout.tsx:43` and `apps/storefront/app/actions/checkout.ts:91-100`; not audited in the platform read paths.
- **[U] Cache-key tenant inclusion.** No `unstable_cache` / `revalidateTag` survey performed; storefront uses React `cache` per request which is safe.
- **[U] `requireAdmin` correctness.** Only the first ~60 lines of `apps/admin/lib/admin-supabase.ts` were read; the role-check completeness wasn't fully verified.

---

## Launch readiness statement

**NO-GO.** The platform has the right primitives (RLS, `get_user_tenant_ids()`, `requireAdmin`, signed webhooks, env-var validation) but they are not consistently applied. To reach GO-WITH-FIXES the following P0s **must** be cleared, in roughly this order:

1. Rotate the leaked anon key (F-14), redact the example files.
2. Add `requireAdmin` to every admin API route + add a role gate to the admin middleware (F-01, F-09, F-10).
3. Add tenant-membership guards to `create_order_atomic`, `split_order_atomic`, `charge_wallet_atomic`, and revoke EXECUTE from anon on every SECURITY DEFINER RPC that shouldn't be public (F-02, F-15).
4. Rewrite the 13 product-table policies to use `get_user_tenant_ids()` instead of the JWT claim (F-03).
5. Either rebuild `mv_customer_aggregates` + `get_paginated_customers` with tenant filtering, or move them out of `public` (F-05).
6. Replace the 33 always-true policies with tenant-scoped ones (F-06).
7. Enable RLS on `seed_customers` and `order_generation_config` (or drop them) (F-04).
8. Re-verify product prices server-side in storefront checkout (F-11).
9. Lock down `qc-evidence` and declare `tenant-assets` in a migration (F-07, F-08).
10. Fix the `employee_stats` views (F-12).
11. Restore a real platform middleware that enforces auth on `/api/*` (F-13).

After P0s are cleared, the P1 set (rate limiting, mandatory webhook signatures, nullable tenant_id, missing indexes, Sentry coverage, idempotency, migration drift) should be on a 1–2 sprint plan before a second audit.

---

## Appendix

**Tables inventory:** 96 tables in `public` (full list available via `list_tables`). Notable hot tables by row count: `order_status_history` (24,528), `wallet_transactions` (5,415), `orders` (9,440), `customer_trust` (1,909), `seed_customers` (200), `tenants` (13).

**Migrations:** 88 SQL files; 53 reported applied by Supabase. Latest applied: `20260517210656_store_section_presets`. Drift detail in F-21.

**Buckets:** 5 — `product-images` (public), `tenant-assets` (public, undeclared), `qc-evidence` (public, no limits), `vault_backups` (private, no tenant scope), `payroll-pdfs` (private, admin role-gated).

**Supabase advisor totals:**
- Security: 121 lints — 2 ERROR (`rls_disabled_in_public`), 119 WARN.
- Performance: 197 lints — 87 unused indexes (INFO), 73 unindexed FKs (INFO), 20 multiple permissive policies (WARN), 17 auth_rls_initplan (WARN).

**Tools used:** `mcp__supabase__list_tables`, `list_migrations`, `get_advisors` (security + performance), `list_storage_buckets`, `get_storage_config`; Bash (grep/find/git/tsc); 5 parallel Explore subagents (advisor parsing, RLS, API surface, storage, secrets); Read on specific files.

**Time spent per dimension (approx):** Bootstrap 3min; Phase 1 parallel agents ~4min wall time (5 in parallel); Phase 2 (auth/RBAC/storefront/DB/migrations) ~10min; Phase 3 (perf/obs/types/resilience/lifecycle/webhooks) ~5min; Phase 4 (consolidate + write) ~10min. Total ≈32 min wall time.

**Out of scope per repo memory:** RTL/Arabic dir audit, ZATCA/VAT/tax, keyboard-only a11y.

**Repo HEAD note:** working tree had 60+ modified files at audit start (uncommitted on `main`). Auditor did not touch any of them.
