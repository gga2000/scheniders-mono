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
