# Inventory: apps/storefront + apps/admin (read-only recon, 2026-10-19)

> **Errata (Phase 0 critic round 1):** storefront has **7** route handlers (all under `app/api`), so denominators below that say 6 should read 7. CONTEXT.md §2 is authoritative.

All paths relative to `/home/claude/scheniders-mono/apps/`. Line numbers are from the live tree.

## 0. Counts summary

| Metric | storefront | admin |
|---|---|---|
| page.tsx | 20 | 16 |
| route.ts | 7 (6 API + 0 other; robots.ts is a metadata route) | 57 |
| layout.tsx | 3 | 3 |
| error.tsx | 1 (root only) | 1 (`(dashboard)` only) |
| loading.tsx | **0** | 6 |
| not-found.tsx | 2 | **0** |
| global-error.tsx | **0** | **0** |
| `'use server'` files | 1 (`app/actions/checkout.ts`) | **0** |
| middleware/proxy | `proxy.ts` (Next 16 name) | `middleware.ts` (old Next ≤15 name, still honored by 16) |
| Service-role client calls | 10 call sites (7 in API/action + 2 in lib/tenant.ts preview + factory) | 79 `createAdminClient()` call sites (every API route) |
| Anon/SSR clients | `createSupabaseServerClient` x1 (reviews GET), `createSupabasePublicClient` x3 (tenant.ts x2, queries.ts x1), ad-hoc anon `createClient` x1 (orders/lookup) | SSR `createServerClient` x3 (middleware, api-auth, auth/callback); browser client x4 |
| API routes with Zod | 6/6 | 16/57 |
| API routes with route-level auth | 0/6 (public by design) | 44/57 (13 rely on middleware only, 1 is the public auth callback) |
| Rate limiting | **none** | **none** (only an upstream 429 detector in leads/analyze-profile) |
| Sentry | **absent** (no sentry.*.config, no instrumentation.ts, no withSentryConfig, no dep) | **absent** (same) |
| unstable_cache usage | 13 cache keys (lib/tenant.ts x2, lib/queries.ts x11) | 0 |
| RPC call sites | 5 (create_order_atomic x1, adjust_customer_points x3, lookup_order x1) | 3 (increment_wallet_balance x1 — does not exist; get_seed_automation_status; toggle_seed_automation) |
| Storage call sites | 2 (`review-photos` upload + getPublicUrl) | 0 |

---

# A. STOREFRONT (`apps/storefront`)

## A1. Pages (all are Server Components; no page.tsx has `"use client"`)

| File | URL route | Notes |
|---|---|---|
| `app/page.tsx` | `/` (apex) | static landing text |
| `app/%5Fpreview/[tenant]/[page_id]/page.tsx` | `/_preview/[tenant]/[page_id]` | `dynamic="force-dynamic"` (:510); HMAC token gate (:306-326); service-role tenant read |
| `app/s/[tenant]/page.tsx` | `/s/[tenant]` (home) | `?preview_template=` override (:71) — unauthenticated template preview |
| `app/s/[tenant]/[...rest]/page.tsx` | `/s/[tenant]/*` catch-all | redirect rules then 404 |
| `app/s/[tenant]/about/page.tsx` | `/s/[tenant]/about` | |
| `app/s/[tenant]/cart/page.tsx` | `/s/[tenant]/cart` | |
| `app/s/[tenant]/categories/[slug]/page.tsx` | `/s/[tenant]/categories/[slug]` | |
| `app/s/[tenant]/checkout/page.tsx` | `/s/[tenant]/checkout` | |
| `app/s/[tenant]/checkout/success/page.tsx` | `/s/[tenant]/checkout/success?order=` | only echoes order number, no DB order read |
| `app/s/[tenant]/contact/page.tsx` | `/s/[tenant]/contact` | |
| `app/s/[tenant]/faq/page.tsx` | `/s/[tenant]/faq` | |
| `app/s/[tenant]/p/[slug]/page.tsx` | `/s/[tenant]/p/[slug]` (custom pages) | `dynamic="force-dynamic"` (:97) |
| `app/s/[tenant]/policies/privacy/page.tsx` | `/s/[tenant]/policies/privacy` | |
| `app/s/[tenant]/policies/returns/page.tsx` | `/s/[tenant]/policies/returns` | |
| `app/s/[tenant]/policies/shipping/page.tsx` | `/s/[tenant]/policies/shipping` | |
| `app/s/[tenant]/policies/terms/page.tsx` | `/s/[tenant]/policies/terms` | |
| `app/s/[tenant]/products/page.tsx` | `/s/[tenant]/products` | |
| `app/s/[tenant]/products/[slug]/page.tsx` | `/s/[tenant]/products/[slug]` | |
| `app/s/[tenant]/search/page.tsx` | `/s/[tenant]/search?q=` | |
| `app/s/[tenant]/track/page.tsx` | `/s/[tenant]/track?order=` | |

