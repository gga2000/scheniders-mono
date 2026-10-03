# Multi-Tenant Fan-Out Report — Axis D

**Date:** 2026-09-17 · **Project:** NEW `sduvpgqwhxragxtxztur` · **Method:** read-only; live catalog and data queries
plus source reading. No DML, no DDL.

This is the axis the prior audit could not run. The system has **one real merchant**, so every isolation defect in the
2026-09-17 ledger is unexercised. This report asks the four fan-out questions — collision, leakage, noisy neighbour,
provisioning — of the schema and the code, and separates **live today** from **latent but certain at launch**.

---

## 0. Tenant census, re-measured

| | Charter §3.1 | Measured 2026-09-17 |
|---|---|---|
| Tenant rows | 28 | **29** |
| Real merchants | 1 | 1 (`Scheniders Iraq`, 4,850 live + 41 soft-deleted orders) |
| Seed tenants | 10 | 10 (18,051 orders) |
| Junk/test tenants | ~17 | 18 |

**The largest tenant by order count is not the real merchant.** Seed tenant `الموصل ماركت` holds **4,869** live orders
against Scheniders Iraq's 4,850. Any "largest tenant", "top merchant" or benchmark logic is currently pointing at
fabricated data (DATA-05, confirmed).

Cross-tenant identity overlap **already exists at n=13**:

| Measure | Count |
|---|---|
| Phone numbers appearing in more than one tenant's `orders` | **201** |
| Phone numbers appearing in more than one tenant's `customer_trust` | **161** |
| …of those, appearing in the **real** merchant's rows | **3** |

This matters because phone is used as a join key in several unscoped paths. Cross-tenant phone collision is not a
hypothetical at 150 merchants; it is the normal case in a country where customers shop at many stores from one number.

---

## 1. Collision — what breaks when two tenants hold the same value

### 1.1 Natural keys that are globally unique but should be per-tenant

I swept every unique index on every table carrying a `tenant_id`. UUID primary keys are safe by construction. The
business-value keys are not:

| Index | Key | Consequence at 150 tenants |
|---|---|---|
| `orders_order_id_key` | `UNIQUE (order_id)` | **DATA-10, confirmed.** One order-number namespace across all tenants. Tenant B's generation fails with `23505` because of tenant A's data. The correct sibling `uq_orders_tenant_idempotency` is `UNIQUE (tenant_id, idempotency_key)` on the same table. |
| `blacklist_pkey` | `PRIMARY KEY (phone)` | **NEW.** One global blacklist. Merchant A blacklisting a phone collides with merchant B's row for the same customer; only one merchant can hold an entry. |
| `customer_risk_pkey` | `PRIMARY KEY (phone)` | **NEW.** One global risk record per phone. |
| `customer_whitelist_pkey` | `PRIMARY KEY (phone)` | **NEW.** |
| `customer_metadata_pkey` | `PRIMARY KEY (customer_phone)` | **NEW.** One metadata row per phone platform-wide, overwritten by whichever tenant writes last. |
| `customer_links_phone_a_phone_b_key` | `UNIQUE (phone_a, phone_b)` | **NEW.** |
| `settings_pkey` | `PRIMARY KEY (key)` | **NEW.** Legacy global settings table; 1 row, `tenant_id` NULL. |
| `telegram_employee_link_pkey` | `PRIMARY KEY (telegram_user_id)` | One Telegram account can be linked to exactly one tenant, platform-wide. |
| `chat_user_status_pkey` | `PRIMARY KEY (user_id)` | Presence is per-user, not per-(user, tenant). |
| `checkout_queue_checkout_id_key` | `UNIQUE (checkout_id)` | External LightFunnels id; collides if two tenants use LightFunnels. |

All five phone-keyed tables **carry a `tenant_id` column** — the schema intends tenant scoping and the primary key
prevents it. `customer_trust` gets this right: `PRIMARY KEY (tenant_id, phone)`.

**Occupancy today: `blacklist` 1 row, the other four 0 rows.** So the collision is latent. It is also certain: 201 phones
already span tenants in `orders`. Severity should be read as *newly reachable at launch, high blast radius, certain
likelihood* — not as *currently exploited*.

