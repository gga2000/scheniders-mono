# PROGRESS

Build log (Phases 4–5), plus Phase 0 gate outputs.

## Phase 0 gate re-run on pinned commit 6bde0f4
Logs kept in the session scratchpad (gates2/). All exits 0.

| Gate | Command | Result |
|---|---|---|
| Type-check | `pnpm type-check` | 3/3 tasks pass, 0 cached |
| Lint | `pnpm lint` | 0 errors; warnings platform 1,082, admin 105, storefront 40 (1,227 total) |
| Unit tests | `pnpm exec vitest run` | 250 files, 2,601 tests, all pass |
| Build | `turbo build --continue` (with proxy CA env, see CONTEXT §0) | 3/3 tasks pass |
| E2E | Playwright | Not meaningful: `e2e/example.spec.ts` hits playwright.dev, `e2e/orders.spec.ts` asserts `expect(true)`. Effectively zero E2E coverage. |
| Audit | `pnpm audit` (run at bf432f7, not re-run at 6bde0f4) | 145 advisories, 4 critical (next@16.0.10 ×2, jspdf ×2). `pnpm-lock.yaml` changed between bf432f7 and 6bde0f4 by +3 lines only (`git diff bf432f7 6bde0f4 -- pnpm-lock.yaml`, hunk `@@ -528,6 +528,9 @@`): a `zod` dependency (`specifier: ^4.3.6`, `version: 4.3.6`) added to the `packages/shared` importer's dependencies (#137). `zod@4.3.6` was already resolved in the bf432f7 lockfile (`packages:` entry at line 8582), so no new package version entered; the advisory count is expected to be unchanged (not re-measured). |


## Phase 4 build — started 2026-10-21 22:34 UTC (Ali approved plan)
Each production migration and merge needs Ali's OK (§4 order). Backup: Ali chose "No backup" (2026-10-22 12:24Z).

| PR | Package | Branch | State | Critic |
|---|---|---|---|---|
| #193 | PKG-00 6a provider mock | fix/pkg00-provider-mock | draft, CI green @ bfd50b6c | 8 |
| #194 | PKG-00 00r rebaseline | fix/pkg00-00r-rebaseline | draft, CI green @ aad573c3; migration 20261021170000 unapplied (D-24) | 8 |
| #195 | PKG-06 F-087 | fix/pkg06-f087-deactivated-admins | draft, CI green @ 20bd8bd8; migration 20261021170100 unapplied (apply before #168's) | 6 → 8.5 |
| #196 | PKG-12 cart 410 | fix/pkg12-abandoned-cart-410 | draft, CI green @ 128d13b7 | 9 |
| #167, #168, #172, #173, #175 | earlier fix PRs | — | being brought up to date with main; #167 storefront build fix in progress | — |

### 2026-10-21 23:58 UTC update
- #195 nits folded in (9d6047e1): single profile read, distinct read-failure error, dead `getUserTenantRole` removed, `/api/cron/process-checkouts-manual` requires active super_admin. Platform vitest 2630 pass.
- #167/#168/#172/#173/#175 merged with main (merge commits, no force-push); full CI command passes locally on each (16/16 tasks).
  - #167 → 6e797260: kept email confirmation (main had auto-login after signup); trial plan now `growth` to match main. **Ask Ali at merge:** confirm `growth` and the loss of auto-login.
  - #168 → 9bf03c86: `140600` narrowed to only revoking anon writes so it doesn't undo live `20261021223954` (finances-permission path). SQL tests 83/83.
  - #175 → 620424b1: added `mask_order_margin` to new function bodies; migrations renamed to `20261022100000`/`20261022100100` so main's `20261021090000` runs first. **Ask Ali at merge:** accept the new timestamps.
- Main CI red at f8e5ca87 (#197): `storefront#build` fails when `next/font/google` can't download at build time (same failure as #167 a1b88e2d; re-runs pass). New package: self-host fonts, branch `fix/ci-self-host-fonts` (worker started).
- Live (SELECT-verified): `authenticated` has table-level SELECT on `orders` (so `product_cost` is readable directly); `20261021090000` is not in `schema_migrations` although `mask_order_margin` exists. Already planned as R3-C (column revoke needs the 24 `select('*')` reads fixed first).
- #199 `fix/ci-self-host-fonts` → 87196c03: all three apps self-host fonts via next/font/local; offline build proven; CI green; critic 7.5 → 8.5. Add to the merge ask (no migration; merging it removes the intermittent `storefront#build` failure on main).

### 2026-10-22 rollout step 1: #173 (F-001 P0, F-002 P1)
- Ali approved "Apply and merge" (12:26Z). Pre-check SELECTs: live inv_apply / process_return / undo_return / child policies still equal the fixture's copies; 0 rows would trip the guards.
- Applied to prod as 8 migrations, 20261022123506 … 20261022124103. The drafts as written hung `apply_migration` until its 60s timeout four times (nothing reached Postgres; no "begin" in the logs, no locks): the MCP tool holds statements containing `DROP TRIGGER` / `DROP POLICY`. Applied versions use `CREATE OR REPLACE TRIGGER` and `ALTER POLICY` (same names, roles, args), and `SET LOCAL lock_timeout = '3s'` on the trigger parts.
- Verified: each repo file's statement md5 equals remote `schema_migrations.statements`; live `pg_get_functiondef` / `pg_get_triggerdef` / policy md5s equal a local PG16 apply of the original drafts; grants unchanged; anon reads 72/72 product images.
- #173 @ a53213b2: drafts replaced by the 8 applied files; drafts' headers kept in `cross_tenant_stock.sql`; the SQL test passes on a fresh local DB against the 8 files (before: 21 failing checks). Marked ready; merge on green CI.
- CI green (7m29s) → merged 12:54Z as b0ee952b (squash); platform prod deploy queued. Next: card for step 1b (#195 F-087) posted.

### 2026-10-22 rollout step 1b: #195 (F-087)
- Ali approved "Apply and merge" (12:57Z). Pre-check: live is_tenant_admin and link-code policy equal the draft's rollback text; 1 admin loses rights, 18 keep, 0 bad link codes.
- Applied as 20261022125832 (function + grants) and 20261022125848 (ALTER POLICY). Function md5 and ACL equal a local apply of the draft; policy text equal except the enum cast (stub used text). Repo files md5-match remote.
- #195 @ b5a1ad96: merged main (conflict with #192 in require-action-caller.ts resolved, critic 8.5), draft replaced by the 2 applied files. Platform vitest 254 files / 2702 pass; type-check and lint clean. Waiting on CI to merge.