Every `/s/[tenant]/*` page resolves the tenant itself via `getTenantByCustomDomain` (when param starts `__domain__`) or `getTenantBySlug`, and has `generateMetadata` (except `[...rest]`).

Other app files:
- `app/layout.tsx` — root layout (server)
- `app/%5Fpreview/layout.tsx` — passthrough layout
- `app/s/[tenant]/layout.tsx` — tenant layout; resolves tenant (:28-33), `notFound()` for missing/`cancelled` (:39, :46-48), renders "store unavailable" for `suspended` (:50-63); reads `x-store-base` header (:44)
- `app/error.tsx` — `"use client"`, root error boundary
- `app/not-found.tsx` — root 404
- `app/s/[tenant]/not-found.tsx` — tenant 404
- `app/robots.ts` — robots metadata route

Segments lacking boundaries:
- **No `loading.tsx` anywhere** (every segment).
- **No `global-error.tsx`** (root layout errors are unhandled).
- `app/s/[tenant]/` has **no `error.tsx`** → errors bubble to `app/error.tsx`, which renders outside the tenant chrome/branding.
- `app/%5Fpreview/` has no error.tsx / loading.tsx / not-found.tsx.

## A2. API routes

All storefront API routes are **unauthenticated** (public storefront), take **tenant from the request body/query (`tenant_id`)**, not from host. `proxy.ts:129-134` passes `/api/*` straight through with no tenant resolution. **No rate limiting on any route.**

| Route | Methods | Tenant source | Zod | Client | Tenant liveness check | Notes |
|---|---|---|---|---|---|---|
| `app/api/checkout/orders/route.ts` | POST | body `tenant_id` (:25) | yes (:24-63, `safeParse` :77) | service-role (:130 for experiment events; order via `submitCheckout`) | yes, inside submitCheckout | price/total server-side (see A2.1); idempotency_key forwarded (:52, :101) |
| `app/api/cart/abandoned/route.ts` | POST | body `tenant_id` (:21) | yes (:12-26) | service-role (:49) | **no** | upserts `abandoned_carts` per (tenant, phone) (:53-64); `subtotal_iqd` computed from **client-supplied item prices** (`cartItemsSubtotal(items)` :58, price from body :17) |
| `app/api/exp-event/route.ts` | POST | body `tenant_id` (:13) | yes (:11-18) | service-role (:44) | experiment must exist+running (:63-69) | arm re-derived server-side (:74) |
| `app/api/loyalty/balance/route.ts` | GET | query `tenant_id` (:13) | yes (:12-15) | service-role (:30) | no | returns any phone's points balance — no phone ownership proof |
| `app/api/newsletter/route.ts` | POST | body `tenant_id` (:16) | yes (:15-24) | service-role (:79) | yes, `trial`/`active` only (:83-100) | upsert ignoreDuplicates (:105-110) |
| `app/api/orders/lookup/route.ts` | POST | body `tenant_id` (:8) | yes (:7-11, response :19-25) | ad-hoc **anon** `createClient` (:30-36) | via RPC | `rpc("lookup_order")` (:57); requires order_number + phone; no brute-force throttle |
| `app/api/reviews/route.ts` | GET, POST | query/form `tenant_id` | yes (GET :23-26, POST :60-67) | GET anon SSR (:39); POST service-role (:120) | GET: RLS; POST: **only product∈tenant check (:124-135), no tenant status check** | POST uploads up to 4×5MB photos to `review-photos` bucket with service role (:142-149) before insert; no captcha/limit |

### A2.1 Checkout / order creation — price trust analysis

Two entry points reach the same function `submitCheckout` in `app/actions/checkout.ts`:
1. `POST /api/checkout/orders` (Zod-validated wrapper) — `route.ts:124`.
2. **Direct server-action call** — `app/actions/checkout.ts:1` is `"use server"` and exports `submitCheckout` (:84). It is imported by client components `components/storefront/CheckoutForm.tsx:9,47` and `components/schneiders/checkout-form.tsx:10,91`, so it is a **publicly callable server action endpoint with NO Zod validation** of `SubmitCheckoutPayload` (:28-49). `governorate_code` is cast unchecked (:263 `as GovernorateCode`, :331), `customer_name`/`city`/`address_details`/`notes` unbounded and unvalidated (`.trim()` on a non-string would throw), `tenantId` unvalidated.

Pricing (server-side, from DB — good):
- Products re-fetched with service role scoped by tenant (:159-163); variants likewise (:177-181).
- Unit price = `variant.price ?? product.website_price ?? product.price` (:220, :222); client price only used to detect `price_changed` (:234-237) and is then replaced (:238).
- Quantity bounded 1..100 integer (:228).
- Subtotal from verified items (:253); delivery fee recomputed `computeDeliveryFee` (:261-264); coupon `computeDiscount` against published config (:269-274); bundles (:280-283); loyalty redemption (:291-317); `grandTotal` (:321).
- Order written via `rpc("create_order_atomic", {_order_data, _tenant_id})` (:365-368), service role (:100).

