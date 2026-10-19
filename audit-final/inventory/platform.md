# apps/platform — Reconnaissance Inventory

> **Errata (Phase 0 critic round 1):** the route-handler count is **53** (52 under `app/api/**` plus `app/link-google/claim/route.ts`), not 54 as written below. CONTEXT.md §2 is authoritative.

Root: `/home/claude/scheniders-mono/apps/platform` (all paths below are relative to it unless absolute).
Read-only survey, 2026-10-19. Line numbers refer to the working tree at survey time.

---

## 11. Counts summary

| Item | Count |
|---|---|
| `page.tsx` | 32 (28 client components, 4 server components) |
| `layout.tsx` | 5 (`app/layout.tsx`, `app/(auth)/layout.tsx`, `app/orders/layout.tsx`, `app/settings/layout.tsx`, `app/store/layout.tsx`) |
| `error.tsx` | 5 (`app/error.tsx`, `app/customers/error.tsx`, `app/orders/error.tsx`, `app/products/error.tsx`, `app/store/edit/error.tsx`) |
| `global-error.tsx` | 1 (`app/global-error.tsx`) |
| `loading.tsx` | 5 (`app/analytics/loading.tsx`, `app/customers/loading.tsx`, `app/products/loading.tsx`, `app/reports/loading.tsx`, `app/team/loading.tsx`) |
| `not-found.tsx` / `template.tsx` / `default.tsx` | 0 / 0 / 0 |
| Route handlers (`route.ts`) | 54 (53 under `app/api/**`, plus `app/link-google/claim/route.ts`) |
| Route handlers using the service-role key | 37 (35 via `createSupabaseServiceClient()`, 2 via raw `createClient(url, SERVICE_ROLE_KEY)`) |
| Route handlers with no caller authentication | 4 unintended (`domains/verify`, `telegram/webhook` when its secret is unset, `webhooks/lightfunnels` and `webhooks/interakt/[tenantId]` in default "monitor" mode), plus 5 public by design (`auth/signup`, `auth/callback`, `link-google/claim`, and the GET health stubs on the two webhooks) |
| Cron routes whose auth fails open | 4 (`trial-suspend`, `subscription-renew`, `waseet-sync`, `auto-no-response`) |
| Routes that use Zod | 8 |
| Routes with rate limiting | 1 (`orders/analyze-image`) |
| `"use server"` files | 6 (all in `app/actions/`), with 15 exported actions |
| Server actions with no explicit auth check | 3 (all in `app/actions/deleted-orders.ts`; they rely on RLS through the cookie session) |
| Distinct Supabase client factories (app code) | 7 (listed in §5) |
| Files importing browser singleton `@/lib/supabase` | 257 |
| Files importing `@/lib/supabase-server` | 64 |
| Realtime `.channel(...)` sites | 15 |
| Storage `.storage.from(...)` call sites | 38 across 9 buckets |
| `.rpc(...)` call sites | 61 |
| Middleware | 1 (`middleware.ts`): session refresh only, no route protection |

---

## 1. Pages

### 1a. Guard model (applies to every page)

- `app/layout.tsx` (server component) wraps everything in the providers `AuthProvider → QueryProvider → OrdersProvider → PWAProvider → ThemeProvider → RoleProvider → FinancialVisibilityProvider → LanguageProvider → DashboardLayout` and mounts `<ChatRuntime/>` (lines 98–125). It sets `<html lang="ar" dir="ltr">` (`app/layout.tsx:81`). CLAUDE.md says never to set `dir`.
- `DashboardLayout` (`components/layout/dashboard-layout.tsx:17`): paths starting `/login`, `/forgot-password`, `/reset-password`, `/signup`, or `/landing` skip the guard (`:55-69`). Every other path renders inside `<PageGuard>` (`:78`).
- `PageGuard` (`components/auth/role-guard.tsx:58`) is **client-only**:
  - With no user it calls `router.push("/login")` in an effect (`:78`).
  - It **renders children while loading or while `!user`** (`:87-89`), and again while the profile loads (`:94-96`). Page JS and chrome therefore mount before the redirect.
  - With no role it shows `AccessDenied`.
  - On a missing profile it shows `AccountNotProvisioned`.
- `RoleProvider` (`components/providers/role-provider.tsx:7-17`) holds a client-side route→role map. A failed check redirects to `/orders?error=access_denied` (`:44`). The map:
  - `/admin/data-import`, `/settings`, `/analytics`, `/reports`, `/team` → admin, super_admin
  - `/printing` → admin, super_admin, employee
  - `/products`, `/orders`, `/customers` → all 4 roles
  - **Not in the map, so any signed-in user with a role can open them:** `/`, `/finances`, `/vault`, `/salaries` (the page checks for itself), `/store/**`, `/returns/scan`, `/sentry-test`, `/offline`.
- **No server-side page protection** exists apart from the `/store/edit` and `/store/onboarding` server components. Middleware does not redirect (see §4).

### 1b. Every page

| # | File | URL | Route group | Kind | Protection |
|---|---|---|---|---|---|
| 1 | `app/(auth)/forgot-password/page.tsx` | `/forgot-password` | `(auth)` | client | none (auth page; `(auth)/layout.tsx` is presentational only) |
| 2 | `app/(auth)/login/page.tsx` | `/login` | `(auth)` | client | none (auth page) |
| 3 | `app/(auth)/reset-password/page.tsx` | `/reset-password` | `(auth)` | client | none (auth page) |
| 4 | `app/(auth)/signup/page.tsx` | `/signup` | `(auth)` | client | none (auth page) |
| 5 | `app/admin/data-import/page.tsx` | `/admin/data-import` | — | client | PageGuard + RoleProvider (admin, super_admin). Every self-signup is `admin`. |
| 6 | `app/analytics/page.tsx` | `/analytics` | — | client | PageGuard + RoleProvider (admin, super_admin) |
| 7 | `app/customers/[phone]/page.tsx` | `/customers/[phone]` | — | client | PageGuard + RoleProvider (all roles) |
| 8 | `app/customers/page.tsx` | `/customers` | — | client | PageGuard + RoleProvider (all roles) |
| 9 | `app/finances/page.tsx` | `/finances` | — | client | PageGuard only (no role map entry, no in-page role check) |
| 10 | `app/landing/page.tsx` | `/landing` | — | client | none (public; DashboardLayout bypass) |
| 11 | `app/offline/page.tsx` | `/offline` | — | client | PageGuard only |
| 12 | `app/orders/page.tsx` | `/orders` | — | client | PageGuard + RoleProvider; `orders/layout.tsx` (client) swaps in `MobileOrdersPage` on mobile |
| 13 | `app/orders/trash/page.tsx` | `/orders/trash` | — | client | PageGuard + RoleProvider (prefix `/orders`) |
| 14 | `app/page.tsx` | `/` | — | client | PageGuard only (uses `useAuth()` `:58`) |
| 15 | `app/printing/page.tsx` | `/printing` | — | client | PageGuard + RoleProvider (admin, super_admin, employee) |
| 16 | `app/products/[id]/edit/page.tsx` | `/products/[id]/edit` | — | client | PageGuard + RoleProvider (all roles, including viewer) |
| 17 | `app/products/new/page.tsx` | `/products/new` | — | client | PageGuard + RoleProvider (all roles, including viewer) |
| 18 | `app/products/page.tsx` | `/products` | — | client | PageGuard + RoleProvider (all roles) |
| 19 | `app/reports/page.tsx` | `/reports` | — | client | PageGuard + RoleProvider (admin, super_admin) |
| 20 | `app/returns/scan/page.tsx` | `/returns/scan` | — | client | PageGuard only; joins realtime `returns:${token}` |
| 21 | `app/salaries/page.tsx` | `/salaries` | — | client | PageGuard + in-page `role !== "admin"` check (`app/salaries/page.tsx:17`). This also blocks super_admin. |
| 22 | `app/sentry-test/page.tsx` | `/sentry-test` | — | client | PageGuard only. A debug page reachable in production. |
| 23 | `app/settings/page.tsx` | `/settings` | — | client | PageGuard + RoleProvider (admin, super_admin); `settings/layout.tsx` (client) mounts `AutoLinkGoogle` |
| 24 | `app/settings/team/page.tsx` | `/settings/team` | — | client | PageGuard + RoleProvider (prefix `/settings`) |
| 25 | `app/store/edit/page.tsx` | `/store/edit` | — | **server** | Server-side `supabase.auth.getUser()` → `redirect("/login")` (`:111-112`); membership via `tenant_members ... .eq(user_id).single()` (`:114-122`), which fails for multi-tenant users. Also PageGuard. Mints a preview token with fallback `"dev-preview-token"` when `PREVIEW_TOKEN_SECRET` is unset (`:49`, `:141-144`). |
| 26 | `app/store/onboarding/page.tsx` | `/store/onboarding` | — | **server** | Server-side `getUser()` → `redirect("/login")` (`:48-49`); membership `.single()` (`:51-59`) |
| 27 | `app/store/page.tsx` | `/store` | — | client | PageGuard only; `store/layout.tsx` (client) adds tabs |
| 28 | `app/store/recovery/page.tsx` | `/store/recovery` | — | client | PageGuard only |
| 29 | `app/store/reviews/page.tsx` | `/store/reviews` | — | client | PageGuard only |
| 30 | `app/store/v2/page.tsx` | `/store/v2` | — | **server** | Unconditional `redirect("/store/edit")` |
| 31 | `app/team/page.tsx` | `/team` | — | client | PageGuard + RoleProvider (admin, super_admin) |
| 32 | `app/vault/page.tsx` | `/vault` | — | client | PageGuard only. Uses the `vault_backups` bucket, which is platform-admin-only in storage RLS (§8), so tenant users reach a page that cannot work for them. |

