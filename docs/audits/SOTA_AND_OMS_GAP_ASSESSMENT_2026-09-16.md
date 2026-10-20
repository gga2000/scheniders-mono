# Scheniders — SOTA & OMS Gap Assessment

**Date:** 2026-09-16 · **Branch at time of run:** `feat/notifications-overhaul`
**Scope:** whole monorepo (platform, storefront, admin, packages) + live NEW Supabase project `sduvpgqwhxragxtxztur`
**Question asked:** what stands between this and a world-class, operationally-real OMS/e-commerce SaaS for Iraq.

---

## Verdict

The **feature surface is already ahead of most regional competitors**. What is missing is not features — it is the
*platform layer underneath them*: enforced invariants, durable integration plumbing, observability, a real test/release
pipeline, and the commercial machinery (billing collection, public API, support) that turns a working app into a SaaS
other people can buy and depend on.

Rough shape of the gap:

| Layer | State |
|---|---|
| Domain features (orders, inventory, customers, store builder, payroll, chat) | **Strong** — genuinely deep |
| Data model | **Strong but sprawling** — 154 tables, real ledgers, real audit tables |
| Security posture | **Much better than the 2026-05 audit, still leaky at the edges** |
| Integration durability (carriers, WhatsApp, webhooks) | **Weak** — direct calls, no outbox, one carrier |
| Observability / ops | **Weak** — Sentry on 1 of 3 apps, 1 health endpoint, 463 `console.log` |
| Test & release engineering | **Weak** — 2 e2e specs, tests not in CI, migration drift |
| SaaS commercial layer (billing collection, API, support, docs) | **Largely absent** |

---

## 1. What is already strong (do not rebuild this)

Worth naming, because the gap list below is long and it would misread the codebase to think it is thin.

- **Order domain depth.** Atomic RPCs (`create_order_atomic`, `split_order_atomic`, `merge_orders_atomic`, plus
  `unsplit_`/`unmerge_`/`undo_return` inverses), an inventory ledger with phase-based reservation, duplicate detection,
  order-number generation, deletion log, status history, merge/split logs. Most "OMS" products in this market are a
  spreadsheet with a status column.
- **Customer intelligence.** `customer_trust` + audit log + risk + points ledger + blacklist + whitelist + normalized
  phone keying. This is the single most Iraq-correct thing in the product (COD no-answer risk is *the* market problem).
- **Inventory realism.** `inventory_ledger`, `inventory_history`, `stock_takes`, `storage_locations`, `product_batches`,
  `purchase_orders`, `bom_items`, tiered pricing, variants with an attribute-def system.
- **Store builder V2.** 47 sections, shared Zod schema across builder and renderer (zero drift), versions, scheduled
  changes, experiments, i18n screen, health checklist. This is a real product on its own.
- **Server-side price verification at checkout.** `apps/storefront/app/actions/checkout.ts:155` re-fetches canonical
  prices and returns a structured `price_changed` issue rather than trusting the client. The 2026-05 B-11 finding is
  **closed**, and it is closed well.
- **Idempotency where it matters most.** Checkout, order creation, chat message send.
- **i18n discipline.** `i18n-completeness.test.ts`, `i18n-parity.test.ts`, `i18n-nav-keys.test.ts` — machine-enforced
  translation coverage is rare and correct.

---

## 2. Tier 0 — close before onboarding more merchants

These are correctness/security issues confirmed live today, not speculation.

### 2.1 Database security advisors (live, 2026-09-16)

| Level | Finding | Count |
|---|---|---|
| **ERROR** | `public.customer_aggregates` view is `SECURITY DEFINER` | 1 |
| WARN | `SECURITY DEFINER` functions executable by `authenticated` | **69** |
| WARN | `SECURITY DEFINER` function executable by `anon` — `lookup_order(tenant_id, phone, order_number)` | 1 |
| WARN | Functions with mutable `search_path` | 26 |
| INFO | RLS enabled but **no policy at all**: `account_link_tokens`, `api_rate_limits`, `chat_push_config`, `security_logs` | 4 |
| WARN | Leaked-password protection (HaveIBeenPwned) disabled | 1 |
| WARN | `pg_net` installed in `public` | 1 |

