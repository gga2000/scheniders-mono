# Final Remediation Plan — Phase 2

**Date:** 2026-09-28 · **Branch at time of writing:** `feat/notifications-overhaul` @ `663e4dc3`
**Register:** [FINAL_AUDIT_REGISTER.md](./FINAL_AUDIT_REGISTER.md) — 54 new findings (two of NEW-53's halves and 1.5(c) withdrawn as already fixed in production); of the ~106 prior IDs, **51 are individually adjudicated and the rest carry the register's blanket "CONFIRMED as written, not re-derived"** — stated here because "105 adjudicated" overclaimed it
**Verdict:** [LAUNCH_READINESS_VERDICT.md](./LAUNCH_READINESS_VERDICT.md) — NO-GO for 150 merchants

**Written for the engineers who will execute it**, not as a summary for the owner. Each round is meant to be picked up
and worked without re-reading the register.

---

## 0. Two things stated plainly before anything else

**This plan is being written against a Phase 1 that scored 3/10.** The charter requires ≥8 before planning begins. The
owner directed otherwise. What that means in practice, and it is not a formality:

- The **security and multi-tenant findings are the reliable part** — three independent critics rated those highest and
  reproduced them to the row. Rounds 1, 4, 5, 6 and 9 rest on that work.
- The **quantitative and scale findings are the unreliable part.** The per-write cost was reported wrongly twice, in
  opposite directions, before the mechanism was found. Round 8 therefore begins by re-measuring, not by fixing.
- **Merchant-app surface quality was never measured** — roughly **66 routes and ~95 screens** have never been opened
  (v1 said "33 of ~53", which was the platform's *total* route count misread from its own companion report, halving the
  stated blind spot). Round 10 is scoped as discovery, not remediation.

**The register is 11 days old and the database moved during the audit.** Re-verify before acting on any specific number.
Spot-checked on 2026-09-28: table count, tenant count, order count, `vault_backups` policy, `admin_activity_logs` at 0
rows and `idempotency_key` at 0 rows all still hold.

**Correction to that spot-check, and it matters:** it checked the `vault_backups` *policy* and not its *volume*. The
bucket went from **31 objects / 222.9 MB** at register time, to **64 / 430 MB** on 2026-09-28, to **76 objects /
509 MB on 2026-10-02** — still under `ALL TO authenticated USING (bucket_id = 'vault_backups')`, re-verified today.
**It has more than doubled since the audit opened and nothing has changed about who can read or delete it.** Objects
span `2026-09-10` to today, i.e. the backup cron is now running daily (it had never run once before 2026-09-11), so
this grows ~**23 MB/day at 28 tenants** — on the order of **124 MB/day, ~45 GB/year, at 150** — every byte of it
cross-tenant order and customer data readable and deletable by any signed-up user. The exposure does not merely
persist; it compounds daily, which is why 1.9 was moved forward out of Round 5. The freshness check
I advertised checked the policy and missed the volume entirely. Check volume, not just shape.

**This document is v2.** It was graded 3/10 by an independent critic against the same rubric, and the revisions below
are marked. The critic's four decisive findings — a base rate that rejects Round 0's premise, a migration that takes
production down if half-applied, three P0s in no round, and the register's own top blockers unplanned — are all
reproduced and all accepted.

---

## Round 0 — Observability only · under a day · **REVISED after the plan critic**

**What v1 got wrong, and it was the sequencing decision of the whole document.** v1 opened by asserting that "the
platform has written no orders for nine days… the application stopped," and placed an incident response above six
confirmed live exposures. **A base-rate test rejects that inference**, and I did not run it before writing:

| | |
|---|---|
| Zero-order days for the real merchant, last 185 days | **91 (49%)** |
| Longest zero-order run in 2026 | **21 days** (2026-07-08 → 07-28) |
| Current run | **10 days** — the *second*-longest, shorter than one nobody called an incident |
| Seed crons `seed_generate_orders` / `seed_progress_orders` | **deactivated**, which explains the platform-wide volume drop independently |

Order flow here is campaign-driven, not a service level, and the inbound path is an external LightFunnels funnel. **"The
application stopped" is unsupported.** A *zero orders in 6 hours* alert — v1's step 0.5 — would have fired on hundreds
of windows in six months. It is a pager that is right about half the time.

**Settled on 2026-10-02: orders resumed.** `orders` is now **22,964** with the newest dated **today**, against 22,943
frozen at 2026-09-18 when v1 called it an outage. There was no incident. The base-rate test was right, v1's premise was
wrong, and the demotion of this round stands on evidence rather than argument.

**What survives, and genuinely belongs first:** you cannot verify any fix in this plan on a system you cannot observe.

| Step | Action |
|---|---|
| **0.0** | **Settled 2026-10-02 — re-confirm it, then keep it current.** Production is `scheniders-platform` from `main` @ **`3c0f0cb334e47b238c459236decdde235b153375`** (PR #109, `READY`). **That SHA is not an ancestor of the audited tree:** `3c0f0cb3...HEAD` = **171 / 99**, and **539 files differ** (514 under `apps/`/`packages/`). My earlier "branch skew is ruled out" compared against local `main` (`0b0ff8b0`), which is itself stale against the deployment — the lesson is to diff against the deployed SHA, never a local ref. The principal findings were re-verified at `3c0f0cb3` and survive (see the register's **⚠ RESOLVED** section); **two items were withdrawn as already fixed there** — 1.5(c) and the two largest halves of NEW-53. **The long tail was not re-verified and must not be assumed.** Action: print the current production SHA and `NEXT_PUBLIC_SUPABASE_URL`, write both into the register, and **re-read each item's evidence at that SHA before doing it.** Also: four `iraq_*` migrations were applied to this project today, none on disk (NEW-33) — another session is changing the database as this plan is read. |
| 0.1 | Fix OPS-01: declare all 8 undeclared `NEXT_PUBLIC_*` in `turbo.json` `build.env`. **Then confirm Sentry receives an event** — do not assume. Note the gate in Round 2 must test the *value*, not just the declaration: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` was declared and unset when web push died. |
| 0.2 | Fix the `admin_activity_logs` writer (NEW-13) — **but not as v1 described it.** `apps/admin/lib/activity-logger.ts` already exports `logAdminActivity`, writes `admin_user_id` correctly, normalises a non-UUID actor into `admin_label`, and is already called from 6 sites. **Route the three broken sites through it.** Settled against the live catalog 2026-10-02: `admin_activity_logs` has **no `admin_id` column at all** (`id, admin_user_id uuid, admin_label text, actor_email, tenant_id, action, details, ip_address inet, user_agent, created_at`), so each of these raises `42703` into a swallowed `console.error`. The three are exactly **`bulk/route.ts:243`** (`admin_id: "system"`), **`bulk/route.ts:265`** (`admin_id: auth.user.id`) and **`impersonate/route.ts:51`** (`admin_id: auth.user.id`). **`merchants/[id]/notes/route.ts:96` is already correct — leave it alone**; v1 implied otherwise. Note a literal rename to `admin_user_id` fixes only two of the three: `"system"` is not a uuid, which is precisely what the helper's `normalizeAdminId` handles by moving it to `admin_label`. **Guardrail for whoever does this:** no caller passes `ipAddress` today, and the column is `inet` — a raw multi-hop `x-forwarded-for` (`"1.2.3.4, 5.6.7.8"`) is not valid `inet` and would raise `22P02` into the same swallowed `console.error`, re-creating this exact bug. Take the first hop or leave it null. |
| 0.3 | **Explain the 0 rows before declaring it fixed** — now done, and the answer is not the one v1 guessed. Live 2026-10-02: `admin_activity_logs` = 0 rows, but `admin_users` = **6**, so the console is not unused. The decisive measurement is `restrictions`: **all 28 tenants hold `'{}'`**, so `pause` has never once succeeded — and `pause`/`unpause`/`convert-trial` are where all six *correct* `logAdminActivity` calls live. Meanwhile **no tenant is in `trial`** (11 active / 16 suspended / 1 cancelled), so `convert-trial` has nothing left to convert. The actions that *are* performed — `impersonate` and the bulk operations — are exactly the three broken writers from 0.2. **So the empty table is fully explained by the wrong column name, with no "console never used" hypothesis needed, and 0.2 is the whole fix.** v1's framing would have sent an engineer looking for a second cause that does not exist. |
| 0.4 | `prune-order-notifications` has failed **every run for 10+ days**. **Settled against the live catalog 2026-10-02: of `notifications`, `order_notifications` and `chat_notifications`, only `notifications` still exists** — both legacy tables were dropped by the notifications overhaul with no `DROP TABLE` on disk (MCP-applied, NEW-33 again). The on-disk function body deletes from **all three**, so repairing only the `chat_notifications` reference — which an earlier draft prescribed — still fails on `order_notifications`. **Redefine the function to touch `notifications` only.** Then remove it from Round 8.3, where v1 held it up as the retention pattern to copy; use `prune_notification_deliveries`, which succeeds. *Verified when* `cron.job_run_details` shows `succeeded` on the next run and `notifications` loses rows older than the window. |

**Moved out of Round 0, to a parallel business thread that does not gate security work:** determining whether the order
stoppage is deliberate, and the `scheniders.com` apex DNS decision (apex → `192.64.119.16`, no TCP; `www` → CNAME
`shop.mylightfunnels.com`, serving 200). Both are real and worth doing. Neither is an incident on this evidence, and a
DNS cutover on a live revenue path is not an afternoon's work.

**Findings closed:** OPS-01, NEW-13. **Effort:** under a day. **Migrations:** none.
**What could break:** declaring env vars changes what is inlined at build — redeploy and smoke-test the preview iframe,
which depends on `NEXT_PUBLIC_PLATFORM_ORIGIN` (NEW-45).
**Rollback:** revert `turbo.json`; the logging change is additive.

---

## Round 1 — Close what is live and unauthenticated · 3–4 days · **EXPANDED after the plan critic**

Every item here is reachable from the internet **right now** with no credential. Ordered by what an attacker gets.

| # | Finding | Fix | Verification |
|---|---|---|---|
| 1.1 | **NEW-01** — `GET /api/health` on `apps/admin` returns every tenant's `business_name`, `plan`, `risk_score`, `balance_iqd`. Confirmed live: HTTP 200, 6,741 bytes. | Remove `/api/health` from the middleware bypass (`middleware.ts:33,37`), or split a static liveness probe from the business report. | Unauthenticated GET returns 401 and contains no tenant names. |
| 1.2 | **NEW-48** — `tenant_public_stats` is anon-readable: **10 rows** (v1 said 12 — not a figure in the register or the database) with per-tenant order and customer volume, joinable to 11 anon-visible `tenants` rows. | **The exact live state, so the fix is unambiguous:** the policy is `public_stats_read [SELECT] roles=public` with qual `EXISTS (SELECT 1 FROM tenants t WHERE t.id = tenant_public_stats.tenant_id AND t.status IN ('trial','active'))`, and `anon` holds a table-level `SELECT`. So it gates on tenant *liveness* but not on *who is asking* — which is why one anon call returns every live tenant. **"Scope the RLS policy to a single tenant" is therefore impossible as written** (an earlier draft said it): `anon` carries no identity for a policy to key on. **Do one of: (a) `REVOKE SELECT ON tenant_public_stats FROM anon` and serve the per-store widget from a server route that takes the slug; or (b) keep anon read and drop the aggregate columns (`completed_orders`, `customers`) from what anon can see.** (a) is cleaner — nothing in the repo reads this table. | `SET LOCAL ROLE anon; SELECT count(*) FROM tenant_public_stats;` returns 0, or 1 when scoped to a single store. |
| 1.3 | **NEW-02** — `/api/lightfunnels/sync` has no auth and exposes `save_token` / `remove_token`. Reachable on the custom domain. | **Split this.** (a) **Now:** `resolveCallerTenant()` + `requireTenantAdmin()` on **both POST and GET** — an earlier draft guarded only POST, and the GET handler is equally open. (b) **Not in this round:** moving the token from `public.settings` to `tenant_integrations` is a design decision, not a security fix — the token is a single platform-global row today and **three of its six readers have no session** (`webhook-handler.ts`, `cron/process-checkouts`, `cron/process-checkouts-manual`). Executed literally in Round 1 it hands `null` to the live LightFunnels order-intake path, on a security round whose verification would not notice. It needs an owner decision plus a data migration, and belongs with Round 3. | Unauthenticated **POST and GET** both return 401. |
| 1.4 | **NEW-03** — `/api/webhooks/interakt/dispatch-event` is an open WhatsApp relay with unvalidated `overridePhone`. | **Delete the route.** v1 offered this as the second of two options; the call-site census settles it as the only one. `grep -rn dispatch-event` over the whole repo returns **no caller** — the surviving hits are a comment in `whatsapp-dispatcher.ts:8`, two `source` string literals written into `whatsapp_logs` (`:99`, `:130`), a test's comment, and one historical `payload->>'source'` filter in `20260913110000_backfill_automation_followup_attribution.sql:31` that reads old rows and is unaffected by the deletion. `dispatchWhatsAppEvent` already has its one real caller in-process at `whatsapp-dispatcher.ts:194` (`triggerImmediateConfirmation`). So nothing calls this route and nothing needs to: there is no reason to port `interakt/send`'s guard into a surface with zero consumers. Keep the `source` literals as they are — they are historical log values, not references. | `curl -X POST .../api/webhooks/interakt/dispatch-event` returns **404**, and `pnpm exec vitest run apps/platform/lib/whatsapp-dispatcher.test.ts` still passes. |
| 1.5 | **SEC-05 + debug routes** — `settings/auto-send`, `domains/verify`, `cron/process-checkouts-manual`, `debug/webhook-status`, `debug/test-webhook`, `interakt/test-button-click`. The last two **sign forged requests with the server's own secrets**. | **"Auth the first three" is too coarse — they need three different instruments, and two of them are also broken today.** (a) **`settings/auto-send`** — the PUT upserts `app_settings` with `{key, value, updated_at}` and **no `tenant_id`**, but the live PK is **composite `(key, tenant_id)` with `tenant_id NOT NULL`**, so every PUT raises `23502` and returns 500: *the toggle has never worked since `tenant_id` joined the key*. The GET is worse at launch scale — `.eq("key", …).single()` is tenant-blind and happens to work only because exactly **1** of 28 tenants has a `whatsapp_auto_send` row; the **second** tenant to set it turns every read into `PGRST116`, which the bare `catch` converts into a silent `enabled: false` for everyone. So the fix is `resolveCallerTenant()` **plus** `tenant_id` in both the filter and the upsert, not an auth check bolted onto a broken write. (b) **`domains/verify`** — the DNS check is genuine (this was wrongly accused of forging verification earlier in the engagement and corrected); the actual defect is IDOR: it looks `tenant_domains` up by `domain_id` alone under service-role. Add `resolveCallerTenant()` and `.eq("tenant_id", tenantId)`. (c) **`cron/process-checkouts-manual` — ~~WITHDRAWN 2026-10-02: already fixed in production.~~** At the deployed SHA it requires a bearer token and `verifyAccessToken`, with a comment naming exactly what the old version exposed. The audited tree still carries the `"No authentication required - useful for debugging"` version, which is how this got onto the list. **Do nothing here; merge forward instead.** (If a cron guard is ever needed on a sibling, copy **`cleanup-deleted-orders:31-35`**, which *refuses to run when `CRON_SECRET` is unset* — not `trial-suspend:19`, whose bare `authHeader !== \`Bearer ${CRON_SECRET}\`` is the shape that disabled itself in PR #90.) **Delete the three debug/test routes — and `apps/platform/app/debug/page.tsx` with them.** Verified: that page `fetch`es `/api/debug/webhook-status` at `:17` and `/api/debug/test-webhook` at `:42`, so deleting the routes alone leaves a live page calling two 404s. It is also one of the orphan routes the surface report flags as shipping to production, so removing it is correct independently. The only other references are `console.log` strings in `scripts/diagnose-webhook.ts:202-211`, which are harmless but should be updated in the same change. | Each route returns 401 or 404; **`/debug` no longer resolves**; a PUT to `settings/auto-send` as tenant A returns 200 and writes a row keyed `(whatsapp_auto_send, A)`, a GET as tenant B does **not** see it, and both still work after a second tenant has set the flag. |
| 1.6 | **NEW-11** — `auth/create-user` writes an unvalidated `role`; `admin/access-requests` then upserts `tenant_members` for an arbitrary `tenantId`. Chain: tenant admin → `super_admin` → membership in any tenant → every RLS policy opens. | **Settled against live values 2026-10-02, so the CHECK can be written without guessing.** `user_profiles.role` is `varchar` (not an enum, so a `CHECK` is addable) holding **`admin, employee, super_admin`**; `tenant_members.role` holds **`admin, member`**. **`super_admin` must remain a legal column value** — the admin console's own gate reads it — so the fix is *not* to ban the value but to stop `create-user` writing it: validate against a tenant-scoped allowlist (`admin`, `employee`, `viewer`) that excludes it, exactly as `access-requests:6` already does with its own `ALLOWED_ROLES`. Then add `CHECK (role IN (…))` on both columns using the live value sets plus any role Round 3 decides to add. | A crafted request with `role: "super_admin"` is rejected by `create-user`; a direct `UPDATE user_profiles SET role='owner'` is rejected by the constraint; and an existing `super_admin` still passes the admin console gate. |
| 1.7 | **MONEY-07 / SEC-09 — this is a class, not a count.** v1 said "five payroll tables"; a critic said six. **Both frame it too narrowly.** `packages/supabase/migrations/20260410100000_fix_all_rls_policies.sql` is a `DO $$` block that iterates `pg_policies`, **drops every existing policy on every base table carrying a `tenant_id` column**, and recreates exactly four — `tenant_isolation_{select,insert,update,delete}`, each gated on `tenant_id` alone (verified from source: `DO $$` at :25, the drop loop at :31–45, the recreate loop at :49). So **every** tenant-scoped table that had a hand-written role-aware policy before 2026-04-10 lost it. The payroll tables are where it bites hardest — payroll is computed *and written* from the browser — but they are not the boundary of the defect. | Interim: restore a role predicate on the payroll and audit tables. **The enumeration is executable — here is the query.** An executability review argued it was not, on the grounds that the catalog shows what the loop *created* rather than what it *replaced*. True, but the loop's footprint is identifiable: tables whose policy set is **exactly the four `tenant_isolation_*` and nothing else** are the ones it overwrote. `SELECT tablename FROM pg_policies WHERE schemaname='public' GROUP BY tablename HAVING count(*)=4 AND bool_and(policyname LIKE 'tenant_isolation_%')` returns **37 tables** live. That is the candidate set; triage it for the ones where a role predicate matters (payroll, audit trails, `activity_logs`) rather than restoring all 37. Full fix is Round 6. | A `member`-role session cannot `INSERT` into `payroll_records` or delete from `salary_config_history`; and the enumeration is reproducible, not a hardcoded list. |
| 1.8 | **NEW-09 / SEC-39** — `recompute_inventory(p_tenant_id uuid DEFAULT NULL)` and `zero_oversold(… DEFAULT NULL)` are `SECURITY DEFINER`, `authenticated`-executable, and the NULL branch issues an **unqualified `UPDATE products`** across all tenants. Plus `increment_usage_tracking` / `increment_order_usage` — **the billing meter**, so any signed-up user can inflate a competitor's bill. **v1 buried these inside Round 6, behind a 3–5 day redesign gated on a meeting.** | **CORRECTED — the "one line each" prescription would have taken down live merchant functionality.** An executability review caught it and I verified both halves. **(a) Do NOT revoke `recompute_inventory` / `zero_oversold`.** Their `GRANT EXECUTE … TO authenticated` at `20260530100000:499-500` is **deliberate**: `lib/repositories/product-repository.ts:33,44` calls both through `import { supabase } from "@/lib/supabase"` — the **browser** client — behind two buttons on the products page. Revoking breaks both. **Add the caller check inside the function body instead**, using the `charge_wallet_atomic` idiom the register already names as the sibling; that closes the finding (which is *missing authorization*, not *browser-callable*) while leaving the feature working. Also remove the `DEFAULT NULL` so a no-argument call cannot target every tenant. **(b) For `increment_usage_tracking` / `increment_order_usage`, revoke is correct** — their only caller is service-role (`create-order-core.ts:148`). **(c) A refutation worth recording:** the review argued these two hold a *default PUBLIC* grant, making `REVOKE … FROM authenticated` a no-op — the exact trap recorded in this project's own notes. Live `proacl` shows `postgres=X/postgres \| authenticated=X/postgres \| service_role=X/postgres` on all four, with **no leading `=X` PUBLIC entry**. The revoke works. Check `proacl` anyway before running it. | `has_function_privilege('authenticated', …)` is false for the two usage functions; the two inventory functions still execute from the products page **and** reject a caller-supplied foreign `p_tenant_id`. |
| 1.9 | **SEC-01 — moved forward from Round 5.** `vault_backups` is `ALL TO authenticated USING (bucket_id = 'vault_backups')` and now holds **76 objects / 509 MB** of cross-tenant order and customer CSVs, readable **and deletable** by anyone who signs up. v1 placed this behind CI gates and a design meeting, 4–6 days out. | **Interim, one policy change. Use `USING (false)` — do NOT "revoke the `authenticated` grant".** An earlier draft offered both; the revoke option is wrong because Supabase storage grants live on `storage.objects`, not per bucket, so revoking would take down `product-images`, `tenant-assets`, `qc-evidence` and `payroll-pdfs` as well. Serve the vault UI from a server route **in the same change** — `lib/vault-utils.ts` uses the browser client (upload :334, list :351, download :364), so it breaks otherwise. The nightly backup is unaffected (`cron/backup/route.ts` is service-role). The full tenant-prefix fix stays in Round 5, and note the register's own warning that it cannot be front-loaded: `vault-utils.ts:334` writes at the **bucket root** and `cron/backup:102` writes `auto_csv_${timestamp}/`, so Round 5's policy would deny all 76 existing objects until they are re-keyed. **This interim is therefore effectively permanent until that happens — which is the argument for doing it now, not against.** | A second signed-up account gets 0 rows from `storage.objects` in that bucket. |
| 1.10 | **NEW-04** — `lib/enhanced-label-generator.ts` is 1,980 lines with **zero** escaping, interpolating `customer_name`/`address_details`/`notes` into HTML at **22 sites** (verified: `grep -c escapeHtml` = 0 across 1,980 lines) that reaches `dangerouslySetInnerHTML` at `print-preview-modal.tsx:657` — executing in the merchant's **authenticated session**. The register ranks it #8 of 15 blockers and calls it worse than SEC-34. **v1 scheduled SEC-34 and omitted this entirely.** Second sink: `products/editor/storefront-preview.tsx:221`. | One `escapeHtml()` at every interpolation, or render from a server-owned template. | A checkout payload containing a script tag renders inert in the print preview. |
| 1.11 | **NEW-05** — `delivery-import/confirm` sets `orders.price` from a client-supplied `pdfAmount` on a service-role client with no tenant predicate, and its rollback selects four columns that do not exist on `delivery_import_items`. Register rank #9. **Absent from v1.** | `resolveCallerTenant()`, Zod, add `.eq("tenant_id", …)`, and **delete the rollback route** (it 500s today, so removing it changes no working behaviour). **CORRECTED:** an earlier draft said "re-derive the match from the parsed PDF already in scope" — **that is not a fix.** `parsedPDF` arrives in the request body and `/api/delivery-import/parse` returns the parse to the browser without persisting it, so the "authoritative" source *is* the attacker's input. Closing this properly means persisting the parse server-side at upload and re-deriving from the stored copy, or re-parsing the file at confirm. Until then the tenant predicate stops the cross-tenant write but **the arbitrary-price half stays open**. Also unmentioned until now: `delivery_imports` and `delivery_import_items` are inserted with **no `tenant_id`**, which is the root of DATA-01's 37% orphan rate. | A cross-tenant `orderId` returns 403. |
| 1.12 | **NEW-12 — added after the v2 grading, which caught it missing.** `apps/storefront/app/api/cart/abandoned/route.ts` is an unauthenticated service-role upsert that never checks the client-supplied `tenant_id` exists or is live; the recovery cron then renders the supplied item text into a real WhatsApp template at the merchant's cost. **This is the third member of the class 1.3 and 1.4 close, and v1 and v2 both dropped it silently** — the same failure that sank v1, surviving in one instance. Disclosure: the iteration log demoted it **P0 → P1** because 0 of 28 tenants have `cart_recovery.enabled`, and the register was never updated to match; the plan should have said so rather than omitting it. | Check tenant existence and liveness before the upsert. The correct sibling is three files away and already named in the register: `apps/storefront/app/api/newsletter/route.ts:66` gates on `status IN ('trial','active')`. | A POST with a non-existent or suspended `tenant_id` returns 400 and writes no row. |
| 1.13 | **NEW-49 — promoted 2026-10-02 while making 1.5 executable; it is the root cause 1.5(a) sits on.** **Not a new discovery:** `MULTI_TENANT_FANOUT_REPORT.md` §1.2 had the core of it and ranked its read-path consequence #3 of the launch blockers; the register never gave it an ID, so it never reached this plan. `20260407000000_app_settings_tenant_scoped.sql:5-6` swapped `app_settings`' PK to `(key, tenant_id)` — implicitly `NOT NULL` — and **nine call sites were never updated**. Five writes raise `23502`; three of them discard the `{ error }` and fail silently; `waseet_token` and `waseet_statuses` are **absent from the 12 live keys**, which is the proof. Four reads filter on `key` alone under service-role (`rolbypassrls = true`, so RLS does not narrow them), working only because each key currently appears exactly once. | **Do 1.5(a) and the other eight sites in one change** — splitting them leaves `clearToken()` at `waseet-api.ts:142` deleting every tenant's token on one tenant's auth failure. Copy `settings/staff-alert`, which is already correct, including its `{ onConflict: "key,tenant_id" }`. **Hold back `waseet_token`/`waseet_statuses`/`waseet_package_sizes`:** the courier credential is one shared platform account, so per-tenant caching multiplies logins by tenant count rather than fixing the login-per-call problem. Route that to Round 3 as a fourth decision (platform-settings table vs. sentinel tenant row). | A PUT to `settings/auto-send` returns 200 and writes `(whatsapp_auto_send, <caller tenant>)`; a GET as a second tenant returns that tenant's own value rather than `PGRST116` → `enabled: false`; `select count(*) from app_settings where key='waseet_token'` is **≥ 1** after one courier call, and the second call logs no new Al-Waseet login. |
| 1.14 | **NEW-50 — the precondition for 1.1, 1.7, 1.8 and 1.9.** `auth/signup/route.ts:44` sets `email_confirm: true` ("can add email verification later"), the route takes no session and has **no rate limit** (`consume_rate_limit` exists with zero call sites, SEC-13), and it writes `user_profiles.role = 'admin'`. So an `authenticated` JWT — which is all that `vault_backups`, `products.cost` and the trust RPCs require — costs one `curl` with an invented address. Separately, the partial-failure path at `:199-203` writes `status: 'incomplete'`, **which is not a member of the live `tenant_status` enum** `(trial, active, suspended, cancelled, limited)`; it raises `22P02`, the error is never destructured, and the route still returns **201** promising "an admin will review your account shortly" — which nothing can act on, since there is no such status to filter and `admin_activity_logs` is empty. | **Two small changes now, one decision deferred.** (a) Put `consume_rate_limit` in front of the route. **Corrected 2026-10-02:** it is not uncalled — in production `lib/rate-limit.ts`'s `consumeRateLimit()` already guards `orders/analyze-image:31` (keyed `analyze-image:${user.id}`, for Gemini cost), so this is copying a proven pattern rather than commissioning one. **But invert its failure mode:** the existing caller deliberately **fails open** on a limiter error, which is right for a cost cap on an authenticated feature and wrong for unauthenticated account creation — signup must **fail closed**, stated in the code. (b) Replace `'incomplete'` with a real enum member (`suspended` is the honest one) or a `provisioning_complete boolean`, and **check the returned `error`** — a status string the enum rejects must not survive this round. (c) Email verification is a signup-friction product decision → Round 3. **Note:** no live evidence the partial-failure path has fired; the 10 tenants missing `tenant_members` are all seed with 0 `user_profiles` pointing at them, which is a seed-script signature. These are confirmed code and catalog defects, not observed incidents. | Two signups from one IP in quick succession: the second is rate-limited. A forced step-4 failure leaves the tenant at a status the enum accepts, the route surfaces the failure, and the tenant is **not** anon-readable while half-provisioned. |
| 1.15 | **NEW-54 — verified at the deployed SHA, and (a) is live now.** Three webhook authenticators fail open; `TRUST_BOUNDARY_MATRIX.md` §5 had all three and none reached this plan. **(a) `webhooks/interakt/[tenantId]:84-89` fails open twice** — the outer `if (expectedSecret)` skips when the tenant has no secret, and the inner `provided &&` passes when the header is **omitted**. **Measured: 0 of 1 `tenant_integrations` rows has a `webhook_secret` key**, and that row is `interakt`, `is_active = true`. So the check is skipped today. An unauthenticated POST with a phone number selects that tenant's most recent `contacted` order (`:133-140`) and sets its status to a caller-supplied `action` under service role (`:152`), logging it as `changed_by: "whatsapp_bot"` (`:158`). Tenant-scoped and limited to `contacted` orders — but confirming is the phase that **reserves inventory**. **(b) `webhooks/lightfunnels:35-41`** accepts header-less POSTs with a `console.warn`, and `:150` calls `createOrderFromWebhook` — unauthenticated order creation, **deliberate and documented** with a TODO. **(c) `telegram/webhook:79-85`** loses its check entirely when `TELEGRAM_WEBHOOK_SECRET` is unset, and the route imports `createOrderForTenant` plus a billed Gemini extractor. | **Order of operations is the whole risk here.** For (a): **provision a `webhook_secret` for the existing integration first**, then invert the guard to require the header and fail closed — reversing that order takes the live WhatsApp webhook down, the same trap as 1.8. For (c): same inversion; copy `lib/cron-auth.ts`, which already documents this anti-pattern and 503s when its secret is unset. For (b): **not an engineering fix — route to Round 3 as a sixth decision.** HMAC-of-body is the real answer; until LightFunnels supports custom headers this is an accepted open endpoint on the live order-intake path and the owner should re-ratify it with the blast radius written down. | Unauthenticated POST to `/api/webhooks/interakt/<tenantId>` returns 401 **and** the live WhatsApp webhook still delivers; same for telegram with the var unset; `(b)` has a dated written decision. |

**Findings closed:** NEW-01, NEW-02, NEW-03, NEW-04, NEW-05, NEW-09, NEW-11, NEW-48, NEW-49 (bar the global-settings decision), NEW-50 (bar email verification), NEW-54 (a) and (c), SEC-01 (interim), SEC-05, SEC-39,
partial MONEY-07/SEC-09.
**Migrations:** four (unchanged — 1.12–1.14 are code-only) — the `tenant_public_stats` policy; the payroll role predicates; the `vault_backups` interim revoke; and **the `CHECK` constraints on `user_profiles.role` / `tenant_members.role` from 1.6**, which v2 omitted from this count and which is the one most likely to fail against existing rows.
**Effort:** **4–5 days.** v1 said "1–2" and did not include 1.8–1.11; this revision adds 1.12–1.14, of which 1.13 (NEW-49) touches nine call sites across three files and 1.14 (NEW-50) adds a rate-limit call site and an enum fix. The estimate has now moved twice in the same direction — both times because the round grew, never because a step turned out smaller than written. Treat 4–5 as a floor.
**What could break:** **1.14's rate limit can lock out real signups**, so pick the window deliberately and watch the first day — though the earlier claim that it "has never run in production" was wrong: it already guards `orders/analyze-image` there, so the mechanism itself is proven and only the window and the fail-closed inversion are new. 1.7 locks out anyone relying on `member` access to payroll screens (19 of 23 members are `admin`,
so small but not zero). 1.9 breaks the vault UI until it is moved behind a server route — that is the intended trade and
it must be scheduled in the same change, not after.
**Rollback:** each item is a single policy, grant or route change, independently revertible.

---

## Round 2 — Gates, before any more fixes · **3–4 days**

**A gate is worth more than any individual fix**, because the diagnosis is drift, not ignorance. Put these in CI before
Round 3, or Rounds 3–9 will decay the same way the last four months did.

| Gate | What it catches | Notes |
|---|---|---|
| `vitest run` in CI | 152 test files, 2,608 assertions currently gate nothing | Costs nothing. Do it first. |
| `pnpm audit --audit-level=high` | SEC-16 climbed to 6 critical unnoticed | |
| Test: every `NEXT_PUBLIC_*` in source appears in `turbo.json` `build.env` | OPS-01, which has now regressed **twice** and silently disabled a security control (NEW-45) | |
| `supabase db diff --linked` | DATA-06 / **NEW-33** — the migration files are *not* a description of the database. Three conclusions in this audit were wrong because they trusted them | |
| **RLS isolation suite with two fixture tenants** | Every isolation finding in the register is currently untested (PROC-04). **The highest-value gate on this list** — it is what proves Round 9, and it is the only mechanism that would catch the next isolation regression | **Specified in full below**, because "add an RLS suite" is where this kind of plan usually dies |
| **`SET ROLE anon` smoke test** asserting exactly which tables and columns are anon-visible | NEW-46, NEW-48 — **and my own worst error.** I read policies *about* anon instead of querying *as* anon, and asserted a false negative | Directly encodes the lesson |
| Test: every public table has RLS enabled **and** at least one policy | `anon` holds blanket table-level write grants; only RLS dead-ends them. A future table shipped without RLS is instantly anon-writable | |
| Check: every new `SECURITY DEFINER` function is `REVOKE`d from `PUBLIC`/`authenticated` | SEC-11 — 14 functions lack a caller check. `chat_search_messages` is the migration idiom | |
| Plan check: no sequential scan in any function invoked by a trigger on `orders` | **NEW-47** | |
| **Test: every route under `app/api/**` names an auth helper, against an explicit allowlist** | **The single most consequential gate missing from v2**, and the one that would have caught NEW-12. NEW-02, NEW-03, NEW-12, SEC-05 and the three debug routes are all one class, and the plan fixes them as seven instances. | **Measured today**, so the gate is specified rather than aspirational: **7 of 58 platform routes name no guard of any kind** — `lightfunnels/sync` (NEW-02), `cron/process-checkouts-manual` (SEC-05), `webhooks/interakt/dispatch-event` (NEW-03), `settings/auto-send` and `domains/verify` (SEC-05), plus `auth/signup` and `auth/callback`, which are **public by design and belong in the allowlist**. Honest caveat: a naive grep that accepts any mention of `SECRET` lets `interakt/test-button-click` pass, because it *uses* a secret to forge a request rather than to check one. The gate must match the guard *being applied to the inbound request*, not the string appearing in the file. |
| **Lint rule: no raw interpolation into an HTML template literal in `lib/**`** | NEW-04's class. Round 1.10 is 15+ instance edits across a 1,980-line file with zero escaping; without this gate the next generator reintroduces it. The register proposed this and v2 dropped it from both Round 1 and Round 2. | |
| e2e on the five must-never-break paths | login · create order · confirm (inventory moves) · submit to courier · storefront checkout | PROC-03 |

### 2A — The RLS isolation suite, specified

**Why this needs a spec and not a line item.** The repo has four `vitest.config.*` files, **no test setup file, and not
one test that connects to a real database** — the two tests mentioning Supabase mock it. CI runs a single step,
`pnpm exec turbo lint type-check build`. So this is greenfield infrastructure, not a test to add, and that is exactly
where "add an RLS suite" normally stalls.

**The design rule that makes it worth building:** *assert as the role, never read the policy.* Reading policy predicates
instead of querying as `anon` is how this audit produced its own worst error — a false "no anon exposure" claim that one
`SET LOCAL ROLE anon` query refuted. The suite exists to make that class of mistake impossible to repeat.

| Decision | Choice | Why |
|---|---|---|
| **Where it runs** | A **Supabase branch seeded from a dump of live schema** — `supabase db dump` of the production schema into the branch, **not** a branch built from `migrations/` alone | **This is the decision that makes or breaks the suite, and an earlier draft got it wrong.** A branch built from migration files inherits this plan's own NEW-33 finding: migrations are not a description of the database. Concretely — `tenant_public_stats` exists in **no migration file**, so assertion 2 could never catch NEW-48; and `vault_backups_tenant_all` **does** exist on disk, so assertion 4 would go **green on the branch while production stays wide open**. That is a verification that passes whether or not the fix is applied — the exact defect this audit has already been caught on twice. Running against the live project is still wrong (fixture rows pollute the aggregates DATA-05 corrupts). |
| **Fixtures** | **Two tenants**, each with one `authenticated` user and one row in every tenant-scoped table under test | Two is the minimum that can detect a cross-tenant read. One tenant proves nothing — which is precisely why none of these defects was caught in four months. |
| **Clients** | Three per test: `anon`, `authenticated as tenant A`, `authenticated as tenant B`. **Never the service role in an assertion** | Service role has `rolbypassrls = true`, so a suite written with it would pass against a completely open database. This is the single most important line in the spec. **Carve-out:** fixture *seeding* needs a privileged client — `auth.admin.createUser` requires it — so the rule is service-role for setup, never inside an assertion. An earlier draft forbade the only thing that can build its own fixtures. |
| **Auth** | Real JWTs minted via `signInWithPassword` against the branch's auth server for the two fixture users | A hand-crafted JWT would not exercise `get_user_tenant_ids()`, which reads `auth.uid()` and joins `tenant_members`. |
| **Location** | `packages/supabase/tests/rls/` with its own `vitest.config.ts`, excluded from the unit-test run | It is slow and needs network; it should not be in the loop developers run on save. |
| **CI** | A separate job from `turbo lint type-check build`, required on PRs touching `packages/supabase/migrations/**` or any `app/api/**` route | Keeps the fast path fast while making the gate unavoidable where it matters. |

**What it asserts**, derived from the findings rather than invented:

1. **For every table carrying `tenant_id`** — as tenant A, every read returns only A's rows; every write naming B's
   `tenant_id` is rejected. Enumerate the table list **from the catalog at runtime**, not from a hardcoded array, so new
   tables are covered the day they ship. This is the assertion that would have caught DATA-01's orphans and NEW-46.
2. **As `anon`** — snapshot exactly which tables and columns return rows, and fail on any *addition* to that set. This is
   the `SET ROLE anon` outcome test, and it is what catches NEW-48 and the `tenant_public_stats` class. Treat the
   snapshot as an allowlist that only shrinks.
3. **For every `SECURITY DEFINER` function executable by `authenticated`** — call it as tenant A with tenant B's id and
   assert it raises or returns nothing. This is SEC-11's 14 functions, and it generalises: a new unguarded definer
   function fails the suite on the day it is written.
4. **For the storage buckets** — as tenant A, list and delete against a tenant-B-prefixed object path and assert denial.
   This is SEC-01, SEC-02 and SEC-07.
5. **Collision cases from Round 9** — both tenants insert the same order number, the same blacklisted phone, the same
   `app_settings` key, and all three must succeed independently. These fail today and should be written **before** the
   Round 9 fixes, as the proof they worked.

**Effort: 2–3 days for the harness and assertions 1–2**, which is the bulk of the value; 1 further day for 3–5. It is
the longest item in Round 2 and the reason the round is 3–4 days rather than 2–3.

**Honest caveat:** assertions 3 and 5 are destructive by nature — they attempt writes. They are safe on a per-run branch
and must **never** be pointed at the live project. Put that in the harness as a **denylist** containing
`sduvpgqwhxragxtxztur` and `ibfdugifekivquwprqjc` — **not** an allowlist, which an earlier draft specified and which
cannot work, because branch refs are generated per run and unknowable in advance.

**Four blockers an engineer hits in the first hour, all verified:**

1. **`packages/supabase/config.toml:5` is `project_id = "ibfdugifekivquwprqjc"` — the OLD project.** Any
   `supabase branches create` or `db push` from this tree targets the wrong database. The repo root also has a decoy
   `./supabase/` holding only `functions/`, with no `config.toml` and no `migrations/`. The NEW ref appears only in
   `.mcp.json`. **Fix the ref before anything else in this section.**
2. **Prior art exists and the spec ignored it.** `packages/supabase/tests/` already holds `chat_rls.sql` and
   `chat_phase2a_authz.sql` — hand-rolled RLS isolation fixtures run as `psql -f` inside a rolled-back transaction,
   **with a positive control to rule out a deny-everyone false pass.** That control is the single most important idea
   this suite needs and it is already written in this repo. Start from them.
3. **`packages/supabase` has no test tooling at all** — no `vitest` dependency, no `test` script, not in any turbo task.
   "Its own `vitest.config.ts`, excluded from the unit-test run" excludes it from a run that does not exist.
4. **Related, and it makes "`vitest run` in CI costs nothing" false:** there is **no `test` task in `turbo.json`** and no
   `test` script in `apps/platform`, `apps/storefront`, `packages/ui` or `packages/supabase` — only `apps/admin`,
   `packages/sections` and `packages/shared` have one. Most of the 152 test files are unreachable by `turbo test` today.
   The gate needs scripts and a task before it needs a CI line.

**Two specification gaps to close before building:** assertion 2 needs a committed baseline artefact and a named review
path for intentional additions ("an allowlist that only shrinks" names no file); and a path-filtered *required* status
check that is skipped blocks the PR forever unless a companion always-green job reports the same check name.

**Findings closed:** PROC-01, PROC-03, PROC-04, PROC-07, PROC-08, PROC-10. **Effort: 3–4 days** (was 2–3 before the
suite above was specified).
**What could break:** CI goes red on existing debt — expect `pnpm audit` to fail immediately. Land the gate with an
allowlist and a burn-down, not by weakening the gate.

---

## Round 3 — Six decisions that must precede code · discussion, not engineering

Nothing downstream is safely implementable until these are answered. The prior audit named two; this one adds a third, and the
executability pass of 2026-10-02 added a fourth, and the orphan-findings diff a fifth and a sixth.

1. **SEC-30 — what is the single source of truth for authorization?** Three role vocabularies across three tables, and
   the app's 14 permissions have no DB representation. `tenant_members` is the right axis because it is per-tenant, which
   `user_profiles.role` structurally cannot be. **SEC-03, SEC-08 and MONEY-07 cannot be properly fixed until this is
   decided.** Note `publish_store_config_v2` already checks for an `owner` role that never exists in the data.
2. **DATA-05 — where does demo data live?** 78.7% of `orders` is seed. It corrupts every dashboard figure, and it
   corrupted this audit's own capacity numbers twice. Move seed tenants to a separate project, or add a `demo` status
   excluded from every aggregate.
3. **NEW-06 — what does `orders.price` mean?** Subtotal, or grand total? Does the courier collect the fee? Is the
   discount pre- or post-fee? Five conventions are live in one column and `waseet-api.ts:500` applies one formula to all
   of them. **This is a product decision before it is an engineering one.**

4. **NEW-49 — where do platform-global settings live, now that `app_settings` is tenant-keyed?** Three values are
   genuinely not per-tenant: `waseet_token`, `waseet_statuses` and `waseet_package_sizes` all derive from a single
   shared Al-Waseet account held in `WASEET_USERNAME`/`WASEET_PASSWORD`. They sit in a table whose PK has been
   `(key, tenant_id)` since 2026-04-07, which is why their writes have silently failed for ~178 days. **Adding
   `tenant_id` mechanically is the wrong fix** — it gives 150 merchants their own cached copy of the same token and
   multiplies courier logins by tenant count instead of eliminating them. Pick one: a dedicated `platform_settings`
   table with no `tenant_id`, or a documented sentinel tenant row that global keys are written against. This is
   entangled with decision 1's answer if courier credentials ever become per-tenant, so answer them together.

5. **NEW-50 — is signup allowed to proceed on an unverified email address?** Today it is: `email_confirm: true` with
   a code comment deferring verification. The tradeoff is real — Iraq-market signup friction against the fact that an
   `authenticated` JWT is the key to `vault_backups`, `products.cost` and the cross-tenant trust RPCs, and currently
   costs one `curl`. Round 1 adds the rate limit either way; this decides whether a mailbox is required. Answer it
   together with decision 1, since both are about what an identity in this system is worth.

6. **NEW-54(b) — is the LightFunnels webhook allowed to stay open?** `webhooks/lightfunnels:35-41` accepts POSTs with
   no secret header and `:150` creates orders from them. The code explains why (LightFunnels' UI has no per-webhook
   secret field) and carries a `TODO` for HMAC-of-body signing. This is the **live order-intake path**, so the choice
   is: accept an open endpoint until HMAC lands, or move to HMAC now and accept the integration work. Either is
   defensible; what is not defensible at 150 merchants is that the decision is currently recorded only as a code
   comment.

**Output:** six written decisions in `docs/`. **Effort:** a meeting and a day of writing.

---

## Round 4 — Wire up what already exists · **3–4 days** · best value per hour in this plan

The register's central finding is that the correct implementation frequently exists, is verified correct, and is simply
not called. These are not engineering problems.

| Finding | What exists | What runs instead |
|---|---|---|
| **NEW-08** | `merge_orders_atomic`, `unmerge_orders_atomic`, `unsplit_order_atomic` — three of the nine functions the prior audit certified as carrying caller-check + `FOR UPDATE` + role-check. **Zero call sites. `order_merge_log` and `order_split_log` have 0 rows.** | A non-atomic two-step browser merge (`use-order-crud.ts:1229`). If step 2 fails, the customer is charged and shipped twice. Split cannot be undone at all. |
| **SEC-13 / SEC-12** | `consume_rate_limit(_key, _limit, _window_seconds)` — live, correct sliding window, service-role only. **Zero call sites.** | Nothing. There is no rate limiting anywhere, including on `auth/signup` and three paid AI routes. |
| **MONEY-01** | The server-side idempotency mechanism and `uq_orders_tenant_idempotency`. | Nothing — **`idempotency_key` is NULL on all 22,943 rows.** Fix the fingerprint (`Date.now()`), stop appending a UUID in `generateIdempotencyKey`, and pass the key from all four platform creation paths. |
| **SEC-34** | `htmlToSafeParagraphs`, already written and tested. | Six legacy `Home.tsx` templates injecting `about.body` raw. |
| **SEC-27 — CORRECTED against production 2026-10-02** | `requireCronAuth`, fails closed with a written rationale — used by 5 of production's 10 cron routes. `auto-no-response` independently fails closed with a `503`. `auto-follow-up` verifies a **QStash signature** and fails closed (my first sweep called it unguarded; that was a grep false negative). | **Not "10 of 17" — 3 of 10, and conditionally.** Production has 10 cron routes, all guarded. `waseet-sync` is `if (cronSecret && authHeader !== …)`, which **skips the check entirely** when the var is unset — the PR #90 defect, still live on that one route. `subscription-renew` and `trial-suspend` use the strict comparison, so an unset var makes the literal header `Bearer undefined` pass. **`CRON_SECRET` appears to be set** — 15 of 16 `suspended` tenants have an expired `trial_ends_at`, which the strict check must have passed for — so these are **latent, not live**. Vercel refused the env listing (403), and `admin_activity_logs` being empty (NEW-13) is why this had to be inferred rather than read. **Fix = three edits** (`waseet-sync` to fail closed; the other two to `auto-no-response`'s shape), after confirming `CRON_SECRET` is present, since it is load-bearing for two routes that would otherwise 401 nightly. |