### 1c. Layout, error and loading files

- **Layouts:**
  - `app/layout.tsx` (server)
  - `app/(auth)/layout.tsx` (server, styling only)
  - `app/orders/layout.tsx` (client)
  - `app/settings/layout.tsx` (client)
  - `app/store/layout.tsx` (client)
- **Error boundaries:**
  - `app/error.tsx`
  - `app/customers/error.tsx`
  - `app/orders/error.tsx`
  - `app/products/error.tsx`
  - `app/store/edit/error.tsx`
  - `app/global-error.tsx`
- **Loading files:**
  - `app/analytics/loading.tsx`
  - `app/customers/loading.tsx`
  - `app/products/loading.tsx`
  - `app/reports/loading.tsx`
  - `app/team/loading.tsx`
- **not-found.tsx, template.tsx:** none.

**Segments with no segment-level `error.tsx`** (they fall back to the root `app/error.tsx`):
`(auth)/forgot-password`, `(auth)/login`, `(auth)/reset-password`, `(auth)/signup`, `admin/data-import`, `analytics`, `finances`, `landing`, `offline`, `/` (root page), `printing`, `reports`, `returns/scan`, `salaries`, `sentry-test`, `settings`, `settings/team`, `store`, `store/onboarding`, `store/recovery`, `store/reviews`, `store/v2`, `team`, `vault`.
These are covered by `error.tsx` in their tree: `customers`, `customers/[phone]`, `orders`, `orders/trash`, `products`, `products/new`, `products/[id]/edit`, `store/edit`.

**Pages with no `loading.tsx` anywhere in their tree:**
`/forgot-password`, `/login`, `/reset-password`, `/signup`, `/admin/data-import`, `/finances`, `/landing`, `/offline`, `/`, `/orders`, `/orders/trash`, `/printing`, `/returns/scan`, `/salaries`, `/sentry-test`, `/settings`, `/settings/team`, `/store`, `/store/edit`, `/store/onboarding`, `/store/recovery`, `/store/reviews`, `/store/v2`, `/vault`.
Covered: `/analytics`, `/customers`, `/customers/[phone]`, `/products`, `/products/new`, `/products/[id]/edit`, `/reports`, `/team`.

---

## 2. API routes (54)

Column key:
- **Auth** is the helper actually called, with file:line.
- **Tenant** is where `tenant_id` comes from.
- **Zod** is whether a Zod schema validates the input.
- **SR** means the route uses the service-role client.
- **RL** is rate limiting.

The helpers are defined in:
- `lib/supabase-server.ts`: `verifyAccessToken` `:92`
- `lib/auth/require-request-caller.ts`: `requireRequestCaller` `:23`
- `lib/auth/resolve-active-tenant.ts`: `resolveActiveTenant` `:23`
- `lib/cron-auth.ts`: `requireCronAuth` `:27`
- `lib/webhook-auth.ts`: `verifyWebhookAuth` `:119`, `enforceWebhookAuth` `:191`

`requireRequestCaller` derives the tenant from `user_profiles.current_tenant_id` **plus an active-membership check**. The routes marked "current_tenant_id (unverified)" read that column with no membership check. A DB policy (`packages/supabase/migrations/20261011090000_stage0_security_lockdown.sql:21-28`) now limits writes to the column to tenants the user belongs to. A user who is **removed** from a tenant keeps a stale `current_tenant_id`, so those routes still act on the old tenant.