Tenant gating: status must be `active|trial|limited` (:127-133); `limited` + `blocks.new_orders` + unexpired pause refuses (:137-155).

Idempotency:
- `idempotency_key` optional (route.ts:52, 8..100 chars); forwarded into `_order_data.idempotency_key` (checkout.ts:362); dedupe is delegated to the `create_order_atomic` RPC (comment :360-361). Not verified in this inventory that the RPC actually enforces it.
- **Loyalty points are deducted BEFORE the order RPC (:305-311) and earned AFTER (:391-402) with no idempotency guard** → a retried request with the same idempotency key (EC17 flaky-3G case) returns the existing order but deducts redeemed points again and awards earned points again. `adjust_customer_points` called with `_order_id: undefined` for redeem (:310).
- **Loyalty redemption needs only a phone number** (:292-297) — anyone who knows a customer's phone can spend that customer's points as a discount on their own order.
- Refund of points on failed order (:373-381) ignores its own error.
- Abandoned cart "recovered" update (:407-412) and CAPI (:419-435, `catch {}` swallow) are best-effort.

## A3. Server actions

| File | Export | Auth |
|---|---|---|
| `app/actions/checkout.ts:1,84` | `submitCheckout(payload)` | **none** (public by design) — but also **no input validation**; uses service-role client (:100) |

## A4. Proxy / tenant resolution (`proxy.ts`)

- Root domain from `NEXT_PUBLIC_ROOT_DOMAIN || NEXT_PUBLIC_DEV_ROOT_DOMAIN || "localhost:3001"` (:91-94).
- `extractSlug(host)` (:105-121): apex/`www.` → null; `*.root` → subdomain slug; anything else → custom domain.
- Bypass (:129-135): `/_next`, `/api`, and **any path containing `.`** — so on a subdomain/custom domain, a product/page slug containing a dot is NOT rewritten (→ 404).
- Root domain `/s/<slug>/…` → sets `x-store-base: /s/<slug>` (:140-150).
- Subdomain → rewrite to `/s/<slug>/…`; custom domain → `/s/__domain__<host>/…`; sets `x-store-base: ""` (:157-161).
- Sets cookies `sb_vid` (httpOnly, secure in prod) (:15-32), `sb_first` (:39-51, not `secure`), `sb_src` (:73-89, not `secure`).
- **No preview-token handling in proxy.** Preview is gated in the page (`app/%5Fpreview/[tenant]/[page_id]/page.tsx:306-326`): HMAC verify via `verifyPreviewToken` with `PREVIEW_TOKEN_SECRET`, `payload.tenant_id === tenant.id` (:313-314); dev fallback literal `dev-preview-token` only when secret unset AND `NODE_ENV!=="production"` (:318-325). On a subdomain/custom domain host `/_preview/...` gets rewritten to `/s/<tenant>/_preview/...` → hits catch-all → 404 (preview only works on the apex host).
- Custom domain lookup: `tenant_domains` where `domain=… AND verified=true` (`lib/tenant.ts:138-143`), then tenant by id.
- `vercel.json` ALSO rewrites `(?<tenant>[^.]+).scheniders.com/:path*` → `/s/:tenant/:path*` with no exclusions for `/api` or `/_next` — duplicates/conflicts with proxy.ts (risk of `/s/acme/s/acme/...` double prefix or `/api` on subdomains being rewritten into `/s/<tenant>/api/...`; also `www`/`platform` subdomains would match). Needs deployment verification.
- Preview postMessage origin allowlist `lib/preview-origin.ts:26-38` accepts **any `localhost`/`127.0.0.1` origin even in production** (:31-35).

## A5. Supabase client factories (`lib/supabase/server.ts`)

| Factory | Line | Key | Used at |
|---|---|---|---|
| `createSupabaseServerClient()` (SSR, cookies) | :17 | anon | `app/api/reviews/route.ts:39` (1) |
| `createSupabaseServiceClient()` | :48 | **service role** | `app/actions/checkout.ts:100`; `app/api/checkout/orders/route.ts:130`; `app/api/cart/abandoned/route.ts:49`; `app/api/exp-event/route.ts:44`; `app/api/loyalty/balance/route.ts:30`; `app/api/newsletter/route.ts:79`; `app/api/reviews/route.ts:120`; `lib/tenant.ts:179` (`getTenantForPreview`); `lib/tenant.ts:195` (`getTenantByCustomDomainForPreview`) — 9 call sites |
| `createSupabasePublicClient()` (cookie-free anon) | :70 | anon | `lib/tenant.ts:115`, `lib/tenant.ts:137`, `lib/queries.ts:25` (3) |
| ad-hoc `createClient` (anon, untyped) | `app/api/orders/lookup/route.ts:31` | anon | 1 |

`NEXT_PUBLIC_*` env uses `!` non-null assertions (server.ts :21-22, :50-51, :72-73; lookup :32-33) — banned pattern per CLAUDE.md.