**Three corrections to v1, all from the plan critic and all verified:**

1. **The triad is a membership check, not a role check.** `merge_orders_atomic` and `unsplit_order_atomic` guard with
   `IF coalesce(auth.role(),'service_role') <> 'service_role' THEN IF _tenant_id NOT IN (SELECT get_user_tenant_ids())`.
   There is no role predicate. **Wiring the RPCs buys atomicity, not authorization** — any `member` can still merge.
   v1 sold it as both.
2. **NEW-44 is a hard prerequisite.** The one path that already has working idempotency **double-moves loyalty points on
   replay** — `checkout.ts:300-311` debits, `:377-383` credits regardless of the RPC returning an existing order. Making
   idempotency work on four more paths extends that corruption to four more paths. **Fix NEW-44 first.**
3. **Switching merge changes money, not just failure mode.** The browser merge sets `price = keep.price + archive.price`
   and touches neither `delivery_fee` nor `discount_amount`; `merge_orders_atomic` computes `_combined_discount` and
   `_combined_delivery`. So this lands a **new price convention before Round 7 defines what `orders.price` means**.
   Either sequence Round 7 first, or accept a known one-way change and record it.

Also: `consume_rate_limit` is **not** `authenticated`-executable, so "wiring it up" does not cover `lookup_order`
(SEC-12), which is called from the browser via PostgREST. That needs the call *inside* the function or a server route.