| Route | Methods | Auth (file:line) | Tenant | Zod | SR | RL | Notes |
|---|---|---|---|---|---|---|---|
| `app/api/admin/access-requests/route.ts` | GET, POST, DELETE | local `requireSuperAdmin` → `verifyAccessToken` `:12`, `role === 'super_admin'` `:16`; called `:24`, `:38`, `:77` | body `tenantId` (`:44`); acceptable for a platform admin | no | yes | no | Does not check `is_active` |
| `app/api/ai/product-copy/route.ts` | POST | `verifyAccessToken` `:25` | n/a (no tenant) | yes `:12`, `:30` | no | **no** | Billed Anthropic call; any authenticated user, including someone not provisioned in any tenant |
| `app/api/auth/callback/route.ts` | GET | none (OAuth code exchange) `:39` | n/a | no | no (SSR cookie client `:22`) | no | **Open redirect:** `next` goes unvalidated into ``${origin}${next}`` (`:17`, `:20`), so `next=@evil.com` lands on `https://host@evil.com`. Calls `provisionInvitedUserIfNeeded` (`lib/team-provisioning.ts:21`). |
| `app/api/auth/create-user/route.ts` | POST | `verifyAccessToken` `:20` + tenant-admin membership `:56-66` | body `tenantId`, else profile `current_tenant_id` (`:28-49`); then membership-verified | no | yes | no | Creates an auth user with `email_confirm: true` |
| `app/api/auth/signup/route.ts` | POST | **none (public by design)** | creates new tenant | no | yes `:38` | **no** | Auto-confirms email (`:44`), so anyone can register any email address. No captcha or rate limit. Client chooses `plan` (allow-listed). Writes the global `user_profiles.role='admin'`. |
| `app/api/chat/push/subscribe/route.ts` | POST | `verifyAccessToken` `:30` | current_tenant_id (unverified) via SR `:44-51` | yes `:18`, `:38` | yes (read) | no | Insert uses the user-token client `:55` (RLS) |
| `app/api/chat/push/unsubscribe/route.ts` | POST | `verifyAccessToken` `:25` | n/a | yes `:16`, `:33` | no (user-token client `:40`) | no | |
| `app/api/chat/unfurl/route.ts` | GET | `verifyAccessToken` `:301` | n/a | no | no | **no** | SSRF-guarded (DNS-pinned private-IP rejection, manual redirects, `lib/chat/ssrf.ts`) |
| `app/api/cron/abandoned-cart-recovery/route.ts` | GET, POST | GET: `requireCronAuth` `:125`; POST: QStash `receiver.verify` `:151` (fails closed when keys are unset `:141-146`) | all tenants (sweep) | no | yes `:36` | n/a | |
| `app/api/cron/auto-follow-up/route.ts` | POST | QStash `receiver.verify` `:36` (fails closed `:27-29`) | `order.tenant_id` from DB | no | yes | n/a | `JSON.parse(body)` `:42` with no schema |
| `app/api/cron/auto-no-response/route.ts` | GET | CRON_SECRET `:25-37`; **`x-vercel-cron: 1` header is accepted instead of the secret** `:33` | all tenants | no | yes, raw `createClient` `:43` with key `SERVICE_ROLE_KEY \|\| ANON_KEY` `:7` | n/a | **Fails open:** anyone who sends the spoofable `x-vercel-cron` header runs it. Not listed in `vercel.json`. |
| `app/api/cron/backup/route.ts` | GET | `requireCronAuth` `:99` | all tenants, dumped into one folder | no | yes, raw `createClient` `:106` | n/a | Uploads to the `vault_backups` bucket `:129-130` |
| `app/api/cron/cleanup-deleted-orders/route.ts` | GET | `requireCronAuth` `:22` | all tenants | no | yes `:25` | n/a | |
| `app/api/cron/process-checkouts-manual/route.ts` | GET | `verifyAccessToken` `:32` only | **global queue, all tenants** | no | yes | no | **Any authenticated user** can drain the platform-wide checkout queue and create orders under the service role |
| `app/api/cron/process-checkouts/route.ts` | GET, POST | GET `requireCronAuth` `:138`; POST QStash `:163` | all tenants | no | yes | n/a | |
| `app/api/cron/subscription-renew/route.ts` | GET | `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` `:31` | all tenants | no | yes | n/a | **Fails open when CRON_SECRET is unset:** the header `Authorization: Bearer undefined` passes. It charges wallets (`charge_wallet_atomic` `:107`) and suspends tenants. |
| `app/api/cron/trial-suspend/route.ts` | GET | same pattern `:18` | all tenants | no | yes | n/a | **Same "Bearer undefined" fail-open**; suspends tenants |
| `app/api/cron/waseet-sync/route.ts` | GET | `if (cronSecret && ...)` `:22-29`, plus the `x-vercel-cron` header bypass `:25` | all enabled tenants | no | yes `:31` | n/a | **Fully open when CRON_SECRET is unset; spoofable header when it is set** |
| `app/api/customers/[phone]/ai-summary/route.ts` | GET | `requireRequestCaller('member')` `:16` | server (verified) | no | yes `:26` | **no** | Billed Anthropic call (`:110`) |
| `app/api/delivery-import/complete/route.ts` | POST | `requireRequestCaller('tenant-admin')` `:14` | server (verified) | no | yes `:27` | no | |
| `app/api/delivery-import/confirm/route.ts` | POST | `requireRequestCaller('tenant-admin')` `:40` | server (verified) | no (TS cast `:43`) | yes `:53` | no | |
| `app/api/delivery-import/history/route.ts` | GET | `requireRequestCaller('tenant-admin')` `:13` | server (verified) | no | yes `:16` | no | |
| `app/api/delivery-import/match/route.ts` | POST | `requireRequestCaller('tenant-admin')` `:18` | server (verified) | no (cast `:21`) | yes `:52` | no | |
| `app/api/delivery-import/parse/route.ts` | POST | `requireRequestCaller('tenant-admin')` `:17` | server (verified) | no (formData `:21`) | no | no | |
| `app/api/delivery-import/rollback/route.ts` | POST | `requireRequestCaller('tenant-admin')` `:17` | server (verified) | no (cast `:20`) | yes `:25` | no | |
| `app/api/domains/verify/route.ts` | POST | **NONE — NO-AUTH?** | **client-supplied `domain_id`** `:8` | no | **yes** `:7` | no | **NO-AUTH?** An unauthenticated caller can read any tenant's `tenant_domains` row by id and flip it to `verified: true` (`:40-46`) if its CNAME contains "vercel" or "scheniders.com" |
| `app/api/generate-batch-pdf/route.ts` | POST | `verifyAccessToken` `:39` | n/a | no | no | **no** | **Any authenticated user's arbitrary HTML goes into headless Chromium `page.setContent`** (`:75`) with no request interception. Server-side SSRF and resource exhaustion. |
| `app/api/lightfunnels/sync/route.ts` | GET, POST | `requireRequestCaller('platform-admin')` `:27`, `:181` | platform | no | via `lib/lightfunnels-api.ts` | no | Body `accessToken` can override the saved token `:34` |
| `app/api/orders/analyze-image/route.ts` | POST | `verifyAccessToken` `:24` | n/a | no | no (rate-limit RPC uses SR) | **yes:** `consumeRateLimit` `:31` (Postgres; fails open on limiter error) | |
| `app/api/orders/delete/route.ts` | POST | `verifyAccessToken` `:32` + `resolveActiveTenant` `:48` | server (verified) | yes `:65` | yes `:43` | no | Role check uses the **global** `user_profiles.role` (`:57`), not `memberRole` |
| `app/api/payslip-pdf/route.ts` | POST | `verifyAccessToken` `:32` | n/a | no (cast) | no | no | HTML is built server-side with `esc()` (`lib/payslip-html.ts:75`). Any authenticated user can render a PDF with any payroll data. |
| `app/api/settings/auto-send/route.ts` | GET, PUT | `requireRequestCaller` `'member'` `:17` / `'tenant-admin'` `:43` | server (verified) | no | yes | no | |
| `app/api/settings/order-pipeline/route.ts` | GET, PUT | local `resolveCaller` `:19` → `verifyAccessToken` `:23` | **current_tenant_id (unverified)** `:27-34` | yes (PUT `:72`) | yes | no | PUT checks `isAdminRole` on the **global** role `:67`. Every self-signup is globally `admin`. |
| `app/api/settings/staff-alert/route.ts` | GET, PUT, POST, DELETE | local `resolveTenant` `:15` → `verifyAccessToken` `:21` | **current_tenant_id (unverified)** `:25-35` | no | yes | no | **No role check:** viewers and employees can change the staff-alert phone list (PUT `:78`, POST `:119`, DELETE `:148`) |
| `app/api/store-config-v2/patch/route.ts` | POST | SSR cookie `supabase.auth.getUser()` `:168` | **body `tenant_id`** `:32`, `:141`; enforced in the DB by the `apply_store_config_v2_patch` SECURITY DEFINER membership check (42501) | yes `:31`, `:136` | no (user client) | no | |
| `app/api/store-config-v2/seed/route.ts` | POST | SSR cookie `getUser()` `:85` | **body `tenant_id`** `:32`, `:69`; enforced by the `seed_store_config_v2_draft` RPC | yes `:31`, `:64` | no | no | |
| `app/api/team/invite/route.ts` | POST, DELETE | `verifyAccessToken` `:18`, `:117` + membership `role==='admin'` `:41-50` / `:133-140` | body `tenantId` or profile (`:37`), then membership-verified | no | yes | no | |
| `app/api/team/link-google/start/route.ts` | POST | `verifyAccessToken` `:18` + admin membership `:32-37` | current_tenant_id + membership | no | yes | no | **A tenant admin can mint a login link for ANY member, including other admins** (consumed by `link-google/claim`). This allows impersonation or account takeover inside a tenant. |
| `app/api/telegram/webhook/route.ts` | POST | `x-telegram-bot-api-secret-token` compared **only `if (expected)`** `:79-85` | tenant from DB `telegram_links` | no | yes | no | **Fails open when TELEGRAM_WEBHOOK_SECRET is unset:** forged updates can create orders for any linked tenant (`createOrderForTenant` `:290`). Uses a non-constant-time compare. |
| `app/api/waseet/cities/route.ts` | GET | `verifyAccessToken` `:19` | n/a (global Waseet account) | no | no | no | |
| `app/api/waseet/city-mappings/route.ts` | GET, POST | `verifyAccessToken` `:19`, `:52` | **none — global table** | no | yes `:24`, `:64` | no | **Any authenticated user (any tenant) can overwrite the global `waseet_city_mappings`** (`:86-88`) |
| `app/api/waseet/invoice-orders/route.ts` | GET | `verifyAccessToken` `:18` | none | no | no | no | Any user can read the platform Waseet account's invoice orders (query `invoice_id` `:23`) |
| `app/api/waseet/invoices/route.ts` | GET | `verifyAccessToken` `:18` | none | no | no | no | Any user can read the platform-wide merchant invoices |
| `app/api/waseet/package-sizes/route.ts` | GET | `verifyAccessToken` `:18` | none | no | yes `:30` | no | Writes global `app_settings` |
| `app/api/waseet/receive-invoice/route.ts` | POST | `verifyAccessToken` `:19` | none | no | no | no | **Any user can mark platform Waseet invoices as received** (mutating, financial) |
| `app/api/waseet/regions/route.ts` | GET | `verifyAccessToken` `:19` | n/a | no | no | no | |
| `app/api/waseet/statuses/route.ts` | GET | `verifyAccessToken` `:19` | none | no | yes `:31` | no | Writes global `app_settings` |
| `app/api/waseet/submit-orders/route.ts` | POST | `verifyAccessToken` `:36` | **current_tenant_id (unverified)** `:57-79`; orders filtered by that tenant `:98` | yes `:42` | yes `:56` | no | Role is the **global** role `:68`; `is_active` is checked |
| `app/api/webhooks/interakt/[tenantId]/route.ts` | POST | `verifyWebhookAuth` + `enforceWebhookAuth` `:115`; mode defaults to **`monitor`** (`lib/webhook-auth.ts:173`) | **URL path `tenantId`** `:73` | no | yes | no | **In monitor mode (the default) requests with no credentials are ACCEPTED** (`lib/webhook-auth.ts:196-197`, `:226-228`). Anyone can then update order status or delivery receipts for any tenant id. |
| `app/api/webhooks/interakt/route.ts` | POST, GET | POST: shared secret header `!==` `:330` (fails closed when unset `:320-326`); GET: none (static JSON `:494`) | orders looked up by id across tenants `:234` | no (`any` + eslint-disable) | yes | no | Logs the full payload (customer PII); non-constant-time compare |
| `app/api/webhooks/interakt/send/route.ts` | POST | `verifyAccessToken` `:38`; order read via the user-token client (RLS) `:59` | from RLS-visible order | no | yes (logs and history writes) | no | |
| `app/api/webhooks/lightfunnels/route.ts` | POST, GET | `enforceWebhookAuth` `:54`, default **monitor** mode; GET none (static `:255`) | env `LIGHTFUNNELS_TENANT_ID` `:159` | no | yes | no | **Unauthenticated order creation is accepted in the default monitor mode** |
| `app/link-google/claim/route.ts` | GET | single-use token in the query string (`:13`, DB lookup `:22-30`) | from the token row | no | yes `:19` | no | Mints a magic-link session for the target user via `auth.admin.generateLink` (`:41-47`). The single-use check and the "used" update are not atomic (`:28`, `:51-54`). |