## A6. Storage & RPC usages

- Storage: `app/api/reviews/route.ts:142-144` `service.storage.from("review-photos").upload(...)`; `:148` `getPublicUrl` (bucket is public). Path `${tenant_id}/${product_id}/${uuid}.${ext}` (:140).
- RPC: `app/actions/checkout.ts:305` `adjust_customer_points` (redeem); `:365` `create_order_atomic`; `:374` `adjust_customer_points` (refund); `:394` `adjust_customer_points` (earn); `app/api/orders/lookup/route.ts:57` `lookup_order` (anon).

## A7. Sentry

Absent: no `sentry.client.config.*`, `sentry.server.config.*`, `sentry.edge.config.*`, no `instrumentation.ts`, `next.config.ts` has no `withSentryConfig`, `@sentry/nextjs` not in `package.json`. Errors go only to `console.error`.

## A8. Caching

- `lib/tenant.ts:111-123` `getTenantBySlug`: `unstable_cache(..., ["storefront-tenant-slug", slug], {revalidate: 60, tags: ["storefront-tenant", "storefront-tenant-${slug}"]})` — key **tenant-scoped (slug)**. Line ~118 key.
- `lib/tenant.ts:132-157` `getTenantByCustomDomain`: key `["storefront-tenant-domain", domain]` (:152), tags incl. `storefront-tenant-domain-${domain}` — **tenant-scoped (domain)**.
- `lib/queries.ts:20-29` `publicCache(keyParts)` → key `["storefront-catalog", ...keyParts]`, revalidate 60, tag `["storefront-catalog"]` only (one global tag → any on-demand revalidation would flush every tenant; nothing calls `revalidateTag` today, so merchant publishes are visible only after ≤60s).
  - `listProducts` :87 key `[listProducts, tenantId, JSON(opts)]` — tenant-scoped
  - `getProductBySlug` :131 `[getProductBySlug, tenantId, slugOrId]` — tenant-scoped
  - `listApprovedReviews` :180 `[listApprovedReviews, tenantId, productId]` — tenant-scoped
  - `getProductImages` :198 `[getProductImages, productId]` — NOT tenant in key, and query (:199-204) has no tenant filter; safe only because product ids are global UUIDs and RLS is anon
  - `getProductVariants` :211 `[getProductVariants, productId]` — same as above (:212-215)
  - `listCategories` :221 `[listCategories, tenantId]`
  - `listCategoryProductIds` :253 `[…, tenantId]`
  - `getMaxDiscountPercent` :294 `[…, tenantId]`
  - `getTenantPublicStats` :343 `[…, tenantId]`
  - `getCategoryBySlug` :360 `[…, tenantId, slug]`
  - `listProductsInCategory` :384-385 `[…, tenantId, categoryId, JSON(opts)]`
- Preview resolvers (`lib/tenant.ts` `getTenantForPreview`, `getTenantByCustomDomainForPreview`) use only React `cache` (per-request) — correct, uncached across requests.
- Route segment config: `force-dynamic` on all 6 API routes, preview page (:510), `p/[slug]` (:97). No `export const revalidate`, no `fetch` cache options.
- Note: tenant status gating in `app/s/[tenant]/layout.tsx:46-63` reads the 60s-cached tenant, so a suspension takes up to 60s to show on the storefront (checkout re-checks status live).

---

# B. ADMIN (`apps/admin`)

## B1. Pages — ALL are `"use client"`; no server-side auth in any page/layout. Gating = `middleware.ts` + client hook `hooks/use-admin-auth.ts` (via `components/layout/admin-shell.tsx:48`).

| File | URL |
|---|---|
| `app/(auth)/login/page.tsx` | `/login` |
| `app/(dashboard)/page.tsx` | `/` |
| `app/(dashboard)/activity/page.tsx` | `/activity` |
| `app/(dashboard)/billing/page.tsx` | `/billing` |
| `app/(dashboard)/health/page.tsx` | `/health` |
| `app/(dashboard)/leads/page.tsx` | `/leads` |
| `app/(dashboard)/leads/[id]/page.tsx` | `/leads/[id]` |
| `app/(dashboard)/leads/analytics/page.tsx` | `/leads/analytics` |
| `app/(dashboard)/merchants/page.tsx` | `/merchants` |
| `app/(dashboard)/merchants/[id]/page.tsx` | `/merchants/[id]` |
| `app/(dashboard)/revenue/page.tsx` | `/revenue` |
| `app/(dashboard)/settings/page.tsx` | `/settings` |
| `app/(dashboard)/team/page.tsx` | `/team` |
| `app/(dashboard)/team/[id]/page.tsx` | `/team/[id]` |
| `app/(dashboard)/trials/page.tsx` | `/trials` |
| `app/(dashboard)/usage/page.tsx` | `/usage` |