**Findings closed:** NEW-08 (atomicity only), MONEY-01, NEW-44, SEC-34, SEC-27, and the mechanism for SEC-13.
**Effort:** 3–4 days, not 1–2. **What could break:** merge becomes all-or-nothing — that is the point, but it will
surface merges that were previously half-completing, and it changes the recorded price on merged orders.

---

## Round 5 — Storage, as code-then-migration · **3–4 days**

**Correcting the charter:** §10 calls SEC-01 and SEC-02 "single SQL statements" closing the largest exposure "in under an
hour." **That is false.** The fix already exists as `20260518000003_storage_lockdown.sql` and has never been applied,
because its own header forbids it:

> `PREREQUISITES — DO NOT APPLY UNTIL platform code is changed to prefix upload paths with ${tenantId}/`

`cron/backup` writes `auto_csv_${timestamp}/` and `lib/vault-utils.ts` writes at the bucket root. Applying the migration
today breaks image upload, the nightly backup and the vault sync.

**REVISED — v1 understated the prerequisite in a way that would have taken production down.**

Every policy in that migration uses a **hard cast**: `(storage.foldername(name))[1]::uuid IN (SELECT get_user_tenant_ids())`.
**13 occurrences — every `storage.foldername` predicate in the file is a hard cast, verified from source.** (An earlier draft said 17.) **A failing cast in an RLS predicate does not deny — it raises `22P02` and errors the query.** Live
prefixes, measured 2026-09-28:

