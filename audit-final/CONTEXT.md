# CONTEXT — Final Hunt & Fix Program

Phase 0 (reconnaissance) output. Read this first at the start of every step and after any context compaction.

## 0. Program state

| Item | Value |
|---|---|
| Current phase | **Phase 2 in progress** (Ali, 2026-10-20: "fix all of those and while doing that go for another round"). Tier A (A1–A10) and Tier B (two passes) hunted and critic-checked (F-001..F-065). Tier C hunted and critic-checked (F-066..F-086). Phase 2 complete, awaiting Ali to approve Phase 3 (Plan). Fix PRs open as drafts, CI green, awaiting Ali: #167, #168, #172, #173, #175. |
| Phase 1+ verification SHA | **87e5e40** — the commit all three Vercel production projects run (Vercel `list_deployments`, 2026-10-19). Phase 0 inventory was taken at 6bde0f4; main is at 577805c (#150, Iraq locations data only, not yet deployed). Findings from Phase 1 on cite 87e5e40. |
| Audit pinned to | `main` @ `6bde0f4` (2026-10-18, "Merge #137 port-flagship-attributes"). Inventories by subagents were taken at `bf432f7` (two PRs earlier: #136 brand-kit chrome, #137 product attributes); line numbers in `inventory/*.md` may drift slightly for files those PRs touched. |
| Live DB snapshot | First snapshot 2026-10-19 (pre-PR #146); **re-snapshot 2026-10-19 00:41 UTC** after PR #146's two migrations were applied live (L-38). All DB counts in this file are the 00:41 UTC values. |
| `origin/main` vs pin | `origin/main` is at `87e5e40` (2026-10-19 03:42 +0300), 11 commits / 433 files ahead of the pinned `6bde0f4` (incl. PR #145 live migration history, PR #146 tenancy hardening, PR #147). The pinned snapshot is behind `main`; re-pinning is a Phase 1 decision. |
| Working branch | `claude/project-thread-kakb65` (holds only `audit-final/`) |
| Mirror for Ali | `/mnt/project-files/audit-final/` |
| Supabase | `sduvpgqwhxragxtxztur` (NEW). Read-only SQL only. OLD `ibfdugifekivquwprqjc` never touched. |
| Vercel team | `team_hZHuBWKm11JhUVSA7bQa4gp7` — projects `scheniders-platform` (`prj_tPQNhd7n5IiwZvW7vdFsERKcu3Ih`), `scheniders-storefront` (`prj_5Bi3z2FCbUHZ5ljQdt3pdPxmF7v2`), `scheniders-mono-admin` (`prj_HO1lheRXukzlG7H13DlfFc1aHnI6`) |
| Concurrent work to treat as data only | Thread "Iraq locations cleanup" owns the `iraq_*` tables and branch `feat/notifications-overhaul`. |

### Tooling available in this environment

| Tool | Status |
|---|---|
| Supabase MCP (`execute_sql`, `list_migrations`, `get_advisors`, `list_tables`) | working |
| Vercel MCP (deployments, runtime errors, env **names**) | working |
| Sentry | **no connector available** — Sentry top issues could not be pulled (see §6) |
| Playwright MCP | failed to start (macOS `npx` path in `.mcp.json`); Playwright CLI + Chromium at `/opt/pw-browsers` are available for local runs |
| `pnpm`, `turbo`, `vitest`, `next build` | working (build needs `NODE_EXTRA_CA_CERTS` + `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` here to fetch Google Fonts through the proxy) |
| Git history | shallow clone grafted at `3d39155` (2026-09-02); `git log -S` only sees history after that |

## 1. Assumptions (CONFIG blanks Ali left empty)

These were defaults chosen by the coordinator. **Ali confirmed all of them on 2026-10-19 01:15 UTC.**

| CONFIG item | Assumed value | Effect on the audit |
|---|---|---|
| Launch date | **unknown** | No date-driven triage; ranking is by severity × likelihood only. |
| Tenants at launch | **5** | Load model base case (§5). 10x = 50 tenants. |
| Priority app | **both** platform and storefront; admin last | Tier B/C order: storefront checkout & platform order ops first, admin last. |
| Out of scope | **none** | Everything in the inventory is in scope. |

Other assumptions are stated where used and labelled **ASSUMPTION**.

## 2. System map (built from `git ls-files` at the pinned commit and live catalog queries; per-claim verification happens in Phase 2)

```
                         ┌──────────────── Vercel (team aa988695) ────────────────┐
 Shopper (Android, 4G) ─▶│ storefront  /s/[tenant]  (subdomain / custom domain)    │
                         │   proxy.ts host→tenant rewrite; 20 pages; 7 API routes; │
                         │   1 public server action (submitCheckout)               │──┐
 Merchant staff ────────▶│ platform    (32 pages, 53 route handlers, 6 action files│  │
   (PWA, push, chat)     │   middleware = session refresh only; client PageGuard)  │──┤
 Superadmin ────────────▶│ admin       (16 client pages, 57 API routes)            │──┤
                         └─────────────────────────────────────────────────────────┘  │
                                                                                      ▼
   Lightfunnels ──webhook──▶ platform /api/webhooks/lightfunnels ──QStash──▶ /api/cron/process-checkouts
   Interakt (WhatsApp) ─────▶ platform /api/webhooks/interakt/[tenantId]
   Telegram ────────────────▶ platform /api/telegram/webhook
   Vercel Cron (6 daily) ───▶ platform /api/cron/*        QStash one-offs ─▶ auto-follow-up, process-checkouts
                                                                                      │
             ┌──────────────── Supabase sduvpgqwhxragxtxztur (PG 17, eu-central-1) ──┴───────────┐
             │ 166 tables (all RLS on, 0 FORCE), 8 views, 1 matview, 183 functions (126 DEFINER),  │
             │ 345 policies, 47 triggers, 8 buckets, realtime on 4 tables + chat broadcast,        │
             │ 13 pg_cron jobs, 343 migrations  (re-snapshot 2026-10-19 00:41 UTC, L-38)           │
             └─────────────────────────────────────────────────────────────────────────────────────┘
   Outbound: Interakt, Lightfunnels API, Gemini, Anthropic, RapidAPI (admin), QStash, web push (VAPID),
             headless Chromium (PDF),
             Meta Conversions API + TikTok Events API (storefront submitCheckout, server-side, per-tenant tokens),
             Al-Waseet (one shared platform account) — code path present but UNUSED IN PROD (L-36: no WASEET_* env,
             no API log since 2026-09-09, no order with waseet_submitted_at)
   Browser-side (storefront /s/[tenant] layout): Meta Pixel (connect.facebook.net), TikTok Pixel
             (analytics.tiktok.com), Snap Pixel (sc-static.net), Google Tag Manager / gtag (www.googletagmanager.com)
```

Inventories (`file:line`; completeness re-checked by the Phase 0 critic, see `critic/phase0-round1.md`):
- `inventory/platform.md` — pages, guard model, 53 route handlers (52 under `app/api` + `app/link-google/claim`) with auth/tenant/Zod/service-role/rate-limit per route, 15 server actions, middleware, 7 Supabase client factories, auth helpers, 15 realtime channels, 38 storage calls, 61 RPC calls, PWA/push/chat.
- `inventory/storefront-admin.md` — same for storefront and admin, incl. checkout price/idempotency path, tenant resolution, admin role checks, impersonation, caching keys.
- `inventory/integrations.md` — 10 crons (auth, schedule, idempotency, maxDuration), 15 integration sections (13 + Meta/TikTok Conversions API + storefront tracking pixels) (auth/signature, timeouts, retries, swallowed catches), every env var by file, every test file with case counts, dependencies (heavy/client), 53 tracked debris files, Sentry.
- `inventory/database.md` — every table (RLS, tenant_id, nullability, policies, size), every policy (cmd/roles), views, all 183 functions with DEFINER/grant/search_path flags, 47 triggers, buckets, realtime, pg_cron, advisors, and the diff between the first snapshot and the 00:41 UTC re-snapshot.
- `inventory/migration-drift.md` — live vs repo migration versions.
- `inventory/advisors-performance.json` — raw performance advisors.

### Key counts

| | platform | storefront | admin |
|---|---|---|---|
| Pages | 32 | 20 | 16 (all client) |
| Route handlers | 53 (52 under `app/api` + `link-google/claim`) | 7 | 57 |
| Server-action files / actions | 6 / 15 | 1 / 1 | 0 |
| `error.tsx` / `loading.tsx` / `not-found.tsx` / `global-error.tsx` | 5 / 5 / 0 / 1 | 1 / 0 / 2 / 0 (`app/error.tsx` only — nothing under `/s/[tenant]`; not-found at `app/` and `app/s/[tenant]/`) | 1 / 6 / 0 / 0 (`(dashboard)/error.tsx`; loading for dashboard, billing, health, leads, merchants, trials) |
| Sentry wired | config files present; **no `instrumentation.ts`**; DSN env var **not set in Vercel production** | none | none |
| Rate-limited routes | 1 (`orders/analyze-image`) | 0 | 0 |
| Route files that reference a Zod schema (heuristic grep; per-input coverage is an A2 check) | 8 / 53 | 7 / 7 (but the public `submitCheckout` server action has none) | 14 / 57 |

## 3. Baseline gates (run 2026-10-19)

Run on `bf432f7` first, then re-run on the pinned `6bde0f4`; results below are for the pinned commit unless noted.

| Gate | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | pass | |
| `pnpm type-check` | **pass** | Only the 3 apps have a `type-check` script; `packages/{shared,ui,sections,supabase}` are only checked transitively through app imports. |
| `pnpm lint` | **pass, 0 errors / 1,227 warnings** (platform 1,082, admin 105, storefront 40) | Warnings by rule (counted on bf432f7, 1,226 total): no-unused-vars 535, **no-explicit-any 278**, no-img-element 83, exhaustive-deps 56, no-unescaped-entities 40, **react-hooks/rules-of-hooks 25**, no-require-imports 10. Platform and admin `eslint.config.mjs` downgrade 17 rules (incl. `rules-of-hooks`, `no-explicit-any`) from error to warn "so CI is unblocked". |
| `pnpm exec vitest run` | **pass — 250 files, 2,601 tests** (239 / 2,381 on bf432f7; #136/#137 added 11 files) | The prompt's "~240 unit tests" is ~240 *files*. CI never runs them. `scripts/migrate-store-config-v2/mapper.test.ts` is not picked up by any vitest config. |
| `pnpm build` (CI-equivalent env) | **pass** (3/3 apps) after proxy CA fix; first attempt failed only on Google Fonts TLS through this sandbox's proxy (environmental) | Platform build warns that `@serwist/next` does not support Turbopack; the committed `apps/platform/public/sw.js` (last changed 2026-09-12) is **not regenerated** by the build (`git status` clean after build). |
| Playwright | **not run — there is nothing real to run.** `e2e/example.spec.ts` is the Playwright scaffold that visits playwright.dev; `e2e/orders.spec.ts` contains only `expect(true).toBe(true)`. Effective e2e coverage = 0. `playwright.config.ts` webServer runs `pnpm dev`. | |
| `pnpm audit --prod` | **145 advisories: 4 critical, 73 high, 57 moderate, 11 low** | Critical: `next@16.0.10` (GHSA-2xp9-vwfh-vxw4 unauthenticated RCE in Image Optimization API; GHSA-p293-qw3h-jr36 RCE on Windows hosts; patched ≥16.3.3) and `jspdf` (path traversal ≤3.0.4; HTML injection ≤4.2.0). High includes 13 more `next` advisories (incl. middleware/proxy bypass), `xlsx` (prototype pollution, ReDoS, no npm fix), `pdfjs-dist` (JS execution on malicious PDF), `sharp`, `prosemirror-view` XSS, `basic-ftp`, `fast-uri`, `ws`, `tmp`, `extract-zip`. |
| Supabase security advisors (re-run 2026-10-19 00:54 UTC, after L-38) | 1 ERROR finding; 82 WARN findings (19 + 1 + 1 + 60 + 1, listed right); 4 INFO findings | ERROR: `customer_aggregates` SECURITY DEFINER view. WARN: 19 mutable search_path (was 26); `pg_net` in public; `lookup_order` anon-callable definer; 60 authenticated-callable definers (was 64); leaked-password protection off. INFO: RLS on with no policy on `account_link_tokens`, `api_rate_limits`, `chat_push_config`, `security_logs`. |
| Supabase performance advisors | 112 unindexed FKs; 43 `auth_rls_initplan`; 190 unused indexes; 57 multiple-permissive-policy overlaps; 1 duplicate index | |
| Vercel runtime errors, last 7 days | platform: 5 groups; storefront: 0; admin: 0 | Platform: expired-JWT on `/api/settings/auto-send` (10×, 5 users); Interakt 400 invalid phone from `/api/webhooks/lightfunnels` (2×); **`/api/delivery-import/parse` crashes loading `pdf-parse` (`DOMMatrix is not defined`)** then fails to render `/500` (2×, last 2026-10-17); invalid refresh token in middleware (2×). Low counts reflect low traffic (1 active tenant), not health. |
| Sentry top issues | **not available** — no Sentry connector in this session, and `NEXT_PUBLIC_SENTRY_DSN` is not set on any Vercel project. | |

### 3a. Pinned-commit re-run

All four gates were re-run on `6bde0f4`: type-check pass (3/3), lint pass (0 errors, 1,227 warnings), vitest pass (250 files, 2,601 tests), build pass (3/3). Raw summaries in `PROGRESS.md`.

### Production configuration facts (Vercel env **names only**, values never read)

- **platform (production):** `CRON_SECRET`, `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `INTERAKT_API_KEY`, `INTERAKT_WEBHOOK_SECRET`, `LIGHTFUNNELS_WEBHOOK_SECRET`, `LIGHTFUNNELS_TENANT_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `ENABLE_EXPERIMENTAL_COREPACK`. `hiddenProductionEnvCount: 0`.
  - **Not set** although code reads them: `WEBHOOK_AUTH_MODE` / `LIGHTFUNNELS_WEBHOOK_AUTH_MODE` (→ webhook auth runs in default "monitor" mode), `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_*`, `VAPID_PRIVATE_KEY`, `GEMINI_*`, `ANTHROPIC_*`, `WASEET_*`, `NEXT_PUBLIC_ROOT_DOMAIN`, storefront/platform origin vars. Whether each missing var breaks a feature or opens a hole is a Phase 2 question (A5/A9).
- **storefront (production):** `NEXT_PUBLIC_ROOT_DOMAIN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ENABLE_EXPERIMENTAL_COREPACK`.
- **admin** (prj_HO1lheRXukzlG7H13DlfFc1aHnI6, names only; all target development, preview and production): SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, LIGHTFUNNELS_TENANT_ID, LIGHTFUNNELS_WEBHOOK_SECRET, ENABLE_EXPERIMENTAL_COREPACK. No Sentry DSN and no admin-specific auth secret.
- **Plan:** `apps/platform/MILESTONE-QSTASH.md:14` says Vercel **Hobby** limits crons to once a day. **HYPOTHESIS:** the team is on Vercel Hobby, which is non-commercial and caps functions at 60 s; proof = team billing plan via Vercel.

## 4. Data-flow per journey (derived from the inventories; every arrow is verified in Phase 2 Tier B)

### 4.1 Storefront COD checkout
```
Browser /s/[tenant]/checkout
  ├─ path A: POST /api/checkout/orders  (Zod) ──┐
  └─ path B: server action submitCheckout (no Zod, callable directly) ─┤
                                                ▼
  submitCheckout (apps/storefront/app/actions/checkout.ts, service-role client)
    → tenant status re-check (live) → price/total from DB (server-side)
    → adjust_customer_points (redeem, BEFORE order, no idempotency)
    → rpc create_order_atomic(_order_data incl. idempotency_key, _tenant_id)            (checkout.ts:365)
         on RPC error: adjust_customer_points(+pointsUsed, reason "redeem_refund") (:374-380), its error
         ignored; return failure
         live triggers on orders (12, read from pg_trigger 2026-10-19):
           BEFORE INS/UPD: trg_orders_created_at_not_future
           BEFORE UPD:     increment_orders_version, trg_order_completed_at, trg_orders_updated_at
           AFTER INS:      trg_log_order_creation_history, trigger_log_order_notification
           AFTER INS/UPD:  trg_loyalty_order_changed
           AFTER INS/UPD/DEL: trg_inv_order_changed (→ inv_apply stock), trg_update_trust_orders
           AFTER UPD:      trg_chat_orders_event, trg_log_order_update_notifications, trg_referral_order_changed
         notifications INSERT → trg_dispatch_notification → dispatch_notification (push/WhatsApp fan-out)
         order_status_history INSERT → trigger_update_order_last_actor
         (increment_order_usage and notify_order_push exist as functions but are attached to no trigger;
          whether create_order_atomic calls them directly is checked in A3)
    → adjust_customer_points (earn, AFTER order, no idempotency)                        (:391-402)
    → abandoned_carts UPDATE recovered_at for (tenant, phone, recovered_at IS NULL)      (:407-412, result unchecked)
    → sendPurchaseCapi (lib/capi.ts:120) if payload.purchaseEventId and tenant analytics config (:419-435):
         Meta graph.facebook.com/v19.0/<pixel>/events and/or TikTok open_api/v1.3/event/track/, hashed
         phone/email/name, no timeout, per-call .catch(() => undefined) (capi.ts:131,144) + outer catch {} (:432)
    (experiment event write happens only on path A, /api/checkout/orders, not inside submitCheckout)
  ← /checkout/success?order=…  (echoes number, no DB read)
  Track: /s/[tenant]/track → /api/orders/lookup → rpc lookup_order (anon, DEFINER)
```

### 4.2 Order intake (non-storefront)
```
Lightfunnels ─webhook─▶ /api/webhooks/lightfunnels (auth mode default "monitor")
     → checkout_queue insert → QStash one-off → /api/cron/process-checkouts (QStash-signed)
     → lib/webhook-handler createOrderFromWebhook → rpc create_order_atomic (service role)
Manual (platform orders UI) → client Supabase (anon key + user JWT, RLS) / create_order_atomic
Image extraction → /api/orders/analyze-image (Gemini, rate-limited) → manual confirm
Telegram bot → /api/telegram/webhook (secret only if env set) → telegram_pending_orders → orders
Interakt → /api/webhooks/interakt/[tenantId] (tenant from URL) → order status / whatsapp_logs
```

### 4.3 Fulfilment & delivery
```
Orders page → confirm/follow-up (status updates via client + RLS; auto-follow-up via QStash)
 → print (client PDF: jspdf/html2canvas; server: /api/generate-batch-pdf headless Chromium)
 → [UNUSED IN PROD, L-36] /api/waseet/submit-orders (role-gated, idempotent claim) → Al-Waseet (single platform
    account): lib/waseet-api.ts:101-103 throws without WASEET_USERNAME/PASSWORD, which no Vercel target sets;
    0 orders ever have waseet_submitted_at; last waseet_api_logs row 2026-09-09 08:42 UTC
 → [UNUSED IN PROD, L-36] status sync: /api/cron/waseet-sync daily 12:00 UTC (+ manual) → orders, order_status_history
    (scheduled, but cannot authenticate to Al-Waseet without the env vars)
 → what actually happens today (MEASURED 2026-10-19): 230 orders marked delivered and 53 of 388 orders created in
    the last 30 days carry a delivery_order_id, while 6 delivery_imports rows were created in the same 30 days.
    HYPOTHESIS: delivery_order_id is set by delivery import or typed by hand; proof = order_status_history /
    delivery_import_items for those 53 orders (Phase 2).
 → delivered/returned → process_return / undo_return RPCs; /returns/scan (ZXing)
 → delivery-import: /api/delivery-import/{parse,confirm,rollback} (pdf-parse/xlsx) → orders
```

### 4.4 Money
```
orders (totals) → dashboards: get_dashboard_metrics, get_orders_aggregates, analytics/reports pages
wallet / wallet_transactions ← charge_wallet_atomic (per order usage), /api/cron/subscription-renew,
                               admin /api/billing/topup and bulk top-up
salaries/payroll: employee_salary_configs, payroll_records, advances, penalties → payroll-pdfs bucket
expenses → finances page
```

### 4.5 Tenant & auth
```
Signup /api/auth/signup (auto-confirm) → tenants + tenant_members + user_profiles(role) → onboarding
Platform session: Supabase SSR cookies; middleware refreshes only; PageGuard client-side;
  API routes: per-route helpers (inventory/platform.md §6); DB: RLS via get_user_tenant_ids()/membership
Team: invites, link-google start/claim (generateLink), roles in tenant_members + global user_profiles.role
Admin: middleware "is admin" gate + per-route checks (uneven); impersonation via /api/impersonate
Storefront: host → proxy.ts → /s/[tenant]; tenant_domains anon lookup; 60 s tenant cache
```

## 5. Load model (§7) — every figure is an ASSUMPTION unless marked MEASURED

### 5.1 Measured today (production DB, read-only SQL, 2026-10-19)

| Metric | Value |
|---|---|
| Tenants (rows) | 28; **1** tenant created orders in the last 30 days |
| Orders total / last 30 days | 23,291 / 388 (≈ 13/day, all one tenant) |
| Busiest day / busiest hour in last 90 days | 136 orders / 15 orders |
| Largest tenant (all time) | 5,239 orders |
| Status changes per order | **3.38 all-time = 78,824 / 23,291** (exact `count(*)`, MEASURED 2026-10-19 00:44 UTC; the earlier 3.3 used `reltuples` estimates); 3.49 over last 30 days |
| WhatsApp log rows per order (30 d) | 2.9 (1,139 / 388) |
| Notifications per order (30 d) | 4.2 (1,629 / 388) |
| Wallet transactions per order (30 d) | 0.12 |
| Order sources, last 90 days | whatsapp 1,784; shop (storefront) 1,203; meta 729; lightfunnels 690; other 452; tiktok 438 → storefront ≈ 23% |
| Hour-of-day share (Asia/Baghdad, last 90 d) | top hour 21:00 = **8.5%**; 17:00 = 8.4%; 19:00 = 7.9%; 18:00 = 7.8%; 20:00 = 7.4%; the 17:00–22:00 window = **40.1%** |
| Postgres `max_connections` | **60** (29 in use at an idle moment) — consistent with the smallest Supabase compute tier (**HYPOTHESIS**: Micro; proof = project compute add-on) |
| Bytes per row (total relation size ÷ rows) | orders ≈ 1.1 KB; whatsapp_logs ≈ 2.4 KB; order_status_history ≈ 0.19 KB; notifications ≈ 2.8 KB |
| Al-Waseet API usage | `waseet_api_logs` newest row 2026-09-09 (0 rows in 30 d); no cached `waseet_token` in `app_settings`; `orders.waseet_submitted_at` is NULL for every order; yet 230 orders were marked delivered in the last 30 days. Deliveries are being recorded without the Waseet API (by delivery import or by hand). |

Launch load (1,500 ordering shoppers/day across 5 tenants) is **~115× today's real volume**; 10× headroom is **~1,150×**.

### 5.2 Design factors (stated, not measured)

| Factor | Value | Why |
|---|---|---|
| Peak-hour share | **30% of daily traffic in one hour** | Required by the brief as a stress factor. It is **3.5× the measured top hour (8.5%)** and models an ad-driven burst on top of the evening peak. |
| Session→order conversion | 20% | ASSUMPTION, typical for COD social traffic. |
| Storefront share of orders | 100% of the 1,500 (design case) | ASSUMPTION: the brief's 1,500 are shoppers "opening the app and placing orders". Other channels (WhatsApp, Lightfunnels, manual) add on top; at today's mix they would add ~3.4× more orders to the platform side ((1,784 + 729 + 690 + 452 + 438) / 1,203). |
| Staff | 4 per tenant, 2 devices/tabs each | ASSUMPTION |
| Writes per order lifecycle | ≈ 25 | ASSUMPTION built from the live trigger list (§4.1): create ≈ 8 rows (order, status-history row, notification, notification deliveries, inventory ledger, trust, loyalty) + 3.49 status changes × ≈ 5 rows (history, notification, deliveries, trust, last-actor). A3/A8 measure it. |
| Status changes per order | 3.49 | MEASURED (30 d) |
| WhatsApp messages per order | 2.9 | MEASURED (30 d) |
| Wallet transactions per order | 0.12 | MEASURED (30 d) |

### 5.3 Daily volume

| Quantity | Base (5 tenants) | 10× (50 tenants) | Derivation |
|---|---|---|---|
| Orders/day | 1,500 | 15,000 | CONFIG |
| Storefront sessions/day | 7,500 | 75,000 | ÷ 20% conversion |
| DB writes/day (order lifecycle) | ≈ 37,500 | ≈ 375,000 | × 25 |
| Order status changes/day | ≈ 5,200 | ≈ 52,000 | × 3.49 |
| WhatsApp messages/day (Interakt) | ≈ 4,350 | ≈ 43,500 | × 2.9 |
| Lightfunnels webhooks/day (**on top of** the 1,500, per §5.2) | ≈ 860 | ≈ 8,600 | 1,500 × 690 / 1,203 (today's LF : storefront ratio, 90 d), only if LF tenants exist. Not included in the 1,500 orders or the 37,500 writes above. |
| Wallet transactions/day | ≈ 180 | ≈ 1,800 | × 0.12 |
| Staff / staff devices | 20 / 40 | 200 / 400 | 4 per tenant, 2 devices each |

### 5.4 Peak hour (30% design factor)

| Quantity | Base | 10× | Derivation |
|---|---|---|---|
| Orders in peak hour | 450 | 4,500 | 30% |
| Order creations/s | 0.13 | 1.25 | ÷ 3,600 |
| DB writes/s (order lifecycle) | ≈ 3.1 | ≈ 31 | 37,500 × 30% ÷ 3,600 |
| DB writes/s (whatsapp_logs) | ≈ 0.36 | ≈ 3.6 | 4,350 × 30% ÷ 3,600 |
| **DB writes/s, total of the modelled sources** | **≈ 3.5** | **≈ 35** | order lifecycle + whatsapp_logs + wallet (180 × 30% ÷ 3,600 ≈ 0.015). Excludes non-storefront orders (§5.2: ~3.4× more at today's mix), storefront_events / analytics_events, activity_logs and checkout_queue — A8 measures those. |
| Storefront sessions in peak hour | 2,250 | 22,500 | 30% of sessions |
| Concurrent shoppers | ≈ 190 | ≈ 1,900 | 5-minute average session (ASSUMPTION) |
| Storefront page views/s | ≈ 5 | ≈ 50 | 8 page views per session (ASSUMPTION) |
| Storefront DB reads/s | ≈ 5–15 | ≈ 50–150 | 1–3 queries per page view after the 60 s `unstable_cache` (ASSUMPTION; A8 measures) |
| Merchant API reads/s | ≈ 2 | ≈ 20 | 20 / 200 staff × ~6 requests/min (ASSUMPTION) |
| Realtime clients | 40 | 400 | one per staff device |
| Realtime channels | ≈ 240 | ≈ 2,400 | up to ~6 channels per device (15 channel call sites in platform; A8 counts the real number per page) |
| Cron overlap with peak | Vercel crons run 00:00–12:00 UTC (03:00–15:00 Baghdad): no overlap. pg_cron `refresh-customer-aggregates` (every 10 min), `check-notification-pipeline` (15 min), `chat-auto-resolve-threads` (15 min), `check-order-sla` and `refresh-tenant-public-stats` (30 min), `notification-digest-hourly` all run **during** the peak. | | |

### 5.5 Data growth

| Table | Rows/day base | 12 months base | 12 months 10× | Size at 12 months, base |
|---|---|---|---|---|
| orders | 1,500 | 550 k | 5.5 M | ≈ 0.6 GB |
| order_status_history | 5,200 | 1.9 M | 19 M | ≈ 0.36 GB |
| whatsapp_logs | 4,350 | 1.6 M | 16 M | **≈ 3.8 GB** |
| notifications (pruned at 90 d by `prune-order-notifications`) | 6,300 | ≈ 570 k steady state | 5.7 M | ≈ 1.6 GB |
| wallet_transactions | 180 | 66 k | 660 k | < 0.1 GB |
| activity_logs, checkout_queue, inventory_ledger, chat_messages | smaller; sized in A8 | | | |

**Largest at 12 months:** `whatsapp_logs`, `orders`, `notifications`, `order_status_history`. Their indexes and plans are checked in A8. The perf advisors already list unindexed foreign keys on `order_status_history`, `delivery_import_items`, `checkout_queue` and `notification_deliveries` (`inventory/advisors-performance.json`).

### 5.6 First component expected to break at 10× — ranked HYPOTHESES (A8 proves or kills each)

1. **Database compute.** 60 connections on the smallest tier; `mv_customer_aggregates` is fully refreshed every 10 minutes across all tenants, during the peak; 43 `auth_rls_initplan` policies re-evaluate `auth.*()` per row on hot tables. Proof: `EXPLAIN ANALYZE` of hot queries at 10× synthetic volume on a Supabase branch.
2. **Vercel plan limits**, if the team is on Hobby: 60 s cap for `generate-batch-pdf` (Chromium) and `waseet-sync`; crons limited to once a day. Proof: team plan and measured durations.
3. **Supabase Realtime quota** at ~400 clients / ~2,400 channels. Proof: plan quota vs §5.4.
4. **Third-party limits:** Interakt at ~43 k messages/day; one shared Al-Waseet account for every tenant. Proof: provider limits.
5. **Puppeteer memory and cold start** on batch label PDFs during the evening print run. Proof: measured duration and memory on a preview.

## 6. Recon leads (UNVERIFIED — not findings)

The inventory subagents flagged the items below. They are **leads for Phase 1/2**, not findings: none has been re-checked with evidence by me yet, and some conflict (see notes). Each becomes an F-### only after verification.

**Tenancy / auth**
- L-01 `apps/platform/app/api/domains/verify/route.ts`: service role, `domain_id` from body, no auth.
- L-02 Webhook auth defaults to "monitor" (`lib/webhook-auth.ts:169-174, :197-198`); prod env has no `*_AUTH_MODE` → **unauthenticated** (no credential presented) Lightfunnels orders and Interakt updates are accepted. A request that presents an **invalid** signature/secret is rejected in every mode, monitor included (`enforceWebhookAuth`, `lib/webhook-auth.ts:197-198`: `rejected = result.status === "invalid" || (… && mode === "enforce")`).
- L-03 Telegram webhook secret only checked if env set (`telegram/webhook/route.ts:79-85`); prod env has no `TELEGRAM_WEBHOOK_SECRET`.
- L-04 Cron auth fail-open patterns: `trial-suspend:17-20`, `subscription-renew:30-33` (template-string compare), `waseet-sync:22-30` and `auto-no-response:31-39` (accept an `x-vercel-cron` header as auth; whether Vercel strips that header from external requests is unverified — A6 tests it on a preview). Prod has `CRON_SECRET` set, so the "unset" branch is not live today; the header path may be.
- L-05 Any signed-in user of any tenant can use the shared Al-Waseet account (`waseet/receive-invoice`, invoices, global `waseet_city_mappings` POST).
- L-06 `cron/process-checkouts-manual`: any signed-in user drains the global checkout queue.
- L-07 `generate-batch-pdf`: arbitrary client HTML rendered in server Chromium (SSRF), browser not closed on error.
- L-08 `team/link-google/start` + `link-google/claim`: tenant admin can mint a login link for another admin; non-atomic single-use.
- L-09 Open redirects: platform `auth/callback:17-20`, admin `auth/callback:8,36`.
- L-10 Tenant from `current_tenant_id` without membership check: `settings/staff-alert`, `settings/order-pipeline`, `waseet/submit-orders`, `chat/push/subscribe`; global `user_profiles.role` used instead of tenant role.
- L-11 Page protection is client-only (`PageGuard` renders children before redirect); `/finances`, `/vault`, `/store/**`, `/returns/scan`, `/sentry-test` have no role gate.
- L-12 Admin: wallet top-up has no permission check and a read-then-write race; 12 admin handlers rely only on middleware "is admin" (no route-level auth helper; grep for `requireAdmin*|requireSuperAdmin|getUser(` finds none): `admin/watchlist/[tenantId]`, `billing/topup`, `dashboard/stats`, `merchants/[id]/audit-log`, `merchants/[id]/convert-trial`, `merchants/[id]/extend-subscription`, `merchants/[id]/extend-trial`, `merchants/[id]/notes`, `merchants/[id]/orders`, `merchants/[id]/pause`, `merchants/[id]/tags`, `merchants/[id]/unpause` (all under `apps/admin/app/api/`); the 13th route without a helper is the public `auth/callback`; impersonation audit insert writes a non-existent column and swallows the error; bulk top-up calls non-existent `increment_wallet_balance`/`wallets` and reports success.
- L-13 Storefront `submitCheckout` is a public server action with no Zod; loyalty points redeemable by anyone with a phone number and double-applied on retries.
- L-14 `/api/cart/abandoned` accepts any `tenant_id`/phone → can make a merchant's WhatsApp reminder job message arbitrary numbers; client-sent prices.
- L-15 Policies referencing `auth.jwt` on `bom_items` and `product_categories` (possible forgeable-claim RLS, prior B-class).
- L-16 `customer_aggregates` SECURITY DEFINER view readable by `authenticated`.
- L-17 Customer data mixed across tenants in `webhook-handler.ts` (`checkBlacklist` ignores tenant; dedup query cross-tenant).

- L-34 Storage policies on `product-images` allow INSERT/UPDATE/DELETE to role `public` with only `bucket_id = 'product-images'` (MEASURED in `pg_policies`): anyone, signed in or not, may be able to overwrite or delete any tenant's product images. `qc-evidence` lets any authenticated user delete any object. `tenant-assets` is public and allows `image/svg+xml` (stored-XSS vector).
- L-35 Code calls DB functions that do not exist live (MEASURED, `pg_proc` 2026-10-19 00:41 UTC): `auto_move_to_no_response` (`apps/platform/app/api/cron/auto-no-response/route.ts:46`), `merge_categories` (`apps/platform/hooks/use-categories-query.ts:263`), `split_category` (`:288`), `increment_wallet_balance` (`apps/admin/app/api/bulk/route.ts:173`), `search_orders_v2` (`apps/platform/lib/repositories/order-repository.ts:448`, with a direct-select fallback at `:453`; repo migration not applied, L-21), `exec_sql` (tracked scripts `apps/platform/scripts/add-tag-color-column.ts:16`, `apps/platform/scripts/apply-persistence.ts:41`).
- L-37 Dead realtime subscriptions (MEASURED at publication level): `supabase_realtime` publishes only `orders`, `qc_quarantine`, `qc_quarantine_events`, `notifications`. Eight subscribed tables are not published, so these channels never fire: platform `activity_logs` (components/providers/global-activity-provider.tsx:26, components/team/hooks/use-team-realtime.ts:88), `expenses` (hooks/use-expenses.ts:189), `announcements` (hooks/use-announcements.ts:83); admin `tenants`, `wallet`, `wallet_transactions`, `subscriptions`, `admin_activity_logs` (apps/admin/hooks/use-admin-realtime.ts:58-62). The generic `hooks/use-realtime-query.ts` (channel at `:141`) has exactly one caller, `apps/platform/hooks/use-order-realtime.ts:40`, with `table: "orders"` (published, so that channel does fire). User impact of the eight dead subscriptions to confirm in Phase 2.
- L-38 **Live DB moved past the pinned snapshot via PR #146** (MEASURED 2026-10-19 00:41 UTC). Migrations `20261019100000 secdef_rpc_tenant_guards` and `20261019100100 tenant_admin_only_writes` were applied live from PR #146 (`fix/tenancy-secdef-hardening`, commit `6c0d157`, merged to `main` as `6c75d9b` after the pinned `6bde0f4`). They are intended changes, not drift: audit them as ordinary changes. Effect: functions 182→183 (new INVOKER `tenant_members_guard_self_change`), policies 343→345 (`tenant_members` ALL policy replaced by admin-only INSERT/UPDATE/DELETE; 30 `tenant_isolation_*` write policies on 10 payroll/settings/integration/domain tables now require `is_tenant_admin`), triggers 46→47 (`trg_tenant_members_guard_self_change`), EXECUTE revoked from `authenticated` on 4 DEFINER functions (60 remain), 7 DEFINER `search_path`s pinned (0 unpinned), 6 function bodies gain tenant guards, `anon` loses all privileges on `orders`. Full diff: `inventory/database.md` → "Live drift since the first snapshot". Files: `packages/supabase/migrations/20261019100000_secdef_rpc_tenant_guards.sql`, `…20261019100100_tenant_admin_only_writes.sql` on `origin/main`. `schema_migrations` stores no statements and `created_by` is NULL for both. Consequences for Phase 1: (a) leads that predate it must be re-checked against live, at least L-10 (tenant role checks) and the INVOKER/DEFINER grant counts in COVERAGE; (b) the pinned snapshot is behind `main` (`origin/main` = `87e5e40`, 11 commits ahead) — decide whether to re-pin.
- L-39 Code queries relations that do not exist live (MEASURED, no `pg_class` row, 2026-10-19), so these reads/writes fail at runtime with a PostgREST "relation not found" error: `customers` — `apps/platform/hooks/use-bulk-actions.ts:26`, inside `exportToCSV` (`:19`); the only consumer, `apps/platform/app/customers/page.tsx:45`, destructures only `bulkAddTags`, so the failing path is currently unreachable from the UI. `order_items` — `apps/platform/hooks/use-store-analytics.ts:33` (top product in the store command center; `components/store-command-center/command-center.tsx:30`); its `{ data: items }` ignores the error, so the KPI silently shows no top product (HYPOTHESIS until run). `activity_log` (singular; the live table is `activity_logs`) — `apps/platform/lib/customer-data-export.ts:95` (read) and `:240` (insert), lazy-loaded from `apps/platform/app/customers/[phone]/page.tsx:176`. `wallets` is already in L-12. Sits next to L-35.
- L-40 Per-tenant Meta CAPI / TikTok Events API tokens are stored in `tenants.store_config_v2.globals.analytics_pixels.base` (`packages/shared/src/types/store-config.ts:262,264`). The storefront redacts them before sending config to the browser (`packages/shared/src/pixel.ts:57-69`, called at `apps/storefront/lib/tenant.ts:91-95`), but the `tenants` row itself is readable by `anon` for every trial/active tenant (policy `public_storefront_read`, `has_column_privilege('anon','public.tenants','store_config_v2','SELECT')` = true, MEASURED). HYPOTHESIS: anyone with the public anon key can read a tenant's CAPI token via PostgREST once one is configured; today 0 tenants have a token (MEASURED), 1 has a Meta pixel id and 1 a TikTok pixel id. Proof = anon `select store_config_v2 from tenants` on a branch with a token set (A1).
- L-41 Live edge function `migrate-scheniders-iraq-product-images` exists only in the database project (not in the repo): ACTIVE, `verify_jwt=true`, body is an inert "decommissioned" stub (MEASURED via `list_edge_functions` / `get_edge_function`, critic round 3). Risk negligible; candidate for deletion in Phase 3 plan.
- L-42 `packages/supabase/config.toml:5` sets `project_id = "ibfdugifekivquwprqjc"`, the OLD project id. In the Supabase CLI this field is a local stack label, not a link target, so it does not route migrations to the old project by itself (inferred from the file's own comment at :3-4). Still a confusion risk given CLAUDE.md's two-project warning.
- L-36 Al-Waseet API is unused in production (MEASURED, §5.1): no `WASEET_*` env vars, no cached token, no API log since 2026-09-09, no order ever has `waseet_submitted_at`. Whether this is a broken launch journey or a deliberate manual process is a Phase 2 / Ali question. **Ali 2026-10-19: manual Waseet handling is deliberate, leave it as is.** Not a finding; the unused API path is audited only as dead/unreachable code.

**Money / data**
- L-18 `subscription-renew` not idempotent (double charge on overlap/retry).
- L-19 Delivery-import rollback selects columns that do not exist; reports success on partial failure.
- L-20 56 tenant tables have nullable `tenant_id`, including `orders` and `products`.
- L-21 Repo migrations `search_orders_v2` and `v_orders_with_risk_contact_columns` not applied live; the app may already call them.

**Reliability / ops**
- L-22 No timeout on any outbound third-party call; swallowed catches in `lightfunnels-api.ts`.
- L-23 Sentry: no `instrumentation.ts`, no DSN in prod, no tenant context, storefront/admin have none.
- L-24 Service worker: committed `public/sw.js` holds the push handlers; `app/sw.ts` (Serwist) has none and is not built under Turbopack. **Conflicting recon** (one agent says the build overwrites `sw.js`; my build shows it does not). Needs a runtime check.
- L-25 Offline order queue (`lib/sync-queue.ts`) has no importers.
- L-26 `/api/delivery-import/parse` crashes in production on `pdf-parse` (`DOMMatrix`) — MEASURED in Vercel runtime errors.
- L-27 Env validation: every server var `.optional()` in `env.ts`; storefront uses `process.env.X!`.
- L-28 Storage: code paths vs bucket policies mismatch (`product-images` prefix, `getPublicUrl` on private buckets, 10-year signed payroll URLs); `qc-evidence` bucket public with no size/MIME limit (MEASURED).

**Code health / debris**
- L-29 Customer phone numbers committed in `apps/platform/Prime file.pdf` and `Prime file copy.pdf`; ~5.4 MB of `tmp/audit` PNGs; `.py`, `check-*.mjs`, `*_plan.md`, `.resolved` tracked.
- L-30 `xlsx@0.18.5` (unfixable advisories) in client bundles; dead heavy components; `html2pdf.js` never imported.
- L-31 `apps/platform/app/layout.tsx:81` sets `dir="ltr"` (CLAUDE.md: never set `dir`).
- L-32 E2E coverage is zero (MEASURED, §3).
- L-33 `next@16.0.10` has a critical unauthenticated RCE advisory (MEASURED, §3).

## 7. Prior audits to regression-check in Phase 1

| Source | Status in repo |
|---|---|
| `docs/audits/PRODUCTION_READINESS_REPORT.md` (381 lines; P0 B-01…B-15) + `PRODUCTION_READINESS_FIX_PLAN.md` | present |
| `tmp/audit/FINAL-REPORT.md` (163 lines; storefront V2 P0 9 / P1 20) | present; **`findings.json` is not in the repo** |
| `ORDERS_PAGE_SOTA_AUDIT_2026-08-20.md` + `ORDERS_PAGE_APPROVAL_LEDGER.md` (83 lines) | present |
| `DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md` + `DASHBOARD_PAGE_APPROVAL_LEDGER.md` (81 lines) | present |
| `STORE_BUILDER_*` (6 files), `SCHENIDERS_SIGNATURE_SOTA_AUDIT_2026-09-06.md`, `QC_TEST_MATRIX.md` (356 lines), `OUT_OF_SCOPE_FINDINGS_2026-09-02.md` | present |

Added for Phase 1 (found via `docs/audits/WEB_HANDOFF.md` on main):

| Source | Status in repo |
|---|---|
| `docs/audits/orders-reliability-2026-10-11/REGISTER.md` (623 lines) + evidence/ | on main since #144 |
| `MASTER_FINDINGS_LEDGER_2026-09-17.md` (266), `SOTA_PLATFORM_AUDIT_2026-09-17.md` (2,097), `FINAL_AUDIT_REGISTER.md` (1,023), `LAUNCH_READINESS_VERDICT.md` (165), `FINAL_REMEDIATION_PLAN.md` (645) | only on branch `feat/notifications-overhaul` @ 9579c36; copied read-only for Phase 1 |

## 8. Skills used in Phase 0

None were invoked in Phase 0: it was inventory and baseline gates only. The per-lens skills (`production-audit`, `security-review`, `supabase-postgres-best-practices`, `postgres-patterns`, `next-best-practices`, `vercel-react-best-practices`, `react-performance`, `error-handling`, `browser-qa`, `click-path-audit`, `web-design-guidelines`, `polish`, `systematic-debugging`, `verification-loop`) are loaded at the start of each matching lens in Phases 1–2 and the loaded skill is named in each finding's Tier/Lens line.
