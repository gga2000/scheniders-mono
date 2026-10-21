# CRITIC LOG

Every critic round, verbatim scores and reasons. Full critic reports live in `critic/`.

## Phase 0 — round 1
Report: critic/phase0-round1.md. Verdict: **Not yet** (no numeric score; Phase 0 is scored on completeness, not the §5 dimensions).

Gaps raised and how each was closed:
1. Pinned-commit gate re-run missing → run on 6bde0f4, recorded in PROGRESS.md and CONTEXT §3a.
2. Waseet contradiction → measured: no WASEET_* env in any Vercel target, no API log since 2026-09-09, no order with waseet_submitted_at. Recorded as L-36 for Ali.
3. §4.1 trigger chain wrong → rewritten from the 12 live `orders` triggers.
4. COVERAGE collapsed rows → regenerated at 620 rows (functions, pg_cron jobs, realtime sites, actions, edge function, robots.ts, integrations exploded).
5. database.md gaps → storage/realtime policies, 46 triggers, bucket MIME lists, INVOKER grants, missing functions added.
6. Load model → peak relabelled as a 3.5× design factor; writes/s recomputed (~3.1 base, ~31 at 10×); staff ratio fixed.
7. Count corrections → platform 53 routes, storefront 7, cache keys, per-inventory cells replaced.
8. Refresh for #136/#137 and admin env names → marked done here, but round 2 found it was **not** done (test files and drifted line numbers); closed in round 2, item 5 below.
9. Honesty wording → L-04, L-02, §8 skills statement corrected; realtime publication cross-check added as L-37 (8 unpublished tables).


## Phase 0 — round 2
Report: critic/phase0-round2.md. Verdict: **Not yet** (no numeric score). Round-1 items 1 and 3 closed; 2, 4–7 and 9 partially closed; 8 open; new gaps N1–N4.

The 8 remaining gaps and how each was closed:
1. **N1 live DB drift** → re-snapshot at 2026-10-19 00:41 UTC (`execute_sql`, SELECT only): 183 functions (126 DEFINER; 115 auth-executable, 47 anon-executable; 60 DEFINER auth, 1 DEFINER anon, 46 INVOKER anon), 345 policies, 47 public triggers, 343 migrations, 166 tables (all RLS). Diffed pg_proc / pg_policies / pg_trigger against database.md: 1 new function, 4 EXECUTE revokes, 7 search_path pins, 6 body replacements, `tenant_members` policies replaced (+2), 30 `tenant_isolation_*` predicates tightened, 1 new trigger. Source located: PR #146 (`6c0d157`, merged to `main` after the pin; `origin/main` now `87e5e40`). Recorded as **L-38** (ordinary changes; pinned snapshot is behind `main`), in database.md ("Live drift since the first snapshot"), migration-drift.md, CONTEXT §0/§2, and COVERAGE (new function row; changed rows annotated).
2. **N2 phantom tables** → `customers` (`use-bulk-actions.ts:26`, path not wired in UI), `order_items` (`use-store-analytics.ts:33`), `activity_log` (`customer-data-export.ts:95,240`) verified at `6bde0f4`; **L-39** added; 4 `missing-table` COVERAGE rows (incl. `wallets`).
3. **N3/N4 integrations** → integrations.md §2.14 (Meta CAPI, TikTok Events API: endpoints, per-tenant tokens, swallowed catches, no timeout, awaited in checkout) and §2.15 (Meta/TikTok/Snap pixels, GTM, gtag); 7 integration rows; CONTEXT §2 outbound + browser-side; §4.1 gains redeem_refund, abandoned_carts.recovered_at and CAPI steps. New **L-40**: CAPI tokens live in the anon-readable `tenants.store_config_v2` (HYPOTHESIS on exposure; 0 tokens set today).
4. **Gap 4 COVERAGE residue** → 6 `missing-function` rows; admin realtime row `use-admin-realtime.ts:150`; every INVOKER row now shows its EXECUTE grants; 6 garbled rows fixed (Source = full signature, Notes = flags); `realtime.messages` split into 5 rows; row 593 backticks fixed. Total 620 → 643 rows.
5. **Gap 8** → 11 test files added to integrations.md §4.4 with case counts; totals 253 tracked (251 `.test.*` + 2 `.spec.ts`), 2,250 cases; 5 line refs fixed (`products/page.tsx:56`, `pdp_direct_order.client.tsx:336`, `pdp_buy_box.client.tsx:131`, `queries.ts:21-30`, `queries.ts:26`). Round-1 item 8 entry above corrected.
6. **Gap 2 Waseet** → CONTEXT §2 and §4.3 mark the API path UNUSED IN PROD (L-36) and record the 53 `delivery_order_id` orders / 6 delivery imports in 30 days (re-queried) with a HYPOTHESIS on their origin.
7. **Gap 7 numbers** → storefront cache keys 14 (2 + 12, lines listed); admin Zod 14/57 (13 import zod + `leads-table-layout` via `layoutSchema`; no grep finds 16), CONTEXT and inventory agree; admin auth 44 + 12 middleware-only + 1 public callback = 57 (the callback was double-counted); L-12 corrected from 13 to 12 with the list.
8. **Wording** → L-02: invalid credentials rejected in every mode (`webhook-auth.ts:197-198`); L-37: single caller `use-order-realtime.ts:40` (`orders`, published); integrations.md cron rows: `x-vercel-cron` spoofability unverified; database.md missing list adds `exec_sql`, `search_orders_v2` (L-35 too); PROGRESS lockfile sentence states the +3-line zod change; §5.1 status changes 78,824 / 23,291 = 3.38 (MEASURED 00:44 UTC); §5.3 Lightfunnels ≈ 860/day on top of the 1,500; §5.4 total modelled writes ≈ 3.5/s base.