| Bucket | Objects | UUID-prefixed | **Would fail the cast** |
|---|---|---|---|
| `product-images` | 122 | 0 | **122** |
| `tenant-assets` | 85 | 5 | **80** |
| `vault_backups` | 64 | 0 | **64** (all `auto_csv_*`) |
| **Total** | 277 | 11 | **266** |

**CORRECTED again — v2's headline here was wrong, and the real hazard is different and sharper.**

v2 claimed "every `SELECT` over `product-images` throws — storefront product imagery dies for every tenant." **The
migration contradicts that.** Line 170, verbatim: `-- Read stays public (preserved from existing "Public Read Access for
Product Images" policy).` It drops only the three *write* policies (:143-145) and creates INSERT/UPDATE/DELETE
(:149/:156/:163). **It creates no SELECT policy on that bucket at all**, so public read survives untouched and uncast.
The dramatised catastrophe cannot happen by that mechanism — and v2's verification line ("confirm `SELECT` over
`product-images` still returns rows for an anonymous visitor") therefore passed trivially and tested nothing.

**What a premature apply actually breaks**, all readable from the file:

- every **upload** to `tenant-assets`, `qc-evidence` and `product-images` (INSERT policies carry the cast);
- every merchant **UPDATE/DELETE** of an existing product image or tenant asset;
- **every authenticated read of `qc-evidence`** — `qc_evidence_tenant_read` (:101-102) is the one *new* SELECT policy
  carrying a cast;