Actions:

1. **`customer_aggregates` view → `security_invoker = true`.** This is the same class of bug as the
   `mv_customer_aggregates` P0 from the 2026-05 audit. A definer view over customer data is a cross-tenant PII leak
   unless every caller path is already tenant-filtered — and a view cannot be relied on to filter itself.
2. **Audit all 69 `authenticated`-executable definer functions for an internal tenant-membership check.** Several were
   fixed individually (`create_order_atomic`, `charge_wallet_atomic`, `adjust_customer_points`, `zero_oversold`), but the
   *grant surface* was never narrowed, so every new definer function ships exposed by default. The names that must be
   re-verified first, because they mutate money or stock with a caller-supplied `_tenant_id`:
   `charge_wallet_atomic`, `inv_apply`, `recompute_inventory`, `zero_oversold`, `increment_usage_tracking`,
   `increment_order_usage`, `adjust_customer_points`, `process_return`, `undo_return`, `merge_orders_atomic`,
   `unmerge_orders_atomic`, `unsplit_order_atomic`, `publish_store_config_v2`, `seed_store_config_v2_draft`,
   `log_shipping_export`.
   Make the rule structural, not per-function: **default-revoke `EXECUTE` from `PUBLIC`/`authenticated` on every new
   definer function**, and grant back only where a code path needs it. (Note the `REVOKE ... FROM anon` trap already
   recorded in memory — a `PUBLIC` grant shows as a leading `=X` in `proacl` and only `REVOKE FROM PUBLIC` clears it.)
3. **`lookup_order` anon-callable + no rate limit = customer-order enumeration.** The public order-tracking use case is
   legitimate, but as written an attacker can brute-force `(phone, order_number)` pairs against a tenant. Gate it behind
   a server route with a rate limit and a per-phone attempt counter, or require both factors to match with a short lockout.
4. **`security_logs` with RLS on and zero policies** means nothing can read it, including your own forensic tooling — and
   `api_rate_limits` in the same state means the rate-limit table is inert. Either write policies or admit the table is dead.
5. Enable HIBP leaked-password protection (one toggle, Auth settings). Set `search_path = ''` on the 26 functions.

### 2.2 Input validation is far below the project's own standard

`CLAUDE.md` says "type external boundaries (API input, webhooks, env) with Zod and infer the types."

Measured: **5 of 57 platform API routes import Zod.** The other 52 `await request.json()` and destructure. Several of
those are unauthenticated-by-design webhook targets (`/api/webhooks/interakt/*`, `/api/webhooks/lightfunnels`) and
service-role writers (`/api/waseet/submit-orders`, `/api/delivery-import/*`).

This is the highest-value/lowest-risk hardening available: one Zod schema per route, inferred types, reject on parse
failure. It also closes a whole class of "undefined reached the DB and the trigger threw" production errors.

### 2.3 No HTTP rate limiting anywhere

`apps/platform/middleware.ts` is **session refresh only** (53 lines) and explicitly excludes `/api`. Route protection is
still "in the client auth guard." The only rate-limit code in the repo is *outbound* backoff inside `waseet-api.ts` and
`interakt.ts`.

Consequence: every platform API route, the auth flow, the AI routes (`/api/ai/product-copy`, `/api/orders/analyze-image`,
`/api/customers/[phone]/ai-summary` — all of which cost money per call) and `lookup_order` are open to enumeration and
cost-blowup. The `api_rate_limits` table exists and is unused.

Fix: Upstash Redis (already a dependency via QStash) rate limiter in middleware, keyed by IP + tenant + route class.
Tight limits on auth, AI, and public lookup; loose on authenticated CRUD.

### 2.4 Migration drift

234 files in `packages/supabase/migrations/`, of which **17 are untimestamped legacy files** (`activity-tracking.sql`,
`add-deletion-log.sql`, `fix-order-status-constraint.sql`, …). The 2026-05 audit already found the applied set diverging
from the file set. Until `supabase db diff` against the live project comes back clean, **you do not know what schema your
code is running against** — and that is the root cause behind several incidents already in the record (the
`log_order_notification` trigger that existed only on OLD, the missing inventory temp-table fix).

