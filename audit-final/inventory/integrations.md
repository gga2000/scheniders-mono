# Integrations / Crons / Env / Tests / Deps / Debris / Sentry inventory

> **Errata (Phase 0 critic round 2):** test totals in §4.1 and the §4.4 list are updated to the pinned `6bde0f4` (253 tracked test files; the 11 files added by #136/#137 are listed). Line refs re-checked at `6bde0f4`: `apps/platform/app/products/page.tsx:56` (was 55), `packages/sections/src/pdp_direct_order.client.tsx:336` (was 327), `packages/sections/src/pdp_buy_box.client.tsx:131` (was 120). §2.14 (Meta / TikTok Conversions API) and §2.15 (storefront tracking pixels) were added. The `x-vercel-cron` spoofability in §1 is unverified.
>
> **Errata (Phase 0 critic round 1):** the claim in the cron section that `auto_move_to_no_response` is executable by anon describes the repo migration only. That function **does not exist in the live database** (see database.md, missing functions), so there is no live anon grant.

Repo: /home/claude/scheniders-mono @ bf432f7 (read-only recon, 2026-10-19).
NOTE: the clone is SHALLOW (`git rev-parse --is-shallow-repository` = true, 272 commits, grafted at 3d39155 "Merge pull request #61", 2026-09-02). Any `git log -S` answer below only covers history after that graft.
All paths are relative to the repo root; `P/` = `apps/platform/`.

---

## 1. Crons (`app/api/cron/**`)

Only `apps/platform` has cron routes (10). `apps/admin/vercel.json` and `apps/storefront/vercel.json` define no crons. `apps/platform/vercel.json` schedules 6.

| Route | Methods | Auth (file:line) | Scheduled by | maxDuration | Idempotency | Tables written |
|---|---|---|---|---|---|---|
| abandoned-cart-recovery | GET, POST | GET: `requireCronAuth` P/app/api/cron/abandoned-cart-recovery/route.ts:125 (fail-closed). POST: QStash `Receiver.verify` :138-153, 401 if signing keys unset (:141-146) | vercel.json `0 7 * * *`. NO QStash publisher anywhere targets this route → POST handler is dead | 30 (:14) | No claim; stamps `reminded_at` after a successful send; the update result is NOT checked (:112-116) → resend possible; two concurrent runs can double-send | abandoned_carts (reminded_at); external Interakt send |
| auto-follow-up | POST only | QStash `Receiver.verify` P/app/api/cron/auto-follow-up/route.ts:22-40; 401 when keys unset (:27-29) | QStash one-off delayed messages: `scheduleFollowUp` P/lib/qstash.ts:33-62 (publisher of the *discount* step is this route itself, :176-186). No caller of the initial `scheduleFollowUp(...,"reminder")` exists in the repo (grep: only call site is auto-follow-up/route.ts:184) → the reminder chain is never started by code in this repo | 30 (:14) | CAS claim on `contact_count` (:101-111), rollback of claim on send failure (:136-140). Payload `JSON.parse(body)` unvalidated (:42) | orders (contact_count, last_contacted_at, follow-up stamp), whatsapp_logs (:149), order_status_history + orders via flagOrderForWhatsAppFailure (P/lib/whatsapp-error-handler.ts:85,100,129) |
| auto-no-response | GET | CRON_SECRET fail-closed P/app/api/cron/auto-no-response/route.ts:25-29, BUT then `x-vercel-cron: 1` header alone bypasses the bearer check (:31-39) — whether an external client can spoof that header (i.e. whether Vercel strips it from inbound requests) is **unverified**; A6 tests it on a preview (CONTEXT L-04). Also note `auto_move_to_no_response` does not exist live (CONTEXT L-35), so the RPC at :46 fails | **NOT scheduled** (not in vercel.json; no QStash publisher; no pg_cron job calls it) | 30 (:10) | Pure SQL, idempotent | orders (via rpc `auto_move_to_no_response`, :46). Client falls back to ANON key if service key unset (:7) |
| backup | GET | `requireCronAuth` P/app/api/cron/backup/route.ts:99 | vercel.json `0 0 * * *` | none (no export) | New timestamped folder each run (`upsert:true`), non-destructive | storage bucket `vault_backups` (:130-135), security_logs (:150). Reads orders, mv_customer_aggregates, products |
| cleanup-deleted-orders | GET | `requireCronAuth` P/app/api/cron/cleanup-deleted-orders/route.ts:22 | vercel.json `0 1 * * *` | none (has `fetchCache='force-no-store'` :7) | Batched (`limit(CLEANUP_BATCH_SIZE)` :44), idempotent | orders HARD DELETE across all tenants (:63-67, `.delete()` :65), order_deletion_log (:91) |
| process-checkouts | GET, POST | GET `requireCronAuth` P/app/api/cron/process-checkouts/route.ts:136-143; POST QStash verify :150-170 | **NOT in vercel.json.** Triggered by QStash one-off delayed message from LF webhook (`scheduleCheckoutProcessing` P/lib/qstash.ts:71-93, called P/app/api/webhooks/lightfunnels/route.ts:128). Also called from browser by P/components/settings/lightfunnels-settings.tsx:186 with NO Authorization header → always 401/503 (broken button) | none | Optimistic claim on `attempts` (:55-61), `createOrderFromWebhook` duplicate detection | checkout_queue (attempts/processed_at/last_error :57,92,107), orders via rpc create_order_atomic (P/lib/webhook-handler.ts:937) + soft-delete of pending checkouts (:1044) |
| process-checkouts-manual | GET | Signed-in user via `verifyAccessToken` P/app/api/cron/process-checkouts-manual/route.ts:28-35 (any tenant's user, no role check, drains a GLOBAL queue) | **NOT scheduled** (manual, from /debug, documented in P/LIGHTFUNNELS_TROUBLESHOOTING.md:78, P/WEBHOOK_DIAGNOSTICS.md:46, P/QUICK_FIX.md:8) | none | Same CAS as above (:93-94) | checkout_queue, orders |
| subscription-renew | GET | Hand-rolled `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` P/app/api/cron/subscription-renew/route.ts:30-33 — NOT migrated to requireCronAuth. If CRON_SECRET is unset, header `Authorization: Bearer undefined` passes (fail-open) | vercel.json `0 3 * * *` | 60 (:8) | NONE: no lock, `charge_wallet_atomic` called with `_order_id:null` and no reference id (:107-112); errors of follow-up updates are not checked (:88-96, :119-126, :139-161) → if period update fails after a charge, next run charges again; concurrent runs double-charge | subscriptions, tenants, usage_tracking (upsert :158), wallet via rpc charge_wallet_atomic |
| trial-suspend | GET | Same hand-rolled check P/app/api/cron/trial-suspend/route.ts:17-20 (`Bearer undefined` fail-open) | vercel.json `0 6 * * *` | 30 (:8) | Conditional update `status='trial'`, idempotent | tenants (:25-30) |
| waseet-sync | GET | `if (cronSecret && authHeader !== ...)` P/app/api/cron/waseet-sync/route.ts:22-30 — **FAIL-OPEN when CRON_SECRET unset**, plus an `x-vercel-cron: 1` bypass (:26) whose spoofability is **unverified** (CONTEXT L-04) | vercel.json `0 12 * * *` | 60 (:7) | Skips unchanged status ids (:113) | orders (:134-137), order_status_history (:147), waseet_api_logs + app_settings(waseet_token) via lib |

Shared helper: P/lib/cron-auth.ts:27-41 (`requireCronAuth`, fail-closed). Used by backup, cleanup-deleted-orders, process-checkouts GET, abandoned-cart-recovery GET only. Not used by trial-suspend, subscription-renew, waseet-sync, auto-no-response.

### Unscheduled cron routes and the evidence
Not in any vercel.json: **auto-follow-up, process-checkouts, process-checkouts-manual, auto-no-response**.

- `git log --oneline -S"<route>" -- apps/platform/vercel.json` returns nothing for all four (shallow history): vercel.json has had the same 6 entries since the graft (3d39155) and the file was never changed afterwards (`git log -- apps/platform/vercel.json` → only 3d39155).
- auto-follow-up / process-checkouts: by design QStash-driven. P/MILESTONE-QSTASH.md:14 "Cron polling every 2min → Vercel Hobby limits crons to 1/day", :64 "Vercel Hobby compatible". Publishers: P/lib/qstash.ts:46 and :82 (no `deduplicationId`, retries 2/3, hard-coded `baseUrl: "https://qstash-us-east-1.upstash.io"` :10). No QStash *schedules* (recurring) are created anywhere (`schedules.create` grep = 0).
- process-checkouts-manual: deliberately manual (docs above; route comment :15-24).
- auto-no-response: **no justification found; evidence contradicts itself.** Route comment says "Runs daily at 6 AM via Vercel Cron" (:14) and commit 5907c29 (fix(security): make cron authorization fail closed #90) says it "keeps its x-vercel-cron fallback because it is genuinely scheduled". It is not. The same commit message and P/lib/cron-auth.ts:16-19 claim cleanup-deleted-orders "is not registered in vercel.json" — it IS (`git show 5907c29:apps/platform/vercel.json` lists it). So the security reasoning in #90 swapped the two routes. The behaviour is actually delivered client-side by P/hooks/use-auto-no-response.ts:9-29 ("fetch-time resolution" + "lazy DB sync" from the browser), and P/implementation_plan.md:13 (scratch) still describes it as a daily cron.
- The SQL fn `auto_move_to_no_response` (packages/supabase/migrations/20_auto_no_response.sql:8-38) is SECURITY INVOKER, spans all tenants, and is `GRANT EXECUTE ... TO anon` (:42) and authenticated (:41) — no later migration revokes it (grep finds only this file). RLS limits the actual effect per caller.
- pg_cron jobs exist for other things (packages/supabase/migrations/20260912100000_notification_types_wave4.sql:361, 20260911120000_tenant_public_stats.sql:97, 20260909100000_products_bestseller_rank.sql:121, 20260629130000_fix_customer_aggregates_freshness.sql:22, 20260911180000_notification_wave1_integrity.sql:190,195, 20260912093100_notification_feed_mutes_and_digest.sql:221,227, 20260912110000_notification_delivery_metrics.sql:56) — none call the HTTP cron routes.

---

## 2. Integrations

General finding: **no outbound server fetch to a third party has a timeout** (no `AbortSignal.timeout`/`AbortController` in waseet-api, lightfunnels-api, interakt, abandoned-cart-sender, telegram, Anthropic routes, RapidAPI, QStash). Only timeouts in the codebase: P/app/api/chat/unfurl/route.ts:113, P/lib/repositories/order-repository.ts:741, P/lib/supabase.ts:77, P/components/settings/lightfunnels-settings.tsx:139.

### 2.1 Al-Waseet (P/lib/waseet-api.ts, 588 lines)
- Credentials: GLOBAL env `WASEET_USERNAME`/`WASEET_PASSWORD` (:99-100). Token cached in `app_settings` key `waseet_token` with NO tenant_id (:80-84 read, :127-132 upsert, :143 delete). One merchant account serves every tenant. `P/lib/tenant-integrations.ts:18 getIntegrationCredentials` / `:36 saveIntegrationCredentials` exist but have **zero callers** (dead).
- Request core `waseetRequest` :164-271: retries `MAX_RETRIES` with linear backoff (:263-265), 401 → clear token + re-login once (:219-225), 429 backoff (:228-233), in-process rate limiter (:178-182, per-instance only). No fetch timeout (:110, :216). `response.json()` unguarded (:115 login, :235) — non-JSON body throws and is retried.
- Audit log `logWaseetApiCall` :283-317 (insert :299) is fire-and-forget (unawaited IIFE) and writes `waseet_api_logs` WITHOUT tenant_id (column exists: packages/supabase/migrations/20260406100001_add_tenant_id_columns.sql:34).
- `getCityMappings` :553-566 and `getDefaultPackageSizeId` :572-582 read global rows (no tenant filter) though `waseet_city_mappings.tenant_id` exists (same migration :33). Errors → `[]` (:561-563).
- Callers (all in platform):
  - P/app/api/cron/waseet-sync/route.ts:3 (fetchOrdersByIdsBulk) — see §1.
  - P/app/api/waseet/cities/route.ts:3, regions:3, package-sizes:3, statuses:3, invoices:3, invoice-orders:3, receive-invoice:3, submit-orders:8 — all authenticate with `verifyAccessToken` only (e.g. receive-invoice/route.ts:19-22). **receive-invoice (POST :11-36) lets ANY signed-in user of ANY tenant mark an invoice received on the single shared Al-Waseet account**; invoices/invoice-orders expose the shared account's financial data to every tenant.
  - P/app/api/waseet/city-mappings/route.ts POST :44-90 — any authenticated user upserts GLOBAL city mappings with the service-role client (no role, no tenant).
  - submit-orders: role-gated (SHIP_ALLOWED_ROLES :14 = admin, super_admin, employee; check :68), tenant-scoped order fetch (:93-98), idempotent via `waseet_qr_id` check + `waseet_submit_started_at` reservation (:158-163, :179-182, release :201-203, write :239), maxDuration 60 (:16).

### 2.2 Lightfunnels
- Webhook P/app/api/webhooks/lightfunnels/route.ts (264 lines). Auth `verifyWebhookAuth` :40-52 (shared secret header `x-webhook-secret`, `?token=`, or HMAC `lightfunnels-hmac` base64 with LIGHTFUNNELS_APP_SECRET). Mode `resolveWebhookAuthMode(env.LIGHTFUNNELS_WEBHOOK_AUTH_MODE, env.WEBHOOK_AUTH_MODE)` :53 → **defaults to "monitor"** (P/lib/webhook-auth.ts:169-174) which ACCEPTS unauthenticated and unconfigured requests (P/lib/webhook-auth.ts:197-198: only `invalid` is rejected unless mode=enforce). Neither *_AUTH_MODE var is in any env.example. So with default config, anyone can POST orders into the LIGHTFUNNELS_TENANT_ID tenant.
- Tenant: single env tenant `LIGHTFUNNELS_TENANT_ID` (:155-166).
- Checkout path: upsert `checkout_queue` onConflict checkout_id (:104-109) — queue rows have no tenant_id; schedule QStash (:125-135; silently skipped if no base URL :134). Verbose payload logging to console always (:66-82).
- `GET` returns endpoint status publicly (:255-264).
- Sync P/app/api/lightfunnels/sync/route.ts: `requireRequestCaller(request,'platform-admin')` :27 and :181. Token from platform-wide `settings` table (P/lib/lightfunnels-api.ts:1232-1253, key `lightfunnels_access_token`, no tenant) or from request body (`accessToken` :31).
- P/lib/lightfunnels-api.ts `executeQuery` :126-140 no timeout, no retry. Swallowed catches returning null/false: :436, :460, :488, :843 (`catch {}`), :988, :1105, :1249.
- Order creation P/lib/webhook-handler.ts:750: `checkBlacklist` :534-556 queries `blacklist` by phone WITHOUT tenant_id (column exists, migration 20260406100001:16) and returns `isBlacklisted:false` on any error (fail-open, :544-546, :553-556); abandoned-checkout dedup :768-778 queries `orders` by phone across ALL tenants.

### 2.3 Interakt (WhatsApp)
- Sender P/lib/interakt.ts: `sendTemplateMessage` :309, `sendStaffAlertMessage` :478. Global key `env.INTERAKT_API_KEY` (:316, :482) — one WhatsApp account for all tenants. Retries + 429 backoff (:336-352, :500-529). No timeout (:338, :502). `response.json().catch(() => ({}))` :511.
- P/lib/abandoned-cart-sender.ts:72-128 duplicate Interakt client (own retry loop :83-125, no timeout).
- Webhook (legacy, global) P/app/api/webhooks/interakt/route.ts: secret mandatory — 503 if `INTERAKT_WEBHOOK_SECRET` unset (:319-325); compare is plain `!==` (:330) — not constant-time; `eslint-disable` + `as any` (:87, :340); logs full payloads (:305, :344). Phone→order lookup spans every tenant and refuses only when >1 tenant matches (:216-248).
- Webhook (per-tenant) P/app/api/webhooks/interakt/[tenantId]/route.ts: per-tenant `credentials.webhook_secret` (:88-99) with HMAC `interakt-signature` + header/token (:100-113); mode `INTERAKT_WEBHOOK_AUTH_MODE`/`WEBHOOK_AUTH_MODE` default **monitor** (:114) → unauthenticated accepted by default.
- Send proxy P/app/api/webhooks/interakt/send/route.ts:32-75: `verifyAccessToken`, order read under caller RLS (:57-63), overridePhone restricted to order phones (:71-75).
- Dispatcher P/lib/whatsapp-dispatcher.ts:45, catches logged at :110, :146, :207.

### 2.4 Telegram bot
- P/app/api/telegram/webhook/route.ts (574 lines, maxDuration 60 :18). Secret check **SKIPPED when `TELEGRAM_WEBHOOK_SECRET` is unset** (:79-85: `if (expected) {...}`). Always returns 200 and swallows handler errors to console (:96-102). Linking via one-time code + tenant_members check (:357-392, :371-380, :486-490).
- P/lib/telegram.ts: `call` :14-25 and `downloadFile` :66-88, no timeout, no retry. Bot token embedded in URL (:15, :68).
- Images → Gemini (see 2.6) → `createOrderForTenant` (:290).

### 2.5 Upstash QStash
- Publishers: P/lib/qstash.ts `scheduleFollowUp` :33-62 (retries 2), `scheduleCheckoutProcessing` :71-93 (retries 3). Client returns null when QSTASH_TOKEN unset (:6) → scheduling silently skipped (warn only :41, :79). Publish errors caught → `false` (:58-61, :90-93); callers ignore the boolean (P/app/api/webhooks/lightfunnels/route.ts:128, P/app/api/cron/auto-follow-up/route.ts:184). No `deduplicationId`.
- Receivers (all mandatory verification; 401 if keys unset): process-checkouts POST :150-170, auto-follow-up POST :22-40, abandoned-cart-recovery POST :138-153. All use `Receiver.verify({signature, body})` without passing `url` (no URL binding).
- P/scripts/diagnose-webhook.ts reads QSTASH_* (scratch script).

### 2.6 Gemini
- P/lib/gemini-order-extractor.ts:45-81: throws if `GEMINI_API_KEY` unset (:49-51); model fallback list (:43, loop :58-72); no timeout; result `JSON.parse(cleaned) as ExtractedOrder` (:80) — **no Zod validation of model output**.
- Callers: P/app/api/orders/analyze-image/route.ts (verifyAccessToken :24, rate-limited via consumeRateLimit :29-47, error detail not returned :73-77); P/app/api/telegram/webhook/route.ts.

### 2.7 Anthropic (raw fetch, no SDK)
- P/app/api/ai/product-copy/route.ts: verifyAccessToken :25, Zod body :12-16/:30, `ANTHROPIC_API_KEY` 500 if unset (:35-39), fetch :45 no timeout, model `claude-opus-4-8` (:53); **no rate limit** (contrast analyze-image); output validated via Zod in P/lib/product-copy.ts:66-84.
- P/app/api/customers/[phone]/ai-summary/route.ts: `requireRequestCaller(...,"member")` :16, fetch :106 no timeout, model `claude-haiku-4-5-20251001` (:114), no rate limit, logs full upstream error body (:122).

### 2.8 Puppeteer / @sparticuz/chromium PDF
- P/app/api/generate-batch-pdf/route.ts: verifyAccessToken :33-42; renders **arbitrary client-supplied `html`** (:44) with `page.setContent(..., waitUntil networkidle0)` (:75-77) — headless Chrome will fetch any URL the HTML references (SSRF to internal/metadata endpoints, no request interception); dev launches with `--no-sandbox` (:60); **`browser.close()` only on the success path (:92), no `finally`** → browser leak on error; error detail returned to client (:105-108); fixed 500 ms sleep (:80); maxDuration 60 (:7).
- P/app/api/payslip-pdf/route.ts: verifyAccessToken :29-33, HTML built server-side by P/lib/payslip-html.ts (:40), `finally { browser.close() }` :80-81, maxDuration 60 (:8).
- next.config externalizes `pdf-parse, pdfjs-dist, puppeteer-core, @sparticuz/chromium` (P/next.config.ts:21).

### 2.9 Exports (exceljs / jspdf / xlsx / html2canvas)
- exceljs: P/lib/excel-report-generator.ts:3 (type), :150 dynamic import — file is `"use client"` (line 1), used by P/components/orders/export-report-modal.tsx.
- jspdf: P/lib/pdf-report-generator.ts:170-171 (dyn, "use client"), P/lib/payroll-summary-pdf.ts:40-41 (dyn, "use client"), P/components/team/export-report.tsx:14 (static, "use client"), P/components/products/barcode/barcode-batch-print.tsx:15 (static, "use client"), P/components/products/import-export/export-builder.tsx:284-286 (dyn, "use client").
- xlsx (SheetJS `^0.18.5` from npm — last npm release, known prototype-pollution/ReDoS advisories, fixes only on SheetJS CDN): static imports in client code P/components/admin/data-import/export-step.tsx:3, P/hooks/use-data-importer.ts:2, P/components/team/export-report.tsx:15, P/components/products/import-export/import-wizard.tsx:22, P/components/products/import-export/export-builder.tsx:19, P/lib/vault-utils.ts:3 (imported by "use client" P/app/vault/page.tsx), P/lib/excel-importer.ts:8; dynamic P/components/products/bulk-operations-panel.tsx:466, P/lib/export-utils.ts:36,:154; plus 11 scripts in P/scripts/*.ts.
- html2canvas: P/lib/screenshot.ts:7 (dyn), used by "use client" P/components/orders/order-confirmation-card.tsx.
- Apparently dead (no importer found by path or symbol): P/components/products/import-export/import-wizard.tsx, P/components/products/import-export/export-builder.tsx, P/components/products/barcode/barcode-batch-print.tsx, P/components/products/bulk-operations-panel.tsx, P/lib/excel-importer.ts. P/components/team/export-report.tsx is only re-exported from P/components/team/index.ts:22 with no consumer of `ExportReport`.

### 2.10 ZXing
- P/hooks/use-barcode-scanner.ts:136-137 (dynamic `@zxing/browser`, `@zxing/library`; "use client" :1) ← P/components/products/barcode-scanner.tsx.
- P/hooks/use-continuous-scanner.ts:111-112 (dynamic; "use client" :1) ← P/app/returns/scan/page.tsx.

### 2.11 Delivery-import pipeline (with rollback)
- Routes (all `requireRequestCaller(request,"tenant-admin")`, tenant from caller): parse P/app/api/delivery-import/parse/route.ts:17 (pdf-parse via P/lib/delivery-import/pdf-parser.ts:7; checks only `.pdf` extension :31, **no size limit**), match .../match/route.ts:18 (tenant-scoped :57-63), confirm .../confirm/route.ts:40, complete .../complete/route.ts:14, history .../history/route.ts:13, rollback .../rollback/route.ts:17.
- confirm: per-order updates via `Promise.allSettled` (:111-185), "Individual failures don't rollback the entire import" (:35); audit rows store `previous_status`/`new_status` only (:213-214, :242-243, :267-268).
- **rollback is broken**: it selects `previous_price, previous_delivered_source, previous_delivered_at, previous_delivery_order_id` (rollback/route.ts:48) — columns that appear in NO migration, NOT in packages/supabase/src/database.types.ts, and are never written by confirm. The select will fail → 500 on every rollback (if the live DB lacks them). Even if present: non-atomic `Promise.allSettled` (:62-78), skips rows without previous_status (:64), then **marks import `cancelled` and returns `success:true` regardless of failures** (:89-96); the final update (:91) is unchecked and not tenant-filtered (:89-92, `.eq("id", importId)` only — import was verified tenant-owned earlier at :29-33). Rollback of a `completed` import is refused (:38-42).

### 2.12 Web push (VAPID)
- Client: P/hooks/chat/use-web-push.ts:74 (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), :90, :119; P/hooks/use-notification-push.ts.
- Subscribe/unsubscribe: P/app/api/chat/push/subscribe/route.ts (verifyAccessToken :28-33; Zod :18-23 but `endpoint: z.string().min(1)` — not URL-validated, so the edge function will POST to any stored endpoint), P/app/api/chat/push/unsubscribe/route.ts.
- Sender: supabase/functions/send-order-push/index.ts — bearer `EDGE_PUSH_SECRET` mandatory (:277-279, fail-closed, non-constant-time `!==`), VAPID inert if keys unset (:27-28, :281), prunes 404/410 (:361-375).
- Trigger: packages/supabase/migrations/20260628120000_order_push.sql:12-31 — `pg_net` POST with secret read from `chat_push_config` (RLS on, `REVOKE ALL ... anon, authenticated`: 20260624110100_chat_push_trigger.sql:15-16). Function URL hard-coded to project sduvpgqwhxragxtxztur (:15).

### 2.13 Other external: RapidAPI (admin)
- apps/admin/app/api/leads/analyze-profile/route.ts: `RAPIDAPI_KEY ?? ""` (:21), fetch :65 no timeout, `.catch(() => ({posts:[]}))` / `.catch(() => ({reels:[]}))` swallow (:107-108), `catch {}` :39; auth `requireAdmin` :159-161.

### 2.14 Meta Conversions API and TikTok Events API (storefront, server-side)
Added in Phase 0 critic round 2; read at `6bde0f4`.
- Module: `apps/storefront/lib/capi.ts` (149 lines). Endpoints: Meta `https://graph.facebook.com/v19.0/<meta_pixel_id>/events?access_token=<meta_capi_token>` (:116, :125); TikTok `https://business-api.tiktok.com/open_api/v1.3/event/track/` with header `Access-Token: <tiktok_capi_token>` (:117, :137-141).
- Event: Meta `Purchase` (:52), TikTok `CompletePayment` (:97), currency `IQD`, value = order grand total, `event_id` shared with the browser pixel for dedup. PII: phone normalised to `964…` (:19-25) and SHA-256 hashed (:14-16, :46, :88); email and name hashed when present (:48-49, :90). Optional Meta `test_event_code` (:73-75).
- Credentials: per tenant, not env. Read from `tenant.store_config_v2.globals.analytics_pixels.base` (`apps/storefront/app/actions/checkout.ts:416-418`); fields `meta_capi_token`, `tiktok_capi_token`, `capi_test_event_code` (`packages/shared/src/types/store-config.ts:262,264`), entered as secret fields in `apps/platform/components/store-builder-v2/pixels-screen.tsx:48-49`. Redacted before config reaches the browser (`packages/shared/src/pixel.ts:57-69`, applied at `apps/storefront/lib/tenant.ts:91-95`). The `tenants` row itself is `anon`-readable for trial/active tenants (policy `public_storefront_read`; CONTEXT L-40, HYPOTHESIS on exposure). Live: 0 tenants have a CAPI token (MEASURED 2026-10-19).
- Call site (only one): `sendPurchaseCapi` (`capi.ts:120`) from `submitCheckout`, `apps/storefront/app/actions/checkout.ts:421`, guarded by `payload.purchaseEventId && analytics` (:419). `purchaseEventId` comes from the `/api/checkout/orders` body `event_id` (`apps/storefront/app/api/checkout/orders/route.ts:103`) or the direct server-action payload (`checkout.ts:35`).
- Error handling: each `fetch` has `.catch(() => undefined)` (:131, :144); results go through `Promise.allSettled` (:148); the HTTP status of a response is never read, so a 4xx/5xx from Meta/TikTok is silent; the call site wraps it in `try { … } catch { /* CAPI is best-effort */ }` (`checkout.ts:420-434`, swallowed `catch {}` at :432). No logging, no metric.
- Timeout / retry: none. `submitCheckout` **awaits** the call (`checkout.ts:421`), so a slow Meta/TikTok endpoint delays the shopper's order confirmation (HYPOTHESIS on impact size; A9 measures). No retry, no queue.
- Tests: `apps/storefront/lib/capi.test.ts` (4 cases) covers only the payload builders `buildMetaPurchaseEvent` / `buildTikTokPurchaseEvent` (:28, :44, :52, :60); `sendPurchaseCapi` (network, error handling) and the `checkout.ts` call site have no test (grep `sendPurchaseCapi` in the test file: 0). `packages/shared/src/pixel.test.ts` covers the redaction helper.

### 2.15 Storefront tracking pixels (browser-side)
Added in Phase 0 critic round 2; read at `6bde0f4`.
- Component: `apps/storefront/components/schneiders/analytics-pixels.tsx` (174 lines), rendered by `apps/storefront/app/s/[tenant]/layout.tsx:239` with `schn.analytics` overlaid by `store_config_v2.globals.analytics_pixels.base`. Scripts use Next `<Script strategy="afterInteractive">`.
- IDs are validated by shape before use (`isPlausiblePixelId`, :25-46).
- Hosts loaded in the shopper's browser:
  - Google Tag Manager `https://www.googletagmanager.com/gtm.js` (:64) and `ns.html` noscript (:71). When a GTM id is set, the component returns early (:53-80) and renders **only** GTM.
  - Meta Pixel `https://connect.facebook.net/en_US/fbevents.js` (:114).
  - TikTok Pixel `https://analytics.tiktok.com/i18n/pixel/events.js` (:127).
  - Google Analytics gtag `https://www.googletagmanager.com/gtag/js` (:140).
  - Snap Pixel `https://sc-static.net/scevent.min.js` (:160).
- Live configuration (MEASURED 2026-10-19, `tenants.store_config_v2`): 1 tenant has `meta_pixel_id`, 1 has `tiktok_pixel_id`; 0 have Snap, GA or GTM ids.
- Consent: no consent gate in the component (grep `consent` in the file finds only TikTok's own method names at :127). Whether one is needed is a Phase 2 / Ali question.

---

## 3. Env vars

### 3.1 Every `process.env.X` / `Deno.env.get("X")` (apps/, packages/, supabase/; excl. node_modules/.next) with file:line
(Vars read only through `env.X` from P/lib/env.ts are listed under env.ts lines.)

- **(Deno) EDGE_PUSH_SECRET** — supabase/functions/send-order-push/index.ts:20
- **(Deno) SUPABASE_SERVICE_ROLE_KEY** — supabase/functions/send-order-push/index.ts:22
- **(Deno) SUPABASE_URL** — supabase/functions/send-order-push/index.ts:21
- **(Deno) VAPID_PRIVATE_KEY** — supabase/functions/send-order-push/index.ts:24
- **(Deno) VAPID_PUBLIC_KEY** — supabase/functions/send-order-push/index.ts:23
- **(Deno) VAPID_SUBJECT** — supabase/functions/send-order-push/index.ts:25
- **ANALYZE** — apps/platform/next.config.ts:85
- **ANTHROPIC_API_KEY** — apps/platform/app/api/ai/product-copy/route.test.ts:28, apps/platform/app/api/ai/product-copy/route.ts:35, apps/platform/app/api/customers/[phone]/ai-summary/route.ts:96
- **CI** — apps/platform/playwright.config.ts:19, apps/platform/playwright.config.ts:21, apps/platform/playwright.config.ts:23, apps/platform/playwright.config.ts:77
- **CRON_SECRET** — apps/platform/app/api/cron/subscription-renew/route.ts:31, apps/platform/app/api/cron/trial-suspend/route.ts:18, apps/platform/app/api/cron/waseet-sync/route.ts:22, apps/platform/lib/env.ts:104
- **DATABASE_URL** — apps/platform/scripts/apply-migration.ts:6
- **GEMINI_API_KEY** — apps/platform/lib/env.ts:112, apps/platform/lib/gemini-order-extractor.ts:49, apps/platform/lib/gemini-order-extractor.ts:53
- **INTERAKT_API_KEY** — apps/platform/lib/env.ts:108
- **INTERAKT_WEBHOOK_AUTH_MODE** — apps/platform/lib/env.ts:102
- **INTERAKT_WEBHOOK_SECRET** — apps/platform/lib/env.ts:109
- **LIGHTFUNNELS_APP_SECRET** — apps/platform/lib/env.ts:99
- **LIGHTFUNNELS_TENANT_ID** — apps/platform/lib/env.ts:98
- **LIGHTFUNNELS_WEBHOOK_AUTH_MODE** — apps/platform/lib/env.ts:101
- **LIGHTFUNNELS_WEBHOOK_SECRET** — apps/platform/lib/env.ts:97, apps/platform/scripts/diagnose-webhook.ts:30, apps/platform/scripts/diagnose-webhook.ts:183
- **NEXT_PUBLIC_CATEGORIES_V2** — apps/platform/app/products/page.tsx:56
- **NEXT_PUBLIC_DEV_ROOT_DOMAIN** — apps/storefront/app/s/[tenant]/not-found.tsx:19, apps/storefront/proxy.ts:93
- **NEXT_PUBLIC_PLATFORM_ORIGIN** — apps/storefront/components/schneiders-preview-bridge.tsx:20, apps/storefront/lib/preview-origin.ts:29, apps/storefront/lib/preview-origin.ts:46
- **NEXT_PUBLIC_ROOT_DOMAIN** — apps/storefront/app/s/[tenant]/not-found.tsx:18, apps/storefront/proxy.ts:92
- **NEXT_PUBLIC_SENTRY_DSN** — apps/platform/sentry.client.config.ts:4, apps/platform/sentry.edge.config.ts:4, apps/platform/sentry.server.config.ts:4
- **NEXT_PUBLIC_SITE_URL** — apps/platform/app/api/cron/auto-follow-up/route.ts:179, apps/platform/app/api/telegram/webhook/route.ts:308, apps/platform/app/api/webhooks/lightfunnels/route.ts:125, apps/platform/lib/env.ts:76, apps/platform/scripts/diagnose-webhook.ts:34, apps/platform/scripts/diagnose-webhook.ts:157, apps/platform/scripts/diagnose-webhook.ts:192
- **NEXT_PUBLIC_STOREFRONT_ORIGIN** — apps/platform/hooks/use-iframe-bridge.ts:52
- **NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN** — apps/platform/lib/env.ts:77
- **NEXT_PUBLIC_STOREFRONT_URL** — apps/admin/components/merchants/detail/dialog-quick-actions.tsx:8, apps/admin/components/merchants/impersonate-button.tsx:16
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** — apps/admin/app/api/auth/callback/route.ts:14, apps/admin/hooks/use-admin-auth.ts:57, apps/admin/hooks/use-admin-realtime.ts:14, apps/admin/lib/admin-env.ts:13, apps/admin/lib/admin-fetch.ts:8, apps/admin/middleware.ts:11, apps/platform/check-anon.mjs:7, apps/platform/check-ids.mjs:6, apps/platform/check-risk.js:5, apps/platform/lib/env.ts:75, apps/platform/middleware.ts:23, apps/platform/query-products.mjs:6, apps/platform/scripts/add-secondary-phones.ts:9, apps/platform/scripts/add-tag-color-column.ts:8, apps/platform/scripts/assign-sources.ts:7, apps/platform/scripts/backup-database.js:23, apps/platform/scripts/check-old-format-orders.ts:8, apps/platform/scripts/check-orders.ts:8, apps/platform/scripts/clear-attention-flags.ts:8, apps/platform/scripts/consolidate-order-ids.ts:8, apps/platform/scripts/debug-risk.ts:10, apps/platform/scripts/debug_split_order.ts:10, apps/platform/scripts/debug_visibility.ts:9, apps/platform/scripts/delete-test-orders.ts:8, apps/platform/scripts/fix-delivery-orders.ts:8, apps/platform/scripts/fix-excel-import.ts:10, apps/platform/scripts/fix-imported-orders.ts:9, apps/platform/scripts/fix-notes-field.ts:9, apps/platform/scripts/fix-notes.ts:8, apps/platform/scripts/fix-prices.ts:9, apps/platform/scripts/fix-sequence-numbers.ts:17, apps/platform/scripts/import-orders.ts:11, apps/platform/scripts/import-taslihat.ts:11, apps/platform/scripts/link-products-to-catalogue.ts:8, apps/platform/scripts/match-products.ts:8, apps/platform/scripts/migrate-statuses.ts:7, apps/platform/scripts/process-delivery-data.ts:9, apps/platform/scripts/remove-dlv-prefix.ts:8, apps/platform/scripts/restore-catalogue-items.ts:8, apps/platform/scripts/update-notes.ts:8, apps/platform/test-verify.ts:8, apps/storefront/app/api/orders/lookup/route.ts:33, apps/storefront/components/sections/NewsletterSection.tsx:28, apps/storefront/lib/supabase/server.ts:22, apps/storefront/lib/supabase/server.ts:73
- **NEXT_PUBLIC_SUPABASE_URL** — apps/admin/app/api/auth/callback/route.ts:13, apps/admin/hooks/use-admin-auth.ts:56, apps/admin/hooks/use-admin-realtime.ts:13, apps/admin/lib/admin-env.ts:12, apps/admin/lib/admin-fetch.ts:7, apps/admin/middleware.ts:10, apps/platform/app/layout.tsx:79, apps/platform/check-anon.mjs:5, apps/platform/check-ids.mjs:5, apps/platform/check-risk.js:4, apps/platform/check_constraint.js:8, apps/platform/lib/env.ts:74, apps/platform/middleware.ts:22, apps/platform/query-products.mjs:5, apps/platform/scripts/add-secondary-phones.ts:8, apps/platform/scripts/add-tag-color-column.ts:7, apps/platform/scripts/apply-persistence.ts:9, apps/platform/scripts/assign-sources.ts:6, apps/platform/scripts/backup-database.js:22, apps/platform/scripts/check-old-format-orders.ts:7, apps/platform/scripts/check-orders.ts:7, apps/platform/scripts/clear-attention-flags.ts:7, apps/platform/scripts/consolidate-order-ids.ts:7, apps/platform/scripts/debug-risk.ts:9, apps/platform/scripts/debug_split_order.ts:9, apps/platform/scripts/debug_visibility.ts:8, apps/platform/scripts/delete-test-orders.ts:7, apps/platform/scripts/diagnose-webhook.ts:16, apps/platform/scripts/diagnose-webhook.ts:28, apps/platform/scripts/fix-delivery-orders.ts:7, apps/platform/scripts/fix-excel-import.ts:9, apps/platform/scripts/fix-imported-orders.ts:8, apps/platform/scripts/fix-notes-field.ts:8, apps/platform/scripts/fix-notes.ts:7, apps/platform/scripts/fix-prices.ts:8, apps/platform/scripts/fix-sequence-numbers.ts:16, apps/platform/scripts/import-orders.ts:10, apps/platform/scripts/import-taslihat.ts:10, apps/platform/scripts/link-products-to-catalogue.ts:7, apps/platform/scripts/match-products.ts:7, apps/platform/scripts/migrate-statuses.ts:6, apps/platform/scripts/process-delivery-data.ts:8, apps/platform/scripts/remove-dlv-prefix.ts:7, apps/platform/scripts/restore-catalogue-items.ts:7, apps/platform/scripts/update-notes.ts:7, apps/platform/test-verify.ts:7, apps/storefront/app/api/orders/lookup/route.ts:32, apps/storefront/components/sections/NewsletterSection.tsx:27, apps/storefront/lib/supabase/server.ts:21, apps/storefront/lib/supabase/server.ts:50, apps/storefront/lib/supabase/server.ts:72
- **NEXT_PUBLIC_SUPPORT_WHATSAPP** — apps/platform/components/auth/account-not-provisioned.tsx:14
- **NEXT_PUBLIC_VAPID_PUBLIC_KEY** — apps/platform/hooks/chat/use-web-push.ts:74
- **NODE_ENV** — apps/platform/app/api/generate-batch-pdf/route.ts:9, apps/platform/app/api/payslip-pdf/route.ts:10, apps/platform/components/error-boundary.tsx:91, apps/platform/components/pwa/dev-service-worker-cleanup.tsx:7, apps/platform/lib/diag.ts:3, apps/platform/lib/diag.ts:10, apps/platform/lib/order-aggregate-parity.ts:47, apps/platform/lib/order-telemetry.ts:67, apps/platform/lib/perf-trace.ts:30, apps/platform/lib/pwa.tsx:13, apps/platform/next.config.ts:8, apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx:308, apps/storefront/proxy.ts:26, packages/sections/src/category_grid.tsx:77, packages/sections/src/pdp_buy_box.client.tsx:131, packages/sections/src/pdp_direct_order.client.tsx:336, packages/sections/src/pdp_info_tabs.client.tsx:48, packages/sections/src/_report.ts:27
- **PREVIEW_TOKEN_SECRET** — apps/platform/app/store/edit/page.tsx:141, apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx:307
- **QSTASH_CURRENT_SIGNING_KEY** — apps/platform/lib/env.ts:106, apps/platform/scripts/diagnose-webhook.ts:32, apps/platform/scripts/diagnose-webhook.ts:187
- **QSTASH_NEXT_SIGNING_KEY** — apps/platform/lib/env.ts:107, apps/platform/scripts/diagnose-webhook.ts:33
- **QSTASH_TOKEN** — apps/platform/lib/env.ts:105, apps/platform/lib/qstash.ts:6, apps/platform/lib/qstash.ts:9, apps/platform/scripts/diagnose-webhook.ts:31, apps/platform/scripts/diagnose-webhook.ts:187
- **RAPIDAPI_KEY** — apps/admin/app/api/leads/analyze-profile/route.ts:21
- **SUPABASE_SERVICE_ROLE_KEY** — apps/admin/lib/admin-env.ts:14, apps/platform/check-ids.mjs:6, apps/platform/check-risk.js:5, apps/platform/check_constraint.js:9, apps/platform/lib/env.ts:96, apps/platform/query-products.mjs:6, apps/platform/scripts/add-secondary-phones.ts:9, apps/platform/scripts/apply-persistence.ts:10, apps/platform/scripts/assign-sources.ts:7, apps/platform/scripts/backup-database.js:23, apps/platform/scripts/check-old-format-orders.ts:8, apps/platform/scripts/check-orders.ts:8, apps/platform/scripts/clear-attention-flags.ts:8, apps/platform/scripts/consolidate-order-ids.ts:8, apps/platform/scripts/diagnose-webhook.ts:17, apps/platform/scripts/diagnose-webhook.ts:29, apps/platform/scripts/fix-delivery-orders.ts:8, apps/platform/scripts/fix-excel-import.ts:10, apps/platform/scripts/fix-imported-orders.ts:9, apps/platform/scripts/fix-notes-field.ts:9, apps/platform/scripts/fix-notes.ts:8, apps/platform/scripts/fix-prices.ts:9, apps/platform/scripts/import-orders.ts:11, apps/platform/scripts/import-taslihat.ts:11, apps/platform/scripts/link-products-to-catalogue.ts:8, apps/platform/scripts/match-products.ts:8, apps/platform/scripts/migrate-statuses.ts:7, apps/platform/scripts/process-delivery-data.ts:9, apps/platform/scripts/remove-dlv-prefix.ts:8, apps/platform/scripts/restore-catalogue-items.ts:8, apps/platform/scripts/update-notes.ts:8, apps/storefront/lib/supabase/server.ts:51
- **TELEGRAM_BOT_TOKEN** — apps/platform/lib/env.ts:113, apps/platform/lib/telegram.ts:9
- **TELEGRAM_WEBHOOK_SECRET** — apps/platform/app/api/telegram/webhook/route.ts:79, apps/platform/lib/env.ts:114
- **VERCEL_URL** — apps/platform/app/api/cron/auto-follow-up/route.ts:180, apps/platform/app/api/cron/auto-follow-up/route.ts:180, apps/platform/app/api/webhooks/lightfunnels/route.ts:126, apps/platform/app/api/webhooks/lightfunnels/route.ts:126, apps/platform/scripts/diagnose-webhook.ts:157, apps/platform/scripts/diagnose-webhook.ts:192
- **WASEET_PASSWORD** — apps/platform/lib/env.ts:111, apps/platform/lib/waseet-api.ts:100
- **WASEET_USERNAME** — apps/platform/lib/env.ts:110, apps/platform/lib/waseet-api.ts:99
- **WEBHOOK_AUTH_MODE** — apps/platform/lib/env.ts:100
- **WEBHOOK_LOGGING_ENABLED** — apps/platform/lib/env.ts:103, apps/platform/scripts/diagnose-webhook.ts:35

### 3.2 NEXT_PUBLIC_* that look secret
None of the NEXT_PUBLIC_* names holds a secret by nature: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (public by design), NEXT_PUBLIC_SENTRY_DSN (public DSN), NEXT_PUBLIC_VAPID_PUBLIC_KEY (public half), NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN/ORIGIN/URL, NEXT_PUBLIC_PLATFORM_ORIGIN, NEXT_PUBLIC_ROOT_DOMAIN, NEXT_PUBLIC_DEV_ROOT_DOMAIN, NEXT_PUBLIC_CATEGORIES_V2, NEXT_PUBLIC_SUPPORT_WHATSAPP. No "use client" file reads a secret env var (checked every file mentioning *_SECRET/_TOKEN/API_KEY/PASSWORD/SERVICE_ROLE: the 4 client hits are UI text or unrelated constants — P/components/customers/detail/ai-summary-card.tsx:126, P/components/chat/composer.tsx:36-37, P/components/store-builder-v2/editor-shell.tsx:88,123,196).
Related risks:
- P/app/api/cron/auto-no-response/route.ts:7 falls back from SUPABASE_SERVICE_ROLE_KEY to NEXT_PUBLIC_SUPABASE_ANON_KEY silently.
- `PREVIEW_TOKEN_SECRET` unset: storefront accepts the literal `dev-preview-token` when NODE_ENV !== production (apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx:84, :303-325); fails closed in prod (:319-322).
- apps/storefront/lib/supabase/server.ts:21-22, :50-51, :72-73 use `process.env.X!` non-null assertions (banned by CLAUDE.md) with no validation.

### 3.3 Env example files (git-tracked)
| File | Size | Keys | Values look real? |
|---|---|---|---|
| apps/platform/env.example | 629 B | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LIGHTFUNNELS_WEBHOOK_SECRET, WEBHOOK_LOGGING_ENABLED, NEXT_PUBLIC_STOREFRONT_ORIGIN | No — placeholders; WEBHOOK_LOGGING_ENABLED is a 4-char boolean; STOREFRONT_ORIGIN is localhost |
| apps/admin/.env.example | 161 B | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY | No — placeholders |
| apps/storefront/.env.example | 366 B | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_ROOT_DOMAIN, NEXT_PUBLIC_DEV_ROOT_DOMAIN | No — placeholders + domain names |

Gaps: none of the examples lists CRON_SECRET, QSTASH_*, INTERAKT_*, WASEET_*, GEMINI_API_KEY, ANTHROPIC_API_KEY, TELEGRAM_*, LIGHTFUNNELS_TENANT_ID/APP_SECRET, *_WEBHOOK_AUTH_MODE, PREVIEW_TOKEN_SECRET, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_VAPID_PUBLIC_KEY, RAPIDAPI_KEY.
Other tracked real-looking keys: `git grep` for JWTs finds only apps/platform/docs/Fixing Real-time App Refresh.md:141-198 — a JWT whose claims are `role: anon`, `ref: ibfdugifekivquwprqjc` (the OLD project's public anon key, inside pasted console logs). No sk-ant-, AIza, sbp_, sb_secret_ or private-key blocks found.

### 3.4 Zod validation of env
- P/lib/env.ts:20-35 (client schema, required URL + anon key), :41-66 (server schema — **every server var is `.optional()`**, incl. SUPABASE_SERVICE_ROLE_KEY :42 and CRON_SECRET :55), parse :72-134, export :136. Fail-fast only for the two public vars. Not covered by env.ts but read directly: ANTHROPIC_API_KEY, PREVIEW_TOKEN_SECRET, NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VERCEL_URL, NEXT_PUBLIC_CATEGORIES_V2, NEXT_PUBLIC_STOREFRONT_ORIGIN, NEXT_PUBLIC_SUPPORT_WHATSAPP. Several routes bypass `env` and read process.env directly even for validated names (CRON_SECRET in trial-suspend:18, subscription-renew:31, waseet-sync:22; WASEET_* in waseet-api.ts:99-100; GEMINI_API_KEY gemini-order-extractor.ts:49,53; TELEGRAM_* in telegram.ts:9 and telegram/webhook/route.ts:79; QSTASH_TOKEN qstash.ts:6,9).
- apps/admin/lib/admin-env.ts:3-26 — Zod schema, but validation is skipped whenever URL or service key is empty (:18-23: returns raw unvalidated values).
- apps/storefront: no env validation at all.
- P/lib/public-env-declared.test.ts — test guarding NEXT_PUBLIC declarations (comment at :13 notes web push shipped dead because NEXT_PUBLIC_VAPID_PUBLIC_KEY was undeclared).

---

## 4. Tests

### 4.1 Totals
253 git-tracked `*.test.*`/`*.spec.*` files at `6bde0f4` (251 `*.test.*` + 2 Playwright `*.spec.ts`; 242 at bf432f7 + 11 added by #136/#137); 2,250 `it(`/`test(` call sites (2,142 at bf432f7 + 108 in the 11 new files; regex count incl. `.each`/`.only`/`.skip`; 0 skip/todo found). Vitest reports 250 files / 2,601 tests at `6bde0f4` (CONTEXT §3); the gap to 251 is `scripts/migrate-store-config-v2/mapper.test.ts`, which no vitest config picks up.
| Area | Files | Cases |
|---|---|---|
| apps/platform | 173 (171 vitest + 2 Playwright) | 1,400 |
| apps/storefront | 17 | 141 |
| apps/admin | 3 | 28 |
| packages/shared | 24 | 288 |
| packages/sections | 35 | 384 |
| packages/ui | 0 | 0 |
| scripts/migrate-store-config-v2 | 1 | (see table) |

### 4.2 Configs
- vitest.workspace.ts:4-13 → apps/storefront/vitest.config.ts, apps/platform/vitest.config.mts, apps/admin/vitest.config.ts, packages/sections/vitest.config.ts, "packages/shared" (no config file; package.json `test: vitest run`).
- apps/platform/vitest.config.mts — jsdom; include components/hooks/lib/app/api/store globs (:38-56).
- apps/storefront/vitest.config.ts — node, jsdom for components via `environmentMatchGlobs` (:34-37).
- apps/admin/vitest.config.ts — node; include only `*.test.ts` under components/hooks/lib (:17-21). Admin has no vitest devDependency (relies on root).
- packages/sections/vitest.config.ts — node.
- apps/platform/playwright.config.ts — testDir ./e2e, 4 browser projects, webServer `pnpm dev`.
- NOT collected by any vitest config: scripts/migrate-store-config-v2/mapper.test.ts.
- Playwright specs: apps/platform/e2e/example.spec.ts (2 tests, both `page.goto('https://playwright.dev/')` boilerplate :4, :11), apps/platform/e2e/orders.spec.ts (1 test, offline order sync).
- Route-level tests exist only for: P/app/api/ai/product-copy, P/app/api/cron/abandoned-cart-recovery, P/app/api/store-config-v2/patch, P/app/api/webhooks/interakt/[tenantId], P/app/api/webhooks/interakt/webhook-order-match, P/app/api/webhooks/lightfunnels, storefront cart/abandoned, checkout/orders, reviews. No tests for: waseet-sync, subscription-renew, trial-suspend, backup, cleanup-deleted-orders, process-checkouts(-manual), auto-follow-up, auto-no-response, telegram webhook, any delivery-import route, any waseet route, generate-batch-pdf, payslip-pdf, legacy interakt webhook.

### 4.3 Storybook
apps/platform/.storybook/main.ts, preview.ts; 7 stories: P/components/ui/button.stories.tsx, P/stories/Button.stories.ts, P/stories/Header.stories.ts, P/stories/Page.stories.ts (these 3 = Storybook init boilerplate), P/stories/ChannelPerformance.stories.tsx, P/stories/NotificationFeed.stories.tsx, P/stories/SectionEditPanel.stories.tsx. No stories in packages/ui.

### 4.4 Every test file (path | case count | skip/todo count)
| File | Cases | Skips |
|---|---|---|
| apps/admin/components/leads/lead-phone.test.ts | 12 | 0 |
| apps/admin/components/leads/lead-stage.test.ts | 3 | 0 |
| apps/admin/lib/leads-table-layout.test.ts | 13 | 0 |
| apps/platform/app/api/ai/product-copy/route.test.ts | 5 | 0 |
| apps/platform/app/api/cron/abandoned-cart-recovery/route.test.ts | 4 | 0 |
| apps/platform/app/api/store-config-v2/patch/route.test.ts | 12 | 0 |
| apps/platform/app/api/webhooks/interakt/[tenantId]/route.test.ts | 9 | 0 |
| apps/platform/app/api/webhooks/interakt/webhook-order-match.test.ts | 4 | 0 |
| apps/platform/app/api/webhooks/lightfunnels/route.test.ts | 10 | 0 |
| apps/platform/components/layout/notifications-dropdown.test.tsx | 5 | 0 |
| apps/platform/components/orders/ad-channel-badge.test.tsx | 8 | 0 |
| apps/platform/components/orders/ad-channel-filter.test.tsx | 5 | 0 |
| apps/platform/components/orders/duplicate-alert-banner.test.tsx | 9 | 0 |
| apps/platform/components/orders/duplicate-comparison/column-header-controls.test.tsx | 3 | 0 |
| apps/platform/components/orders/duplicate-comparison/likelihood-meter.test.tsx | 2 | 0 |
| apps/platform/components/orders/duplicate-confirm-dialog.test.tsx | 5 | 0 |
| apps/platform/components/orders/follow-up-cue-badge.test.tsx | 11 | 0 |
| apps/platform/components/orders/governorate-options.test.tsx | 4 | 0 |
| apps/platform/components/orders/highlighted-phone.test.tsx | 10 | 0 |
| apps/platform/components/orders/order-customer-card.test.tsx | 19 | 0 |
| apps/platform/components/orders/order-modal-boundary.test.tsx | 6 | 0 |
| apps/platform/components/orders/product-picker.test.tsx | 13 | 0 |
| apps/platform/components/orders/ship-export-confirmation-dialog.test.tsx | 5 | 0 |
| apps/platform/components/orders/sticky-filter-bar.test.tsx | 4 | 0 |
| apps/platform/components/products/attribute-form-modal.test.ts | 14 | 0 |
| apps/platform/components/store-builder-v2/auto-form.test.tsx | 23 | 0 |
| apps/platform/components/store-builder-v2/block-layers-panel.test.tsx | 4 | 0 |
| apps/platform/components/store-builder-v2/brand-kit-editor.test.tsx | 18 | 0 |
| apps/platform/components/store-builder-v2/bundles-screen.test.tsx | 3 | 0 |
| apps/platform/components/store-builder-v2/cart-recovery-screen.test.tsx | 2 | 0 |
| apps/platform/components/store-builder-v2/config-diff.test.ts | 9 | 0 |
| apps/platform/components/store-builder-v2/custom-pages-screen.test.tsx | 5 | 0 |
| apps/platform/components/store-builder-v2/discounts-screen.test.tsx | 3 | 0 |
| apps/platform/components/store-builder-v2/editor-shell.test.tsx | 16 | 0 |
| apps/platform/components/store-builder-v2/experiments-screen.test.tsx | 10 | 0 |
| apps/platform/components/store-builder-v2/health-checklist-screen.test.tsx | 7 | 0 |
| apps/platform/components/store-builder-v2/i18n-screen.test.tsx | 2 | 0 |
| apps/platform/components/store-builder-v2/i18n-string-input.test.tsx | 7 | 0 |
| apps/platform/components/store-builder-v2/live-preview-context-menu.test.tsx | 5 | 0 |
| apps/platform/components/store-builder-v2/loyalty-screen.test.tsx | 2 | 0 |
| apps/platform/components/store-builder-v2/nav-builder-screen.test.tsx | 3 | 0 |
| apps/platform/components/store-builder-v2/page-seo-panel.test.tsx | 5 | 0 |
| apps/platform/components/store-builder-v2/page-template-empty-state.test.tsx | 4 | 0 |
| apps/platform/components/store-builder-v2/page-template-picker.test.tsx | 6 | 0 |
| apps/platform/components/store-builder-v2/pixels-screen.test.tsx | 2 | 0 |
| apps/platform/components/store-builder-v2/preview-as-controls.test.tsx | 7 | 0 |
| apps/platform/components/store-builder-v2/preview-overlay.test.tsx | 15 | 0 |
| apps/platform/components/store-builder-v2/publish-confirm-sheet.test.tsx | 7 | 0 |
| apps/platform/components/store-builder-v2/redirects-screen.test.tsx | 4 | 0 |
| apps/platform/components/store-builder-v2/scheduled-changes-screen.test.tsx | 6 | 0 |
| apps/platform/components/store-builder-v2/section-edit-panel.test.tsx | 9 | 0 |
| apps/platform/components/store-builder-v2/section-list-panel.test.tsx | 8 | 0 |
| apps/platform/components/store-builder-v2/section-picker.test.tsx | 10 | 0 |
| apps/platform/components/store-builder-v2/segments-screen.test.tsx | 5 | 0 |
| apps/platform/components/store-builder-v2/shipping-screen.test.tsx | 14 | 0 |
| apps/platform/components/store-builder-v2/toolbar-controls.test.tsx | 5 | 0 |
| apps/platform/components/store-builder-v2/variant-add-wizard.test.tsx | 20 | 0 |
| apps/platform/components/store-builder-v2/variant-editor.test.tsx | 24 | 0 |
| apps/platform/components/store-builder-v2/variant-list.test.tsx | 9 | 0 |
| apps/platform/components/store-builder-v2/version-history-screen.test.tsx | 7 | 0 |
| apps/platform/components/ui/bottom-sheet.test.tsx | 4 | 0 |
| apps/platform/components/ui/toaster.bulk-progress.test.tsx | 2 | 0 |
| apps/platform/e2e/example.spec.ts | 2 | 0 |
| apps/platform/e2e/orders.spec.ts | 1 | 0 |
| apps/platform/hooks/orders-swr-cache.test.ts | 6 | 0 |
| apps/platform/hooks/use-announcements.test.ts | 5 | 0 |
| apps/platform/hooks/use-duplicate-dispatch-guard.test.ts | 4 | 0 |
| apps/platform/hooks/use-grouped-phone-input.test.tsx | 3 | 0 |
| apps/platform/hooks/use-headroom.test.tsx | 7 | 0 |
| apps/platform/hooks/use-iframe-bridge.test.tsx | 17 | 0 |
| apps/platform/hooks/use-is-mobile-editor.test.tsx | 3 | 0 |
| apps/platform/hooks/use-order-details-form.test.tsx | 4 | 0 |
| apps/platform/hooks/use-order-filters.ad-channel.test.tsx | 4 | 0 |
| apps/platform/hooks/use-order-filters.search.test.tsx | 4 | 0 |
| apps/platform/hooks/use-orders-query.window.test.tsx | 2 | 0 |
| apps/platform/hooks/use-salaries.test.ts | 6 | 0 |
| apps/platform/hooks/use-section-presets.test.ts | 4 | 0 |
| apps/platform/hooks/use-store-builder-v2.publish-gate.test.tsx | 3 | 0 |
| apps/platform/lib/abandoned-cart-sender.test.ts | 3 | 0 |
| apps/platform/lib/ad-attribution.test.ts | 23 | 0 |
| apps/platform/lib/ad-channel-filter.test.ts | 8 | 0 |
| apps/platform/lib/analytics/channel-metrics.test.ts | 11 | 0 |
| apps/platform/lib/analytics/dashboard-calculations.test.ts | 22 | 0 |
| apps/platform/lib/analytics/dashboard-export.test.ts | 7 | 0 |
| apps/platform/lib/analytics/dashboard-metrics-schema.test.ts | 6 | 0 |
| apps/platform/lib/analytics/dashboard-order-facts.test.ts | 11 | 0 |
| apps/platform/lib/analytics/dashboard-work-queue.test.ts | 2 | 0 |
| apps/platform/lib/auth/require-action-caller.test.ts | 13 | 0 |
| apps/platform/lib/auth/resolve-active-tenant.test.ts | 5 | 0 |
| apps/platform/lib/auth/server-actions-guarded.test.ts | 3 | 0 |
| apps/platform/lib/blacklist-matching.test.ts | 4 | 0 |
| apps/platform/lib/brand-themes.test.ts | 5 | 0 |
| apps/platform/lib/chat/avatar-identity.test.ts | 9 | 0 |
| apps/platform/lib/chat/filter-conversations.test.ts | 9 | 0 |
| apps/platform/lib/chat/fuzzy.test.ts | 5 | 0 |
| apps/platform/lib/chat/markdown.test.tsx | 6 | 0 |
| apps/platform/lib/chat/own-echo.test.ts | 6 | 0 |
| apps/platform/lib/chat/parse-references.test.ts | 2 | 0 |
| apps/platform/lib/chat/slash-commands.test.ts | 3 | 0 |
| apps/platform/lib/chat/ssrf.test.ts | 7 | 0 |
| apps/platform/lib/chat/topics.test.ts | 3 | 0 |
| apps/platform/lib/chat/unread.test.ts | 7 | 0 |
| apps/platform/lib/customer-aggregates-access.test.ts | 1 | 0 |
| apps/platform/lib/customer-reliability.test.ts | 26 | 0 |
| apps/platform/lib/customer-trust-risk.test.ts | 4 | 0 |
| apps/platform/lib/duplicate-comparison.test.ts | 15 | 0 |
| apps/platform/lib/duplicate-window.test.ts | 47 | 0 |
| apps/platform/lib/editor-i18n.test.ts | 10 | 0 |
| apps/platform/lib/export-governorate.test.ts | 5 | 0 |
| apps/platform/lib/follow-up-state.test.ts | 26 | 0 |
| apps/platform/lib/fraud-detector-tenant-scope.test.ts | 3 | 0 |
| apps/platform/lib/governorate-code-bridge.test.ts | 8 | 0 |
| apps/platform/lib/i18n-completeness.test.ts | 6 | 0 |
| apps/platform/lib/i18n-nav-keys.test.ts | 3 | 0 |
| apps/platform/lib/i18n-orders-keys.test.ts | 4 | 0 |
| apps/platform/lib/i18n-parity.test.ts | 3 | 0 |
| apps/platform/lib/interakt-send-result.test.ts | 3 | 0 |
| apps/platform/lib/interakt.test.ts | 2 | 0 |
| apps/platform/lib/layer-walk.test.ts | 5 | 0 |
| apps/platform/lib/notification-chime.test.ts | 13 | 0 |
| apps/platform/lib/notification-feed-sections.test.ts | 10 | 0 |
| apps/platform/lib/order-age-locale.test.ts | 7 | 0 |
| apps/platform/lib/order-aggregate-parity.test.ts | 5 | 0 |
| apps/platform/lib/order-api-schemas.test.ts | 15 | 0 |
| apps/platform/lib/order-bulk-batches.test.ts | 12 | 0 |
| apps/platform/lib/order-bulk-result.test.ts | 20 | 0 |
| apps/platform/lib/order-bulk-scope.test.ts | 9 | 0 |
| apps/platform/lib/order-date-guard.test.ts | 9 | 0 |
| apps/platform/lib/order-duplicates.test.ts | 17 | 0 |
| apps/platform/lib/order-export-csv.test.ts | 5 | 0 |
| apps/platform/lib/order-filter-utils.arabic-normalization.test.ts | 3 | 0 |
| apps/platform/lib/order-image-upload.test.ts | 11 | 0 |
| apps/platform/lib/order-money.test.ts | 12 | 0 |
| apps/platform/lib/order-notifications-access.test.ts | 8 | 0 |
| apps/platform/lib/order-phone-grouping.test.ts | 9 | 0 |
| apps/platform/lib/order-phone-validation.test.ts | 6 | 0 |
| apps/platform/lib/order-reasons.test.ts | 3 | 0 |
| apps/platform/lib/order-revenue.test.ts | 16 | 0 |
| apps/platform/lib/order-risk-filter.test.ts | 5 | 0 |
| apps/platform/lib/order-scheduling.test.ts | 14 | 0 |
| apps/platform/lib/order-server-search.test.ts | 23 | 0 |
| apps/platform/lib/order-status-label.test.ts | 6 | 0 |
| apps/platform/lib/order-status-machine.test.ts | 6 | 0 |
| apps/platform/lib/order-telemetry.test.ts | 7 | 0 |
| apps/platform/lib/order-total.test.ts | 5 | 0 |
| apps/platform/lib/order-utils.phone-normalization.test.ts | 2 | 0 |
| apps/platform/lib/order-window.test.ts | 25 | 0 |
| apps/platform/lib/page-templates/page-templates.test.ts | 4 | 0 |
| apps/platform/lib/product-copy.test.ts | 5 | 0 |
| apps/platform/lib/product-recent-sales.test.ts | 4 | 0 |
| apps/platform/lib/public-env-declared.test.ts | 1 | 0 |
| apps/platform/lib/publish-diff.test.ts | 9 | 0 |
| apps/platform/lib/realtime-batcher.test.ts | 6 | 0 |
| apps/platform/lib/realtime-batcher.window.test.ts | 5 | 0 |
| apps/platform/lib/recovery-stats.test.ts | 3 | 0 |
| apps/platform/lib/repositories/order-columns.test.ts | 7 | 0 |
| apps/platform/lib/repositories/order-repository.bulk-status.test.ts | 5 | 0 |
| apps/platform/lib/repositories/product-repository.test.ts | 2 | 0 |
| apps/platform/lib/responsive-overrides.test.ts | 7 | 0 |
| apps/platform/lib/returns/classify-scan.test.ts | 6 | 0 |
| apps/platform/lib/review-queue.test.ts | 2 | 0 |
| apps/platform/lib/scan-utils.test.ts | 4 | 0 |
| apps/platform/lib/section-field-groups.test.ts | 26 | 0 |
| apps/platform/lib/sections-manifest.test.ts | 6 | 0 |
| apps/platform/lib/starter-store.test.ts | 26 | 0 |
| apps/platform/lib/store-templates/store-templates.test.ts | 16 | 0 |
| apps/platform/lib/storefront-url.test.ts | 5 | 0 |
| apps/platform/lib/tenant.test.ts | 5 | 0 |
| apps/platform/lib/variant-summary.test.ts | 9 | 0 |
| apps/platform/lib/webhook-auth.test.ts | 30 | 0 |
| apps/platform/lib/webhook-handler.attribution.test.ts | 5 | 0 |
| apps/platform/lib/webhook-handler.cleanup.test.ts | 3 | 0 |
| apps/platform/lib/whatsapp-contact.test.ts | 17 | 0 |
| apps/platform/lib/whatsapp-delivery-receipts.test.ts | 6 | 0 |
| apps/platform/lib/whatsapp-dispatcher.test.ts | 4 | 0 |
| apps/platform/store/order-store-reset.test.ts | 4 | 0 |
| apps/storefront/app/api/cart/abandoned/route.test.ts | 3 | 0 |
| apps/storefront/app/api/checkout/orders/route.test.ts | 21 | 0 |
| apps/storefront/app/api/reviews/route.test.ts | 5 | 0 |
| apps/storefront/app/robots.test.ts | 3 | 0 |
| apps/storefront/components/schneiders-preview-bridge.test.tsx | 18 | 0 |
| apps/storefront/components/schneiders-preview-live-renderer.test.tsx | 10 | 0 |
| apps/storefront/components/schneiders/pixel-route-change.test.tsx | 3 | 0 |
| apps/storefront/components/schneiders/v1-theming.test.ts | 4 | 0 |
| apps/storefront/lib/arabic-bidi-css.test.ts | 4 | 0 |
| apps/storefront/lib/brand-kit-alpha.test.ts | 6 | 0 |
| apps/storefront/lib/candy-bento-tokens.test.ts | 12 | 0 |
| apps/storefront/lib/capi.test.ts | 4 | 0 |
| apps/storefront/lib/product-status-filter.test.ts | 8 | 0 |
| apps/storefront/lib/section-class-resolution.test.tsx | 4 | 0 |
| apps/storefront/lib/seo.test.ts | 7 | 0 |
| apps/storefront/lib/storefront-runtime.test.ts | 27 | 0 |
| apps/storefront/lib/tenant.test.ts | 2 | 0 |
| packages/sections/src/RenderSection.boundary.test.tsx | 1 | 0 |
| packages/sections/src/RenderSection.overlay.test.tsx | 5 | 0 |
| packages/sections/src/RenderSection.sticky.test.tsx | 4 | 0 |
| packages/sections/src/_chrome.test.tsx | 19 | 0 |
| packages/sections/src/_facets.test.ts | 15 | 0 |
| packages/sections/src/_lazy-section.test.tsx | 3 | 0 |
| packages/sections/src/_order-confirmation.test.tsx | 16 | 0 |
| packages/sections/src/_pdp-form.test.tsx | 13 | 0 |
| packages/sections/src/_pdp-gallery.test.tsx | 10 | 0 |
| packages/sections/src/_pdp-social.test.tsx | 15 | 0 |
| packages/sections/src/_pdp-variants.test.tsx | 3 | 0 |
| packages/sections/src/_registry.test.ts | 13 | 0 |
| packages/sections/src/_render-smoke.test.tsx | 14 | 0 |
| packages/sections/src/_search-results-grid.test.tsx | 6 | 0 |
| packages/sections/src/_signature-sections.test.tsx | 97 | 0 |
| packages/sections/src/faq-ledger.test.tsx | 8 | 0 |
| packages/sections/src/helpers/cart-store.test.ts | 5 | 0 |
| packages/sections/src/helpers/catalog-filter.test.ts | 9 | 0 |
| packages/sections/src/helpers/catalog-grid.test.tsx | 22 | 0 |
| packages/sections/src/helpers/compact-count.test.ts | 6 | 0 |
| packages/sections/src/helpers/format.test.ts | 4 | 0 |
| packages/sections/src/helpers/primitives.test.tsx | 5 | 0 |
| packages/sections/src/helpers/product-search.test.ts | 14 | 0 |
| packages/sections/src/helpers/variant-store.test.ts | 4 | 0 |
| packages/sections/src/helpers/whatsapp.test.ts | 8 | 0 |
| packages/sections/src/html_embed.test.tsx | 2 | 0 |
| packages/sections/src/order_tracker.stage.test.ts | 9 | 0 |
| packages/sections/src/pdp-price.test.tsx | 4 | 0 |
| packages/sections/src/product-card.test.tsx | 17 | 0 |
| packages/sections/src/product_attributes.test.tsx | 12 | 0 |
| packages/sections/src/section-default-claims.test.ts | 2 | 0 |
| packages/sections/src/site_footer.address.test.ts | 5 | 0 |
| packages/sections/src/site_footer.links.test.tsx | 2 | 0 |
| packages/sections/src/site_footer.reward.test.tsx | 3 | 0 |
| packages/sections/src/testimonial-stage.test.tsx | 9 | 0 |
| packages/shared/src/abandoned-cart.test.ts | 5 | 0 |
| packages/shared/src/arabic-search.test.ts | 17 | 0 |
| packages/shared/src/brand-kit-vars.test.ts | 23 | 0 |
| packages/shared/src/bundle.test.ts | 5 | 0 |
| packages/shared/src/custom-pages.test.ts | 18 | 0 |
| packages/shared/src/delivery.test.ts | 11 | 0 |
| packages/shared/src/discount.test.ts | 8 | 0 |
| packages/shared/src/governorates.test.ts | 7 | 0 |
| packages/shared/src/health-rules.test.ts | 31 | 0 |
| packages/shared/src/locale.test.ts | 12 | 0 |
| packages/shared/src/loyalty.test.ts | 7 | 0 |
| packages/shared/src/phone.test.ts | 7 | 0 |
| packages/shared/src/pixel.test.ts | 5 | 0 |
| packages/shared/src/preview-token.test.ts | 5 | 0 |
| packages/shared/src/product-attribute.test.ts | 17 | 0 |
| packages/shared/src/prune-orphaned-variants.test.ts | 5 | 0 |
| packages/shared/src/redirects.test.ts | 14 | 0 |
| packages/shared/src/review.test.ts | 3 | 0 |
| packages/shared/src/schedule-time.test.ts | 7 | 0 |
| packages/shared/src/types/resolve-i18n.test.ts | 7 | 0 |
| packages/shared/src/types/store-config-v2-resolver.test.ts | 60 | 0 |
| packages/shared/src/types/store-config-v2.test.ts | 1 | 0 |
| packages/shared/src/util/sanitize-css.test.ts | 8 | 0 |
| packages/shared/src/utils.test.ts | 5 | 0 |
| scripts/migrate-store-config-v2/mapper.test.ts | 9 | 0 |

---

## 5. Dependencies

### 5.1 package.json dependencies
- **root package.json** — dev: turbo ^2.5.0, husky ^9.1.7, lint-staged ^16.2.7, vitest ^2.1.9.
- **apps/platform** — deps: @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^10.0.0, @dnd-kit/utilities ^3.2.2, @google/generative-ai ^0.24.1, @radix-ui/react-dialog ^1.1.2, @radix-ui/react-dropdown-menu ^2.1.2, @radix-ui/react-popover ^1.1.15, @radix-ui/react-select ^2.2.1, @radix-ui/react-slot ^1.1.1, @radix-ui/react-switch ^1.2.6, @radix-ui/react-toast ^1.2.5, @scheniders/sections, @scheniders/shared, @scheniders/supabase, @scheniders/ui (workspace), @sentry/nextjs ^10.40.0, @serwist/next ^9.5.0, @serwist/precaching ^9.5.0, @serwist/sw ^9.5.0, **@sparticuz/chromium ^143.0.4**, @supabase/ssr ^0.8.0, @supabase/supabase-js ^2.50.1, @tanstack/react-query ^5.90.16, @tanstack/react-virtual ^3.13.19, @tiptap/extension-link/placeholder/text-align/underline ^3.22.3, @tiptap/pm ^3.22.3, @tiptap/react ^3.22.3, @tiptap/starter-kit ^3.22.3, @types/qrcode ^1.5.6 (types in deps), @upstash/qstash ^2.9.0, @vercel/speed-insights ^1.3.1, **@zxing/browser ^0.2.0, @zxing/library ^0.22.0**, class-variance-authority ^0.7.1, clsx ^2.1.1, date-fns ^4.1.0, **exceljs ^4.4.0**, framer-motion ^11.15.0, fuse.js ^7.1.0, **html2canvas ^1.4.1**, **html2pdf.js ^0.14.0**, idb-keyval ^6.2.2, jsbarcode ^3.12.1, **jspdf ^3.0.4**, jspdf-autotable ^5.0.7, lucide-react ^0.468.0, next 16.0.10, next-themes ^0.4.6, pdf-parse ^2.4.5, **pdfjs-dist ^5.5.207**, pg ^8.19.0, **puppeteer-core ^24.40.0**, qrcode ^1.5.4, react 19.2.1, react-dom 19.2.1, recharts ^2.15.4, sonner ^2.0.7, tailwind-merge ^2.6.1, tailwindcss-animate ^1.0.7, **xlsx ^0.18.5**, zod ^4.3.5, zustand ^5.0.11. dev: @playwright/test ^1.58.2, @storybook/addon-a11y/addon-docs/addon-onboarding/nextjs ^10.1.11, @tailwindcss/postcss ^4, @testing-library/react ^16.3.2, @types/node ^20, @types/pg ^8.15.6, @types/react ^19, @types/react-dom ^19, @vitejs/plugin-react ^6.0.2, dotenv ^17.2.3, eslint ^9, eslint-config-next 16.0.10, eslint-plugin-storybook ^10.1.11, jsdom ^29.1.1, storybook ^10.1.11, tailwindcss ^4, typescript ^5, vite ^8.0.0, vitest ^2.1.9, webpack-bundle-analyzer ^5.1.0.
- **apps/storefront** — deps: @scheniders/sections, @scheniders/shared, @scheniders/supabase, @supabase/ssr ^0.5.2 (platform/admin on ^0.8.0), @supabase/supabase-js ^2.46.1, lucide-react ^0.460.0, next ^16.0.0 (unpinned vs 16.0.10 elsewhere), react ^19.0.0, react-dom ^19.0.0, zod ^4.3.5, zustand ^5.0.0. dev: @types/node ^22.9.0, @types/react ^19, @types/react-dom ^19, eslint ^9, eslint-config-next ^16.0.0, tailwindcss ^3.4.14 (v3, others v4), postcss ^8.4.49, autoprefixer ^10.4.20, typescript ^5.7.2, vitest ^2.1.9, jsdom ^29.1.1.
- **apps/admin** — deps: @radix-ui/react-dialog/dropdown-menu/popover/select/slot/switch/toast (same as platform), @scheniders/shared, @scheniders/supabase, @scheniders/ui, @supabase/ssr ^0.8.0, @supabase/supabase-js ^2.50.1, @tanstack/react-query ^5.90.16, @tanstack/react-virtual ^3.13.23, class-variance-authority ^0.7.1, clsx ^2.1.1, date-fns ^4.1.0, framer-motion ^11.15.0, fuse.js ^7.1.0, lucide-react ^0.468.0, next 16.0.10, next-themes ^0.4.6, react 19.2.1, react-dom 19.2.1, recharts ^2.15.4, sonner ^2.0.7, tailwind-merge ^2.6.1, tailwindcss-animate ^1.0.7, zod ^4.3.5, zustand ^5.0.11. dev: @tailwindcss/postcss ^4, @types/node ^20, @types/react ^19, @types/react-dom ^19, eslint ^9, eslint-config-next 16.0.10, tailwindcss ^4, typescript ^5. (No Sentry in admin or storefront.)
- **packages/shared** — deps: clsx ^2.1.1, tailwind-merge ^2.6.1. dev: @types/react ^19, fast-check ^4.8.0, typescript ^5, vitest ^2.1.9.
- **packages/ui** — deps: @scheniders/shared, @radix-ui/react-dialog ^1.1.2, react-dropdown-menu ^2.1.2, react-popover ^1.1.15, react-slot ^1.1.1, react-switch ^1.2.6, class-variance-authority ^0.7.1, framer-motion ^11.15.0, lucide-react ^0.468.0. dev: @types/react ^19, @types/react-dom ^19, typescript ^5.
- **packages/sections** — deps: @scheniders/shared, zod ^4.3.5, zustand ^5.0.0. dev: @testing-library/react ^16.3.2, @types/react ^19, @types/react-dom ^19, jsdom ^29.1.1, typescript ^5, vitest ^2.1.9.
- **packages/supabase** — dev: supabase ^2.76.8, typescript ^5.

### 5.2 Heavy deps — where imported, client or server
| Dep | Import site (file:line) | Client? |
|---|---|---|
| puppeteer-core | P/app/api/generate-batch-pdf/route.ts:2; P/app/api/payslip-pdf/route.ts:2 | server route |
| @sparticuz/chromium | P/app/api/generate-batch-pdf/route.ts:64 (dyn); P/app/api/payslip-pdf/route.ts:51 (dyn) | server route |
| pdfjs-dist | not imported directly anywhere (only listed in serverExternalPackages P/next.config.ts:21; transitively via pdf-parse) | — |
| pdf-parse | P/lib/delivery-import/pdf-parser.ts:7 ← P/app/api/delivery-import/parse/route.ts | server |
| html2pdf.js | **not imported anywhere** (unused dependency) | — |
| html2canvas | P/lib/screenshot.ts:7 (dyn) ← P/components/orders/order-confirmation-card.tsx ("use client") | client (lazy) |
| exceljs | P/lib/excel-report-generator.ts:3 (type), :150 (dyn); file is "use client" :1 ← P/components/orders/export-report-modal.tsx ("use client") | client (lazy) |
| jspdf | P/components/team/export-report.tsx:14 (static, "use client" :1); P/components/products/barcode/barcode-batch-print.tsx:15 (static, "use client" :1); P/components/products/import-export/export-builder.tsx:284 (dyn, "use client"); P/lib/pdf-report-generator.ts:170 (dyn, "use client" :1); P/lib/payroll-summary-pdf.ts:40 (dyn, "use client" :1) | client (2 static) |
| jspdf-autotable | P/components/products/import-export/export-builder.tsx:286, P/lib/pdf-report-generator.ts:171, P/lib/payroll-summary-pdf.ts:41 (all dyn) | client (lazy) |
| xlsx | static in client bundles: P/components/admin/data-import/export-step.tsx:3 and P/hooks/use-data-importer.ts:2 (both via "use client" P/app/admin/data-import/page.tsx), P/components/team/export-report.tsx:15, P/components/products/import-export/import-wizard.tsx:22, P/components/products/import-export/export-builder.tsx:19, P/lib/vault-utils.ts:3 (← "use client" P/app/vault/page.tsx), P/lib/excel-importer.ts:8 (no importer); dyn: P/components/products/bulk-operations-panel.tsx:466, P/lib/export-utils.ts:36, :154; scripts: P/scripts/{add-secondary-phones,update-notes,fix-prices,fix-imported-orders,import-orders,restore-catalogue-items,fix-notes-field,fix-notes,fix-excel-import,import-taslihat,process-delivery-data}.ts:3 | client (several static) |
| @zxing/browser, @zxing/library | P/hooks/use-continuous-scanner.ts:111-112 (dyn, "use client" :1); P/hooks/use-barcode-scanner.ts:136-137 (dyn, "use client" :1) | client (lazy) |
| pg | P/scripts/apply-migration.ts:1 only — runtime dependency used only by a script | script |
| jsbarcode / qrcode | jsbarcode: P/components/products/barcode/barcode-batch-print.tsx:13, barcode-generator.tsx:12, barcode-label-designer.tsx:11, P/lib/enhanced-label-generator.ts:110 (dyn). qrcode: P/components/returns/return-detail-panel.tsx:5, returns-cockpit-modal.tsx:6, barcode-batch-print.tsx:14, barcode-generator.tsx:13, barcode-label-designer.tsx:12, P/components/store-command-center/share-dialog.tsx:5, P/lib/enhanced-label-generator.ts:9 | client |

---

## 6. Repo debris (git-tracked; size in bytes)
Matches for check-*.mjs / check_*.js / *.py / *.txt / *.pdf / *_plan.md / *.resolved / output/ / tmp/ / NEXT_CHAT_PROMPT.md / env.example / root-level images. 53 files.

| File | Bytes |
|---|---|
| apps/admin/.env.example | 161 |
| apps/platform/.claude/skills/ui-ux-pro-max/data/_sync_all.py | 21832 |
| apps/platform/.claude/skills/ui-ux-pro-max/scripts/core.py | 11512 |
| apps/platform/.claude/skills/ui-ux-pro-max/scripts/design_system.py | 43614 |
| apps/platform/.claude/skills/ui-ux-pro-max/scripts/search.py | 5492 |
| apps/platform/NEXT_CHAT_PROMPT.md | 5190 |
| apps/platform/Prime file copy.pdf | 61735 |
| apps/platform/Prime file.pdf | 231166 |
| apps/platform/check-anon.mjs | 713 |
| apps/platform/check-ids.mjs | 829 |
| apps/platform/check-risk.js | 1575 |
| apps/platform/check_constraint.js | 1263 |
| apps/platform/current_row.txt | 1 |
| apps/platform/env.example | 629 |
| apps/platform/implementation_plan.md | 14060 |
| apps/platform/output/pdf/scheniders_app_summary_one_page.pdf | 4234 |
| apps/platform/replace_table.py | 3113 |
| apps/platform/rewrite_modal.py | 2725 |
| apps/platform/saas_architecture_plan.md.resolved | 7660 |
| apps/platform/saas_blueprint/draft_plan.md | 6228 |
| apps/platform/scripts/check-old-format-orders.ts | 2011 |
| apps/platform/scripts/check-orders.ts | 870 |
| apps/platform/tmp/pdfs/generate_app_summary_pdf.py | 5962 |
| apps/platform/tmp/pdfs/render/scheniders_summary-1.png | 312383 |
| apps/storefront/.env.example | 366 |
| header-desktop.png | 301527 |
| phase1-home-top.png | 149237 |
| scripts/migration/build-historical-import-sql.py | 7263 |
| scripts/migration/run-historical-import.py | 5187 |
| scripts/migration/transform-historical-csv.py | 13789 |
| tmp/audit/FINAL-REPORT.md | 19067 |
| tmp/audit/brand-story-fixed.png | 2760 |
| tmp/audit/brand-story-fixed2.png | 106410 |
| tmp/audit/category-grid-fixed.png | 40904 |
| tmp/audit/crop-category.png | 72619 |
| tmp/audit/crop-hero-fixed.png | 400565 |
| tmp/audit/crop-hero.png | 401053 |
| tmp/audit/crop-products.png | 484299 |
| tmp/audit/desktop-cart.png | 119425 |
| tmp/audit/desktop-checkout.png | 107964 |
| tmp/audit/desktop-home-full.png | 532025 |
| tmp/audit/desktop-home-tall.png | 1225698 |
| tmp/audit/desktop-home-true.png | 514567 |
| tmp/audit/desktop-pdp.png | 575806 |
| tmp/audit/findings.json | 260938 |
| tmp/audit/home-midscroll-revealed.png | 81587 |
| tmp/audit/live-supplementary-findings.md | 2735 |
| tmp/audit/mobile-home-tall.png | 480351 |
| tmp/audit/mobile-nav-open.png | 126217 |
| tmp/audit/pdp-gallery-fixed.png | 119787 |
| tmp/audit/pdp-sticky-bar.png | 208631 |
| tmp/audit/perf-hero-icons.png | 452366 |
| tmp/store-builder-suggestions.txt | 102668 |

Additional tracked app-root scratch not matched by the patterns above: apps/platform/check-risk.js (1575), apps/platform/check_constraint.js (1263) [included above], apps/platform/query-products.mjs (1016), apps/platform/test-verify.ts (798), apps/platform/LIGHTFUNNELS_TROUBLESHOOTING.md (8138), apps/platform/MILESTONE-QSTASH.md (4171), apps/platform/QUICK_FIX.md (3840), apps/platform/SMART_BATCHING_GUIDE.md (6150), apps/platform/TESTING_CHECKLIST.md (35990), apps/platform/WEBHOOK_DIAGNOSTICS.md (8729), apps/platform/iraq.svg (53779), apps/platform/saas_blueprint/draft_plan.md (6228, included), packages/supabase/01_create_customers_schema.sql (1754), 02_security_policies.sql (2891), rbac_policies.sql (5545), seed-automation.sql (22224), seed-test-data.sql (24385) — loose SQL outside migrations/.

**PII alert:** `apps/platform/Prime file.pdf` (62 pages) and `apps/platform/Prime file copy.pdf` (9 pages) are delivery-company manifests; `pdftotext` finds 79 and 96 Iraqi mobile-number-shaped strings (07XXXXXXXXX / +9647…) respectively — customer phone numbers committed to git (values not reproduced here).
Also: `apps/platform/.claude/skills/ui-ux-pro-max/**` (4 .py files, ~86 KB) is a vendored skill tracked inside the app; `tmp/audit/` holds ~5.4 MB of PNG screenshots + findings.json (260 KB) tracked despite CLAUDE.md saying tmp/ is gitignored scratch; `apps/platform/tmp/pdfs/render/scheniders_summary-1.png` (312 KB); root `header-desktop.png` (301 KB), `phase1-home-top.png` (149 KB).

---

## 7. Sentry

| App | Config files | instrumentation.ts | instrumentation-client.ts | withSentryConfig |
|---|---|---|---|---|
| platform | P/sentry.client.config.ts, P/sentry.server.config.ts, P/sentry.edge.config.ts | **missing** | **missing** | P/next.config.ts:146-152 (org "ali-b1", project "javascript-nextjs", silent) |
| storefront | none | none | none | no (no @sentry dependency) |
| admin | none | none | none | no (no @sentry dependency) |

- With @sentry/nextjs v10 + Next 16 (`next build` = Turbopack by default, P/package.json:7), `sentry.server.config.ts`/`sentry.edge.config.ts` are only loaded via `instrumentation.ts` `register()`, and `sentry.client.config.ts` is not picked up under Turbopack (needs `instrumentation-client.ts`). With neither file present, **Sentry.init likely never runs** on server/edge and probably not on the client → `captureException` calls are no-ops. (Inferred from SDK conventions; not runtime-verified.)
- DSN: `dsn: process.env.NEXT_PUBLIC_SENTRY_DSN` unconditionally in all three (client :4, edge :4, server :4); no `enabled:` guard; `tracesSampleRate: 1` everywhere (client :12, edge :7, server :7); Replay 10% sessions / 100% on error (client :8, :17, :20) with default masking.
- No `onRequestError` export (needs instrumentation.ts) → server route errors not captured.
- **No `Sentry.setUser`, `setTag` (global), `setContext` or `setExtra` anywhere** in apps/ or packages/ — no tenant/user context. Only per-call tags: P/app/error.tsx:19 (`boundary:"app-error"`), P/app/global-error.tsx:41 (`boundary:"global-error"`), P/app/store/edit/error.tsx:24 (`area:"store-builder"`), P/components/error-boundary.tsx:47, P/hooks/use-dashboard-metrics-query.ts:101, P/lib/order-telemetry.ts:71 (`buildOrderErrorReport(context)`).
- P/app/sentry-test/page.tsx:22 — a public `captureMessage` test page shipped in the app.
- Server-side code (crons, webhooks, integrations) never calls Sentry; errors go to `console.error` only.
