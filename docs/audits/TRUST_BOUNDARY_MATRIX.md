# Trust Boundary Matrix — Axis B

**Date:** 2026-09-17 · **Branch:** `feat/notifications-overhaul` @ `663e4dc3` · **Method:** read-only source analysis,
with the highest-severity cells re-verified by me directly against the file.

Every point where data or control crosses from untrusted to trusted, audited for seven controls:
**authentication → authorization → tenant scoping → schema validation → rate limiting → idempotency → audit logging.**

**Verification marks:** ✔︎ = I opened the file and confirmed the decisive line myself. Unmarked rows come from the
systematic sweep and were not individually re-verified; they are reported as classified, and the completeness caveats are
in §7.

**Critical reading rule used throughout:** a **service-role** client (`createSupabaseServiceClient`, `createAdminClient`,
`supabaseAdmin`) **bypasses RLS**, so a query with no tenant predicate is cross-tenant. A **user-context** client
(cookie/JWT) is constrained by RLS, so relying on RLS there is correct, not a gap.

---

## 0. Headline counts

| | |
|---|---|
| Platform API routes | **58** (charter said 57) |
| Platform Server Actions | 13 |
| Admin API routes | **57** |
| Admin Server Actions | **0** |
| Storefront API routes | 8 |
| Storefront Server Actions | **1** (`submitCheckout`) |
| Webhook endpoints | 4 (LightFunnels, Interakt global, Interakt per-tenant, Telegram) + 2 undocumented debug forwarders |
| Cron routes | 11 platform + 11 active `pg_cron` jobs |
| `SECURITY DEFINER` RPCs executable by `authenticated` | **69** |
| Storage buckets | 8 |
| **Routes with Zod** | **6 of 58** platform · 11 of 57 admin · 7 of 8 storefront |
| **Routes with rate limiting** | **0 of 122.** **CORRECTED:** the first draft said "no limiter exists in the repo." It does. `public.consume_rate_limit(_key text, _limit int, _window_seconds int)` is live, implements a correct sliding window over `api_rate_limits`, and is properly locked down (`has_function_privilege('authenticated', …)` = **false**, so service-role only). It has **zero call sites** ✔︎. This is a fourth instance of this audit's own headline thesis — the correct implementation exists, is verified correct, and is not wired up — and it re-prices SEC-13, SEC-12 and open signup from "build a limiter" to "call the one that is already there." |

`apps/platform/middleware.ts:51` excludes `/api` from its matcher by design, so **no platform API route is
authenticated by middleware**. Every route self-gates or does not gate. `apps/storefront` has no middleware at all.
Only `apps/admin/middleware.ts` gates its API surface — and it bypasses two paths.

---

## 1. Unauthenticated endpoints that mutate or disclose

The most important table in this document. Each of these is reachable from the public internet with no credential.

| Endpoint | What it does | Verified |
|---|---|---|
| `admin: /api/health` | **Service-role read of every tenant's `business_name`, `plan`, `status`, `city` and `wallet.balance_iqd` vs threshold.** `middleware.ts:37` returns *before* `getUser()` for this exact path, and the route has no in-route check. | ✔︎ |
| `platform: /api/lightfunnels/sync` (POST) | `save_token` / `remove_token` / `sync` / `sync_checkouts`. Steal, replace or destroy the LightFunnels integration token; trigger an import. No auth import exists in the file. | ✔︎ |
| `platform: /api/webhooks/interakt/dispatch-event` | **Open WhatsApp relay.** Takes `orderId` + unvalidated `overridePhone`, sends a real order template to any number at the merchant's cost. The identical bug was fixed on the sibling `interakt/send`. | ✔︎ |
| `platform: /api/settings/auto-send` (GET+PUT) | Master switch for outbound WhatsApp + an unbounded `default_discount_percent`. PUT currently 500s (tenant collision, see the fan-out report); GET returns another tenant's row. | ✔︎ |
| `platform: /api/cron/process-checkouts-manual` | Cross-tenant checkout import. `export async function GET()` takes no request at all. Comment: *"No authentication required - useful for debugging."* | ✔︎ |
| `platform: /api/debug/webhook-status` | Service-role read of `orders` and `checkout_queue` across every tenant, plus an environment-configuration oracle. | ✔︎ |
| `platform: /api/debug/test-webhook` | Self-POSTs a forged order to the LightFunnels webhook **carrying the server's own `LIGHTFUNNELS_WEBHOOK_SECRET`**. | |
| `platform: /api/webhooks/interakt/test-button-click` | Forges a signed Interakt webhook using `process.env.INTERAKT_WEBHOOK_SECRET` — confirm or cancel an arbitrary order UUID. | |
| `platform: /api/domains/verify` | **CORRECTED — this row was a false accusation in the first draft.** It is unauthenticated and takes a client-supplied `domain_id`, but it does **not** forge verification: `:28` performs `dns.resolveCname(domain.domain)` and only writes `verified: true` when a record contains `scheniders.com` or `vercel`. Real finding: an unauthenticated enumeration oracle over `tenant_domains`, not a verification bypass. | ✔︎ |
| `platform: /api/auth/signup` | Public by design. Creates an auth user **and a tenant**. `email_confirm: true`, no rate limit, no captcha, password rule `length >= 8`, HIBP disabled. | |
| `platform: /api/webhooks/lightfunnels` | Accepts a missing secret by design, documented with a TODO. Tenant is a fixed env var = the real merchant. | |
| `storefront: /api/cart/abandoned` | **Service-role upsert into any `tenant_id`** with no existence or liveness check; the cron then sends a WhatsApp template to the supplied phone. Overwrites a real shopper's cart row via `onConflict: "tenant_id,phone"`. | ✔︎ |
| `admin: /api/auth/callback` | Public by design (PKCE code exchange). Correct. | |
| `platform: /api/auth/callback` | Public by design. Correct. | |