Still open after round 2: Vercel env names (CONTEXT §3) were not re-verified in this pass (Vercel MCP unreachable); Supabase advisors were re-run after L-38 at 00:54 UTC (CONTEXT §3), closing that item; the pre-PR-#146 function bodies were never hashed, so body changes rest on the migration file plus live guard presence.

## Phase 0 — round 3 (final)
Report: critic/phase0-round3.md. Verdict: **Ready for Phase 1**, no blocking errors. All 8 round-2 gaps closed; 24 fresh spot-checks correct; live counts match; no source changes outside audit-final/.

Minor items and how each was handled:
1. Live edge function `migrate-scheniders-iraq-product-images` missing → COVERAGE row 644 and lead L-41.
2. `packages/supabase/config.toml:5` names the old project id → lead L-42.
3. Stale "advisors not re-run" lines in database.md and this log → corrected.
4. §4.1 experiment event write placed in submitCheckout → moved to path A only.
5. Stray backtick in COVERAGE row 607 → fixed.
6. Vercel env names not re-verified (Vercel MCP unreachable) → still open; re-check at Phase 1 start if the connector is back.

## Phase 1 — round 1
Report: critic/phase1-round1.md. **Score: 7/10**, accuracy of the regression tables (this is not a §5 score).

Reasons given by the critic:
- Strengths: all 30 spot-checked rows were correct (20 of 20 Fixed, 10 of 10 Still open); evidence was concrete; the serious new holes were found.
- Weaknesses: confirmed issues (a, b, d, g) sat only in New-observations sections, without rows or severity, and g was still labelled HYPOTHESIS; store-builder counts wrong (said 306, rows 315); master-ledger counts off by one; OPS-01 (Fixed) contradicted V-6 (Partially fixed); F-16 still said "unverifiable" though the env-name file settles it; thin evidence on E1, G1, P-R3.2; truncated lists in B-01, BA-7.2, F-20.