**NO-AUTH? (any caller on the internet):**
- `app/api/domains/verify/route.ts`
- `app/api/telegram/webhook/route.ts` (when `TELEGRAM_WEBHOOK_SECRET` is unset)
- `app/api/webhooks/lightfunnels/route.ts` (POST, monitor mode)
- `app/api/webhooks/interakt/[tenantId]/route.ts` (POST, monitor mode)
- `app/api/cron/waseet-sync/route.ts` (CRON_SECRET unset, or the `x-vercel-cron` header)
- `app/api/cron/auto-no-response/route.ts` (the `x-vercel-cron` header)
- `app/api/cron/subscription-renew/route.ts` and `app/api/cron/trial-suspend/route.ts` (CRON_SECRET unset → `Bearer undefined`)

**Public by design:**
- `app/api/auth/signup/route.ts`
- `app/api/auth/callback/route.ts`
- `app/link-google/claim/route.ts`
- GET `app/api/webhooks/interakt/route.ts`
- GET `app/api/webhooks/lightfunnels/route.ts`

**Zod-validated routes (8):**
- `ai/product-copy`
- `chat/push/subscribe`
- `chat/push/unsubscribe`
- `orders/delete`
- `settings/order-pipeline` (PUT)
- `store-config-v2/patch`
- `store-config-v2/seed`
- `waseet/submit-orders`

**Rate-limited (1):** `orders/analyze-image`.

---

## 3. Server actions (`"use server"`): 6 files, 15 actions

A guard test exists at `lib/auth/server-actions-guarded.test.ts`.

| File | Action | Auth check (file:line) | Tenant source |
|---|---|---|---|
| `app/actions/billing.ts` | `changePlanAction(tenantId, newPlan, accessToken?)` `:12` | `requireTenantAdminFor` `:18` | argument, membership-verified |
| `app/actions/deleted-orders.ts` | `getDeletedOrders()` `:6` | **none explicit.** Uses the cookie SSR client `createSupabaseServerClient` `:7`, so only RLS applies. There is no tenant filter, so a multi-tenant user gets every tenant's trash. | RLS only |
| `app/actions/deleted-orders.ts` | `restoreDeletedOrder(orderId)` `:24` | **none explicit** (RLS only) `:25`. No role check, so a viewer can restore if RLS allows the update. | RLS only |
| `app/actions/deleted-orders.ts` | `restoreDeletedOrders(orderIds)` `:53` | **none explicit** (RLS only) `:56` | RLS only |
| `app/actions/orders.ts` | `checkOrderLimitsAction` `:49` | `resolveCaller` → `verifyAccessToken` + `resolveActiveTenant` `:52` (helper `:28-43`) | verified |
| `app/actions/orders.ts` | `createOrderAction` `:61` | `resolveCaller` `:65`, role gate on the **global** role `:69` | verified |
| `app/actions/orders.ts` | `splitOrderAction` `:80` | `resolveCaller` `:86` + global role; SR RPC `split_order_atomic` `:116` | verified |
| `app/actions/orders.ts` | `checkOrderIdExists` `:139` | `resolveCaller` `:147`; global SR query across all tenants `:150-163` (an existence oracle by design) | — |
| `app/actions/orders.ts` | `unsplitOrderAction` `:177` | `resolveCaller` `:181` + global role; SR RPC `:190` | verified |
| `app/actions/permissions.ts` | `toggleRolePermissionAction` `:17` | `requirePlatformAdmin` `:23` | platform |
| `app/actions/permissions.ts` | `toggleUserOverrideAction` `:51` | `requireAdminOverUser` `:57` | shared tenant |
| `app/actions/telegram-link.ts` | `getTelegramLinkStatusAction` `:44` | `requireTenantAdminFor` `:49` | argument, verified |
| `app/actions/telegram-link.ts` | `generateTelegramLinkCodeAction` `:81` | `requireTenantAdminFor` `:87` | argument, verified |
| `app/actions/telegram-link.ts` | `unlinkTelegramAction` `:133` | `requireTenantAdminFor` `:138` | argument, verified |
| `app/actions/wallet.ts` | `topUpWalletAction` `:11` | `requirePlatformAdmin` `:22` | argument (platform admin) |