- all `vault_backups` and `customer-voice-notes` access, since both are `FOR ALL`.

**And the hazard neither v1, v2 nor the earlier critic named:** `vault_backups_tenant_all` (:128-129) and
`customer_voice_notes_tenant_all` (:192-193) are `FOR ALL TO authenticated`. Their quals therefore join the OR'd
permissive policy set for **every `storage.objects` read by any authenticated user**, and Postgres does not guarantee
that `bucket_id = '…'` is evaluated before the cast. So a `22P02` can surface on reads of entirely unrelated buckets.
**That is the real cross-bucket "production down" risk**, and it is the one path by which v2's accidental conclusion
about `product-images` could actually come true — for a reason v2 did not give.

v1 wrote step 5.2 as "backfill **or** expire existing objects" and promised "a read fallback for old prefixes for one
retention cycle." **Both are wrong.** 5.2 is a hard, all-or-nothing gate on 5.3, and the fallback is impossible from
inside this policy — the cast fires before any fallback branch could. Making one possible means **editing the migration**
to guard the cast behind a UUID regex, which v1 did not mention.

**Order, with 5.2 as a gate:** 5.1 change the six upload paths to `${tenantId}/…`. 5.2 **re-key all 266 objects, or
expire them and accept the loss** — verify 0 non-UUID prefixes remain before proceeding. 5.3 edit the migration to guard
the cast. 5.4 apply. 5.5 verify per bucket.

