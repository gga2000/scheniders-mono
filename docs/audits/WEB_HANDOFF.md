# Handoff — continuing the launch-readiness work on Claude Code web

**Written:** 2026-10-19 · **For:** a fresh Claude Code **web** session on this repo
**Read this first.** It tells you what exists, where it lives, what is true, and what to do next.

---

## 0. The one thing that will bite you immediately

**Most of the audit work is NOT on `main`.** If you clone and look only at `main`, you will conclude none of it exists.

| What | Where it actually lives |
|---|---|
| **Launch audit charter** (the operative instructions) | **`main`** — canonical, as of this handoff commit |
| Master ledger, 10-round audit, final register, remediation plan, verdict, the 6 matrices | branch **`feat/notifications-overhaul`** (pushed) |
| Orders reliability audit (2026-10-11) — 21 files | **`main`**, as of this handoff commit |
| Admin activity-logging fix | branch **`fix/admin-activity-logging-v2`** (pushed, PR open — see §4) |

So: `git fetch --all`, then read the ledger set from `origin/feat/notifications-overhaul`, and the charter from `main`.

**The charter copy on `feat/notifications-overhaul` is stale** — it predates the three revisions in §3. `main` has the
current one. If that branch later merges and conflicts on this file, **keep `main`'s version.**

**Do not rely on `feat/notifications-overhaul` staying put.** Other sessions push to it; a push of mine was rejected as
diverged while writing this handoff. Copy anything you need out of it rather than working on it.

---

## 1. Hard constraints — violating any of these wastes a day

1. **Vercel deploys are blocked unless the commit author is `gga2000`.** Use exactly:
   ```
   gga2000 <235769697+gga2000@users.noreply.github.com>
   ```
   A commit authored as `aa988695@gmail.com` resolves to `goodguyali20` and **no build runs at all** — the deploy
   silently never happens. This has already cost time. Set it per-commit:
   `git -c user.name=gga2000 -c user.email=235769697+gga2000@users.noreply.github.com commit …`
2. **Standing approval (2026-10-18): merge green PRs on sight.** Do not ask. Still diagnose a red CI, still commit as
   `gga2000`.
3. **pnpm only**, Corepack-pinned. **Node 20** for installs — Node 24 crashes `pnpm install`. Never `npm install`.
4. **LTR only.** `<html lang>` yes, `<html dir>` never, in every locale including Arabic.
5. **Iraq market:** currency **IQD**, whole numbers with thousands separators, **no tax/VAT** anywhere.
6. **No keyboard-shortcut or keyboard-a11y work** unless asked. Contrast, hit targets, colour-only signalling and
   motion sensitivity *are* in scope.
7. **Two Supabase projects.** This repo is **NEW** `sduvpgqwhxragxtxztur`. `ibfdugifekivquwprqjc` is the OLD project in
   a different codebase. Never confuse them.
8. **Vercel Hobby: 100 deploys/day.** Rollback is the escape hatch.

---

## 2. Audit state — three engagements, none closed

### 2.1 Platform audit, 10 rounds (2026-09-17) — `feat/notifications-overhaul`

- `docs/audits/MASTER_FINDINGS_LEDGER_2026-09-17.md` — **105 findings** (19 P0 / 37 P1 / 29 P2), 38 areas
  VERIFIED-OK, stable IDs. **Quote these IDs.**
- `docs/audits/SOTA_PLATFORM_AUDIT_2026-09-17.md` — rounds 1–10, the evidence per ID.
- `docs/audits/SOTA_AND_OMS_GAP_ASSESSMENT_2026-09-16.md` — product/strategic gaps (`PROD-*`).

### 2.2 Final launch audit, 1 iteration — `feat/notifications-overhaul`

Ran against the charter in §3. Produced all eight deliverables:
`FINAL_AUDIT_REGISTER.md` (44 new findings + all 105 prior IDs adjudicated), `INVARIANT_WRITE_SITE_MATRIX.md`,
`TRUST_BOUNDARY_MATRIX.md`, `MULTI_TENANT_FANOUT_REPORT.md`, `SCALE_PROJECTION_REPORT.md`,
`SURFACE_QUALITY_REPORT.md`, `ITERATION_LOG.md`, `LAUNCH_READINESS_VERDICT.md`, plus `FINAL_REMEDIATION_PLAN.md`.

**Verdict: NO-GO for 150 merchants. GO for the current single merchant once six items close.**