**Two of these sign forged requests with the server's own secrets** (`debug/test-webhook`, `interakt/test-button-click`),
which means an attacker does not need the secret — the server applies it on their behalf.

---

## 2. Authenticated but not tenant-scoped (service role, no tenant predicate)

SEC-04 said 11 routes. The sweep found these, and the class is larger than the route list because the same defect sits in
shared libraries.

| Route / module | Table(s) | Verified |
|---|---|---|
| `platform: /api/orders/delete` | `orders` — `.in('id', ids)` only; role check reads global `user_profiles.role` | ✔︎ |
| `platform: /api/customers/[phone]/ai-summary` | `customer_metadata`, `orders` by phone → LLM summary | |
| `platform: /api/delivery-import/confirm` | `orders` — `.eq("id", item.orderId)`, sets `status` **and `price`** from the body | |
| `platform: /api/delivery-import/match` | `orders` ×3, one unbounded `select("*")` over every return order | |
| `platform: /api/delivery-import/complete` · `rollback` · `history` | `delivery_imports`, `orders` | |
| `platform: /api/waseet/submit-orders` | `orders` — `.in("id", orderIds)` | |
| `platform: /api/waseet/city-mappings` | `waseet_city_mappings` — global upsert on `governorate_code` | |
| `platform: /api/waseet/package-sizes` · `statuses` | `app_settings` without `tenant_id` (writes now fail) | ✔︎ |
| `platform: /api/webhooks/interakt` (global) | `findOrder` resolves by id or phone across all tenants | |
| `platform: lib/webhook-handler.ts` | `checkDuplicateOrder`, `checkBlacklist`, `checkRejectionHistory`, **`findProductBySku` — no filter at all** | ✔︎ |
| `platform: lib/whatsapp-dispatcher.ts` | `orders`, `app_settings` | ✔︎ |
| `platform: lib/whatsapp-error-handler.ts` | `orders` by uuid | |
| `platform: lib/lightfunnels-api.ts` (9 sites) | `orders`, `products`; incl. the unscoped abandoned-checkout soft-delete inside an empty `catch {}` (SEC-24) | |
| `platform: /api/cron/backup` | `orders`, `customers`, `products` — platform-wide by design, but written to a non-tenant path | |
| `platform: /app/link-google/claim` | `account_link_tokens`, `user_profiles` — token-keyed; the token is the only secret | |

`lib/webhook-handler.ts:635-646` deserves separate mention: **both** product-match queries are unscoped —
`.eq('sku', sku).single()` and a full-catalogue fetch for fuzzy alias matching. This is an independent mechanism for the
"wrong item in the WhatsApp message" incident already in this project's history, and at two tenants sharing a SKU the
`.single()` also errors outright.