Every service-role action has an explicit check. `deleted-orders.ts` is the only file with no check, and it does not use the service role.

---

## 4. `middleware.ts`

- `middleware.ts:19` `export async function middleware(request)` builds an `@supabase/ssr` `createServerClient` with the anon key (`:21-37`). It calls `await supabase.auth.getUser()` (`:41`) **only to refresh and rotate the session cookie**. The comment at `:39-40` says not to branch on the result, and the code never redirects or gates.
- Matcher `:46-52`: `'/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'`. It runs on page navigations and **excludes every `/api` route**, so each route must authenticate itself.
- No tenant resolution, role check or redirect happens in middleware. Route protection is client-side only (§1a); the comment at `:15-17` confirms this.

---

## 5. Supabase client creation

| # | Factory | Defined at | Key / auth | Used by |
|---|---|---|---|---|
| 1 | `supabase` singleton via `createBrowserClient` | `lib/supabase.ts:67` | anon + cookie session | imported by **257** files (`@/lib/supabase`) |
| 2 | `createSupabaseServerClient()` (`@supabase/ssr` cookie client) | `lib/supabase-server.ts:15` | anon + cookies | called in 2 files: `app/actions/deleted-orders.ts`, plus the definition |
| 3 | `createSupabaseServerClientWithToken(token)` | `lib/supabase-server.ts:50` | anon + Bearer JWT | 5 files: `chat/push/subscribe`, `chat/push/unsubscribe`, `webhooks/interakt/send`, `lib/tenant.ts`, plus the definition |
| 4 | `createSupabaseServiceClient()` (**service role**) | `lib/supabase-server.ts:72` | SERVICE_ROLE | **54 files**, 89 call sites (listed below) |
| 5 | Inline `createServerClient` (cookie, anon) copies | `middleware.ts:21`; `app/api/auth/callback/route.ts:22`; `app/api/store-config-v2/patch/route.ts:111`; `app/api/store-config-v2/seed/route.ts:40`; `app/store/edit/page.tsx:66`; `app/store/onboarding/page.tsx:27` | anon + cookies | 6 duplicate inline factories |
| 6 | Raw `createClient(url, SERVICE_ROLE_KEY \|\| ANON_KEY)` | `lib/whatsapp-error-handler.ts:5-8` (module-level) | service role, **silently falls back to anon** | imported by 3 files (`cron/auto-follow-up`, `webhooks/interakt/send`, `lib/whatsapp-dispatcher.ts`) |
| 7 | Raw `createClient` service role in routes | `app/api/cron/auto-no-response/route.ts:43` (same anon fallback `:7`); `app/api/cron/backup/route.ts:106` | service role | 2 routes |

**Also present:**
- `verifyAccessToken` (`lib/supabase-server.ts:92`) builds a type-3 client per call. It logs the token prefix and user id on every call (`:94`, `:105`).
- Out-of-app scratch: `test-verify.ts:11` and 29 files in `scripts/*.ts` call `createClient` directly.

**No `import "server-only"` guard anywhere.** `lib/supabase-server.ts`, `lib/order-service.ts`, `lib/webhook-handler.ts` and `lib/lightfunnels-api.ts` rely on comments only. No client component imports `@/lib/supabase-server` (checked).

**Files calling `createSupabaseServiceClient()` (54):**
- `app/actions/`: billing, orders, permissions, telegram-link, wallet
- `app/api/`:
  - admin/access-requests
  - auth/create-user, auth/signup
  - chat/push/subscribe
  - cron/abandoned-cart-recovery, cron/auto-follow-up, cron/cleanup-deleted-orders, cron/process-checkouts-manual, cron/process-checkouts, cron/subscription-renew, cron/trial-suspend, cron/waseet-sync
  - customers/[phone]/ai-summary
  - delivery-import/complete, delivery-import/confirm, delivery-import/history, delivery-import/match, delivery-import/rollback
  - domains/verify
  - orders/delete
  - settings/auto-send, settings/order-pipeline, settings/staff-alert
  - team/invite, team/link-google/start
  - telegram/webhook
  - waseet/city-mappings, waseet/package-sizes, waseet/statuses, waseet/submit-orders
  - webhooks/interakt/[tenantId], webhooks/interakt, webhooks/interakt/send, webhooks/lightfunnels
- `app/link-google/claim`
- `lib/`:
  - auth/require-action-caller, auth/resolve-active-tenant
  - lightfunnels-api, order-service, rate-limit, restrictions, staff-alerts, supabase-server, team-provisioning, tenant, waseet-api, webhook-handler, whatsapp-delivery-receipts, whatsapp-dispatcher

---

## 6. Auth helpers

| Helper | Defined (file:line) | Behavior | Files calling (excl. tests) |
|---|---|---|---|
| `verifyAccessToken(token)` | `lib/supabase-server.ts:92` | `auth.getUser()` with the bearer token. **Identity only, no tenant or role.** | 29 files (30 call sites) |
| `requireRequestCaller(req, 'member'\|'tenant-admin'\|'platform-admin')` | `lib/auth/require-request-caller.ts:23` | bearer → `verifyAccessToken` → `resolveActiveTenant` → role | 10 files (11 call sites) |
| `resolveActiveTenant(userId)` | `lib/auth/resolve-active-tenant.ts:23` | `current_tenant_id` + active membership + `is_active` | 4 files (`require-request-caller.ts`, `app/actions/orders.ts`, `app/api/orders/delete/route.ts`, and the definition) |
| `requireVerifiedCaller(token)` | `lib/auth/require-action-caller.ts:27` | identity | internal to `require-action-caller.ts` (4 internal uses) |
| `requireTenantAdminFor(token, tenantId)` | `lib/auth/require-action-caller.ts:68` | membership + admin for the **argument** tenant | 2 caller files (`billing.ts`, `telegram-link.ts`), 4 call sites |
| `requireTenantMemberFor(token, tenantId)` | `lib/auth/require-action-caller.ts:86` | membership | **0 callers** (defined only) |
| `requirePlatformAdmin(token)` | `lib/auth/require-action-caller.ts:102` | `role = super_admin` | 2 files (`permissions.ts`, `wallet.ts`) |
| `requireAdminOverUser(token, userId)` | `lib/auth/require-action-caller.ts:116` | caller administers a tenant the target belongs to | 1 file (`permissions.ts`) |
| `requireCronAuth(req)` | `lib/cron-auth.ts:27` | Bearer CRON_SECRET, **fails closed** | 4 routes (`abandoned-cart-recovery`, `backup`, `cleanup-deleted-orders`, `process-checkouts`) |
| `verifyWebhookAuth` / `enforceWebhookAuth` / `resolveWebhookAuthMode` | `lib/webhook-auth.ts:119` / `:191` / `:169` | HMAC, header or `?token=`; mode defaults to `monitor` (accepts unauthenticated) | 2 routes (`webhooks/lightfunnels`, `webhooks/interakt/[tenantId]`) |
| `constantTimeEqual` | `lib/webhook-auth.ts:79` | | `webhook-auth.ts` only |
| Ad-hoc local helpers | `requireSuperAdmin` `app/api/admin/access-requests/route.ts:9`; `resolveCaller` `app/api/settings/order-pipeline/route.ts:19`; `resolveTenant` `app/api/settings/staff-alert/route.ts:15`; `resolveCaller` `app/actions/orders.ts:28` | | 1 each |
| Inline hand-rolled cron checks | `cron/auto-no-response:25-37`, `cron/subscription-renew:31`, `cron/trial-suspend:18`, `cron/waseet-sync:22-29` | 3 of the 4 are fail-open | 4 |
| Inline QStash `Receiver.verify` | `cron/abandoned-cart-recovery:151`, `cron/auto-follow-up:36`, `cron/process-checkouts:163` | fails closed | 3 |
| Client-side guards | `PageGuard` `components/auth/role-guard.tsx:58`; `RoleGuard` same file `:20`; `RoleProvider` `components/providers/role-provider.tsx:32`; `useAuth` `components/auth/auth-provider.tsx` | UI only | — |
| Static permission helpers | `hasRole`, `hasPermission`, `isAdminRole`, `isPlatformAdminRole` in `lib/permissions.ts` | | — |