Fix: reconcile once, delete or timestamp the legacy files, then add a CI job that runs `supabase db diff --linked` and
fails the build on drift.

---

## 3. Tier 1 — OMS fundamentals that are actually missing

This is the part of the question about "what does a world-class OMS need software-wise to be operationally up and
running." Ranked by how much operational pain each one is causing or will cause.

### 3.1 No durable integration outbox (highest structural risk)

Every outbound integration — Waseet submit, Waseet status sync, Interakt/WhatsApp send, LightFunnels — is a **direct
in-request HTTP call**. QStash is used, but only for the delayed-checkout flow.

What this costs you, and has already cost you (from the incident record): a dropped env var silently killed WhatsApp
sends for weeks; a self-fetch hit a protected `VERCEL_URL` and 401'd; Interakt 400s on whitespace in template variables.
Every one of those is the same shape — **a side effect with no durable record, no retry, and no dead-letter queue**.

Build: a `integration_outbox` table (tenant_id, kind, payload, idempotency_key, attempts, next_attempt_at, status,
last_error), written in the same transaction as the domain change; a QStash-driven worker that drains it with
exponential backoff; a DLQ view in the admin app. Then *every* integration failure is visible, replayable, and alertable
instead of being a silent nothing.

This one change retires an entire category of your production incidents.

### 3.2 Single carrier, hardcoded

`waseet` appears 584 times in the codebase. `karrar` twice. There is no carrier interface — Waseet's API shape leaks into
route handlers, city mappings, invoice reconciliation, and label generation.

Iraqi merchants routinely run 2–4 couriers simultaneously (Waseet, Karrar, Al-Khazna, Zajil, in-house drivers) and switch
on price and governorate coverage. Single-carrier lock is a hard ceiling on who can buy this product.