Layouts: `app/layout.tsx`, `app/(auth)/layout.tsx`, `app/(dashboard)/layout.tsx` (5 lines, no auth).
Error/loading: `app/(dashboard)/error.tsx`; `app/(dashboard)/loading.tsx`; `billing/loading.tsx`; `health/loading.tsx`; `leads/loading.tsx`; `merchants/loading.tsx`; `trials/loading.tsx`.
Lacking: **no root `error.tsx`, no `global-error.tsx`, no `not-found.tsx` anywhere**; `(auth)` has no error/loading; activity, revenue, settings, team, team/[id], usage, leads/[id], leads/analytics, merchants/[id] have no own loading (inherit `(dashboard)/loading.tsx`).

## B2. Middleware (`middleware.ts`)

- Matcher (:96-100) all paths except static/image assets.
- `/api/auth/*` bypasses all checks (:32, :37-39).
- `supabase.auth.getUser()` (:41-43); unauthenticated API → 401 (:49-51), pages → `/login` (:55-57).
- Admin check: `admin_users` row via **anon-key SSR client relying on `admin_users_read_own` RLS** (:64-68); requires `is_active===true` and role ∈ {super_admin, support_staff} (:4, :70-71); else API 403 / page redirect `/login?error=forbidden` (:73-84).
- Middleware enforces **only "is an admin"**, never per-action permissions.

## B3. Auth helpers

- `lib/api-auth.ts:67` `requireAdminFromRequest` — Bearer (:70-79 → `requireAdmin`) or cookie session (`adminFromCookies` :18-51, `getUser()` :45).
- `lib/api-auth.ts:97` `requireAdminPermission(request, action)` → `hasPermission` (`lib/admin-permissions.ts:27`).
- `lib/admin-supabase.ts:71` `requireAdmin(token)` (bearer only) → `resolveAdminRole` (:37) via **service role** read of `admin_users`.
- Permission matrix `lib/admin-permissions.ts:3-25`: super_admin = all 12; support_staff = extend_trial, add_note, send_notification, impersonate, export_data.
- `lib/admin-supabase.ts:9-16` `createAdminClient()` is **untyped** (`createClient(url, key)` without `<Database>`) → column-name bugs (see B6) are not caught by `tsc`.
- `lib/admin-env.ts:25-31` skips Zod validation when URL/service key are empty (build) — returns unvalidated raw values at runtime too if unset.

## B4. API routes (57) — methods, auth, Zod, audit

Legend: MW = middleware-only (any active admin incl. support_staff); RAFR = `requireAdminFromRequest`; RAP(x) = `requireAdminPermission(x)`; RA = `requireAdmin(token)` (bearer-only; any admin role; non-admin → throws → caught → usually 500 not 403).