---

## 7. Realtime subscriptions (15 `.channel()` sites)

| File:line | Channel name | Type | Table / event | Filter | Tenant-filtered? |
|---|---|---|---|---|---|
| `app/returns/scan/page.tsx:29` | `returns:${token}` | broadcast (`ack`) + presence, **not private** | — | — | No. The topic token is the only secret, and anyone holding the anon key plus the token can join. |
| `hooks/use-returns-session.ts:71` | `returns:${token}` | broadcast (`scan`) + presence, **not private** | — | — | No (same as above). It does a lookup per scan (RLS). |
| `components/providers/global-activity-provider.tsx:20` | `global-activity-stream:${instanceId}` | postgres_changes | `activity_logs` INSERT | **none** | **No** (RLS only). Payload typed `any` `:28`. |
| `components/team/hooks/use-team-realtime.ts:82` | `team-activity-realtime:${instanceId}` | postgres_changes | `activity_logs` INSERT | **none** | **No** (RLS only) |
| `hooks/use-notification-feed.ts:234` | `notifications:${userId}:${instanceId}` | postgres_changes | `notifications` `*` | **none** | No (RLS only, per comment) |
| `hooks/chat/use-mention-notifications.ts:70` | `chat_mentions:${user.id}:${instanceId}` | postgres_changes | `notifications` `*` | **none** | No (RLS only) |
| `hooks/use-inventory-qc.ts:79` | `qc_quarantine_changes_${tenantId}_…` | postgres_changes ×3 | `qc_quarantine` INSERT `:81`, UPDATE `:103`, DELETE `:112` | `tenant_id=eq.${tenantId}` `:76` | **Yes** (tenantId from client state) |
| `hooks/use-realtime-query.ts:141` (via `hooks/use-order-realtime.ts:40`) | `${table}_changes_${id}` (here `orders_changes_…`) | postgres_changes | `orders` `*` | `is_archived=eq.false` | **No tenant filter** (RLS only) |
| `hooks/use-expenses.ts:186` | `expenses-changes-<random>` | postgres_changes | `expenses` `*` | **none** | **No** (RLS only) |
| `hooks/use-announcements.ts:82` | `announcements-changes:${instanceId}` | postgres_changes | `announcements` `*` | **none** | **No** (RLS only) |
| `hooks/use-presence.ts:52` | `presence:${topic}` (topic = orderId, from `components/orders/presence-avatar-group.tsx:14`, `components/chat/order-thread-card.tsx:87`) | presence, **not private** | — | — | No. Order UUID as topic. |
| `hooks/chat/use-messages.ts:159` | `chat:conv:${conversationId}` | broadcast `message:new`, **private: true** | — | — | Realtime authorization (private) |
| `hooks/chat/use-typing-indicator.ts:24` | `chat:conv:${id}:typing` | broadcast `typing`, private | — | — | private |
| `hooks/chat/use-unread-inbox.ts:26` | `chat:user:${userId}` | broadcast `inbox:new`, private | — | — | private |
| `hooks/chat/use-tenant-presence.ts:57` | `chat:tenant:${tenantId}:presence` | presence, private | — | — | private, topic includes the tenant |

Topic builders: `lib/chat/topics.ts:3`, `:9`, `:10`, `:11`. Only `use-inventory-qc` filters on `tenant_id`. Every other postgres_changes stream relies entirely on RLS for realtime.

---

## 8. Storage (`.storage.from(...)`): 38 call sites, 9 buckets

| File:line | Bucket | Operation | Path |
|---|---|---|---|
| `app/api/cron/backup/route.ts:129-130` | `vault_backups` | upload (SR) | `auto_csv_${timestamp}/…`. **All tenants in one folder.** |
| `lib/vault-utils.ts:334-335` | `vault_backups` | upload | `sync_${timestamp}.scheniders` (no tenant prefix) |
| `lib/vault-utils.ts:351` | `vault_backups` | list `''` (bucket root) | — |
| `lib/vault-utils.ts:364` | `vault_backups` | download | user-supplied filename |
| `components/store-onboarding/onboarding-wizard.tsx:670-671` | `tenant-assets` | upload (upsert) | `${tenantId}/onboarding-logo-…` |
| `components/store-onboarding/onboarding-wizard.tsx:676` | `tenant-assets` | getPublicUrl | |
| `components/settings/business-settings.tsx:139` | `tenant-assets` | upload (upsert) | `${tenantId}/logo-…` |
| `components/settings/business-settings.tsx:147` | `tenant-assets` | getPublicUrl | |
| `components/store-builder-v2/auto-form-fields.tsx:468` | `tenant-assets` | upload (upsert) | `${tenantId}/section-…` |
| `components/store-builder-v2/auto-form-fields.tsx:474` | `tenant-assets` | getPublicUrl | |
| `components/store-builder-v2/brand-kit/controls.tsx:208` | `tenant-assets` | upload (upsert) | `${tenantId}/brand-…` |
| `components/store-builder-v2/brand-kit/controls.tsx:214` | `tenant-assets` | getPublicUrl | |
| `components/chat/composer.tsx:486` | `chat-attachments` | upload | `${tenantId}/${conversationId}/…` |
| `components/chat/composer.tsx:522` | `chat-attachments` | remove | |
| `components/chat/composer.tsx:564` | `chat-attachments` | remove | |
| `components/chat/voice-message.tsx:39-40` | `chat-attachments` | createSignedUrl (3600s) | |
| `components/chat/message-item.tsx:160-161` | `chat-attachments` | createSignedUrl (3600s) | |
| `components/chat/message-item.tsx:311` | `chat-attachments` | createSignedUrl (60s) | |
| `components/settings/team-settings.tsx:253-254` | `avatars` | upload | `${user.id}/${Math.random()}.ext` |
| `components/settings/team-settings.tsx:259-260` | `avatars` | getPublicUrl | |
| `components/products/qc/qc-photo-uploader.tsx:35` | `qc-evidence` | upload | `${qcItemId}/…` (no tenant prefix) |
| `components/products/qc/qc-photo-uploader.tsx:40` | `qc-evidence` | getPublicUrl | Bucket is private per the storage lockdown migration, so the public URL will not resolve |
| `components/products/editor/digital-fields-section.tsx:31-32` | `product-images` | upload | `digital/${productId}/…` |
| `components/products/editor/digital-fields-section.tsx:40-41` | `product-images` | getPublicUrl | |
| `components/products/editor/note-cards-tab.tsx:128-129` | `product-images` | upload (upsert) | `note-cards/${productId}/…` |
| `components/products/editor/note-cards-tab.tsx:133-134` | `product-images` | getPublicUrl | |
| `components/products/product-gallery-section.tsx:99-100` | `product-images` | upload | `gallery/${productId}/…` |
| `components/products/product-gallery-section.tsx:111-112` | `product-images` | getPublicUrl | |
| `components/products/product-image-upload.tsx:52-53` | `product-images` | upload | `products/…` |
| `components/products/product-image-upload.tsx:67-68` | `product-images` | getPublicUrl | |
| `hooks/use-products-crud.ts:304-305` | `product-images` | upload | `products/${productId}-…` |
| `hooks/use-products-crud.ts:310-311` | `product-images` | getPublicUrl | |
| `hooks/use-product-images-query.ts:181` | `product-images` | remove | parsed from the URL |
| `hooks/use-payroll.ts:128-129` | `payroll-pdfs` | upload (upsert) | `${payrollId}.pdf` (no tenant prefix) |
| `hooks/use-payroll.ts:134-135` | `payroll-pdfs` | createSignedUrl **315,360,000 s (10 years)** | |
| `hooks/use-voice-notes.ts:37-38` | `customer-voice-notes` | upload | `${phone}/…` (customer phone as folder, no tenant) |
| `hooks/use-voice-notes.ts:42-43` | `customer-voice-notes` | getPublicUrl | Bucket is private, so the public URL will not resolve |