**Findings closed:** SEC-02, SEC-06, F-24, and SEC-01 in full (the interim revoke is Round 1.9).
**SEC-07 is NOT closed here — v1 claimed it and nothing in this round touches it.** **Verified from source:** the migration's only mention of `payroll-pdfs` is line 11 of its header comment, `← admin-only, OK`. Its policies touch five buckets — `product-images`, `qc-evidence`, `tenant-assets`, `vault_backups` and **`customer-voice-notes`**, the last of which appears in neither the register nor this plan's bucket inventory and needs its own check. The policy (`ALL` where global `user_profiles.role='admin'`,
no tenant predicate → any admin reads any tenant's payslips) is unchanged by this round and is the terminal step of
NEW-11's escalation chain. It belongs in Round 6.
**Effort:** 3–4 days, not 2 — re-keying 266 objects across three buckets including 430 MB is the bulk of it.
**Verification:** a second authenticated account cannot list or delete the first tenant's objects in any bucket; an
authenticated read of **`qc-evidence`** succeeds (that is the policy that actually carries a cast); and an authenticated
read of an **unrelated** bucket does not raise `22P02` (the `FOR ALL` cross-bucket hazard). Do **not** use "public read of
`product-images` still works" as a check — v2 did, and it passes whether or not the migration is applied.

---

## Round 6 — Authorization, once Round 3 has decided · **8–12 engineer-days over ≥3 calendar weeks**

Implements the SEC-30 decision: widen `tenant_members.role` to the four app roles, express the 14 permissions in
`role_permissions`, and make both RLS and a server-side `requirePermission()` read from it.

**Then, and only then:** SEC-03 (`products.cost` readable by every role — `authenticated` holds the column `SELECT`,
verified), SEC-08 (**14** admin routes with no in-route check — v1 said 12, contradicting its own register;
`billing/topup` imports no auth helper and bounds `amount` at `z.number().positive()` with no ceiling while
`bulk/route.ts` bounds the same operation to 1,000–10,000,000), **SEC-07** (moved here from Round 5, which claimed it
without touching it), MONEY-07 in full, SEC-04's 11 unscoped service-role routes, **SEC-24** (the LightFunnels sync
bulk-soft-deletes `pending_checkout` orders on phone with **no tenant filter** — Round 1.3 authenticates that route
without fixing the cross-tenant delete behind it), and the unauthorized `SECURITY DEFINER` functions.

**Two corrections to v1's risk analysis:**

- **It named the wrong hazard.** `get_user_tenant_ids()` has **no role predicate** — widening `tenant_members.role`
  cannot affect it, and the VERIFIED-OK holds. The real blast surface is **`is_tenant_admin()`, which hardcodes
  `role = 'admin'` and is referenced by 8 RLS policies and 2 functions**, plus `publish_store_config_v2`. Live,
  `tenant_members` is **19 `admin` / 4 `member`** — the entire access model rests on those 19 rows, and the *point* of
  this round is to downgrade some of them. The moment one becomes `employee`, that user loses 8 policies, 2 functions
  and **the ability to publish their own storefront**. Enumerate that surface before the dry run.
- **It conflated two authorization systems.** SEC-08's admin routes are gated on `admin_users` (`admin_role` ∈
  {`super_admin`, `support_staff`}; live 2 + 4), a table wholly decoupled from `tenant_members`. **The SEC-30 decision
  does not determine their fix** — they need their own.

Also: "the 14 unauthorized definer functions" is a **floor, not a closed list**. An independent sweep returns ~16
excluding trigger functions. Hand the engineer the query, not the number.

**Effort: 8–12 engineer-days over ≥3 calendar weeks, not 3–5 days.** v1 contradicted itself — a round whose own
mitigation is "a dry-run mode that logs what would be denied **for a week**" cannot complete in 3–5 days.
**What could break:** this is the round most likely to lock someone out, and it is **not safely half-completable** — a
partial `requirePermission()` rollout across 14 routes while RLS reads a new `role_permissions` shape denies in the gaps.

---

## Round 7 — The money contract · 3–5 days

Implements the NEW-06 decision.

7.1 Define `orders.price` once, in writing. 7.2 Add a DB `CHECK` and re-derivation inside `create_order_atomic` — it is
currently a verbatim JSON→column pass-through with no validation. 7.3 **Fix the editor first**: the measured divergence
tracks *editing*, not creation — 3,513 of 3,519 divergent orders were edited post-creation, and `source='manual'` has
2 orders, both conforming. So `use-order-details-form.ts:144,158,176` and `order-items-editor.tsx:154,171,201` come
before the creation writers. 7.4 Then the five creation paths. 7.5 Centralise the delivery fee — three independent
sources exist, and `computeDeliveryFee` is already the correct one.

**Scope honestly:** live exposure at the real merchant is **132 orders / 6.54M IQD absolute / −5.36M net**, not the 50M
absolute figure the register first led with. 96% of the divergence is seed data.

**Findings closed:** NEW-06, MONEY-02, MONEY-05, MONEY-13..18 depending on the decision.
**Verification:** recompute `price + delivery_fee − discount_amount` against `Σ(items)` for every order and require
agreement — **independently of the fix's own forecast.**

---

## Round 8 — Scale · re-measure before fixing · 2–4 days

**Correction carried in from the register (NEW-53), because it changes a number this round reasons from:** the scale
report assumed `/api/cron/backup` has 300 s available. It has **no `maxDuration` at all**, so it inherits Vercel's
**60 s** default — 300 s is the maximum you can *request*, and this route never does, while `waseet-locations` (a
weekly job) asks for 300. Measured today the run takes **~24 s** (`00:01:40` → `00:02:04`) for an 18.9 MB `orders.csv`;
linear scaling to 150 merchants lands near **480 s**. Headroom is 5× smaller than this round was planned against.
Both tables are still buffered whole in memory before CSV generation, so the first ceiling hit may be memory rather
than time. **Two claims withdrawn after re-reading the deployed SHA:** the unbounded `products` `.select('*')` and the
all-or-nothing upload are **already fixed in production** — the deployed route paginates every dataset and gives each
its own `try`/`catch` with failures recorded in `security_logs`. What remains live is the absent `maxDuration`
(confirmed missing at `3c0f0cb3`), the in-memory accumulation, and `app/vault/page.tsx:103-105`'s swallowed catch,
which is byte-identical in production.

**This round starts with measurement because the audit got this wrong twice.** Do not act on the register's numbers.

8.1 **NEW-47 is the one real change.** `trg_update_trust_orders` fires on every write with no `WHEN` clause and calls
`calculate_customer_trust`, whose first statement sequentially scans `orders` cross-tenant —
`Rows Removed by Filter: 22943` and 201 ms in a cold `EXPLAIN`. **Do not quote the 3.29M scans / 23.9B tuples figure from the register — `pg_stat` has since been reset and now reads 385 / 8.58M.** The mechanism is exact; the magnitude must be re-measured, which is this round's whole point. Note also that `trg_update_trust_orders` is one of **three** row triggers on `orders` with no `WHEN` clause (`trg_inv_order_changed` and `trg_loyalty_order_changed` are the others). Fix: expression indexes
on `(tenant_id, normalize_phone(phone))` and `secondary_phone`, a `WHEN` clause, and pass `tenant_id` in rather than
deriving it. **Small change, largest effect in this plan.**
8.2 Re-measure the per-write cost after 8.1, on a `→ delivered` transition, **as a function of table size**, not as a
constant.
8.3 Retention on four log tables with none: `whatsapp_logs`, `waseet_api_logs`, `activity_logs`,
`order_status_history`. **`prune_order_notifications` is NOT the model — it has failed every run for 10+ days** (`relation "public.chat_notifications" does not exist`). Use `prune_notification_deliveries`, which succeeds.
8.4 Revoke `EXECUTE` on `refresh_customer_aggregates` from `authenticated` — it is the **one** scheduled function of ten
that is authenticated-executable, and it costs 1,195 ms per call.
8.5 `max_connections = 60` with 20–30 already in use at one tenant. Size this before launch.
8.6 The 51 tables without a leading `tenant_id` index: **real cleanup, not the ceiling.** 43 are empty and
`order_status_history` is 99.96% index-served. Do it, but after 8.1.

---

## Round 9 — Multi-tenant collisions · 2–3 days

**REWRITTEN as steps.** v2 left this as a paragraph of IDs — the same bullets-without-steps defect it convicts v1 of —
in the round that addresses the plan's own stated launch risk. Ordered so the destructive key changes come last, after
the suite that can prove them.

| # | Finding | Change | Verification |
|---|---|---|---|
| 9.1 | **NEW-15** — `app_settings` is `PK (key, tenant_id)` and four call sites are tenant-blind. `whatsapp-dispatcher.ts:69` reads `.eq("key",…).single()` with no tenant, so at **tenant #2 `.single()` errors and every outbound WhatsApp is silently skipped platform-wide**, returned as `{success:true, skipped:true}`. | Add `.eq("tenant_id", …)` at the four sites; `onConflict: "key,tenant_id"` on the writes. The correct siblings are `settings/staff-alert`, `settings/order-pipeline`, `lib/staff-alerts.ts` and `hooks/use-settings.ts`. | With two tenants holding a `whatsapp_auto_send` row, a send for tenant A is not suppressed by tenant B's row. **This is the one item here that is already broken at n=1** (the PUT 500s) and it must be fixed before onboarding a second tenant. |
| 9.2 | **NEW-10** — `get_customer_percentile`, `get_customer_trust_history`, `get_customer_score_audit_log` are `SECURITY DEFINER`, `authenticated`-executable, and query `customer_trust` / `customer_trust_audit_log` with **no tenant predicate**. Called straight from the browser at `use-customer-trust.ts:12,29,82`. | Add the tenant predicate inside each function; add `SET search_path`. The correct siblings are in the same family — `get_customer_reliability`, `get_customer_dashboard_stats`, `get_paginated_customers` all use `get_user_tenant_ids()`. | Tenant A calling with a phone that exists in tenant B gets no row. **Also fixes a live correctness bug:** `get_customer_percentile` does `SELECT … INTO` with no `LIMIT`, so for the 161 phones present in more than one tenant it returns an arbitrary tenant's trust score — three of them the real merchant's. |
| 9.3 | **NEW-46** — `product_images` and `product_variants` carry an `EXISTS`-only public-read policy that does not inherit the parent's `is_visible` / `is_archived` / `is_supply` / tenant-status gate; `anon` holds `SELECT` on both. | Replace both quals with the full parent gate. **Five sibling tables in the same policy family already do exactly this** (`product_attribute_values`, `product_bundle_items`, `product_order_bumps`, `product_related`, `product_tiered_pricing`) — copy one. | As `anon`, a hidden or archived product's images and variants return 0 rows. Latent today (0 exposed) and certain once a merchant hides a product. |
| 9.4 | **NEW-34** — `role_permissions` and `user_permissions` are platform-global and `app/actions/permissions.ts:40` lets any tenant admin write them. Self-documented in the file as "ORD-A13, still open". | **This is a schema change, not a policy change** — v2 mis-filed it as the latter. `role_permissions` is `PRIMARY KEY (role, permission)` with no tenant column; scoping it means adding one and re-keying. Sequence it with Round 6, which decides the role model. | A tenant admin's permission edit does not alter another tenant's matrix. |
| 9.5 | **NEW-35 — RE-DIAGNOSED 2026-10-02, and the register is wrong about it.** The only unique index on `waseet_city_mappings` is `waseet_city_mappings_pkey` on `(id)`. There is **no unique index on `governorate_code`**, so `onConflict: "governorate_code"` raises **`42P10`**. | **This is a broken write, not a cross-tenant overwrite.** The register and v1/v2 of this plan both described a platform-wide routing-table takeover; the actual defect is that the write has never worked. Fix the write, then decide whether the table needs tenant scoping at all — and correct the register entry rather than carrying the wrong mechanism forward. | The upsert succeeds. Severity drops: there is no cross-tenant write to prevent, because there is no successful write. |
| 9.6 | **DATA-10** — `orders_order_id_key` is `UNIQUE (order_id)` globally, so one merchant's order number can fail another merchant's order creation. | Drop it; add `UNIQUE (tenant_id, order_id)`. The correct shape is on the same table: `uq_orders_tenant_idempotency`. **Check for cross-tenant number reuse before migrating** — the index currently prevents duplicates by refusing inserts, so the data is clean by construction and the migration should be safe, but verify rather than assume. | Two tenants can both hold order number `LF-00001`. |
| 9.7 | **NEW-36** — five customer tables keyed on `phone`/`customer_phone` alone while carrying a `tenant_id`: `blacklist`, `customer_risk`, `customer_whitelist`, `customer_metadata`, `customer_links`. | Re-key each to `(tenant_id, phone)`. **Correction to the register:** `customer_links` is `PK (id)` with `UNIQUE (phone_a, phone_b)` — the collision is real but the constraint to change is the unique index, not the PK, so "fix the PK" would miss it. **Do this last**: it is the most destructive change in the round, and occupancy is low (`blacklist` 1 row, the rest 0), so it is cheap now and expensive later. | Two tenants can independently blacklist the same phone. |