Correctly scoped for contrast: `tenant_domains_domain_key` (domains genuinely are globally unique) and
`tenant_slug_history_pkey`.

### 1.2 A collision that breaks a live feature at tenant #2

`app_settings` was migrated to `PRIMARY KEY (key, tenant_id)` with `tenant_id NOT NULL` by
`20260407000000_app_settings_tenant_scoped.sql:5-6` on **2026-04-07**. **Nine call sites never followed** — this
section originally said "three" and undercounted; it is tracked as **NEW-49** in the register, which lists all nine:

- `apps/platform/app/api/settings/auto-send/route.ts:47` — upserts `{key, value, updated_at}` with **no `tenant_id`**.
  This now violates `NOT NULL`, so the PUT returns 500. The WhatsApp auto-send toggle is already broken.
- `apps/platform/app/api/waseet/package-sizes/route.ts:31` and `waseet/statuses/route.ts:32` — same shape. Confirmed by
  outcome: the keys `waseet_package_sizes` exists but `waseet_statuses` and `waseet_token` **do not exist in the table
  at all**, because those writes fail.
- `apps/platform/lib/whatsapp-dispatcher.ts:69` — reads `.eq("key","whatsapp_auto_send").single()` with no tenant.

The read path is the dangerous one. At one tenant `.single()` returns the row. At **two** tenants it errors, `settings`
is undefined, and the guard `settingsValue?.enabled !== true` evaluates true — so the dispatcher **silently skips every
outbound WhatsApp message for every tenant** and returns `{ success: true, skipped: true }`. Given this project's
recorded history of WhatsApp dying quietly for weeks, and with Sentry stripped at build (OPS-01), nothing would report it.

Correct siblings in the same codebase: `settings/staff-alert`, `settings/order-pipeline`, `lib/staff-alerts.ts`,
`hooks/use-settings.ts` and `cron/waseet-sync` all pass `tenant_id` and use `onConflict: "key,tenant_id"`.

### 1.3 Shared courier credentials — a provisioning collision

`apps/platform/lib/waseet-api.ts:96` reads `WASEET_USERNAME` / `WASEET_PASSWORD` from **process environment**. There is
no per-tenant courier credential path anywhere, and `tenant_integrations` is not consulted for Waseet.

At 150 merchants, every merchant's shipments are submitted under **one Al-Waseet merchant account**. Every shipment,
every invoice, every COD remittance and every status webhook lands in a single upstream account with no way to attribute
or separate them. The platform routes `waseet/invoices`, `waseet/invoice-orders` and `waseet/receive-invoice` through
that shared account, so any authenticated user of any tenant can read and settle invoices belonging to the whole
platform.

This is not a bug to patch; it is a missing carrier-account model. It is a launch blocker for a multi-merchant product
and it is the single clearest instance of "built for one merchant" surviving into the multi-tenant design.

---

## 2. Leakage — what crosses tenants at scale that did not at n=1

### 2.1 Three `SECURITY DEFINER` functions read customer intelligence across every tenant

| Function | Reads | Tenant predicate | Grant |
|---|---|---|---|
| `get_customer_percentile(target_phone, target_city)` | `customer_trust` | **none** | `authenticated` |
| `get_customer_trust_history(target_phone, months)` | `customer_trust_audit_log` | **none** | `authenticated` |
| `get_customer_score_audit_log(target_phone, limit, offset)` | `customer_trust_audit_log` | **none** | `authenticated` |

All three are `SECURITY DEFINER` (so RLS does not apply), none has `SET search_path`, and all three are called
**directly from the browser** at `apps/platform/hooks/use-customer-trust.ts:12,29,82`. Any signed-up user can iterate
phone numbers and extract the platform's aggregate COD-risk intelligence — the most commercially valuable data in the
product, and exactly the cross-tenant risk network that the 2026-09-16 gap assessment said would require explicit
merchant agreements.

