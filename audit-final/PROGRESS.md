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
Nothing merged and no production migration applied; each needs Ali's OK (§4 order). Backup decision pending.

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