**Correctly scoped siblings, for the fix campaign:** `/api/webhooks/interakt/send` (`resolveCallerTenant()` then
`.eq("id",…).eq("tenant_id", callerTenantId)`, and it restricts `overridePhone` to the order's own numbers),
`/api/settings/order-pipeline`, `/api/settings/staff-alert`, `lib/staff-alerts.ts`.

---

## 3. Admin app — the middleware is a role gate, not a permission gate

`apps/admin/middleware.ts:4` admits `ALLOWED_ROLES = {super_admin, support_staff}`. **Live census: 4 active
`support_staff`, 2 active `super_admin`.** Any route without an in-route permission check is therefore available to all
six, and `support_staff` is the wider group.

**SEC-08's count of 14 is exactly right**, with one refinement: `auth/callback` is correctly public and `health` is worse
than the other twelve because the middleware also skips it. So: **1 unauthenticated (health), 12 genuine missing-authz,
1 correct by design.**

| Route | Permission checked | Audit log | Note |
|---|---|---|---|
| `billing/topup` | **none** | **none** | `amount: z.number().positive()` — no `.max()`, no `.int()`. The guarding permission `"top_up_wallet"` exists in `admin-permissions.ts` and is referenced by **zero** routes. ✔︎ |
| `merchants/[id]/pause` · `unpause` | none | actor logged as `"system"` | Sets `restrictions.blocks.new_orders`, which storefront checkout honours — one call stops a merchant taking orders |
| `merchants/[id]/convert-trial` · `extend-subscription` · `extend-trial` | none | none / partial | Free paid time; trial→paid conversion |
| `merchants/[id]/orders` | none | none | Customer name + phone of any tenant |
| `merchants/[id]/audit-log` · `notes` · `tags` | none | none | Reads the audit trail itself |
| `dashboard/stats` | none | none | Cross-tenant financials |
| `admin/watchlist/[tenantId]` | none | none | Hardcoded placeholder admin id `00000000-…` |
| `leads/[id]/convert` · `build-store` | bearer, any admin | none | **Creates tenants**, 7 writes, no Zod |
| `merchants/[id]` PATCH | `"change_plan"` | ✔︎ ×3 | **Reference implementation** |
| `bulk` | `"bulk_action"` | broken (see below) | Correctly bounds top-up to 1,000–10,000,000 |
| `impersonate` | `"impersonate"` | **broken** | |

### 3.1 The admin audit trail has never recorded anything

`admin_activity_logs` contains **0 rows**. The column is `admin_user_id`; `impersonate/route.ts:53` inserts `admin_id`,
and the error is swallowed at `:63` as "non-blocking". `bulk/route.ts:244,266` repeat the mistake and the second site
does not check the error at all. ✔︎ (verified: column list from the live catalog, row count 0, insert line read).

**This falsifies a ledger VERIFIED-OK.** The prior audit recorded `impersonate` as exemplary because it "logs the real
actor". It has a named permission, it has Zod, and it logs nothing. Merchant impersonation and every bulk
plan-change/suspend/top-up are unrecorded. `lib/activity-logger.ts` — used by the four correct routes — writes the right
column.

---

## 4. Storefront — the public, unauthenticated surface

No middleware. `proxy.ts` passes `/api` straight through.

| Surface | Validation | Tenant from | Writes? | Verdict |
|---|---|---|---|---|
| `submitCheckout` (Server Action) | No Zod, but **prices, fees, discounts and points are all re-derived server-side** | client `payload.tenantId`, status-gated to `active/trial/limited` | yes | Pricing model is genuinely sound. Gaps: no length caps on free-text fields; `governorate_code` cast without a membership check on the action path; no throttle |
| `/api/checkout/orders` | **Full Zod** incl. `z.enum(GOVERNORATE_CODES)` | client `tenant_id` | yes | Closes the action's governorate gap for HTTP callers |
| `/api/cart/abandoned` | Zod on shape only | client `tenant_id`, **never checked** | yes | See §1 |
| `/api/reviews` POST | Zod + MIME allowlist + 5 MB + ≤4 photos; **product↔tenant ownership verified** | verified against `products` | yes | Solid; unthrottled storage write |
| `/api/newsletter` | Zod + `max(254)`, **tenant liveness checked** | client, verified | yes | Best-validated route in the app |
| `/api/exp-event` | Zod; `arm_id` accepted then **ignored and re-derived from the httpOnly cookie** | client, experiment must be `running` | yes | Correct anti-forgery design |
| `/api/loyalty/balance` | Zod + phone normalise | client `tenant_id` | no | Service-role oracle: any `(tenant, phone)` returns a balance; enumerable |
| `/api/orders/lookup` | Zod in **and on the RPC response** | client `tenant_id` | no | `lookup_order` requires order number **and** last-10 phone match, tenant must be `trial/active`, `LIMIT 1`. Crypto is fine; unlimited attempts are the problem |
| `?token=` preview | `verifyPreviewToken` — HMAC-SHA256, `timingSafeEqual`, TTL, **`payload.tenant_id` matched to the resolved tenant**, fails closed with no secret | — | no | **Correctly built. IDOR closed.** |
| `?preview_template=` | allowlisted against `TEMPLATE_NAMES` | — | no | No injection, but it forces the legacy renderer on V2 tenants → SEC-34 |

---

## 5. Fail-open guards

`lib/cron-auth.ts` (`requireCronAuth`) returns **503 when `CRON_SECRET` is unset** and its doc block names the
anti-pattern explicitly, "so the next route copies the right shape." **Three of eleven cron routes adopted it.**

| Site | Shape | Verdict |
|---|---|---|
| `cron/process-checkouts`, `cron/abandoned-cart-recovery`, `cron/backup` | `requireCronAuth` | fails closed |
| `cron/auto-no-response`, `cron/cleanup-deleted-orders`, `cron/waseet-locations` | hand-rolled, fails closed | correct but duplicated |
| `cron/auto-follow-up` | QStash signature | fails closed |
| `cron/waseet-sync` | `if (cronSecret && authHeader !== …)` | **fails open** |
| `cron/subscription-renew`, `cron/trial-suspend` | `!== \`Bearer ${process.env.CRON_SECRET}\`` | **`Bearer undefined` authenticates when unset** |
| `cron/process-checkouts-manual` | none | **no auth** |
| `telegram/webhook` | `if (expected) { … }` | **fails open** — and this route reaches `createOrderCore` |
| `webhooks/interakt/[tenantId]` | `if (provided && provided !== expectedSecret)` | **fails open twice** — unset secret *and* omitted header |
| `webhooks/lightfunnels` | `if (expectedSecret && secret && …)` | **fails open by design**, documented TODO |
| `packages/shared/src/preview-token.ts` | throws with no secret | fails closed |

`cron-auth.ts:19` asserts that `trial-suspend` and `subscription-renew` "already did it this way." They do not — they
compare against an interpolated `undefined`. A comment that describes a safeguard the code does not have is worse than
no comment, because it stops the next reader looking.

Three cron routes also accept `x-vercel-cron: 1` as an alternative credential. Whether Vercel's edge strips a
client-supplied `x-vercel-*` header cannot be settled from source; **this is a `NEEDS-EVIDENCE` item** — settling it
requires one live probe against the deployed URL, which Phase 1 forbids.

---

## 6. `SECURITY DEFINER` RPCs — the 70th trust boundary

69 are executable by `authenticated`; 1 by `anon` (`lookup_order`). Of those, **11 have no effective caller
authorization** (the ledger's SEC-11 said 6):

`adjust_customer_points`, `inv_apply`, `recompute_inventory`, `zero_oversold`, `increment_usage_tracking`,
`increment_order_usage`, `get_customer_percentile`, `get_customer_trust_history`, `get_customer_score_audit_log`,
`refresh_customer_aggregates`, `get_seed_automation_status`.

**Correction to my own first pass:** I initially flagged 27, including eleven `chat_*` RPCs. Reading them shows they
delegate to `chat_is_conversation_admin()` / `chat_is_member()`, which do check `auth.uid()`. My regex searched for the
wrong spellings — the exact grep artefact that produced two near-false accusations in the prior audit. The eleven chat
functions are **correctly authorized**.

**Also resolved in the codebase's favour**, and open in the ledger since 2026-09-16: `apply_store_config_v2_patch`,
`publish_store_config_v2`, `seed_store_config_v2_draft` and `aggregate_experiment_stats` all carry proper
`tenant_members` membership checks; `publish_store_config_v2` additionally checks role. These are **clean**.

---

## 7. Completeness caveats

- **The 58 platform routes and 13 actions were each read** by the sweep; I personally re-verified the 9 most severe.
- **Admin service-role tenant scoping was excluded** as cross-tenant by design; its *authorization* gates are §3.
- **`apps/platform/scripts/*` (25 files) were excluded** as non-deployed.
- **Three cells are `NEEDS-EVIDENCE`**: the `x-vercel-cron` header question (§5); whether `support_staff` accounts are
  held by people who should not have billing power (a policy question, not a code one — but the 4 active accounts are
  confirmed); and the live behaviour of `/api/health` against the deployed admin URL, which I reasoned about from
  source and did not probe.
- **`leads/analyze-profile`** calls an external profile API with admin-supplied input; it is authenticated, but its
  outbound URL construction was not traced for SSRF.
- **Realtime subscriptions and `postMessage` across the preview iframe** are named in the charter as boundaries and are
  only partially covered here: realtime exposure is verified minimal (4 published tables, audience-aware policy on
  `notifications`), but the preview-iframe `postMessage` origin checks were **not audited**. That is a gap.