**Live impact is split and must be stated honestly:**
- `customer_trust_audit_log` has **0 rows**, so the two history functions leak nothing *today*.
- `customer_trust` has **4,882 rows across 13 tenants**, so `get_customer_percentile` leaks today — and worse, it does
  `SELECT … INTO` with no `LIMIT`, so for the **161 phones present in more than one tenant** it returns an arbitrary
  tenant's trust score. Three of those phones are the real merchant's. A merchant can already be shown another
  merchant's risk assessment of their own customer and act on it.

The correctly-scoped siblings are in the same file family: `get_customer_reliability`, `get_customer_dashboard_stats`
and `get_paginated_customers` all use `get_user_tenant_ids()`.

### 2.2 Platform-global tables written per-tenant

42 tables carry no `tenant_id`. Most are legitimately global (`waseet_regions`, `iraq_postal_codes`, `plan_limits`,
`industries`), platform-level (`tenants`, `leads`, `admin_*`), or child tables that scope through a parent
(`purchase_order_items`, `stock_take_items`, `product_tag_assignments`, `chat_message_*` — verified correct).

These are not:

| Table | Rows | Problem |
|---|---|---|
| `role_permissions` | 22 | Platform-global, and `app/actions/permissions.ts:40` lets **any tenant admin** insert/delete rows. The file documents this itself as "ORD-A13, still open". One merchant's admin changes every merchant's permission matrix. |
| `user_permissions` | 0 | Global, with an always-true `SELECT` policy named "read_own" (SEC-17). |
| `security_logs` | 11 | RLS on, **zero policies** — the forensic log is unreadable by anyone but service role. |
| `chat_push_config` | 1 | RLS on, zero policies. |
| `api_rate_limits` | 0 | RLS on, zero policies — the rate-limit table is inert (SEC-13). |
| `system_health_checks` | 1 | Policy is `auth.uid() IS NOT NULL` — any signed-in user of any tenant reads platform health. |
| `seed_customers` | 200 | Demo data in the production database (DATA-05). |
| `notification_feed_state` / `notification_user_state` | 23 / 8 | Keyed per user, not per (user, tenant). A user belonging to two tenants shares one read state. Minor, but wrong at launch. |
| `waseet_city_mappings` | 18 | **Has** a `tenant_id` column, but `app/api/waseet/city-mappings/route.ts:88` upserts `onConflict: "governorate_code"` with the service role and no tenant predicate — any employee of any tenant rewrites the platform's delivery routing. |

### 2.3 The nightly backup is one cross-tenant artefact

`/api/cron/backup` dumps `orders`, `customers` and `products` for the **entire platform** into
`vault_backups/auto_csv_${timestamp}/`. The storage policy in force is
`"Allow authenticated full access to vault_backups"` — `ALL`, to `authenticated`, keyed on `bucket_id` only
(**76 objects, 509 MB** live as of 2026-10-02, growing ~23 MB/day; 31 objects / 222.9 MB when first measured). Any signed-up user can download, overwrite or delete every merchant's order and
customer book. That is SEC-01, confirmed and grown since the ledger was written.

The path convention matters for the fix: because the object prefix is `auto_csv_${timestamp}` rather than a tenant UUID,
the tenant-prefix policy that the repo already contains **cannot be applied without changing the backup writer first**
(see §5).

### 2.4 Cache keys — verified clean, with one exception

Storefront catalog caching is correctly tenant-keyed: `listProducts`, `getProductBySlug`, `listCategories`,
`getCategoryBySlug` and `listProductsInCategory` all include `tenantId`; tenant lookups key on slug. This is the most
likely place for a cross-tenant cache leak and it is closed. **Spot-check passed.**

The exception is the shared invalidation tag `["storefront-catalog"]` (PERF-09) — one merchant publishing will
invalidate all tenants' catalogs once the publish webhook lands. `getTenantBySlug` already demonstrates the correct
per-slug tag in the same file.

---

## 3. Noisy neighbour — what one tenant can do to another