**Prerequisite:** Round 2's two-fixture-tenant RLS suite. Every verification above is a two-tenant assertion, which is
why that gate comes first — and why Round 1's three isolation migrations, which land before it, carry their own one-line
`SET LOCAL ROLE` checks instead.

**What could break:** 9.6 and 9.7 are index and key changes on live tables. Both are low-occupancy today, which is the
argument for doing them now. **Rollback:** 9.1–9.3 are single-site reverts; 9.6/9.7 need the inverse migration written
before the forward one is applied.

---

## Round 10 — Surface quality · mostly discovery, two items now scheduled

**Roughly 66 routes and ~95 screens have never been opened.** v1 said "33 of ~53", which was the platform's *total* route count lifted from its own companion report — a misread that halved the stated blind spot. The real figure: platform 33 + storefront 20 + admin 16 = 69 routes, of which three were opened, and `/finances` alone hosts 14 tabs while `/store/edit` hosts 15 builder screens. What was measured on the public surfaces: the storefront is in good shape
(0px overflow at 390px, 1 contrast failure in 93 nodes on home, correct IQD formatting with no bidi marks), with two real
defects — the PDP trust-badge icons at **1.39:1** contrast, and the login page firing **five authenticated Supabase
queries that all 401**.

Known from source and worth fixing regardless: the `/reports` hook-order crash on cold load (`page.tsx:189` returns above
a `useLanguage()` call at `:197`), zero `not-found.tsx` in the platform and zero `global-error.tsx` in any app, the
orders empty state hardcoding `hasFilters={true}`, `components/reports/**` at zero `t()` calls, and Arabic search
normalisation existing in exactly one of seven search paths.

**Two items promoted out of discovery into scheduled work, 2026-10-02** — both were measured in
`SURFACE_QUALITY_REPORT.md`, neither had an ID, and so neither was scheduled anywhere. They do not need the app opened,
so they are not blocked on a test login like the rest of this round:

| # | Finding | Change | Verification |
|---|---|---|---|
| 10.1 | **NEW-51** — **25 `dir=` sites across 15 `.tsx` files** break the LTR-only house rule (§6 said "19 + 2 dynamic" and undercounted). The one that matters is **`packages/ui/src/prompt-dialog.tsx:62`** in the **shared package**: unconditional `dir="rtl"`, `text-right`, and hardcoded Arabic buttons (`إلغاء`/`تأكيد`) with no `t()` — not locale-aware in any respect. Also `onboarding-wizard.tsx:239` flipping the whole first-run wizard to RTL for Arabic merchants, and `apps/admin/.../lead-form.tsx:201` `dir={dir}`, which §6 missed because a `dir={variable}` spelling escapes a `dir={…rtl…}` grep. | Remove `dir` from the 25 app-chrome sites and the 12 inline `direction: rtl` CSS sites; put `prompt-dialog`'s labels through `t()` and drop its `text-right`. **Then add an ESLint rule banning the `dir` prop outside the four document generators** — without it this returns, which is how 25 sites accumulated under a rule that has existed the whole time. **Leave the 13 occurrences in the print/document generators alone**: a shipping label is not app chrome, the rule as written says "anywhere", and that is the owner's call, not an auditor's. | `grep -rn 'dir=' apps packages --include='*.tsx'` returns only the document generators; the lint rule fails a reintroduced `dir` prop in CI; the prompt dialog renders LTR with translated buttons. |
| 10.2 | **NEW-52** — four numeral systems render the same money and dates. Live tags: **`en-IQ` ×70 · `en-US` ×4 · `ar-IQ` ×2**, plus 27 named local formatters. `apps/storefront/lib/utils.ts:8` hardcodes `"ar-IQ"` into the shared `formatIQD`, so the legacy storefront path always emits Arabic-Indic digits **plus the U+200F marks ICU injects** — the LTR rule broken through formatting rather than through `dir` — while `packages/sections`' `formatPrice` (the live V2 path) emits Latin. **§5's "the only `ar-IQ` site in the merchant app" is wrong:** `reports/return-breakdown.tsx:15-19` is real (renders `٢٥٬٠٠٠ IQD`, Arabic-Indic numerals beside a Latin code) but three more are unconditional — `order-confirmation-card.tsx:219`, `profit-breakdown-table.tsx:93`, `lib/duplicate-comparison.ts:70`. **Four, not one**, so an English-language merchant gets Arabic-Indic dates. | One exported formatter in `packages/shared`, Latin digits, **no `ar-IQ` number branch at all**; delete the storefront wrapper's hardcoded locale and the four unconditional sites; lint-ban bare `Intl.NumberFormat` for currency outside the helper. Same lint change as 10.1 — do them together. | No `ar-IQ` tag remains outside a deliberate date-only helper; one amount renders identically on the V2 and legacy storefront paths; no U+200F in rendered output. |

**§5's "42 locally re-declared formatters" is not reproducible** and I have not substituted a number of my own: my
pattern finds 27 declarations and 76 call sites, §5 records no counting method, and given this engagement's record on
counts the class is what is confirmed, not the figure. Whoever does 10.2 should count it once, properly, and write the
method down.

---

## Round 11 — The three architectural blockers · weeks, not days · **ADDED after the plan critic**

v1's worst structural failure: the register ranks NEW-14, NEW-06 and NEW-07 as the top three launch blockers, and the
verdict says these are why 150 merchants is impossible. v1 gave NEW-06 a round and left **NEW-14, NEW-07 and PROD-01 as
bullets in a closing paragraph** — no steps, no effort, no verification, no dependencies. They are the longest-lead
items in the programme and therefore the ones that most need to start early.

### 11.1 — Per-tenant courier credentials (NEW-14)

`lib/waseet-api.ts:94-96` reads `WASEET_USERNAME` / `WASEET_PASSWORD` from **process environment**. There is no
per-tenant carrier credential path and `tenant_integrations` is not consulted for Waseet. At 150 merchants every
shipment, invoice and COD remittance lands in **one upstream account with no attribution**, and `waseet/invoices`,
`waseet/invoice-orders` and `waseet/receive-invoice` are pass-throughs, so any authenticated user can read and **settle**
invoices for the whole platform. **This blocks merchant #2, not merchant #150.**

Shape: a `ShippingCarrier` interface (`submit`, `getStatus`, `cancel`, `printLabel`, `listCities`, `mapCity`), Waseet as
the first adapter, credentials in `tenant_integrations`, per-tenant per-governorate rate card. **Effort: 2–3 weeks.**
**Verification:** two tenants submit shipments and each sees only its own in the courier's invoice list.

### 11.2 — COD remittance ledger (NEW-07)

No table in the schema contains `remittance`, `payout` or `settlement`. `orders.waseet_invoice_id` is non-null on **0 of
22,943 rows** — because `cron/waseet-sync` captures it only on a *status change* and invoices are issued after status
stops changing — so the payouts screen **structurally cannot report a mismatch**. `delivery_imports.actual_amount_received`
defaults, in the UI, to the courier's own claim.

Shape: `cod_remittances` + `cod_remittance_items` fed from the invoice import, with a variance queue.

**Two prerequisites, both one-line, both of which gate this 2–3 week item — and v2 named neither:**

1. **Fix the `waseet_invoice_id` capture.** `cron/waseet-sync/route.ts:113` is `if (newStatusId === oldStatusId) continue;`, so the invoice id is captured **only on a status change** — and invoices are issued *after* the status stops changing. That is why it is null on all 22,943 orders. **The ledger has nothing to join on until this is fixed.**
2. **NEW-18 — fix the schedule.** `apps/platform/vercel.json` schedules `waseet-sync` as `0 12 * * *`, **once daily**, against a route docstring claiming every 15 minutes. A COD ledger fed by a once-daily poll inherits a 24-hour lag on every settlement figure. NEW-18 appears in no round in v1 or v2; it belongs here, before the ledger is built on top of it.

**Effort: 2–3 weeks**, plus roughly an hour for the two prerequisites.
**Verification:** a deliberately short remittance appears in the variance queue — and `waseet_invoice_id` is non-null on
orders delivered since the fix, which is the check that proves prerequisite 1 actually landed.

### 11.3 — Payment collection (PROD-01)

ZainCash / FastPay / Qi are UI labels; `wallet.ts` says the verification webhook "would" exist. Billing is a manual
top-up through the route Round 1 authenticates. **You cannot charge merchants.** Until this lands, the 150-merchant
target is a plan for giving software away. **Effort: 3–4 weeks including a provider integration.**

---

## Round 12 — Correctness findings v1 left out entirely · 5–7 days