How each requested change was applied (all in `audit-final/regression/`, no source code touched, SELECT-only SQL on `sduvpgqwhxragxtxztur`):
1. **master-ledger OPS-01** → Partially fixed; evidence is the Vercel prod env-name listing (no `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`); cross-ref V-6; the claim that it closes NEW-45 was removed.
2. **master-ledger PROD-13** → Still open, citing OR REL-B (one Supabase env record spans prod/preview/dev).
3. **master-ledger Counts** → regenerated by script. The stray row was not stray: the ledger's P2 table really holds 29 rows (its own header says 29), so the old "28 rows" text was wrong. The P2 heading and scope note were corrected.
4. **final-register P-G7** → Partially fixed (0 tables with RLS off; 4 policy-less tables named; no CI check).
5. **final-register NEW-14 Notes** → "breaks on next re-login (cached token, `waseet-api.ts:85-90`)", plus the NEW-16 fact that 0 cached tokens exist live.
6. **prod-readiness F-16** → the "unverifiable" note was replaced by the env-name evidence (no `*_AUTH_MODE`, no `TELEGRAM_WEBHOOK_SECRET`). Same env evidence also added to ML SEC-26 and FR NEW-54c.
7. **prod-readiness B-02/F-02 Notes** → cross-ref to N-1 / NEW-P1-01 (negative `_amount`).
8. **prod-readiness B-01** → all 11 F-01 routes enumerated with the line of their own admin helper call; matcher extensions enumerated from `apps/admin/middleware.ts:97`.
9. **page-audits N4** → promoted to row NEW-P1-09 (Still open, P1), including the no-op admin deactivate (`settings/team/page.tsx:355-360`). N4's narrower `current_tenant_id IS NULL` precondition was corrected.
10. **page-audits N1** → promoted to row NEW-P1-10, Partially fixed by #147 (primary phone only); the 5 files holding the remaining number are listed (number not printed).
11. **page-audits SEC-5** → stays Partially fixed; Notes now state that self-reactivation undoes the "live half closed" claim.
12. **store-builder-qc Counts** → regenerated by script from the rows (now 316 with the new row).
13. **store-builder-qc E1, G1** → `file:line` plus behaviour (SEO panel fields, mount point in `inspector-rail.tsx:233-242`, storefront consumer; `beforeunload` effect at `use-store-builder-v2.ts:564-582`).
14. **store-builder-qc BA-7.2** → all 16 token names enumerated from `ALL_SWATCH_KEYS`.
15. **prod-readiness F-20** → full list of all 112 unindexed FKs, re-derived by a live `pg_constraint`/`pg_index` query that matches the advisor list exactly.
16. **final-register P-R3.2** → the search command, its single hit and the `docs/` inventory are shown.
17. **New rows** → a: PR NEW-P1-01 (P0); b: OR NEW-P1-02 (P0); c: SB NEW-P1-03 (P1); d: ML NEW-P1-04 (P0); i: OR NEW-P1-11 (P2). e (SSRF) and the Telegram issue already had rows (ML SEC-25; FR NEW-54c / ML SEC-27), so their evidence was strengthened instead of adding duplicate rows; both appear in REGRESSION.md as NEW-P1-05 and NEW-P1-08.
18. **Truncation sweep (all six files)** → every "etc.", "e.g.", "among others" and partial "including" list in an evidence cell was replaced by the full enumeration: untimestamped migrations (20), tenant-scope tests (4), direct stock writers (5), product-repository stripped fields, backup try/catch lines, platform/storefront routes without auth helpers, `ORD-8` invalidation sites, sonner importers (31 files), en-US sites (11), `attention_reasons!` lines (11), overlay aria-labels (5), `tenants` UPDATE-granted columns (25), nullable-`tenant_id` tables (56), tables lacking admin-gated writes (30 of 42), advisor tables for F-31 (20) and F-32 (35), patch-RPC allowlist (10 roots), live cart sections. BA-14.1 is now explicitly labelled a two-site sample. Remaining "…" marks only elide quoted SQL/code.