| Route | Methods | Auth (file:line) | Zod | Mutation / audit notes |
|---|---|---|---|---|
| `app/api/activity/route.ts` | GET | RAFR :6 | no | reads admin_activity_logs |
| `app/api/admin-users/route.ts` | GET, POST, DELETE | RAFR :29/:81/:199; POST/DELETE `role!=="super_admin"` → 403 (:83, :201) | no (manual) | creates auth users (`auth.admin.createUser` :136), resets passwords (`updateUserById` :165), grants admin roles; **no audit log** |
| `app/api/admin/last-actors/route.ts` | POST | RAFR :11 | yes | read |
| `app/api/admin/leads-table-layout/route.ts` | GET, PUT | RAFR :22; RAP(update_settings) :49 | yes | |
| `app/api/admin/watchlist/route.ts` | GET, POST | RAFR :12/:32 | yes (POST) | upsert with `auth.user.id` |
| `app/api/admin/watchlist/[tenantId]/route.ts` | DELETE | **MW only** | no | deletes rows for hard-coded `ADMIN_USER_PLACEHOLDER` `0000…` (:4-5, :18) — never matches real rows (broken), `// TODO` |
| `app/api/auth/callback/route.ts` | GET | **public** (bypassed by MW :37) | no | **open redirect**: `next` param unvalidated, `redirect(`${origin}${next}`)` (:8, :36) — `next=@evil.com` → `https://admin…@evil.com` |
| `app/api/billing/route.ts` | GET | RAP(adjust_balance) :8 | no | read |
| `app/api/billing/topup/route.ts` | POST | **MW only — no permission check** | yes (:5-9) | **wallet top-up callable by support_staff** (bypasses `top_up_wallet`); non-atomic read-modify-write on `wallet` (:27-52) → lost-update race; `tenant_id` only `min(1)`; **no audit log, no actor recorded** |
| `app/api/bulk/route.ts` | POST | RAP(bulk_action) :20 | yes (:6-17), `params` is `record<unknown>` | change_plan/suspend/reactivate/extend_trial/top_up/send_notification. top_up: `rpc("increment_wallet_balance")` (:172) — **RPC does not exist in DB types** → fallback updates table **`wallets` (does not exist; real table is `wallet`)** (:180-191) → every top-up silently fails, then inserts tx with `type:"top_up"` (:199-206) which **violates CHECK (topup,charge,refund,adjustment)**; route still returns `success:true`. Audit inserts use column **`admin_id`** (:246, :267) which **does not exist** → audit silently fails (second insert's error not even checked) |
| `app/api/dashboard/stats/route.ts` | GET | **MW only** | no | cross-tenant aggregates |
| `app/api/dashboard/v2/route.ts` | GET | RAFR :24 | no | |
| `app/api/export/route.ts` | GET | RAP(export_data) :111 | no | cross-tenant export; support_staff allowed |
| `app/api/health/route.ts` | GET | RAFR :6 | no | |
| `app/api/impersonate/route.ts` | POST | RAP(impersonate) :11 | yes (:6-8) | see B6 |
| `app/api/industries/route.ts` | GET, POST | RA :8/:31 | no | |
| `app/api/industries/[id]/route.ts` | PATCH, DELETE | RA :11/:47 | no | |
| `app/api/leads/route.ts` | GET, POST | RA :8/:86 | no | **PostgREST filter injection**: raw `search` interpolated into `.or()` (:51) |
| `app/api/leads/[id]/route.ts` | GET, PATCH, DELETE | RA :11/:98/:164 | no | |
| `app/api/leads/[id]/activities/route.ts` | GET, POST | RA :11/:40 | no | |
| `app/api/leads/[id]/build-store/route.ts` | POST | RA :11 | no | **creates tenant** (:42-43), products (:77), wallet (:81) — any admin role, no audit |
| `app/api/leads/[id]/competitors/route.ts` | GET, POST, DELETE | RA :11/:38/:73 | no | |
| `app/api/leads/[id]/convert/route.ts` | POST | RA :11 | no | **creates/activates tenant** (:37-46, :57-58), wallet (:79), subscription (:89), commissions (:130) — any admin role, no admin audit |
| `app/api/leads/[id]/follow-ups/route.ts` | GET, POST | RA :11/:39 | no | |
| `app/api/leads/[id]/follow-ups/[fid]/route.ts` | PATCH | RA :11 | no | |
| `app/api/leads/analytics/route.ts` | GET | RA :8 | no | |
| `app/api/leads/analyze-profile/route.ts` | POST | RA :161 | no | calls RapidAPI with `RAPIDAPI_KEY` (:21, :65); no local rate limit |
| `app/api/leads/bulk/route.ts` | POST | RA :8 | no | |
| `app/api/leads/duplicates/route.ts` | POST | RA :8 | no | `.ilike` with raw input (:55) |
| `app/api/leads/import/route.ts` | POST | RA :8 | no | |
| `app/api/merchants/route.ts` | GET | RAFR :6 | no | search escaped (:91-96) |
| `app/api/merchants/stats/route.ts` | GET | RAFR :40 | no | **filter injection**: raw `search` in `.or()` (:67) |
| `app/api/merchants/[id]/route.ts` | GET, PATCH | RAFR :21; RAP(change_plan) :110 | yes (:7-15) | status/plan/auto_renew; audit via `logAdminActivity` with **`adminUserId: "system"`** (~:161, :169, :177) — real actor NOT recorded |
| `app/api/merchants/[id]/audit-log/route.ts` | GET | **MW only** | no | reads logs |
| `app/api/merchants/[id]/convert-trial/route.ts` | POST | **MW only — no permission** | yes (:6-9) | sets tenant active (:55-58) + upserts subscription (:62-90); audit `adminUserId: null, adminLabel:"system"` (:92-102) — actor lost |
| `app/api/merchants/[id]/extend-subscription/route.ts` | POST | **MW only — no permission** | yes (:5-7) | extends `subscriptions.current_period_end` + sets active (:49-53) and tenant `status:"active"` (:58-61, error ignored); **no audit** |
| `app/api/merchants/[id]/extend-trial/route.ts` | POST | **MW only** (no `extend_trial` check) | yes | sets `trial_ends_at` and forces `status:"trial"` (:46-51) — can flip an active/suspended/cancelled merchant back to trial; **no audit** |
| `app/api/merchants/[id]/notes/route.ts` | GET, POST | **MW only** | yes (POST :8-12) | mention log uses correct columns (:96-108) |
| `app/api/merchants/[id]/orders/route.ts` | GET | **MW only** | no | reads tenant orders incl. customer_phone (cross-tenant PII) |
| `app/api/merchants/[id]/pause/route.ts` | POST | **MW only — no `suspend_tenant` check** | yes (:6-18) | sets `status:"limited"` + restrictions (:60-65); `paused_by:"system"` (:49); audit `adminUserId:"system"` (:74-79) |
| `app/api/merchants/[id]/unpause/route.ts` | POST | **MW only — no `reactivate_tenant` check** | no | sets `status:"active", restrictions:{}` (:13-18) — reactivates even a suspended/cancelled/trial tenant to active; audit `"system"` (:27-32) |
| `app/api/merchants/[id]/tags/route.ts` | PUT, GET | **MW only** | yes (PUT) | |
| `app/api/outreach-templates/route.ts` | GET, POST | RA :8/:31 | no | |
| `app/api/outreach-templates/[id]/route.ts` | PATCH, DELETE | RA :11/:47 | no | |
| `app/api/revenue/route.ts` | GET | RAFR :8 | no | `dynamic=force-dynamic` |
| `app/api/seed-automation/route.ts` | GET, POST | RAFR :11; RAP(update_settings) :31 | no | `rpc("get_seed_automation_status")` :17, `rpc("toggle_seed_automation")` :38 |
| `app/api/settings/route.ts` | GET, POST | RAFR :6; RAP(update_settings) :29 | no (manual `key`/`value` check :35-41) | arbitrary key upsert into `admin_settings`; no audit |
| `app/api/team/route.ts` | GET | RA :8 | no | |
| `app/api/team/[id]/route.ts` | GET | RA :11 | no | `.or(`created_by.eq.${id},…`)` with path param (:32) |
| `app/api/team/[id]/actions/route.ts` | GET | RA :11 | no | |
| `app/api/team/achievements/route.ts` | GET | RA :8 | no | |
| `app/api/team/commissions/route.ts` | GET, POST | RA :8/:31 | no | any admin (incl. support_staff) can create/activate commission configs; body passed through unvalidated; `created_by` taken from body (:~70) |
| `app/api/team/commissions/calculate/route.ts` | POST | RA :8 | no | |
| `app/api/team/track/route.ts` | POST | RA :8 | no | |
| `app/api/trials/route.ts` | GET | RAFR :6 | no | |
| `app/api/trials/extend/route.ts` | POST | RAP(extend_trial) :12 | yes (:6-10) | no audit |
| `app/api/usage/route.ts` | GET | RAFR :8 | no | `dynamic=force-dynamic` |

Tenant resolution: admin is cross-tenant by design — tenant id always from path param `[id]`/`[tenantId]` or body `tenant_id`/`tenant_ids`, executed with the service-role client.

Routes with no route-level guard (13, rely solely on middleware): `admin/watchlist/[tenantId]` DELETE, `billing/topup` POST, `dashboard/stats` GET, `merchants/[id]/audit-log` GET, `merchants/[id]/convert-trial` POST, `merchants/[id]/extend-subscription` POST, `merchants/[id]/extend-trial` POST, `merchants/[id]/notes` GET/POST, `merchants/[id]/orders` GET, `merchants/[id]/pause` POST, `merchants/[id]/tags` PUT/GET, `merchants/[id]/unpause` POST (+ `auth/callback`, intentionally public). Defense-in-depth is therefore single-layer, and **every billing/subscription/pause mutation among them is reachable by `support_staff`**, contradicting `admin-permissions.ts`.

Bearer-only routes (`requireAdmin(token)`, 31 handlers across leads/*, team/*, industries/*, outreach-templates/*) reject cookie-only callers with 401 even though middleware already validated the cookie (two auth transports in one app).

## B5. Server actions

None (`'use server'` appears nowhere in apps/admin).

## B6. Admin-specific: role verification, impersonation, billing

- Role verification: middleware `admin_users` check (`middleware.ts:64-71`, anon+RLS) → per-route `resolveAdminRole` (`lib/admin-supabase.ts:37-60`, service role) → optional `hasPermission` (`lib/api-auth.ts:97-110`). Pages: client-only `hooks/use-admin-auth.ts:79-90` (cosmetic; real gate is middleware).
- **Impersonation** (`app/api/impersonate/route.ts`): permission `impersonate` (:11, allowed to support_staff). It does NOT mint a session; it only returns `storefront_url` `/storefront/<slug>` (:74) and the UI opens the public storefront (`components/merchants/impersonate-button.tsx:30,50`). Audit: insert into `admin_activity_logs` with column **`admin_id`** (:50-60) — the table has `admin_user_id`, not `admin_id` (migration `packages/supabase/migrations/20260411000000_admin_console_tables.sql:18-26`; types `packages/supabase/src/database.types.ts:216-228`). The insert fails and the error is swallowed as "non-blocking" (:62-65) → **impersonation is effectively NOT audited.**
- Billing/trial/subscription mutation endpoints: `billing/topup` (MW-only, racy, unaudited), `bulk` top_up (broken: missing RPC + wrong table + invalid tx type; audit broken), `bulk` change_plan/suspend/reactivate/extend_trial (audit broken via `admin_id`), `merchants/[id]` PATCH (audited as "system"), `merchants/[id]/convert-trial` (MW-only, audited as system), `merchants/[id]/extend-subscription` (MW-only, unaudited), `merchants/[id]/extend-trial` (MW-only, unaudited), `merchants/[id]/pause` / `unpause` (MW-only, audited as "system"), `trials/extend` (RAP, unaudited), `leads/[id]/convert` + `leads/[id]/build-store` (any admin, create tenants/wallets/subscriptions, unaudited).
- Audit logger `lib/activity-logger.ts:24-50` logs-and-continues on failure (:47-49); ip/user-agent never populated by any caller.
- Migration drift: `admin_label`, `actor_email`, `user_agent` columns exist in generated types but no migration in `packages/supabase/migrations/` adds them (grep found none).

## B7. Supabase client factories & counts

| Factory | Location | Count |
|---|---|---|
| `createAdminClient()` service role, untyped | `lib/admin-supabase.ts:9` | 79 call sites (all 56 non-callback API routes + `lib/activity-logger.ts:35` + `lib/admin-supabase.ts:38`) |
| `createBrowserClient()` (anon, supabase-js) | `lib/admin-supabase.ts:22` | exported |
| `createServerClient` (@supabase/ssr) | `middleware.ts:9`, `lib/api-auth.ts:20`, `app/api/auth/callback/route.ts:12` | 3 |
| `createBrowserClient` (@supabase/ssr) | `lib/admin-fetch.ts:9`, `hooks/use-admin-auth.ts`, `hooks/use-admin-realtime.ts` | 3 |
| bearer-validating anon client | `lib/admin-supabase.ts:73` | 1 |

Realtime (browser, anon+RLS): `hooks/use-admin-realtime.ts:58-62` subscribes to `tenants`, `wallet`, `wallet_transactions`, `subscriptions`, `admin_activity_logs` — works only if RLS grants admins SELECT on those tables (not verified here).

## B8. Storage & RPC

- Storage: none.
- RPC: `app/api/bulk/route.ts:172` `increment_wallet_balance` (**absent from DB types/migrations**); `app/api/seed-automation/route.ts:17` `get_seed_automation_status`; `:38` `toggle_seed_automation`.

## B9. Sentry

Absent (no config files, no instrumentation.ts, `next.config.ts` plain, no `@sentry/nextjs` dependency).

## B10. Caching

None: no `unstable_cache`, `revalidate`, `"use cache"`, or fetch cache options. `force-dynamic` only on `revenue` and `usage` routes. (Route handlers using `request`/cookies are dynamic anyway; `app/api/dashboard/stats/route.ts` `GET()` takes no request argument and reads no request data — in Next 16 a GET handler without dynamic APIs can be statically evaluated at build time; verify it is not served stale/prebuilt.)

---

# C. Most alarming observations (ranked)

1. Admin `billing/topup` POST has no permission check (support_staff can mint wallet credit), non-atomic RMW race, no audit/actor (`app/api/billing/topup/route.ts:11-81`).
2. Impersonation audit insert writes nonexistent column `admin_id` and swallows the error → impersonations are not audited (`app/api/impersonate/route.ts:50-65`). Same broken column in bulk audit (`app/api/bulk/route.ts:246, :267`).
3. Bulk wallet top-up is a silent no-op returning success: missing RPC `increment_wallet_balance` → nonexistent table `wallets` → invalid tx type `top_up` (`app/api/bulk/route.ts:172-206`).
4. 13 admin API handlers rely solely on middleware; billing/subscription/trial/pause/unpause mutations are reachable by support_staff contrary to the permission matrix (`merchants/[id]/{convert-trial,extend-subscription,extend-trial,pause,unpause}`).
5. Audit actor is recorded as "system"/null on merchant status/plan/pause/unpause/convert-trial; extend-subscription, extend-trial, trials/extend, admin-users, settings, leads/convert, leads/build-store write no audit at all.
6. Open redirect in admin `api/auth/callback` via `next` (`:8, :36`).
7. Storefront `submitCheckout` is an exported `'use server'` action callable directly with no Zod validation (`app/actions/checkout.ts:1, 84`); the Zod-validated API route is bypassable.
8. Loyalty: points redeemable by anyone who knows a phone number; redeem/earn not idempotent so retries with the same idempotency key double-deduct / double-award (`app/actions/checkout.ts:291-317, 391-402`).
9. No rate limiting anywhere on public storefront writes (orders, reviews with 20MB photo uploads, abandoned carts, newsletter, order lookup, loyalty balance).
10. `/api/cart/abandoned` accepts any tenant (no liveness check) and any phone → abuse vector for merchant WhatsApp reminder sweep; stores client-priced subtotal.
11. No Sentry in either app; no global-error.tsx in either; storefront has zero loading.tsx and no tenant-level error.tsx; admin has no not-found.
12. Admin `createAdminClient()` is untyped, which is why the column/table name bugs above pass type-check.
13. `vercel.json` host rewrite in storefront duplicates proxy.ts and doesn't exclude `/api`/`/_next`; plus `proxy.ts` skips any path with a `.`.
14. PostgREST `.or()` filter injection from raw search strings in admin (`leads/route.ts:51`, `merchants/stats/route.ts:67`).
15. Preview postMessage allowlist trusts any localhost origin in production (`lib/preview-origin.ts:31-35`); preview route only works on apex host.
