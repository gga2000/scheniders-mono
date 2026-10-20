# Tier B pass 1 — storefront checkout and merchant order operations

Basis: code `origin/main` @ 7eed48becdc39990bbfc38e86c863c576f080bb6 (all `file:line` at that commit; storefront paths relative to `apps/storefront/`, platform to `apps/platform/` unless prefixed). DB `sduvpgqwhxragxtxztur`, SELECT/EXPLAIN on catalog and aggregates, 2026-10-20 13:25–14:10 UTC. No writes, no app endpoint requests. Findings F-040..F-054 are in `../FINDINGS.md`.

## 1. Journey walks

### J1 Storefront: land → browse → PDP → cart → checkout (COD) → success → track → returns policy
1. Host → tenant: `proxy.ts:105-121` → `/s/<key>` rewrite `:157-161`. OK. Paths containing "." skip the rewrite (`:129-135`), so a custom-domain path with a dot is not rewritten (P3 note, not filed).
2. Tenant resolution `lib/tenant.ts:276-294` (slug), `:300-328` (custom domain), anon + 60 s `unstable_cache`: errors cached **F-045**; suspended/limited → 404 **F-047**; pixel tokens redacted `:253-268` but anon table read open **L-40 / F-010**.
3. Layout `app/s/[tenant]/layout.tsx:233-236` sanitised `custom_css` **NEW-P1-03**; `<html lang>` via `HtmlLang` `:238`, no `dir`. OK.
4. Browse/search/category `lib/queries.ts:331-370`: tenant, visibility, status, supply filters. OK. PostgREST `max_rows = 1000` (`packages/supabase/config.toml:18`), largest catalogue 43 (note). Search in memory, no `.or()` interpolation (`queries.ts:486` constant). OK.
5. PDP: children by `product_id` only **F-002** (PR #173); variant cost **F-009**; sold-out gate `packages/sections/src/pdp_add_to_cart.client.tsx:62`. OK.
6. Cart: Zustand persisted per tenant `packages/sections/src/helpers/cart-store.ts:68-105`. OK.
7. Checkout submit V2 `checkout_form.client.tsx:470-611`, key + double-submit guard `:472`. OK. Key lost on reload **F-054**. Legacy path **F-048**.
8. Route `app/api/checkout/orders/route.ts:24-65`: Zod (governorate enum, alt phone normalised `:93-99`); no length caps; no rate limit **F-041**.
9. `submitCheckout`: phone canonical `checkout.ts:137` OK; tenant gate `:147-167` OK; replay lookup `:174-186` OK; prices/variants/tiers/bumps from DB, tenant-scoped `:189-401` OK; no stock check **F-049**; gift `:416-456`, fee `:465`, coupon `:473` (**F-010**), bundles, referral `:493-519` OK; points by phone alone `:538-564` **F-011 / L-13**; RPC `:616-619` **F-040, F-041**; refund on error/replay `:621-658` OK; referral insert `:665-675` OK; abandoned-cart stamp `:686-691` (best-effort, intended); purchase events `:693-714` **F-050**; upsell proof `:718-722` OK.
10. `create_order_atomic` + triggers: tenant guard skipped for service role (intended); idempotency lookup tenant-scoped with `uq_orders_tenant_idempotency` OK; global lock/counter **F-040, F-041**; `inv_apply` **F-001**; trust under wrong tenant **F-018**.
11. Experiment events (`route.ts:129-171`): arm re-derived server-side. OK.
12. Success: V2 echoes sanitised number (`success/page.tsx:61,72-91`; `lib/storefront-runtime.ts:180-185`), recap from sessionStorage. OK. Legacy shows UUID **F-048**.
13. Upsell `app/api/checkout/orders/[id]/upsell/route.ts`: HMAC proof, tenant from proof `:81-87`; window/status re-checked `:89-117`; optimistic version `:326-345`. OK.
14. Track: `order_tracker.client.tsx:221` → `/api/orders/lookup` (`route.ts:60-138`, rate-limited, anon RPC); direct RPC bypass **F-017 correction**; legacy fake tracker **F-048**.
15. Returns policy `app/s/[tenant]/policies/returns/page.tsx:50-80`, config-driven. OK.

### J2 Abandoned cart
Beacon `checkout_form.client.tsx:312` → ingest `app/api/cart/abandoned/route.ts:12-69` (anon, client names/prices) **F-004** → sweeper `cron/abandoned-cart-recovery/route.ts:43-114` (platform Interakt key) **F-004**; one row per phone **F-051** → recovery stamp `checkout.ts:686-691` OK.

### J3 Loyalty
Balance `app/api/loyalty/balance/route.ts:17-42` anon by phone, no limit **F-017(1)**; redeem `checkout.ts:538-564` → `adjust_customer_points` (overdraw raises `insufficient_points`, anon/authenticated guarded) OK; phone-only auth **F-011 / L-13**; earn/reverse via `loyalty_order_changed` OK (F-011 corrected). Loyalty enabled on 0 tenants.

### J4 Reviews
GET `app/api/reviews/route.ts:28-56` anon RLS (approved, live tenants) OK. POST `:77-167`: product/tenant pairing `:124-135` OK; MIME client-declared, 4 × 5 MB exceeds the 4.5 MB body limit (413, note); photos orphaned if insert fails (note); no limit, public bucket before moderation **F-017(3)**.

### J5 Newsletter
V2 `site_footer.client.tsx:118`, `newsletter_inline.client.tsx:69` → `/api/newsletter` (`route.ts:96-172`, liveness check, upsert `(tenant_id, email)`) OK; reward anon-readable **F-010 extension**; legacy popup **F-048(5)**.

### J6 Custom domain / subdomain
`proxy.ts:157` → `layout.tsx:28-33` → `lib/tenant.ts:300-328` (anon `tenant_domains`, `verified = true`, 3/3 live verified) OK; verify route **NEW-P1-32**; error caching **F-045**.

### J7 `_preview`
Token gate `app/%5Fpreview/[tenant]/[page_id]/page.tsx:293-326` (HMAC, tenant match, fail-closed) OK; secret unset **F-046**; draft via service role `lib/tenant.ts:337-351` OK; postMessage origins `lib/preview-origin.ts:26-61` OK.

### J8 Merchant order operations
1. Intake storefront: J1 (**F-040, F-041, F-043**).
2. Intake LightFunnels: monitor mode **NEW-P1-07** (PR #167); queue **F-034, F-035**; `webhook-handler.ts:695-925` squatting **F-042**, unbilled/unpaused **F-043**; retried webhook idempotent via `checkout_id` upsert + `order_id` check (`:762-768`) OK.
3. Intake manual: `hooks/use-orders-query.ts:1132` → `createOrderAction` (`app/actions/orders.ts:61-74`, global role **F-007**) → `lib/order-service.ts:30-116` (billing **F-043**, caller `order_id` **F-040**) → client follow-up date write (`use-order-crud.ts:583-605`) OK; double-click guard client-side only (`:497-503`, minor).
4. Intake image extraction `app/api/orders/analyze-image/route.ts:17-50`: any authenticated user, 60/min per user, no tenant check (cost exposure); key unset **F-046**.
5. Intake Telegram `telegram/webhook/route.ts:290` → `createOrderForTenant` **NEW-P1-08**.
6. Confirm / follow-up: `lib/repositories/order-repository.ts:623-720` version guard OK; conflict retry drops it **F-052**; auto-follow-up **F-037**.
7. Batch print `app/printing/page.tsx` + `lib/enhanced-label-generator.ts` amounts **F-044**; server PDF **NEW-P1-05, F-033**; labels emit `<html lang="ar" dir="rtl">` (`:1238`), print documents outside the app LTR rule (note).
8. Submit to Waseet: manual by design (L-36), not audited.
9. Status sync: Waseet cron unused (L-36), **NEW-P1-14**; delivered status arrives via delivery import.
10. Delivered/returned: delivery import matching tenant-scoped (`match/route.ts:57-63`) OK; confirm **F-053**; pdf-parse `DOMMatrix` crash **L-26** unchanged (`lib/delivery-import/pdf-parser.ts:7`); pre-2026-10-17 NULL-tenant rows **NEW-P1-13**.
11. Returns scan/processing: `process_return` / `undo_return` **F-001**; pairing channel **F-020**.
12. Concurrent staff: version guard on every write path, retry hole **F-052**.
13. Removed staff: **F-008**, **F-006**, **F-007**.

### Roles walked
- Anonymous / attacker: checkout spam and lock denial (F-041); counter poisoning needs a signup (F-040); direct lookup RPC (F-017); abandoned-cart injection (F-004); loyalty by phone (F-011, F-017).
- Customer: F-054, F-049, F-045.
- Owner / staff: F-052, F-053, F-044.
- Other tenant: F-040, F-042, F-001, F-002.

## 2. Corrections to CONTEXT §4 / §5
- §4.1 "adjust_customer_points (earn, AFTER order)" (:150) is wrong: earn is trigger `loyalty_order_changed` on delivered/completed (`checkout.ts:677-681`).
- §4.1 step order now: tenant gate → idempotency replay check (`checkout.ts:174-186`) → prices → redeem (`:538-564`) → RPC (`:616`, not :365) → refund on error/replay (`:621-658`; refund error now logged) → referral insert (`:665-675`, new) → abandoned carts (`:686-691`) → purchase events (`:693-714`) → upsell proof (`:718-722`, new). New `/api/checkout/orders/[id]/upsell` also modifies orders after creation.
- §4.1 "increment_order_usage / notify_order_push called by create_order_atomic?" No; the live body calls neither.
- §4.1 `create_order_atomic` takes a global advisory lock and a global `order_id` counter (F-040, F-041).
- §4.1 legacy-template forms call the server action directly, no key, UUID success URL (F-048).
- §4.1 Track: `/api/orders/lookup` is POST and rate-limited (`route.ts:60-108`), but anon can call the RPC directly.
- §4.2 Manual: server action `createOrderAction` (`use-orders-query.ts:1132`) → `createOrderForTenant` (`order-service.ts:68`, service role) → `create_order_atomic`, plus a client RLS update for dates; billing only on this path (F-043).
- §4.2 LightFunnels: also `lib/lightfunnels-api.ts:800,938` (`importOrder` / `importCheckout`) call `create_order_atomic` directly; no pause, limit or billing check.
- §4.2 Image extraction: dead in prod without `GEMINI_API_KEY` (F-046).
- §4.3 delivered-status HYPOTHESIS (:180-183) resolved: 206 of 219 orders delivered in 30 days have a confirmed `delivery_import_items` row; only 48 carry `delivery_order_id`.
- §4.3 print: COD amounts differ by template (F-044).
- §5.1 "shop (storefront) 1,203" is wrong: `source='shop'` rows all have `is_shop_order = false` and stop 2026-09-09 (a manual source label). Real storefront orders all-time: 1 (`source='storefront'`, 2026-10-20). Storefront findings are pre-launch exposure.
- §4.5 storefront tenant lookup: suspended/limited tenants invisible to anon → 404 (F-047).

## 3. Not verified, and why
- Playwright: not run. A local `next build && next start` needs `NEXT_PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY`, and the only database is production (writes forbidden); e2e specs are placeholders (CONTEXT §3). Offline, slow-3G and back-button sad paths were traced in code only.
- Vercel env (PREVIEW_TOKEN_SECRET, GEMINI_API_KEY): listing denied by the permission classifier; F-046 relies on the 2026-10-19 snapshot.
- F-043 manual-path shortfall cause: HYPOTHESIS (no Sentry connector, `track_functions = none`).
- Per-trigger share of `create_order_atomic`'s 944 ms: not measurable (`track_functions = none`, no nested pg_stat_statements entries).
- RLS by role inside `set local role` transactions: not run; claims rest on catalog policies, grants and function source.
- Telegram and Interakt status intake: referenced as tracked (NEW-P1-06/07/08/17, F-021), not re-walked.
- Waseet submit and sync: left alone by design (L-36).
- Whether LightFunnels and storefront orders are meant to be billed per order: question for Ali (F-043).