**Code paths that do not match the storage policies** (see `packages/supabase/migrations/20260518000003_storage_lockdown.sql`):
- `product-images` INSERT, UPDATE and DELETE require the first folder to be a tenant UUID the user belongs to (`:148-168`). Every product upload path starts with `products/`, `gallery/`, `digital/` or `note-cards/`, so uploads and deletes fail once that migration is applied.
- `customer-voice-notes` is private and requires a `${tenantId}/` prefix (`:173-203`), but the code uses `${phone}/` and `getPublicUrl`.
- `vault_backups` is limited to `super_admin` (`20261011090000_stage0_security_lockdown.sql:9-18`). `/vault` (`lib/vault-utils.ts`) is open to every role in the UI.

---

## 9. RPC calls (61)

"Tenant arg from client state" means the browser supplies a `_tenant_id`/`p_tenant_id` value. Where marked, the DB function was checked for its own membership guard.

| File:line | RPC | Tenant arg? | Source / notes |
|---|---|---|---|
| `app/actions/orders.ts:116` | `split_order_atomic` | `_tenant_id` | server-verified (SR) |
| `app/actions/orders.ts:190` | `unsplit_order_atomic` | `_tenant_id` | server-verified (SR) |
| `app/customers/[phone]/page.tsx:75` | `get_customer_reliability` | no | browser |
| `app/customers/page.tsx:153` | `get_paginated_customers` | no | browser |
| `app/api/cron/auto-no-response/route.ts:46` | `auto_move_to_no_response` | no | SR, cross-tenant |
| `app/api/cron/subscription-renew/route.ts:107` | `charge_wallet_atomic` | `_tenant_id` | from DB rows (SR) |
| `app/api/store-config-v2/seed/route.ts:90` | `seed_store_config_v2_draft` | `p_tenant_id` | **request body**; DB checks membership |
| `app/api/store-config-v2/patch/route.ts:173` | `apply_store_config_v2_patch` | `p_tenant_id` | **request body**; DB checks membership (`20260606191126_…sql:18-31`) |
| `lib/vault-utils.ts:270` | `get_current_tenant_id` | no | browser |
| `lib/lightfunnels-api.ts:789` | `create_order_atomic` | in `_order_data` | SR |
| `lib/lightfunnels-api.ts:922` | `create_order_atomic` | in `_order_data` | SR |
| `lib/repositories/product-repository.ts:33` | `recompute_inventory` | `p_tenant_id` | **client state** (browser client); DB membership guard present (stage0 lockdown) |
| `lib/repositories/product-repository.ts:44` | `zero_oversold` | `p_tenant_id` | **client state**; DB guard present (stage0) |
| `lib/repositories/order-repository.ts:448` | `search_orders_v2` | no | browser |
| `lib/order-service.ts:69` | `create_order_atomic` | `_tenant_id` | server (SR) |
| `lib/order-service.ts:149` | `increment_usage_tracking` | `_tenant_id` | server (SR) |
| `lib/order-service.ts:158` | `charge_wallet_atomic` | `_tenant_id` | server (SR) |
| `lib/tenant.ts:362` | `charge_wallet_atomic` | `_tenant_id` | server (SR) |
| `lib/webhook-handler.ts:937` | `create_order_atomic` | `_tenant_id ?? null` | server (SR; from env or webhook) |
| `lib/returns/process-return.ts:26` | `process_return` | `_tenant_id` | **client state**; membership guard added in `20260905233505_sec4_membership_guard_process_return.sql` |
| `lib/returns/process-return.ts:38` | `undo_return` | `_tenant_id` | **client state**; guard in `20260905233323_sec4_membership_guard_undo_return.sql` |
| `lib/rate-limit.ts:36` | `consume_rate_limit` | no | SR |
| `components/orders/order-customer-risk-panel.tsx:47` | `get_customer_reliability` | no | browser |
| `components/chat/forward-dialog.tsx:80` | `chat_send_message` | no | browser |
| `hooks/use-order-crud.ts:1419` | `merge_orders_atomic` | `_tenant_id` | **client state**; DB guard present (`20260822130355_…`) |
| `hooks/use-order-crud.ts:1457` | `unmerge_orders_atomic` | `_tenant_id` | **client state**; DB guard present |
| `hooks/use-store-builder-v2.ts:612` | `publish_store_config_v2` | `p_tenant_id` | **client state**; DB guard present |
| `hooks/use-store-builder-v2.ts:1326` | `aggregate_experiment_stats` | `p_tenant_id` | **client state**; DB guard present |
| `hooks/use-notification-feed.ts:142` | `notification_feed` | no | |
| `hooks/use-notification-feed.ts:172` | `notification_unread_count` | no | |
| `hooks/use-notification-feed.ts:375` | `clear_notification_feed` / `mark_notifications_read` (dynamic name) | no | |
| `hooks/use-dashboard-metrics-query.ts:73` | `get_dashboard_metrics` | no | |
| `hooks/use-categories-query.ts:263` | `merge_categories` (cast `as never`) | no | |
| `hooks/use-categories-query.ts:288` | `split_category` (cast `as never`) | no | |
| `hooks/chat/use-conversations.ts:42` | `chat_unread_counts` | no | |
| `hooks/chat/use-conversations.ts:98` | `chat_find_or_create_dm` | no | |
| `hooks/chat/use-conversations.ts:110` | `chat_find_or_create_order_conversation` | no | |
| `hooks/chat/use-conversations.ts:124` | `chat_create_channel` | no | |
| `hooks/chat/use-conversations.ts:141` | `chat_create_group` | no | |
| `hooks/chat/use-conversations.ts:155` | `chat_rename_conversation` | no | |
| `hooks/chat/use-conversations.ts:168` | `chat_archive_conversation` | no | |
| `hooks/chat/use-conversations.ts:184` | `chat_leave_conversation` | no | |
| `hooks/chat/use-conversations.ts:195` | `chat_delete_conversation` | no | |
| `hooks/chat/use-messages.ts:262` | `chat_send_message` | no | |
| `hooks/chat/use-messages.ts:345` | `chat_mark_read` | no | |
| `hooks/chat/use-message-search.ts:14` | `chat_search_messages` | no | |
| `hooks/chat/use-conversation-members.ts:41` | `chat_add_members` | no | |
| `hooks/chat/use-conversation-members.ts:55` | `chat_remove_member` | no | |
| `hooks/chat/use-mention-notifications.ts:39` | `notification_feed` | no | |
| `hooks/chat/use-mention-notifications.ts:99` | `mark_notifications_read` | no | |
| `hooks/chat/use-mention-notifications.ts:105` | `clear_notification_feed` | no | |
| `hooks/chat/use-mark-all-read.ts:10` | `chat_mark_all_read` | no | |
| `hooks/chat/use-order-actions.ts:18` | `chat_assign_order` | no | |
| `hooks/chat/use-order-actions.ts:39` | `chat_set_conversation_resolved` | no | |
| `hooks/use-orders-aggregates.ts:51` | `get_orders_aggregates` | `_tenant_id` (`:37`) | **client state**. No `CREATE FUNCTION` for it was found in `packages/supabase/migrations/`, so its guard could not be verified. |
| `hooks/use-paginated-customers.ts:91` | `get_paginated_customers` | no | |
| `hooks/use-paginated-customers.ts:185` | `get_customer_dashboard_stats` | no | |
| `hooks/use-customer-trust.ts:12` | `get_customer_trust_history` | no | |
| `hooks/use-customer-trust.ts:29` | `get_customer_score_audit_log` | no | |
| `hooks/use-customer-trust.ts:82` | `get_customer_percentile` | no | |
| `hooks/use-order-bulk-operations.ts:361` | `log_shipping_export` | `p_tenant_id` | **client state**; DB checks `p_tenant_id IN get_user_tenant_ids()` (`20260910010000_obs3_shipping_export_log.sql:20`) |