**REWRITTEN as steps**, with the source-checkable claims re-verified today. v2 left this as bullets — the defect it
convicts v1 of — carrying roughly a fifth of the register. Grouped so each group is one person's work.

### 12A — Audit trails that do not record (1 day)

| # | Finding | Change | Verification |
|---|---|---|---|
| 12A.1 | **NEW-19** — four audit writers still broken after Round 0: `whatsapp-error-handler.ts` inserts `to_status: null` against a `NOT NULL` column; `bulk-operations-panel.tsx` writes `new_quantity`/`note` where the columns are `quantity_after`/`notes`; `customer_trust_audit_log` is SELECT-only so its only writer always throws; `orders/delete` writes to `deletion_log`, which **does not exist** (the live table is `order_deletion_log`, holding **2 rows against 41 soft-deleted orders**). | Fix each to its real column/table. Then apply Round 0.3's discipline: **confirm rows actually land** rather than assuming the rename worked. | Each writer produces a row under test. `order_deletion_log` count rises on the next soft delete. |
| 12A.2 | **`activity_logs` is the payroll attendance input and the audited party can write and delete it.** Round 1.7 adds a role predicate to the payroll tables; this table is not one of them, so **half of MONEY-07 survives Rounds 1.7 and 6 without this step.** | Role-predicate it with the payroll set, or move attendance to an explicit record. Note MONEY-09: absence is derived from *telemetry*, not attendance — so this is also a correctness fix, not only an authorization one. | A `member` session cannot insert or delete its own `activity_logs` rows. |

### 12B — Money paths (2 days)

| # | Finding | Change | Verification |
|---|---|---|---|
| 12B.1 | **The wallet ledger** — the register de-certified this VERIFIED-OK: **585 ordering-immune chain breaks, ~8.1M IQD**, all in seed tenants with the real merchant clean. The live hazard is not the seed data: **`billing/topup` is a second read-modify-write that bypasses `charge_wallet_atomic` entirely**, and Round 6 authenticates it without routing it through the ledger. | Route `billing/topup` and `app/actions/wallet.ts` through `charge_wallet_atomic`, which already carries caller check + `FOR UPDATE` + the `auth.role()` guard. | A running-balance test over `wallet_transactions` shows no new breaks after the change. **Use the running-balance test, not `wallet.balance == last balance_after`** — the latter is written by the same code path and cannot fail. |
| 12B.2 | **NEW-28 / NEW-29** — delivery-import compares courier **gross** against `orders.price` (**subtotal**), so every order carrying a fee or coupon flags `amount_mismatch`, and the staff "fix" overwrites `price` with the gross. | Compare like with like: gross against `price + delivery_fee − discount_amount`. **Sequence with Round 7** — this is the mechanism behind **83 of the real merchant's 133 divergent orders**, versus 0 of 3,387 seed divergent orders. v2 sequenced Round 7 on the edit hypothesis, which is 96% seed. | A fee-bearing order no longer flags as mismatched. |
| 12B.3 | **MONEY-12 / NEW-31 / NEW-32** — finance buckets land a day early on a UTC+3 market (`date-range-picker.tsx:48` builds "this month" as local midnight then `.toISOString()`); the P&L subtracts the customer's delivery fee as a cost, on rejected orders too, and never subtracts refunds. | Route every calendar-day conversion through the existing `baghdadDay` helpers in `lib/analytics/dashboard-calculations.ts`. Fix the P&L sign and the rejected-order ordering. | "This month" starts on the 1st in Baghdad time; gross margin reconciles against a hand-computed month. |

### 12C — Order state machine (2 days)

| # | Finding | Change | Verification |
|---|---|---|---|
| 12C.1 | **DATA-04** — `orders.status` is free text with **no `CHECK`** and 14 writers. | Add the constraint and the transition table. This is the structural prerequisite for 12C.2–12C.4; without it each is a patch. | An invalid status string is rejected at the database. |
| 12C.2 | **NEW-24** — `20260403000001_orders_completed_at.sql:14` sets `NEW.completed_at = NULL` on **any** update of a non-completed row, so re-entry re-stamps `now()`; payroll buckets on that column with no duplicate-run guard → **a `completed → X → completed` flip-flop is paid twice**. (Verified in source today.) | Make the stamp write-once, and add the duplicate-run guard `use-payroll.ts` already surfaces to the UI but does not enforce. | An order re-entering `completed` keeps its original timestamp and is not paid twice. |
| 12C.3 | **NEW-23** — the bulk status path lacks the single path's `previousOrder.status !== status` guard, so bulk-marking already-delivered orders deducts BOM supplies again. (Verified: the guard exists on one of the two `deductSupplies` call sites.) | Apply the same guard to the bulk branch. | Bulk-marking delivered orders twice deducts once. |
| 12C.4 | **NEW-25 / NEW-26 / NEW-27** — `undo_return` always lands on `confirmed` whatever the prior status, so a *delivered* order that was returned and un-returned leaves revenue and re-enters reserved stock; `process_return` has no re-entry guard; `undoLastAction` writes blind with no `expectedUpdatedAt`, no history row and no side-effect reversal. | Restore the prior status; add a re-entry guard; make undo go through the same transition path as the forward action. | Return-then-undo on a delivered order returns it to `delivered`. |
| 12C.5 | **DATA-09** — soft deletes are unenforced: RLS has no `deleted_at IS NULL` predicate and **3 soft-deleted `confirmed` orders are holding live stock reservations**. | Add the predicate to the `orders` RLS `SELECT` policy — one change, global effect, and it cannot be forgotten by the next query. | A soft-deleted order disappears from reports, exports and `recompute_inventory`'s reservation count. |

### 12D — Two class defects with gates (1–2 days)

| # | Finding | Change | Verification |
|---|---|---|---|
| 12D.1 | **SEC-31 — no security headers on any app.** Re-verified today: only `apps/platform` has a `headers()` block at all, and **zero** files across all three apps contain `Content-Security-Policy`, `Strict-Transport-Security` or `X-Frame-Options`. | Add CSP, `nosniff`, HSTS, `Referrer-Policy` and a frame-ancestors allowlist (the store builder legitimately iframes `/_preview`, so not `DENY`). **Storefront first** — it takes checkout input and runs on customer devices. CSP is also the only thing that would contain SEC-34 and NEW-04 if either is missed. | Response headers present on all three origins; the preview iframe still loads. |
| 12D.2 | **SEC-35 — CSV formula injection.** Re-verified today: **33 files build CSV rows; exactly 1 carries a formula-injection guard** (`lib/analytics/dashboard-export.ts`, which also has a test). `customer_name`, `notes` and `address_details` come verbatim from the storefront checkout form, so this is untrusted input executing on the merchant's own machine. | Extract the existing `RISKY_PREFIX` guard into one shared `csvCell()` and route every exporter through it — this also fixes DATA-11's unescaped quotes. **Add the gate:** a test asserting no exporter writes a cell without it. | A customer named `=HYPERLINK(…)` exports as inert text. |


---

## Launch-blocking vs post-launch

**CORRECTED after the v2 grading.** The previous version left **Rounds 3, 7 and 12 in neither list** — including the
register's **#2** blocker (NEW-06, `orders.price`) and a round whose own introduction says "none launch-optional". Every
round is now on exactly one side of the line.

**Blocking for 150 merchants** — Rounds **0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 12**. The three architectural items are not
bugs and are the longest-lead: per-tenant courier credentials (NEW-14 — one shared Al-Waseet account blocks merchant #2,
not merchant #150) · a payment gateway (PROD-01 — you cannot collect money) · a COD remittance ledger (NEW-07 —
`waseet_invoice_id` is null on all 22,943 orders, so the payouts screen cannot report a mismatch even in principle).
**Round 3 is blocking because Rounds 6 and 7 are declared hard-dependent on it**, and **Round 7 is blocking because the
verdict requires `orders.price` defined and `CHECK`-enforced even for a 5–10 merchant cohort.**

**Blocking for the current single merchant:** Round 0, Round 1, **and the `activity_logs` item in Round 12** — Round 12
itself states that `activity_logs` is the half of the live payroll exposure that survives Round 1.7, so listing only
Rounds 0 and 1 understated it.

**Post-launch, justified:** Round 8.6 (43 of 51 tables empty), Round 10 beyond the `/reports` crash fix, PROD-03 (public
API), PROD-06 (ATP), PROD-09 (support tooling). Each is deferred because it does not affect correctness, isolation or
money at 150 tenants.

**Deferral I am no longer comfortable asserting:** Round 10. You cannot defensibly classify as non-blocking a surface you
have never looked at, and ~66 routes and ~95 screens have never been opened. It is listed above as post-launch only
because nothing in it is *known* to block; that is an absence of evidence, not evidence of absence, and the v2 grading
is right to call it out. Treat it as **unclassified** until the merchant app is actually measured.

### Findings with no round, disclosed rather than dropped

The v2 grading found ten findings in no round. One (NEW-12) is now Round 1.12. The rest are recorded here so the
omission is a decision someone can review rather than an accident:

**NEW-18** — `vercel.json` schedules `waseet-sync` `0 12 * * *`, once daily, against a docstring claiming 15 minutes.
**This gates Round 11.2**, which depends on the `waseet_invoice_id` capture that only fires on a status change: a COD
ledger fed by a once-daily poll inherits a 24-hour lag. One-line fix, 2–3 week dependant. **It should be in Round 11.1's
prerequisites and is not.**

**NEW-16, NEW-17, NEW-20, NEW-21, NEW-22, NEW-30, NEW-39, NEW-41**, and the `create-order-core.ts:78-82` half of
**NEW-43**. Of these, **NEW-22** (`product-repository.update()` passes any column through, so any caller can set
`stock_quantity`) and **NEW-30** (every tenant's payout receipts including `raw_data`) are isolation-class and only
*implied* by SEC-04's route list — they need their own line in Round 6 or 9. **NEW-41** (live customer-facing tax copy
violating the no-tax house rule) belongs in Round 10.

Roughly 30 prior-ledger IDs are likewise neither rounded nor deferred. Some are genuinely subsumed (SEC-22→NEW-05,
SEC-29→NEW-15, PROD-05→NEW-07, SEC-37/38→the definer-function work). The rest are not, and that tail needs a decision.

---

## How this plan should be audited

Per the charter, this plan gets a critic too. The questions I would put to it:

1. Does Round 0 belong first, or is it letting an operational incident displace security work?
2. Is Round 2 (gates) correctly placed *before* Rounds 3–9, given that it delays live-exposure fixes by two days?
3. Does any round break something the register marked VERIFIED-OK? Round 6 is the risk.
4. Is any fix a workaround? Round 1.7 (interim payroll predicate) is the candidate.
5. Does each round leave the system deployable?
6. **Is Round 8 correctly sequenced as measure-then-fix, given that this audit's scale numbers were wrong twice?**