It corrected the 2026-09-17 ledger in seven measurable ways — 159 public tables not 154, **1,682 orphaned rows not
550**, **11 unauthorized definer functions not 6**, 110 unindexed FKs not 108, 58 platform routes not 57, 15
`NEXT_PUBLIC_*` not 13, `vault_backups` **509 MB / 76 objects growing ~23 MB/day** (was recorded as 193 MB). It also
**refuted the charter's own claim** that SEC-01/SEC-02 are "single SQL statements" — the fix is an unapplied migration
whose header forbids applying it before six code changes.

### 2.3 Orders reliability audit (2026-10-11) — now on `main`

`docs/audits/orders-reliability-2026-10-11/REGISTER.md` + 20 evidence files. **This was untracked until this handoff
commit** — it was one `git clean` from being lost. Critic loop scored **5 → 6 → 7**, stopped at the 3-round cap below
the 8 target, and the round-3 amendments in its §A **have not been re-scored**. 5 live security P0s; root cause is
shared env.

### 2.4 Perf & craft audit — FAILED

Scored **5 → 4 → 3** across three rounds and **built nothing**; when two fixes were finally attempted, **both were
wrong** (one had cause and direction backwards, one the magnitude). Do not treat its findings as conclusions. Live P0
from it: customer phones reach Meta via `/track`.

---

## 3. The charter — use it, and note it has been revised

`docs/audits/FINAL_LAUNCH_AUDIT_CHARTER.md` on `feat/notifications-overhaul`. Paste from `===BEGIN===`. It defines
the 7-axis method (invariant · trust-boundary · flow · multi-tenant fan-out · scale · pattern-backport · surface),
the build/critic loop, the 10-dimension rubric scored as a **minimum not a mean**, and the ≥8 gate.

Three revisions were added on 2026-10-10 after the first run exposed gaps the charter itself caused:

- **§0.1 Step zero** — establish the deployed SHA *before* auditing anything. The first run audited a branch
  **171/99 commits divergent from production, 539 files differing**. Its headline findings survived re-verification
  there; the long tail never did. Every finding must carry the SHA it was verified at.
- **§0.2 Proof-of-fix carve-out** — each iteration carries its **top-ranked finding** to a working, measured fix in a
  throwaway worktree, then discards it. Not to ship — to test whether the finding was understood. A register whose top
  finding was never built caps at **7** on Actionability. This exists because of §2.4.
- **§7.3** — a **falling score is the loop working**, not failing. Stall condition is "no new ground covered," not "no
  score improvement."

---

## 4. Open work, in the order I would do it

1. **PR for `fix/admin-activity-logging`** — merge it if green. `admin_activity_logs` had **0 rows ever**: three
   writers inserted `admin_id`, a column that does not exist (it is `admin_user_id`), so PostgREST rejected every
   write, while 4 active `support_staff` accounts could suspend merchants, extend trials and mint wallet credit with
   no trail. The read path was broken identically — the Activity page, dashboard feed and `use-dashboard-stats` all
   typed and rendered `log.admin_id`, so fixing only the writers would have produced rows with a blank actor column.
   Fixed by routing every writer through the `logAdminActivity` helper that already existed and already used the right
   columns. 7 new tests; verified they fail on 4 of 7 cases when the bug is reintroduced.
2. **The six items in `LAUNCH_READINESS_VERDICT.md`** that must close before the *current* merchant is safe. Read them
   at the deployed SHA first (§0.1) — two were already withdrawn as fixed in production.
3. **Re-score the orders reliability register** (§2.3) — it stopped at 7 and its amendments were never graded.
4. **Decide the two design questions** that block everything downstream:
   - **SEC-30** — authorization has no single source of truth. Three role vocabularies across three tables
     (`tenant_members.role` holds only `admin`/`member`, and 19 of 23 rows are `admin`; `user_profiles.role` models
     four roles; `apps/admin` uses `admin_users`). The app's 14 permissions have **no database representation at
     all**, so SEC-03 cannot be fixed without picking one.
   - **DATA-05** — **79% of the production database is demo data** (10 seed tenants, 18,052 fake orders, ~224M IQD
     fake balances, all `status='active'`). No dashboard figure, benchmark or capacity estimate means anything until
     they move out.
5. **The one-line win still unapplied:** `packages/shared/src/preview-token.ts:21` imports `node:crypto` behind the
   `export *` barrel; every component imports `cn`, so Turbopack polyfills it into every route — **~129 KB/route on
   platform, ~125 KB on storefront**, measured by build diff. Storefront's floor drops to 162 KB, inside budget.