**Client-state tenant arguments (10 sites):**
- `product-repository.ts:33`, `:44`
- `process-return.ts:26`, `:38`
- `use-order-crud.ts:1419`, `:1457`
- `use-store-builder-v2.ts:612`, `:1326`
- `use-orders-aggregates.ts:51`
- `use-order-bulk-operations.ts:361`

All except `get_orders_aggregates` had a DB-side membership guard confirmed. The two routes that take a tenant from the request body (`store-config-v2/patch`, `store-config-v2/seed`) also have DB guards.

---

## 10. Service worker / PWA, web push, team chat

**Serwist / SW**
- `next.config.ts:4-10`: `withSerwistInit({ swSrc: "app/sw.ts", swDest: "public/sw.js", disable: dev, register: false })`.
- `app/sw.ts` (51 lines) runs `installSerwist` with precache, `skipWaiting`, `clientsClaim`, `navigationPreload`. Runtime caching is `NetworkOnly` for `/\.supabase\.co/` and `/\/api\//`, then Serwist `defaultCache`. It purges old `schenider-*` caches on activate. **It has no `push` or `notificationclick` listener.** It also uses `any` + eslint-disable (`:6-7`) and two `@ts-expect-error` (`:40`, `:46`).
- `public/sw.js` (176 lines, **committed to git**, last changed 2026-09-12) is a separate hand-written SW. It handles:
  - cache-first for `/_next/static` and media
  - network-first navigations into `schenider-dynamic-v3`, with `/offline` as fallback
  - a **`push` handler** (`:56-83`) and a **`notificationclick` handler** (`:96-130`)
- **Conflict:** a production build writes the compiled `app/sw.ts` to `public/sw.js`. That overwrites the hand-written worker, so **production loses the push and notificationclick handlers**. Web push would then arrive with no handler. This is an inference from the config; I did not run a build to confirm it.
- Registration happens in two places:
  - `lib/pwa.tsx:11` `registerServiceWorker()` → `/sw.js` (`:18`), called from `components/pwa/pwa-provider.tsx:9`
  - `hooks/chat/use-web-push.ts:114` registers `/sw.js` again
- `components/pwa/dev-service-worker-cleanup.tsx` unregisters SWs in dev.
- `OfflineIndicator` is in `lib/pwa.tsx`. The install banner is commented out (`pwa-provider.tsx:15-16`).

**Offline queueing of orders: none.** `lib/sync-queue.ts` (IndexedDB `SyncQueue` with `CREATE_ORDER`, `UPDATE_ORDER` and `DELETE_ORDER` task types, payload typed `any` `:6`) **has zero importers**. It is dead code. Orders made offline are not queued, and the SW `NetworkOnly`/skip rules mean mutations simply fail while offline. `hooks/use-network-status.ts` only reports status.

**Web push**
- `hooks/chat/use-web-push.ts` (220 lines): reads the VAPID key from `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (`:74`), calls `pushManager.subscribe` (`:119`), then `POST /api/chat/push/subscribe` (`:136`) and `/api/chat/push/unsubscribe` (`:188`).
- `hooks/use-notification-push.ts` (144 lines): preference toggle that writes `notification_prefs` (`:64`, `:79`).
- Server-side sender: `/home/claude/scheniders-mono/supabase/functions/send-order-push/index.ts` (397 lines), a Supabase Edge Function that reads `chat_push_subscriptions` (`:297`) and prunes dead ones (`:367`). No sender exists inside the platform app.

**Team chat**
- Mount point: `components/chat/chat-runtime.tsx` (in the root layout for every page, including the auth pages).
- UI: `components/chat/` has 27 files: chat-avatar, chat-empty-state, chat-runtime, chat-sheet, chat-trigger, composer, conversation-jump, conversation-list, conversation-menu, conversation-settings-dialog, create-channel-dialog, create-group-dialog, emoji-picker, forward-dialog, link-preview, live-presence-stack, message-actions, message-item, message-list, order-action-bar, order-thread-card, pinned-bar, reaction-bar, reference-card, search-panel, voice-message, voice-recorder.
- Hooks: `hooks/chat/` has 20 files: use-conversation-members, use-conversations, use-favicon-badge, use-last-seen, use-mark-all-read, use-mention-notifications, use-message-search, use-messages, use-notification-sound, use-order-actions, use-pins, use-reference-search, use-tenant-brand, use-tenant-members, use-tenant-presence, use-typing-indicator, use-unfurl, use-unread-inbox, use-user-status, use-web-push.
- Library: `lib/chat/`: avatar-identity, channel-icons, emoji-data, filter-conversations, fuzzy, markdown, own-echo, parse-references, slash-commands, ssrf, topics, unread (plus tests).
- Key behaviors:
  - All mutations go through `chat_*` RPCs (§9).
  - Live delivery uses **private** broadcast channels per conversation, user inbox, typing and tenant presence (§7).
  - Mentions arrive via unfiltered `notifications` postgres_changes.
  - Attachments use the `chat-attachments` bucket with a `${tenantId}/${conversationId}/` prefix and 60–3600 s signed URLs.
  - Link previews go through the SSRF-guarded `/api/chat/unfurl`.
  - Order threads link chat to orders (`chat_find_or_create_order_conversation`, `chat_assign_order`), and presence per order uses non-private `presence:${orderId}` (`hooks/use-presence.ts:52`).