Build: a `ShippingCarrier` interface (`submit`, `getStatus`, `cancel`, `printLabel`, `listCities`, `mapCity`), Waseet as
the first adapter, a per-tenant per-governorate rate card, and a routing rule ("Basra → Karrar, Baghdad → Waseet, Erbil →
in-house"). `tenant_integrations` already has the right shape to hold per-carrier credentials.

### 3.3 No COD settlement / remittance ledger

This is the single biggest Iraq-specific OMS omission. In a ~100% COD market, the merchant's real question every week is
**"the courier has my money — how much, for which orders, and did they pay me the right amount?"**

Today: `delivery_imports` + `shipping_export_log` + `waseet_invoices` cover *delivery* reconciliation, and the finances
hub has a payouts tab — but there is no ledger that tracks, per order: cash collected by courier → courier invoice →
remittance received → variance. Nor a per-courier aging report of money owed to the merchant.

Build: `cod_remittances` (carrier, period, expected_total, received_total, received_at, variance) + `cod_remittance_items`
linking to orders, fed from the existing Waseet invoice import, with a variance queue. Merchants will pay for this alone.

### 3.4 No explicit order state machine

Order status is a `text` column with a `CHECK` constraint that has been dropped and re-added at least three times
(`fix-order-status-constraint.sql`, `add-refund-statuses.sql`, `fix-refund-statuses.sql`, `add-suspended-status.sql`).
Allowed transitions live in app code and in triggers.

Consequences already visible: the inventory phase logic (`inv_phase`) has to re-derive intent from status strings; a
statement-level trigger doing two UPDATEs broke every status change; postpone semantics had to be untangled from
`created_at`.

Build: an `order_status_transitions(from, to, requires_role, side_effects)` table, a single `transition_order_status()`
RPC that is the only writer of `orders.status`, and a DB constraint that rejects any direct status UPDATE. Every side
effect (inventory, notification, chat event, outbox row) hangs off that one function.

### 3.5 Inventory: reservation exists, allocation does not

Reservation is phase-based at `confirmed` — correct. What is missing for multi-location operation:
- **ATP (available-to-promise)** = on_hand − reserved − damaged + inbound_PO, surfaced to the storefront so it stops
  selling what it cannot ship.
- **Allocation across locations** — `storage_locations` and `stock_transfer` exist, but nothing chooses *which* location
  fulfils an order, so multi-warehouse merchants cannot be onboarded.
- **Backorder / pre-order** as a first-class state rather than overselling then `zero_oversold()`.

### 3.6 SLA detection exists; the exception console does not

Correction to an earlier draft of this section: an SLA check **does** run — `check_order_sla(2, 6, 24)` on a `*/30`
pg_cron schedule, feeding the notification pipeline. Credit where due.

What is missing is the **console**: a worklist of orders currently breaching an SLA (unconfirmed > 2h, with courier >
5 days, no scan event > 48h, >1 failed delivery attempt, payment mismatch), with owner, age, and bulk actions. Right now
a breach produces a notification and then relies on a person to go find the order. Notifications are a firehose; a queue
is a workflow.

The data is already there (`order_status_history`, `waseet_api_logs`, `notification_deliveries`), so this is a UI and a
query, not a system.

### 3.7 No background job runner with progress/resume

Bulk operations run as in-request loops. The record already shows ~110ms/row on `orders` (5 row triggers), MCP timeouts
that kept committing, and a bulk update that had to be batched by hand.

Build: a `jobs` table + QStash worker + a progress UI. Any bulk status change, import, export, or recompute becomes a
resumable job with a cancel button, rather than a request that might or might not have finished.

### 3.8 Returns are RPC-deep but UI-shallow

`process_return`, `undo_return`, refund statuses, and a `/returns/scan` page exist. Missing: an RMA record (reason,
condition, disposition: restock / quarantine / write-off), the link to `qc_quarantine`, and a returns analytics view —
RTO rate by governorate, by product, by courier, by ad channel. **RTO rate is the #1 P&L lever for an Iraqi COD store**;
you already capture ad channel on orders (recent commits), so the join is one report away.

---

## 4. Tier 2 — SaaS platform fundamentals that are absent

These are the things that make it a product other companies buy, rather than an internal tool with tenants.

### 4.1 You cannot actually collect money

- **No payment gateway integration exists.** `zaincash` / `fastpay` / `qi card` appear only as UI labels, marketing copy
  on the landing page, and payroll method enums. `apps/platform/app/actions/wallet.ts` says in a comment: *"In production
  this would be called after payment verification (ZainCash/Qi Card webhook)"* — that webhook does not exist.
- Billing infrastructure around it is real: `subscriptions`, `plan_limits`, `usage_tracking`, `wallet`,
  `wallet_transactions`, `cron/subscription-renew`, `cron/trial-suspend`, plan-change with downgrade warnings. It is
  wired to a manual top-up.

For an Iraq SaaS the realistic path is **ZainCash and/or FIB (First Iraqi Bank) + Qi Card**, with manual bank transfer as
fallback. Until one of them is integrated with a verified webhook, every merchant is invoiced by hand, and revenue is a
spreadsheet.

Also missing on top of the billing tables: proration, invoices/receipts (merchants will ask for a printable
فاتورة), dunning beyond suspend, and a self-serve upgrade path.

### 4.2 No transactional email or SMS at all

Zero matches for Resend/SendGrid/Postmark/Mailgun/nodemailer, and zero for Twilio or any SMS provider. `/api/auth/signup`
sets `email_confirm: true` — **email addresses are never verified.**

That means: no password reset you control, no invoice emails, no receipts, no trial-expiry warnings, no team-invite
emails that reliably land, no security alerts. Supabase's built-in SMTP is rate-limited and not something to run a
business on.

Given the market, **phone/OTP is arguably the better primary identity than email** — Iraqi merchants live on WhatsApp and
rarely on email. A defensible answer: OTP via WhatsApp (you already have the channel) + optional email for receipts.

### 4.3 No public API, no outbound webhooks, no API keys

No `/api/v1`, no API key table, no scopes. Every serious commerce SaaS is eventually integrated with by its customers'
accountants, marketplaces, and ad tools. This also blocks partner/agency resale, which is how B2B SaaS scales in this region.

### 4.4 Observability is one-legged

- Sentry configured for `apps/platform` only — **storefront and admin are blind**, and the storefront is the revenue path.
- One health endpoint in the whole repo (`apps/admin/app/api/health`). No platform or storefront health check, so no
  meaningful uptime monitoring.
- **463 `console.log` calls** in platform app code and no structured logger. Production debugging currently means reading
  Vercel's raw log stream — which is exactly how the WhatsApp relay and the never-once-run backup were eventually found.
- No SLOs, no alerting, no on-call path, no status page for merchants.

Build: Sentry on all three apps; a `pino`-style structured logger with tenant_id/request_id/route on every line; health
endpoints that actually check DB + Supabase auth + QStash; an uptime monitor; alert rules on outbox DLQ depth, cron
failure, and 5xx rate.

### 4.5 Tests exist but do not gate anything

- 152 unit test files (heavily concentrated in store-builder) and **2 Playwright specs** (`example.spec.ts`,
  `orders.spec.ts`).
- **CI runs `turbo lint type-check build` only** — tests are not in CI, by design and by documented convention.
- No RLS/tenant-isolation test suite, despite tenant isolation being the product's core security invariant.
- No load test, despite a known 9.7MB order-book fetch in the history.

Minimum bar: put `vitest run` in CI today (it costs nothing); add an **RLS test suite** that, for every tenant-scoped
table, asserts tenant A cannot read/write tenant B as `anon` and as `authenticated`; grow Playwright to cover the five
paths that must never break — login, create order, confirm order (inventory moves), submit to courier, storefront checkout.

### 4.6 No staging environment or preview DB

Migrations are drafted and applied straight to the live NEW project (this is deliberate and documented). Supabase branches
exist and are unused (`list_branches` available, none in the workflow). For a multi-tenant system holding other
businesses' money and customer PII, a staging project + preview branches per PR is the standard bar.

### 4.7 Support, docs, and lifecycle

No in-app help, no changelog, no ticketing, no onboarding checklist beyond the store wizard, no status page. Merchant
support currently happens in your personal WhatsApp — which does not survive merchant #50.

---

## 5. Tier 3 — what makes it specifically world-class *for Iraq*

Features above are table stakes. These are the ones that would make the product hard to displace locally.

1. **Cross-tenant COD risk network.** You already compute `customer_trust` per tenant. The defensible version is an
   opt-in, privacy-safe network signal: "this phone has refused delivery 7 times across the network in 90 days." Hash the
   phone, share only aggregate counts, make it opt-in both ways. No incumbent can copy this without your merchant base.
   *(Handle carefully: needs an explicit merchant agreement and a clear policy — it is customer data, and getting this
   wrong legally/reputationally is worse than not shipping it.)*
2. **Address quality for a country without street addresses.** Iraqi delivery runs on landmarks and phone calls. Build a
   landmark-based address model (governorate → district → nearest landmark → free text), a pinned-map fallback, and an
   address-quality score that predicts failed delivery *before* dispatch. Feed it from your historical failure data —
   you have the orders to train on.
3. **WhatsApp as the primary rail, properly.** Interakt is a reseller in the middle of your core channel. Going direct on
   the WhatsApp Cloud API (or a BSP you control) gets you template management, session-window awareness, an opt-in ledger,
   read receipts, and per-merchant numbers. The incident history (wrong-item messages, silent send failures, 400s on
   whitespace) is the cost of not owning this layer.
4. **Iraq ops calendar.** Fri–Sat weekend, Ramadan hours, Eid/Arbaeen surges and courier shutdowns, governorate-level
   disruptions. SLA timers, payroll, and forecasting should all respect it. Currently nothing does.
5. **Arabic that reads native.** The LTR-only constraint is deliberate and fine. What still matters: Arabic numerals
   choice, Iraqi dialect in customer-facing copy (not MSA), Arabic-first fonts, and Arabic search that handles
   alef/hamza/taa-marbuta normalization — your product/customer search almost certainly does not today.
6. **Offline-tolerant ops.** Iraqi connectivity is uneven. A PWA shell exists (`sw.ts`, `/offline`). Real value would be
   an offline-capable picking/packing and delivery-scan mode that queues actions and syncs — warehouse staff on bad wifi
   is a daily reality.
7. **Merchant benchmarking.** `tenant_public_stats` and `community_ratings` exist. "Your RTO rate is 23% vs 14% for
   similar stores in Baghdad" is a retention feature nobody local offers.

---

## 6. Engineering health (secondary, but it compounds)

Measured today:

| Metric | Count | Note |
|---|---|---|
| `: any` / `as any` | 254 | `CLAUDE.md` bans it unless justified |
| `@ts-ignore` / `@ts-expect-error` | 81 | same |
| `eslint-disable` | 130 | same |
| `console.log` (platform) | 463 | no structured logging |
| TODO/FIXME | 17 | low — good |
| `apps/platform/app/orders/page.tsx` | 3,233 lines | single file |
| `components/orders/order-card.tsx` | 2,527 lines | single file |
| `hooks/use-order-crud.ts` | 1,627 lines | single file |

Performance advisors on the live DB: **108 unindexed foreign keys**, 43 RLS policies re-evaluating `auth.*()` per row,
57 multiple-permissive-policy combinations, 77 unused indexes. The unindexed FKs and the per-row `auth.uid()` are the two
that will bite non-linearly as `orders` grows — both are mechanical fixes (add covering indexes; wrap as
`(select auth.uid())`).

The orders page decomposition matters less than the rest of this list, but it is the file every future orders change has
to walk through.

---

## 7. Suggested sequence

**Now — Tier 0, ~1–2 weeks.** Nothing new ships until these do.
1. `customer_aggregates` → `security_invoker`; default-revoke policy for definer functions; audit the 15 money/stock RPCs.
2. Zod on all 57 platform routes (mechanical, parallelizable).
3. Rate limiting in middleware (Upstash), tightest on auth / AI / `lookup_order`.
4. Migration drift reconciliation + `db diff` CI gate.
5. `vitest run` into CI. HIBP toggle. `search_path` on 26 functions. Covering indexes on 108 FKs.

**Next — operational spine, ~4–6 weeks.**
6. Integration outbox + worker + DLQ; migrate Waseet and WhatsApp onto it.
7. Order state machine as the single status writer.
8. Structured logging + Sentry on all three apps + real health endpoints + alerts.
9. RLS test suite + 5 critical-path Playwright specs.
10. Background job runner for bulk operations.

**Then — commercial viability, ~4–8 weeks.**
11. ZainCash/FIB payment integration + invoices + dunning → you can actually charge.
12. Transactional messaging (WhatsApp OTP primary, email secondary) → verified identity, receipts, resets.
13. COD remittance ledger + variance queue.
14. Carrier adapter interface + a second carrier.
15. Staging project + preview DB branches.

**After — moat.**
16. Exception/SLA console. RTO analytics by governorate/product/courier/ad-channel.
17. Address quality + landmark model. Iraq ops calendar. Arabic search normalization.
18. Public API + webhooks + API keys. Merchant benchmarking. Cross-tenant risk network (with policy work first).

---

## 8. Open questions for you

1. **Who pays, and how, today?** If merchants are invoiced by hand, payment integration moves to Tier 0 — everything else
   is optimizing a business that cannot bill.
2. **Is email or phone the identity?** This decision blocks the messaging work and changes the signup flow.
3. **How many merchants are live right now?** The Tier 0 list is urgent at 10 tenants and an emergency at 100.
4. **Is `lookup_order`'s anon exposure intentional** (public order tracking on the storefront)? If yes it stays, behind a
   rate limit; if no it should be revoked today.
5. **Multi-carrier: which one is second?** The adapter interface should be designed against a real second API, not in the
   abstract.

---

# Addendum — second pass (same day)

A second sweep over areas the first pass did not reach: route-level tenant scoping, storage buckets, build-time env,
cron triggering, custom domains, SEO, and actual data volume. Everything below is verified against live code or the live
project, not inferred.

## A1. Cross-tenant holes in service-role API routes — Tier 0

The platform's auth story is "every `/api/*` route self-gates" (middleware excludes `/api` by design). Most routes do
authenticate. The gap is that **authenticating the user is not the same as scoping to their tenant**, and 11 service-role
routes stop at the first step.

Verified: these routes call `verifyAccessToken` (so a valid login is required) and then query with the service role —
which bypasses RLS — using an **ID or phone taken from the request, with no tenant filter anywhere in the file**:

| Route | What a user of tenant A can do to tenant B |
|---|---|
| `orders/delete` | **Soft-delete any order by ID.** Role check is against `user_profiles.role` (global), not tenant membership; the `UPDATE ... SET deleted_at` filters on `.in('id', ids)` only. |
| `customers/[phone]/ai-summary` | Read any customer by phone and get an LLM summary of their history. Cross-tenant PII, and it bills your AI spend. |
| `delivery-import/rollback` | **Roll back a confirmed delivery import** — restores order statuses, prices, delivery provenance. Zero occurrences of `tenant` in the file. |
| `delivery-import/confirm`, `complete`, `match`, `history` | Same class — drive another tenant's delivery reconciliation. |
| `waseet/submit-orders` | Submit another tenant's orders to the courier. |
| `waseet/statuses`, `package-sizes`, `city-mappings` | Read/write another tenant's carrier config. |

Fix: these should all go through `resolveCallerTenant()` / `requireTenantAdmin()` — the helpers already exist in
`lib/auth/require-caller.ts` and are used correctly by `webhooks/interakt/send` and the billing actions. Then add the
tenant predicate to every service-role query. This is the same remediation shape as PRs #88/#90; the pattern is known,
it just was not applied uniformly.

**Genuinely unauthenticated service-role routes** (narrower than it first looked — `interakt/send` is now guarded by
`resolveCallerTenant`, `interakt/[tenantId]` verifies a webhook secret, the crons check `CRON_SECRET`):

- `settings/auto-send` — GET + PUT, no auth. Reads and writes tenant automation settings.
- `domains/verify` — POST, no auth, takes `domain_id` from the body. Anyone can flip any tenant's custom domain to verified.
- `cron/process-checkouts-manual` — GET, no auth. Manual trigger of the checkout processor.
- `auth/signup` — public by design, but unrate-limited and auto-confirms email (see A5).

## A2. Turbo is still stripping 8 env vars from production builds — including the Sentry DSN

`turbo.json` `build.env` declares 7 variables. The code references **13 distinct `NEXT_PUBLIC_*` vars**. Anything not
declared is stripped from the build environment, so Next.js inlines `undefined` — it works locally (`.env.local` bypasses
turbo) and is dead on Vercel, silently.

Undeclared today:

```
NEXT_PUBLIC_SENTRY_DSN          ← used by BOTH sentry.client.config.ts and sentry.server.config.ts
NEXT_PUBLIC_VAPID_PUBLIC_KEY    ← web push (already known to have been killed by this)
NEXT_PUBLIC_PLATFORM_ORIGIN
NEXT_PUBLIC_STOREFRONT_ORIGIN
NEXT_PUBLIC_STOREFRONT_URL
NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN
NEXT_PUBLIC_SUPPORT_WHATSAPP
NEXT_PUBLIC_CATEGORIES_V2
```

The consequence that matters: **`NEXT_PUBLIC_SENTRY_DSN` is stripped, and `withSentryConfig` has no other DSN source.**
Next inlines `NEXT_PUBLIC_*` at build time in server code too, so this plausibly means **Sentry has been reporting
nothing from the platform in production** — which reframes §4.4 from "observability is one-legged" to "observability may
be zero-legged." This is diagnosable in one minute: check whether the Sentry project has received any platform event
recently. If it hasn't, that also explains how the open WhatsApp relay and the never-once-run backup went unnoticed.

Fix is one line per variable in `turbo.json`, plus a test that asserts every `NEXT_PUBLIC_*` referenced in source appears
in `build.env` — otherwise this regresses the next time someone adds a variable. It has already regressed once after
being diagnosed.

## A3. A business rule runs in the customer's browser

`/api/cron/auto-no-response` ("contacted > 2 days → `no_response`") is **triggered by nothing**. It is absent from
`vercel.json` crons and absent from `cron.job` in the live database.

What actually performs the transition is `resolveStaleContacted()` in `hooks/use-auto-no-response.ts`, called from
`use-orders-query.ts` — i.e. **in the browser of whoever happens to open the orders page**. The status of an order
therefore depends on whether a human looked at a screen, and which human, and when. Two users with different filters can
produce different results.

This is the same failure shape as the Activity Feed that was dead for 102 days: a feature that appears to exist, with no
server-side guarantee that it runs. Either schedule the route (Vercel cron or pg_cron) and delete the client hook, or
move the rule into the database entirely. Do not leave both.

For contrast, the healthy pattern is already in the repo: 11 active `pg_cron` jobs (`check_order_sla`,
`refresh_customer_aggregates`, `send_notification_digests`, `chat_auto_resolve_threads`, `prune_*`) and QStash for
`auto-follow-up`. Those are fine. `auto-no-response` is the outlier.

## A4. Storage buckets — two of eight still open

Six of the eight buckets now have size limits and MIME allowlists (a real improvement over the 2026-05 audit). Two do not:

| Bucket | Public | Size limit | MIME allowlist | Issue |
|---|---|---|---|---|
| `qc-evidence` | **true** | **none** | **none** | Public read of QC photos + unbounded upload of any file type. Storage-cost DoS and cross-tenant evidence exposure. Findings F-07 from 2026-05, still open. |
| `tenant-assets` | true | 512 KB | includes **`image/svg+xml`** | Stored-XSS vector: an SVG served inline from your domain executes script. F-24, still open. |

Fix: `qc-evidence` → private, 10 MB cap, image MIME allowlist, signed URLs. `tenant-assets` → drop SVG, or serve it with
`Content-Disposition: attachment` and a restrictive CSP.

## A5. Identity gaps around signup

- `/api/auth/signup` sets `email_confirm: true` — **no address is ever verified**, so there is no trustworthy channel to
  the account owner (compounds §4.2).
- No rate limit on the endpoint, so tenant records can be created in bulk.
- Password rule is `length >= 8` only, and HaveIBeenPwned checking is off at the Auth project level.

## A6. Custom domains verify DNS but nothing provisions them

`tenant_domains` exists and `/api/domains/verify` does a CNAME lookup. But **no code anywhere calls the Vercel Domains
API** (zero matches for `api.vercel.com`). So a merchant can add their domain and see it go green, and the domain will
not actually serve their store over HTTPS — nothing adds it to the Vercel project or issues a certificate.

"Use your own domain" is a headline feature for a store-builder SaaS. Either finish it (Vercel Domains API: add domain →
poll verification → auto-TLS) or remove the UI until it works. A green checkmark that does nothing is worse than no
checkmark.

## A7. Storefront SEO — no sitemap

`robots.ts` exists (with a test), and JSON-LD is implemented for the tenant home and product pages via
`components/json-ld.tsx` + `lib/seo.ts`. Good foundation. Missing: **`sitemap.ts`**. For a multi-tenant storefront this
should be per-tenant and dynamic (products, categories, custom pages, with `lastModified` from the config revision).
Organic discovery is a large part of what a merchant is buying.

## A8. Scale reality check

Live row counts: `order_status_history` 77,485 · `orders` 21,311 · `wallet_transactions` 17,803 · `whatsapp_logs` 9,192 ·
`activity_logs` 7,505 · `mv_customer_aggregates` 6,034 · `customer_trust` 4,882.

This is small. **Performance is not the binding constraint today** — which is good news, and also the reason to fix the
108 unindexed foreign keys and the 43 per-row `auth.uid()` policies *now*, while they are cheap and invisible rather than
later during an incident. The correctness and security items above matter far more than any optimization at this volume.

## A9. Revised priority order

Slot these into the §7 sequence:

**Tier 0 additions (this week):**
- Tenant-scope the 11 service-role routes in A1 — start with `orders/delete`, `delivery-import/rollback`, `ai-summary`.
- Auth the 3 unauthenticated routes in A1.
- Fix `turbo.json` `build.env` + add the guard test (A2). **Then confirm Sentry is actually receiving events.**
- Lock down `qc-evidence` and drop SVG from `tenant-assets` (A4).
- Schedule or relocate `auto-no-response` (A3).

**Tier 1 additions:**
- Exception console on top of the SLA data that already exists (§3.6).
- `sitemap.ts` (A7).
- Finish or remove custom domains (A6).