Extra corrections found while doing this (not in the critic's list):
- master-ledger DATA-05 and N8 said the seed crons are "still scheduled"; `cron.job` shows both `active=false` (matches page-audits DATA-1). Corrected.
- master-ledger PERF-04 Unverifiable → Still open, settled by a fresh performance-advisor run (51 findings on 20 tables), which matches PR F-31.
- final-register V-5's "11 admin-gated / 26 not" split was re-queried: of 42 tables with all four `tenant_isolation_*` policies, 12 are admin/false-gated on a write and 30 are not; both lists are now in the row.
- Status conflicts left for Phase 2 (listed in REGRESSION.md Cross-source duplicates): page-audits OBS-1 / OBS-D1 / REL-D2 are Fixed although no Sentry DSN is set in prod (D-09); ML SEC-26 / PR F-16 Partially fixed vs FR / OR Still open for the same webhook issue (D-01); several by-scope differences (D-18, D-25, D-26, D-30, D-33, D-45).

Totals after round 1 (script): 749 rows: 286 Fixed, 126 Partially fixed, 290 Still open, 0 Regressed, 23 No longer applicable, 24 Unverifiable. 94 non-fixed P0-class rows. 38 new live-issue leads in REGRESSION.md (11 confirmed by the critic, 27 HYPOTHESIS).

## Phase 1 — round 2

Critic: [critic/phase1-round2.md](critic/phase1-round2.md). **Accuracy 8.5/10.** The score is at or above 8, so the Phase 1 critic loop stops here. All round-1 changes were confirmed applied, and all 25 fresh samples were correct on status.

Changes applied (every row of the critic's "Rows that must still change" table):
1. **page-audits OBS-1** → Partially fixed. The code sends tagged reports (`lib/order-telemetry.ts`), but prod has no `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`, `sentry.client.config.ts:4` reads the DSN from env, and there is no `instrumentation.ts`, so nothing is reported. Cross-refs ML OPS-01, FR V-6 and OR OBS-1/ORD-4.
2. **page-audits OBS-D1** → Partially fixed. The events half is Fixed (48 `dashboard_*` rows). Sentry is inert in prod, and `hooks/use-announcements.ts` has no Sentry call (grep = 0).
3. **page-audits REL-D2** → Partially fixed. Widget error states are Fixed. Sentry is inert in prod, and `hooks/use-batch-analytics.ts:73` still discards its query error (`const { data: orderData }`).
4. **Counts** → re-run by `count.py`. page-audits is now 82 Fixed / 20 Partially fixed (Counts section and ID list regenerated). The all-files total in REGRESSION.md is now 283 / 129 / 290 / 0 / 23 / 24 = 749.
5. **REGRESSION.md D-09** → Agree (Partially fixed).
6. **REGRESSION.md P0-list header** → now states that 35 `Blocking (150)` final-register rows and NEW-48 ("P1 (arguably P0)") are excluded. It also says that P-G1 to P-G11 and P-R3.1 to P-R3.6 have no P0 twin in the list. The script re-count confirms 35.
7. **REGRESSION.md leads** → the section is renamed "Live issues found or re-confirmed during Phase 1". NEW-P1-04, -05, -19, -23, -32 and -35 are labelled "Re-confirmed (prior audit)", and each is mapped to its prior ID. Counts: 32 new (9 Confirmed, 23 HYPOTHESIS) and 6 re-confirmed (2 Confirmed, 4 HYPOTHESIS).
8. **NEW-P1-16** → `pg_policies` query and result added: `performance_bonuses.tenant_isolation_insert/update/delete` are membership-only. The table is missing from the list at `20261019100100_tenant_admin_only_writes.sql:157-167`.
9. **NEW-P1-18** → `pg_default_acl` query and result added: for both `postgres` and `supabase_admin`, anon and authenticated get EXECUTE on functions, `arwdDxtm` on tables and `rwU` on sequences.
10. **NEW-P1-22** → `role_table_grants` query and result added: all 8 table/role pairs hold every privilege, TRUNCATE included.
11. **NEW-P1-24** → policy `orders.tenant_isolation_select` (no role test) added, along with authenticated column SELECT on `price`, `product_cost` and `net_profit`, `v_orders_with_risk` `security_invoker=true`, and `get_dashboard_metrics(text)` having an admin role test with no `VIEW_FINANCIALS`.
12. **NEW-P1-37** → file paths added (`packages/sections/src/*.tsx` `thumbnail:` declarations, `_types.ts:83`, `apps/storefront/public/sections/`, `section-picker.tsx:704-706`). A re-run gives 27 missing.
13. **store-builder-qc E3** → `nav-builder-screen.tsx:41,48-72`, `page-tree.tsx:190` and `system-screen-router.tsx:120-121`.
14. **store-builder-qc QC-FIND-2** → `qc-detail-drawer.tsx:49,74-76,152`.
15. **store-builder-qc BA-1.6** → the card order is cited with lines (`brand-kit-editor.tsx:263,350-359,421,…`), plus the eyedropper (`brand-kit/controls.tsx:392-395,418`) and a "Coming soon" grep (= 0). The full-screen half is now addressed: it is still full-screen by design (`system-screen-router.tsx:81-86`, `inspector-rail.tsx:69-71`). The status stays Fixed, and the Notes say that a literal reading of this half is a won't-do.
16. **orders-reliability STATE-6** → the exact query is given (tenant `b5c4…f45a`, `source='lightfunnels'`, `created_at >= '2026-10-12'`, soft-deleted rows included), giving 39/30 = 77%. With `deleted_at is null` the figure is 32/24 = 75%, which reconciles with the critic's number.

DB access for 8–11 and 16 was SELECT-only on `sduvpgqwhxragxtxztur`, counts and catalog data only, with no PII.

Totals after round 2 (script): 749 rows: 283 Fixed, 129 Partially fixed, 290 Still open, 0 Regressed, 23 No longer applicable, 24 Unverifiable. There are 94 non-fixed P0-class rows (unchanged). There are 38 leads: 32 new and 6 re-confirmed.

## Phase 2 Tier A (A1–A3), round 1 — 2026-10-20
Report: `critic/phase2-tierA-round1.md` (code @ 0032320, SELECT-only DB).
- P1s: none disproved. F-001 raised to **P0**; F-003 lowered to **P2 (latent)**; F-004 kept P1, marked latent (0/28 tenants enabled); F-002 and F-005 confirmed, with additions.
- P2 sample (F-006, F-007, F-008): confirmed. F-008 repro corrected (the 2 rows belong to the deactivated user).
- New: N-1 is the already-tracked NEW-P1-09 (fixed in PR #168), now listed under "tracked elsewhere"; N-2 filed as F-020; admin callback open redirect filed as F-019; Interakt `[tenantId]` NULL tenant log filed as F-021; NEW-P1-06/07 added to the tracked list.
- CLEAN sample: 9/10 correct; row 360 AuthZ corrected to NEW-P1-09.
- Coverage: +75 Tier A cells checked by the critic (rows 73, 113, 117, 120, 135, 210, 373–381, 597–606) → 1,569 checked.
- Scores: Isolation 4, AuthZ 4, Money/Order 4. All three are capped at 5 by open P0s (F-001, NEW-P1-01/02/06/07). These caps lift only when the fixes ship, so another critic round now cannot reach ≥8; the next round runs after the fixes merge and A4–A10 are hunted.

## Phase 2 Tier A (A4–A10), round 1 — 2026-10-20
- F-022 upheld at P1; title and evidence corrected (11 days is at launch volume, 115× today; storage ≈2026-11-18 is at today's rate). F-025 lowered P1 → P2 (warm 1.7 ms, 1.8 receipts/message). F-023 deletion-request impact corrected to dead code. F-026 corrected (existing index on a different function; detail path grows with customer_trust). F-028 location updated for main 7eed48be. F-030, F-031 upheld.
- CLEAN sample: 9/9 checked cells hold (row 619 not re-verified).
- Scores: A4 5, A5 5, A6 5, A7 4, A8 3, A9 3, A10 5. All capped at 7 by remaining UNCHECKED cells; A8/A9 held down by open P1 F-022.

## Phase 2 Tier B pass 1, round 1 — 2026-10-20
- F-040 raised P1 → **P0** (also reachable via column UPDATE on `order_id`, any member role). F-041 stays P1 (lock precedes the replay check). F-043 lowered to P2 latent (all October orders are one `internal`-plan tenant). F-044, F-047, F-053 confirmed; F-045/F-047 line refs corrected; F-052 mechanism reworded.
- OK-step sample: 9/9 hold.
- Scores: B-checkout 4, B-order-intake 4, B-fulfilment 5, B-storefront-browse 6, B-preview 6.

## Phase 2 Tier B pass 2, round 1 — 2026-10-20
- No escalations: F-055..F-059 hold at P2 (F-055 already happened live: 7 FULFILLED reverses on deleted orders; F-057 borderline P1). F-058 fix sketch corrected (existing tenant_members admin policies suffice). F-059 adds an active tenant with a cancelled, unbilled subscription. F-062 flagged a pre-launch blocker. New P3 (delivery import ignores `deleted_at`) folded into F-055.
- OK-step sample: 8/8 hold.
- Scores: B-merchant-lifecycle 5, B-team 4, B-finances 4, B-trash 6, B-admin 4.

## Phase 2 Tier C, round 1 — 2026-10-20
Report: `critic/phase2-tierC-round1.md` (code @ 7eed48be, count-only SELECTs).
- F-067 upheld at P1 and widened (header brand and logo, footer licence number, address, socials). F-066, F-068, F-069, F-070, F-071, F-074, F-075, F-077 upheld at P2. F-076 and F-078 lowered to P3.
- P3 sample 5/10 (F-072, F-073, F-079, F-084, F-085): all upheld.
- Clean-cell recheck 9/10; `(auth)/login` English-only text added to F-075.
- N-C4: production serves mostly the legacy storefront pages, which got only light review; V2-only findings reach 1 tenant today.
- Scores: C-storefront 6, C-platform orders/printing/returns 6, C-platform other 5, C-admin 5. All capped at 7 by open P1 or heuristic-only pages.

## Phase 3 Plan, round 1 — 2026-10-20 (two parallel critics)
Reports: `critic/phase3-round1-security-data.md`, `critic/phase3-round1-product-ops.md` (plan basis 056c668b).
- Security & data: Isolation 7, AuthZ 6, Money/Order 5, Data 5, Security 5, Perf 7, Scale 6, Reliab 6; overall 5.5. P0 PRs #173/#175 correct at root cause. Main moved to 3365a7d0; live-only migration `20261020215422 tenant_role_source_of_truth` changes the role model (PKG-03/13 and PR SQL fixtures affected). #172/#175 conflict with main; #172 renewal lacks internal-tenant exemption. #168 should move to Wave 1. Launch gate must require webhook enforce mode. Role-aware write policies, behavioural SECDEF cross-tenant test, default grants on tables/sequences missing. PKG-14 (no stock reservation), PKG-03, PKG-17 approaches wrong.
- Product & ops: Reliab 6, Observ 5, UX 6, i18n 6, A11y 6, CodeHealth 6, Ops 5; overall 5.5. PKG-00 not buildable as written (needs Supabase Postgres image, seed, schema_migrations dump; no branch protection on main; storage not backed up). Load test would message real phones: stub providers, reserved phone range, limiter bypass, manual crons, staff stream; 32–40 h. Runbook: public /api/healthz, Sentry hard gate, alert channel, kill switch, change freeze. PKG-10 test incomplete; PKG-31 grep broken; PKG-28 approach wrong; PKG-32 misses `direction:"rtl"`. Effort ≈400 h for the launch gate.
- Loop: < 8, revising for round 2.

## Phase 3 Plan, round 2 — 2026-10-20 (two parallel critics, plan @ 3365a7d0)
Reports: `critic/phase3-round2-security-data.md`, `critic/phase3-round2-product-ops.md`.
- Security & data: Isolation 8, AuthZ 7, Money/Order 6, Data 7, Security 7.5, Perf 7.5, Scale 8, Reliab 7; overall 7. Open: PKG-14 reservation wiped by `recompute_inventory` (EC1); viewer can create/merge/split/return orders through membership-only functions; `user_permissions` lacks `tenant_id`; 2-arg `create_order_atomic` accepts NULL tenant; vault_backups retention vs backup copy; global `WEBHOOK_AUTH_MODE`; PKG-01 grant check passes pre-fix; PKG-20 `store_config_versions`; PKG-12 410 interim slot.
- Product & ops: Reliab 7.5, Observ 7, UX 8, i18n 7.5, A11y 7.5, CodeHealth 8, Ops 7; overall 7.5. Open: Supabase CLI auto-applies migrations; provider base URLs hard-coded (mock server needed in PKG-00); restore drill re-arms prod push trigger (sanitise step); kill switch gaps; PKG-31 grep; D-20 minutes figure; §8.2 `source='storefront'`; PKG-17 sweeper via pg_cron; Vercel Hobby acceptance; branch policy; PKG-29 ordering; Edge Function and WhatsApp-tier load criteria; effort ≈520 h; `checkout.ts` hotspot.
- Loop: < 8, revising for round 3 (last round allowed).

## Phase 3 Plan, round 3 (final) — 2026-10-20 (two parallel critics, plan revision 3 @ 3365a7d0)
Reports: `critic/phase3-round3-security-data.md`, `critic/phase3-round3-product-ops.md`.
- Security & data: Isolation 8.5, AuthZ 7.5, Money/Order 7.5, Data 7.5, Security 8, Perf 7.5, Scale 8, Reliab 7.5; overall 7.5. All round-2 blockers closed; EC1 credibly closed. Remaining: R3-A `is_tenant_admin()` ignores `user_profiles.is_active` (live; 49 policies, 3 functions); R3-B kill switch blocks staff orders (all app orders run as service role); R3-C cost-column revoke breaks 24 `select('*')` reads; PKG-14 precision (expiry vs COD risk, stock check after replay, lock order, server-only stock columns).
- Product & ops: Reliab 7.5, Observ 7.5, UX 8, i18n 8, A11y 8, CodeHealth 8.5, Ops 7.5; overall 7.5. Remaining: restore under `session_replication_role = replica` with network limited to mocks; kill switch by channel; backup role `BYPASSRLS` + `pg_read_all_data`; mock-host rule keyed on `VERCEL_ENV`; checkout_queue age alert and smaller items.
- Loop: 3 rounds used, overall 7.5 < 8. Per §10, STOP and report to Ali. Gap list applied to PLAN.md as revision 4 without a further critic round.

## Phase 4 per-package critics — 2026-10-21
One fresh critic per package, before Ali is asked to merge.
- #193 PKG-00 6a provider mock (`fix/pkg00-provider-mock`): 8/10. Nits fixed in bfd50b6c: Telegram token redacted from call log, QStash query stripped, non-loopback host refused unless `PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1`, cast removed. Gap: admin RapidAPI call not routed through the mock.
- #194 PKG-00 00r rebaseline (`fix/pkg00-00r-rebaseline`): 8/10. Open nits: plan's `'member'` grep check also hits `chat_members.role` (reword); PR covers 00r items 5–6 only. Cron unschedule migration awaits D-24.
- #195 PKG-06 F-087 deactivated admins (`fix/pkg06-f087-deactivated-admins`): first pass 6/10, BLOCKER: service-role server actions trusted `tenantRole` without `is_active`, so a deactivated admin could mint a Telegram link code for an active employee. Fixed in 20bd8bd8 (shared `active-tenant-role` helper on every role-granting path, target-user active check). Re-critic 8.5/10, nothing blocking; nits (single profile read, distinct read-failure error, dead `getUserTenantRole`, manual-checkouts cron via `requirePlatformAdmin`) being folded in.
- #196 PKG-12 abandoned-cart 410 (`fix/pkg12-abandoned-cart-410`): 9/10.