---

## 5. The diagnosis that should shape every fix

Across 10 rounds, **in eleven of twelve cases where something was wrong, the correct version already existed in the
same repository**:

| Correct implementation | Sibling that never received it |
|---|---|
| `charge_wallet_atomic` (caller check + `FOR UPDATE` + role check) | 6 unauthorized money/stock RPCs |
| `chat-attachments` storage ACL (tenant folder + membership) | `vault_backups`, `product-images`, `payroll-pdfs` |
| `chat_search_messages` (`REVOKE … FROM PUBLIC` + narrow `GRANT`) | 69 open definer functions |
| `htmlToSafeParagraphs` (the EC4 fix) | 4–6 legacy `Home.tsx` templates |
| `computeDeliveryFee` (one authoritative number) | payroll + commission math |
| `uq_orders_tenant_idempotency` (per-tenant partial unique) | `orders_order_id_key`, which is global |
| `requireCronAuth` (fails closed, with written rationale) | the Telegram webhook, which fails open |
| `unfurl` (six-layer SSRF defence) | `generate-batch-pdf`, which renders arbitrary HTML |
| per-slug cache tags on `getTenantBySlug` | one shared catalog tag for all tenants |
| `logAdminActivity` (right columns) | three writers using `admin_id` — **fixed, §4.1** |

So for each finding: **find the sibling that got it right, apply the same thing, then add the gate that stops it
drifting again.** The gates matter more than any individual fix — the disease is drift, not ignorance.

Six gates are identified and **none is in place**: `vitest run` in CI (tests exist and are not run),
`pnpm audit --audit-level=high`, a test asserting every `NEXT_PUBLIC_*` appears in `turbo.json` `build.env`,
`supabase db diff --linked`, an RLS isolation test suite, and e2e coverage of the five must-never-break paths.

---

## 6. Traps this project has already paid for

- **Check the outcome, not the telemetry.** An empty log table means the logging moved at least as often as the
  feature died. Query what the feature *changes*. (Got this wrong twice on WhatsApp. §4.1 is another instance — the
  table was empty because the writer was broken.)
- **Verify by independent recomputation.** A fix that agrees with its own forecast is unverified. Check the catalog,
  not the comments, for column types.
- **A grep that finds nothing has not proved absence.** Two near-false accusations came from guessed helper names
  (`verifyAccessToken`, `redactTenant`). Search for the behaviour, then read the file.
- **Re-read every file you quote, from the tree you are auditing, at the moment you write the finding.** A
  `turbo.json` read minutes earlier from a stale branch produced a fabricated finding that had to be withdrawn.
- **"Fixed" usually means "fixed at one call site."** Verify at the class level.
- **`lookup_order`: read `stage`, never `status`** — `status` folds cancelled/rejected/no_response/suspended into
  "placed". That is why `/track` told 1,888 orders they were on the way (fixed in #141).
- **List columns must exist in the view** — #122 broke `/orders` with a 400. Probe a live `select` before merging.
- **Workspace packages must declare their own deps** — `shared` imported `zod` undeclared: local type-check green, CI
  `TS2307` cascade (#137).
- **Bundle attribution by grep is a hypothesis.** Prove it with a build diff.
- **Local Lighthouse here is bimodal** — identical builds give ~4.8 s or ~7.3 s LCP, cause unknown. Never trust
  n < 10; report medians with spread; read `metricSavings.LCP`, not the headline saving.
- **MCP `apply_migration` never writes a file.** 30 migrations once existed only in the remote.
- **An MCP `execute_sql` timeout is not a cancel** — it keeps running and commits. Re-query state before retrying.
- **Never `git checkout <ref> -- <path>` in a shared tree.** It once wiped 16 files of another session's uncommitted
  work.

---

## 7. Scale target — the number every decision is measured against

**150 merchants × 25 orders/day = 3,750 orders/day** ⇒ 112,500/month, ~1.37M/year.

The one real merchant does **~31 orders/day**. So the target is **~122× the current real write rate**, and day one
processes 77% of that merchant's entire five-month history *every day*. `order_status_history` runs at ~3.4 rows per
order ⇒ ~12,700 rows/day, ~4.6M/year. Order status writes measure **~1.7 s** each, which at target is ~6 hours of
database time per day with ~40% of it inside a 3-hour evening peak.

Plan as though launching worldwide, even though the first cut is a few real tenants.