| Vector | Mechanism | Reachable by |
|---|---|---|
| `refresh_customer_aggregates()` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` over **all tenants**, measured **1,194 ms** today, ~180 s projected at launch. `SECURITY DEFINER`, no caller check. | any `authenticated` user, unlimited |
| `recompute_inventory()` | `p_tenant_id` defaults to **NULL**, and the NULL branch runs `UPDATE public.products SET reserved_quantity = 0` **with no WHERE clause**, then recomputes from every confirmed order platform-wide. `SECURITY DEFINER`, no caller check. | any `authenticated` user |
| `zero_oversold(p_tenant_id)` | Caller supplies the tenant. No caller check. | any `authenticated` user |
| `increment_usage_tracking` / `increment_order_usage` | Caller supplies the tenant. No caller check. **These are the billing meters** — inflating a competitor's usage trips their plan limits and drives overage billing. | any `authenticated` user |
| `delivery-import/match` | Unbounded `select("*")` over **every return order in the database** on every request | any `authenticated` user |
| 51 tenant tables with no leading `tenant_id` index | Every RLS-filtered query sequentially scans all tenants' rows | inherent |
| `/api/ai/product-copy`, `/api/orders/analyze-image`, `/api/customers/[phone]/ai-summary` | Per-call LLM spend, no rate limit, no metering | any `authenticated` user |
| No HTTP rate limiting anywhere | `api_rate_limits` exists with zero policies and zero rows | anyone |

**Correction to my own working hypothesis.** I initially read `recompute_inventory` as capable of destroying stock
levels by recomputing `stock_quantity` from a ledger that has no inbound entries. **That is wrong** — reading the body
shows it only touches `reserved_quantity`. The real finding is narrower and still serious: the no-argument call is a
platform-wide unqualified `UPDATE` on `products`, reachable by any signed-up user. I am recording the error because the
stronger claim would have been alarming and false.

---

## 4. Provisioning and lifecycle

| Question | State |
|---|---|
| Is new-tenant setup complete and idempotent? | Signup (`/api/auth/signup`) creates the auth user and tenant with `email_confirm: true` — **the address is never verified** — unrate-limited, no captcha. Store seeding goes through `seed_store_config_v2_draft`, which **is** correctly authorized and idempotent. |
| Courier credentials per tenant? | **No.** Shared process-level Al-Waseet account (§1.3). |
| WhatsApp credentials per tenant? | Partially — `webhooks/interakt/[tenantId]` reads `tenant_integrations.credentials`, but the global sender path uses `env.INTERAKT_API_KEY`. |
| Suspend / trial expiry | `cron/trial-suspend` and `cron/subscription-renew` exist and loop tenants serially. Both authenticate by comparing against `` `Bearer ${process.env.CRON_SECRET}` `` — **with the variable unset, the literal string `Bearer undefined` authenticates**. |
| Cancellation | `status` enum supports `cancelled`; 1 seed tenant is in it. No data-retention or export step. |
| Deletion | **No tenant deletion path exists.** No cascade, no purge job, no anonymisation. |
| Data export / offboarding | **None.** The only bulk export is the platform-wide nightly CSV backup (§2.3). |
| Slug change | `tenant_slug_history` exists and is correctly keyed — old slugs resolve. Good. |
| Domain change | `tenant_domains` verifies DNS; **no code calls the Vercel Domains API**, so no certificate is ever provisioned (OPS-08, confirmed — zero matches for `api.vercel.com`). |
| Plan limits | `plan_limits` is global reference data (correct). But 10 seed tenants are `status='active'` with fabricated ~224M IQD balances and count toward every platform aggregate. |

**The two gaps that matter most for a launch:** there is no tenant offboarding path of any kind (no export, no deletion),
and there is no per-tenant courier account. Both are product-level absences, not defects to patch.

---

## 5. The `tenant_id` audit across all tables

| | Count |
|---|---|
| Base tables in `public` | **159** |
| Carrying `tenant_id` | **124** |
| …of which `tenant_id` is **nullable** | **56** |
| …of which have **no leading `tenant_id` index** | **51** |
| Without `tenant_id` (see §2.2 for the classification) | 42 |
| Tables with RLS **disabled** | **0** |
| Tables with RLS enabled but **zero policies** | 4 |

**Orphaned rows — DATA-01 re-measured and 3× worse than recorded.** The ledger says 550 rows across 4 tables. Live:

| Table | Orphaned | Total | Share |
|---|---|---|---|
| `delivery_import_items` | **859** | 2,306 | **37%** |
| `whatsapp_logs` | 315 | 9,095 | 3% |
| `checkout_queue` | 246 | 2,114 | 12% |
| `order_status_history` | 225 | 77,497 | 0.3% |
| `waseet_api_logs` | 19 | 47 | **40%** |
| `delivery_imports` | 8 | 17 | **47%** |
| `customer_filter_presets` | 4 | 8 | 50% |
| `role_salary_defaults` | 3 | 6 | 50% |
| `inventory_ledger` | 2 | 2,619 | 0.1% |
| `settings` | 1 | 1 | 100% |
| **Total** | **1,682** | | |

The prior audit named four of these and missed the largest: **`delivery_import_items` at 859 rows is line-level COD
reconciliation data that no merchant can see**, because every `tenant_id IN (…)` predicate rejects a NULL. This
strengthens SEC-22's claim to be the root cause — the same writer that omits `tenant_id` on `delivery_imports` omits it
on the line items.

One orphan is self-inflicted by design: `recompute_inventory` inserts its `recompute:reserved` marker row with
`tenant_id = p_tenant_id`, which is NULL on the no-argument call.

**Verified clean, adversarially:** every one of the 159 tables has `relrowsecurity = true`. I checked this specifically
because `anon` holds blanket table-level `INSERT/UPDATE/DELETE/TRUNCATE` grants on public tables — I suspected a
systemic anon-write hole and there is none, because RLS dead-ends all of them. The residual risk is a **gate**, not a
vulnerability: any future table shipped without RLS is immediately anon-writable. That belongs in CI.

---

## 6. Ranked — the fan-out findings that block a 150-merchant launch

1. **Shared Al-Waseet courier account** (§1.3) — no per-tenant carrier credentials exist. Architectural.
2. **`vault_backups` open to every authenticated user** (§2.3) — **509 MB** of cross-tenant PII, readable and deletable.
3. **`whatsapp_auto_send` read is tenant-blind** (§1.2 / **NEW-49**) — all outbound WhatsApp stops platform-wide at tenant #2, silently. Same root cause also means **every Al-Waseet call performs a fresh login** on the one shared account, because the token cache has never persisted a row.
4. **Three customer-intelligence RPCs read across all tenants** (§2.1) — one of them already returns the wrong tenant's data for 161 phones.
5. **`recompute_inventory()` / `zero_oversold` / the two billing meters have no caller check** (§3) — platform-wide writes by any signed-up user.
6. **Order numbers globally unique** (DATA-10) — one merchant's data fails another merchant's order creation.
7. **Five customer tables keyed on `phone` alone** (§1.1) — latent, certain at launch.
8. **`role_permissions` is global and tenant admins can write it** (§2.2) — self-documented, still open.
9. **51 tenant tables with no leading `tenant_id` index** (§5) — every query scans all tenants' rows.
10. **1,682 orphaned rows, incl. 37% of COD line items** (§5) — silent data loss, already happening.
11. **No tenant offboarding, deletion or export path** (§4).
12. **`waseet_city_mappings` global upsert** (§2.2) — any employee rewrites platform delivery routing.

---

## 7. What this report does not cover

- **No second real tenant was created**, so none of the latent collisions were *demonstrated*, only derived from the
  schema. Phase 1 forbids the writes that would demonstrate them. An RLS/isolation test suite with two fixture tenants
  is the correct way to settle every item in §1.1 and it does not exist (PROC-04).
- **Supabase connection-pool and realtime subscriber limits** were not read; they bound §3's noisy-neighbour vectors.
- **`apps/admin` is cross-tenant by design** and its authorization gates are audited in the trust-boundary matrix, not
  here.
- Chat mention fan-out at scale was not measured.
