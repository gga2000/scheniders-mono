# Iteration Log

Scores are recorded **only** as received from an independent critic. Nothing in this file is self-graded.

---

## Iteration 1 — 2026-09-17

### Method

Seven axes, run in yield order rather than charter order: A (invariants) and F (pattern classes) first, then B (trust
boundaries), D (fan-out), E (scale), C (flows), G (surface). Breadth sweeps were delegated to six independent agents
with read-only instructions; **every severity-relevant claim they returned was re-verified by me against the file or the
live database before entering a deliverable.**

### Ground-truth drift found against the charter's §3

~~29 tenants (not 28)~~ — **withdrawn: the charter was right.** I counted a JSON array by eye; `select count(*) from
tenants` is **28**, re-confirmed 2026-10-02. This entry is left struck through rather than deleted because it is the
cleanest example of the failure this log exists to record: a "correction" that was itself the error. · 159 public
tables (not 154) · 1,682 orphaned rows (not 550) · 222.9 MB in `vault_backups` (not 193; **now 509 MB / 76 objects as
of 2026-10-02, growing ~23 MB/day**) · 11 unauthorized definer functions (not 6) · 15 `NEXT_PUBLIC_*` referenced (not 13) · 110 unindexed FKs (not 108) ·
58 platform routes (not 57). The charter's own remediation premise (§10, "SEC-01 and SEC-02 are single SQL statements")
was **refuted** — the fix exists as an unapplied migration whose header forbids applying it before six code changes.

### Output

| Deliverable | State |
|---|---|
| `FINAL_AUDIT_REGISTER.md` | Written — 44 new findings, all 105 prior IDs adjudicated, 10 VERIFIED-OK spot-checked |
| `INVARIANT_WRITE_SITE_MATRIX.md` | Written — 8 invariants |
| `TRUST_BOUNDARY_MATRIX.md` | Written — 123 routes + RPCs + buckets × 7 controls |
| `MULTI_TENANT_FANOUT_REPORT.md` | Written — 4 fan-out questions, 159-table audit |
| `SCALE_PROJECTION_REPORT.md` | Written — measured → projected → limit → change |
| `SURFACE_QUALITY_REPORT.md` | Written — **source-only; the app was never run** |
| `LAUNCH_READINESS_VERDICT.md` | Written — NO-GO for 150 |
| `ITERATION_LOG.md` | This file |

### Corrections I made to my own work, in order

1. **11 chat RPCs wrongly flagged as unauthorized.** My first definer-function sweep searched for `auth.uid()` /
   `get_user_tenant_ids` and missed `chat_is_conversation_admin()` / `chat_is_member()`, which do check `auth.uid()`.
   This is the exact grep artefact that produced two near-false accusations in the prior audit. Real count: 11, each
   read individually.
2. **`recompute_inventory` does not destroy stock.** I read it as recomputing `stock_quantity` from an incomplete ledger
   and called it a data-destruction weapon. Reading the body shows it touches only `reserved_quantity`; `zero_oversold`
   is the one that writes `stock_quantity`. The narrower finding — an unqualified platform-wide UPDATE on a NULL default
   — stands.
3. **Suspected a systemic `anon` write hole.** `anon` holds blanket table-level `INSERT/UPDATE/DELETE/TRUNCATE` on public
   tables. I checked whether any table had RLS off: **none of 159 does**, so the grants are dead-ended everywhere. The
   residual is a CI gate, not a vulnerability.

### Subagent claims I corrected — 8

Upward in severity (3): the Reports hook-order crash is deterministic on cold load, not cache-dependent; SEC-34 is 6
templates not 4; DATA-01 is 1,682 orphans not 550.

Downward or refuted (5):
- `charge_wallet_atomic` is **not** broken — the live body uses `auth.role()`; the claim came from a stale migration file.
- `adjust_customer_points` is **not** anon-callable — `has_function_privilege('anon', …)` is false for all five money/stock
  RPCs checked.
- `orders.refund_status`/`refunded_at` **are** written (53 refunded, 6 pending).
- `orders.delivered_source` **is** written (2,608 rows), contradicting "nothing ever writes it".
- The storefront cart-abandoned relay applies `sanitizeVar` and posts into a pre-approved template slot, so it is
  outbound-spend abuse, not free-form content injection.

**Pattern worth recording for Phase 2:** five of those corrections trace to one cause — reasoning about DDL from
`packages/supabase/migrations/` rather than from live objects. That is now finding NEW-33.

### Where I expect to score worst, before hearing it

- **Surface quality (dimension 8).** The app was never run. Contrast, hit targets, focus visibility, rendered Arabic and
  real payload sizes are unjudged.
- **Coverage (dimension 1).** `postMessage` across the preview iframe was not audited; `supabase/functions/*` were not
  read; `pnpm audit` was not re-run; the 47 store-builder screens were inventoried, not examined.
- **Scale rigour (dimension 6).** Every launch projection is arithmetic from a measured unit cost. No load test.

### Critics spawned

Completeness · Data-integrity · Adversarial-security. Each received the artefacts and the rubric only, with the charter's
verbatim instruction, and no access to my reasoning.

### Scores received — iteration 1

| Dimension | Completeness | Data-integrity | Adversarial-security |
|---|---|---|---|
| 1 Coverage | 4 | 8 | 7 |
| 2 Evidence | 6 | 6 | 7 |
| 3 Falsification | 7 | 6 | 8 |
| 4 Severity accuracy | 5 | 6 | **5** |
| 5 Multi-tenant rigour | 7 | 8 | 7 |
| 6 Scale rigour | **3** | **3** | 5 |
| 7 Root-cause depth | 4 | 6 | 8 |
| 8 Surface quality | **3** | **3** | 5 |
| 9 Actionability | 7 | 7 | 8 |
| 10 Intellectual honesty | 7 | 6 | 8 |
| **Minimum** | **3** | **3** | **5** |

**Overall: 3.** Three independent critics, converging on the same two floors — scale rigour and surface quality — for
the same two reasons: the scale numbers are wrong in their *inputs*, and the surface axis was never measured.

---

## Iteration 1 — post-critique findings against my own work

### The one that matters most: I certified a money invariant that does not hold

`VERIFIED-OK: wallet ledger reconciles exactly — 0 mismatches across 17,805 transactions, recomputed independently.`

**False, and the method was the defect.** My test was `wallet.balance_iqd == (last balance_after_iqd)`. Both sides are
written by the same code path, so it passes by construction and **cannot detect a failure**. The correct test is a
running balance: `balance_after_iqd = lag(balance_after_iqd) + amount_iqd`.

Re-run by me: **3,045 chain breaks across 10 tenants, 91,373,605 IQD unexplained.** 585 of them sit on rows with no
timestamp tie, so ordering ambiguity does not explain them.

**The saving detail, which is also the real finding:** the real merchant's **68 transactions are clean — 0 breaks.**
Every break is in a seed tenant, i.e. the seed generator writes wallet rows without going through
`charge_wallet_atomic`. So this is not a live money bug; it is (a) further DATA-05 contamination, and (b) proof that the
reconciliation check used by two consecutive audits is not a check. Both statements need to be in the register.

### Quantitative corrections to apply in iteration 2

| # | Claimed | Correct | Impact |
|---|---|---|---|
| 1 | Wallet reconciles exactly | 3,045 breaks / 91.4M IQD, all seed; real merchant clean | Falsifies a VERIFIED-OK in both audits |
| 2 | `notifications` 12,098 B/row, "most expensive row in the DB" | **342 B** avg tuple. The figure was `total_relation_size / n_live_tup` on a 474-row table with ~96% dead heap | 16.5 GB projection → ~0.47 GB; remediation changes from "inspect payload duplication" to "autovacuum" |
| 3 | Status write 1.7 s | Call-weighted mean over all 1,177 status-touching calls = **1,233 ms**. The two I quoted are the slowest of eight shapes; a 32 ms / 10,992-call shape sits one row below in my own table | Cherry-picked |
| 4 | 3.38 status rows/order | Platform-wide, seed-dominated. **Real merchant = 2.515** | Contradicts my own DATA-05 finding |
| 5 | ~6 h DB time/day, "80% of the peak" | **~3.2 h** with corrected inputs; and 80% assumes DB parallelism = 1, which I never checked and said I could not | The anchor of the scale NO-GO |
| 6 | 29 tenants | **28** | The charter was right; my "correction" was the error |
| 7 | 124 tenant-scoped tables | **117 base tables + 7 views.** 56-nullable and 51-no-index were computed on 117 | "51 of 124" is a ratio between two populations; views cannot be indexed |
| 8 | 110 unindexed FKs of 266 | **112 of 275** (Supabase's own advisor agrees) | — |
| 9 | `orders` 1,220 B/row | **1,134** — I used `n_live_tup` 21,315 while quoting the exact 22,943 elsewhere | Mixed estimate and exact count in one table |
| 10 | `waseet_api_logs` 6,275 B/row → 8.6 GB/yr | **3,364 B**; projected from a **47-row** sample; 40 kB of 288 kB is minimum index pages | Ranked #2 storage risk on a 47-row basis |
| 11 | 1,682 "orphaned" rows | Correct count, wrong word. These are `tenant_id IS NULL`. **True dangling-FK orphans = 0** | "Orphaned" implies referential corruption that does not exist |
| 12 | 31 orders/day today | Lifetime average. **Trailing 30-day = 7.27/day** | Baseline overstated ~4× |
| 13 | ~18–20 GB year-one growth | Own table sums to **~22.5 GB** | Internally inconsistent |
| 14 | Exactly 11 unauthorized definer fns | **≥14** — add `in_quiet_hours`, `notification_channel_enabled`, `tenant_block_active` | Found independently by two critics |
| 15 | Largest tenant is a seed tenant | True **only** with `deleted_at IS NULL` (4,869 vs 4,850); on raw and non-archived counts the real merchant leads | 0.4% margin, filter unstated |
| 16 | `pg_timezone_names` = app waste, "delete the caller" | Call count **identical** to PostgREST's schema-cache query — it is a schema reload | Remediation not executable |
| 17 | "No limiter exists in the repo" | **`consume_rate_limit` exists**, is correct, is service-role-only, and has **zero call sites** | Fourth instance of my own thesis, missed. Re-prices SEC-13/SEC-12 |
| 18 | `/api/domains/verify` forges verification | **False accusation.** It does `dns.resolveCname` and only writes `verified` on a matching record | Corrected in place |
| 19 | `anon` reads `tenants.contact_email` only | **13 columns**, incl. `store_config_v2` | `redactTenant` is not a chokepoint against raw PostgREST. Latent: 0 tenants hold a CAPI token |

### Severity re-rating — proposed by a critic, then TESTED (iteration 2)

The adversarial critic argued I audit code and not reachability, and proposed deflating three P0s. With the user's
approval I probed reachability directly (GET only — never the mutating verb, never an exploit). **Two of the three
deflations are wrong.**

- **NEW-01** (admin health) — critic said SSO-walled, P0 → P2. **REFUTED.** Unauthenticated `GET` returns **HTTP 200,
  application/json, 6,741 bytes** of per-tenant `business_name`/`plan`/`risk_score`/`balance_iqd`. **Stays P0, now with
  observational proof.** Promoted to the most urgent item in the register.
- **NEW-12** (cart relay) — critic said the storefront project is SSO-walled with no custom domain, so unreachable.
  **REFUTED on reachability**: the storefront root returns **200** and `GET /api/cart/abandoned` returns **405**, i.e.
  the handler exists and is internet-reachable; 405 is the correct response to GET on a POST-only route, so this proves
  reachability without touching the mutating path. **The critic's *other* mitigation stands and is the real one:
  0 of 28 tenants have `cart_recovery.enabled`, so no message can currently be sent.** Net: P0 → **P1**, on the strength
  of the feature flag, not the network.
- **NEW-09** (`recompute_inventory`) — **UPHELD.** This deflation came from reading the function body, not from
  reachability: it zeroes and then rebuilds correct values, so the harm is lock contention and an unauthorized
  platform-wide write, not corruption. `zero_oversold`'s live blast radius is 1 product.
- **NEW-02** (`lightfunnels/sync`) — **upheld and confirmed reachable**: `GET` on the platform's custom domain
  `schenidersapp.xyz` returns 200.

**Lesson recorded for the method, not just the findings:** a reachability argument is as falsifiable as a code argument,
and a critic asserting a compensating control deserves exactly the same "reproduce it from primary sources" standard I
am held to. I applied that standard and the control was not there.
- **NEW-09** (`recompute_inventory`) — it zeroes and then **rebuilds** correct values; harm is lock contention and an
  unauthorized platform-wide write, not corruption. `zero_oversold` does destroy data, live blast radius **1 product**.
- **NEW-02** (`lightfunnels/sync`) — **upheld and reachable**: the platform project *does* carry a custom domain
  (`schenidersapp.xyz`), which is outside the SSO wall. The token lives in `public.settings`, not `app_settings`.
- **NEW-11** — **understated.** `create-user` writes an unvalidated role; `api/admin/access-requests` then upserts
  `tenant_members` for an **arbitrary `tenantId` from the body**, gated only on `user_profiles.role='super_admin'`.
  Chain: tenant admin → minted `super_admin` → membership in any tenant → `get_user_tenant_ids()` opens every RLS
  policy. Promote to standalone P0.

### Findings I missed that the critics found

- A second XSS sink of NEW-04's class: `components/products/editor/storefront-preview.tsx:221` renders the product
  `description` via `dangerouslySetInnerHTML` inside the authenticated merchant app. My own pattern sweep reported it
  and I failed to consolidate it.
- `PERF-05` re-measures to **178** unused indexes against the ledger's 77 — one of ~66 IDs I closed with a blanket
  "CONFIRMED as written", which is not an adjudication.
- 7 of 11 `pg_cron` jobs are never named in any artefact, including two `send_notification_digests` fan-outs that are
  exactly the serial-loop-over-all-tenants class my own scale report defines.
- `avatars` and `review-photos` buckets never mentioned; neither has any `storage.objects` policy.
- 92 of 166 live tables are never named in any artefact.
- `apps/platform/scripts/*` excluded as "25 files, non-deployed" — there are **41**, several of them service-role
  tooling that writes production money and status data.

### The disclosure I should have made

**The database was being modified during this audit.** 17 migrations carry today's date; tables went 159 → 166,
functions 177 → 179, applied migrations 300 → 310, all from a concurrent session. My figures were correct when taken and
I presented them as settled. A read-only audit that re-measures ground truth and finds the charter stale has an
obligation to say its own snapshot is moving.

**Iteration 2 is required.** The two floors (scale rigour, surface quality) cannot be lifted inside Phase 1 as written:
one needs a load test, the other needs the app running. *(The user subsequently unblocked both: read-only browser
observation, and a timing measurement inside a rolled-back transaction.)*

---

## Iteration 2 — graded

**Scale critic: 2/10** (minimum on Severity accuracy). Verdict: *"the rewrite fixed the arithmetic and broke the
conclusion. Iteration 1 was wrong about how much and right about whether; iteration 2 is right about the arithmetic and
wrong about whether. Of the two errors, this one ships."*

That is correct and I verified every load-bearing claim it made:

| Critic's claim | My verification |
|---|---|
| `service_role` has `rolbypassrls = true`, so the 1,669 ms statement evaluates no RLS | **TRUE.** My "the gap is RLS + PostgREST" explanation was not merely unproven — it was impossible |
| `orders` is scanned sequentially on every write | **TRUE.** `EXPLAIN` shows `Seq Scan`, `Rows Removed by Filter: 22943`, **201 ms**; `pg_stat_user_tables` shows **3,288,657 scans / 23.9B tuples read** |
| `trg_update_trust_orders` has no `WHEN` clause | **TRUE** |
| No index on `orders` uses `normalize_phone(` | **TRUE** — `pg_index` returns `<NONE>` |
| `max_connections = 60`, `shared_buffers = 224 MB`, DB = 153 MB | **TRUE.** The whole database fits in RAM, so every measurement I took was warm-cache |
| I measured only cheap transitions because loyalty/referral gate on `delivered`/`completed` | **FALSE.** I measured `→ delivered` (**106.3 ms**) and `→ completed` (**85.6 ms**) directly. That half does not hold |

**Net: I have now been wrong about this number twice, in opposite directions.** Iteration 1 said 1,669 ms (cherry-picked
from a contaminated window). Iteration 2 said 110 ms constant (measured warm-cache, on a match-early path, explained by a
mechanism that does not apply). **Iteration 3's answer is that it is not a constant at all** — it is proportional to
total platform order volume because of an unindexed cross-tenant scan in a trigger that fires on every write. That is
NEW-47, and it is the finding both earlier versions were groping at.

**Lesson for the method:** both wrong answers came from *measuring* rather than *explaining*. A measurement with no
mechanism behind it can be reproduced exactly and still be meaningless — which is a sharper form of this project's own
recorded lesson about verifying by independent recomputation.

**Data-integrity critic (pass 2): 3/10 overall — but 5 on its own axis, up from 3.** It reproduced **38 of 50** of my
recomputed claims exactly, including all four wallet numbers and all four NEW-06 numbers, and confirmed 12 live row
counts. The floor is surface quality, which it scored 3 and attributed correctly to the app never having been fully
exercised rather than to a new failure.

Its verdict on the correction pass, which I accept: *"the auditor learned each lesson, wrote it down, and then failed to
apply it one finding over."*

| What it found | My verification | Action |
|---|---|---|
| **§6b's "no anon exposure beyond NEW-46" is false** | **TRUE.** As `anon`: `tenant_public_stats` = **10 rows, 4,831 completed orders, 5,870 customers**; `tenants` 11 rows; `plan_limits` 5; `tenant_slug_history` 1 | Retracted; filed **NEW-48** |
| **`@ts-ignore` 157 is fabricated** | **TRUE.** All 152 hits are in `apps/admin/.next/` build output. Source count **0**; `@ts-expect-error` is 5 | Retracted in §4.2b |
| 2.515 mixes populations | **TRUE.** Correct is **2.561**; the 225 NULL-tenant history rows are this merchant's | Corrected; scale report now uses the **~3.5 cohort figure** for launch-like volume |
| NEW-06 is 96% seed and tracks editing, not creation | **TRUE.** 3,387 of 3,519 are seed; real merchant is **132 orders / 6.54M abs / −5.36M net**; **3,513 of 3,519 (99.8%) were edited post-creation** vs 65% of conforming | NEW-06 re-characterised; root cause moved to the **editor**, severity lowered from #2 blocker |
| Wallet 91.4M is an absolute sum, and 81% of breaks sit on timestamp ties | **TRUE.** Net −7.9M; ordering-free test 8.1M; **585 of 3,045** breaks are ordering-immune | Headline corrected to **585 breaks / ~8.1M** |
| Seven corrected figures never propagated into the findings | **TRUE** | All seven fixed (NEW-37, PERF-02, OPS-01, SEC-11, §4.3, NEW-01, scale report) |
| NEW-05 cites the wrong table | **TRUE.** The route queries `delivery_import_items`; only `previous_status` exists there | Citation fixed |
| `product_variants` has 0 rows | **TRUE** — I called it "the sharper half" on an empty table | Stated |
| `.select('*')` 140 | **TRUE** — exact count is **149** | Corrected |
| NEW-46 is 12 policies, not 13 | **FALSE.** `pg_policies` returns **13** `public_storefront_read*` policies | Kept at 13 |

**The pattern across my four worst errors is one habit:** I verified by reading the thing that describes the behaviour
(a policy, a migration file, a statistics view) instead of exercising the behaviour itself. The critic ran
`SET LOCAL ROLE anon` and queried; I read policy predicates. That is this project's own recorded lesson — *check the
outcome, not the telemetry* — failed on my strongest negative claim, one finding after I cited that same lesson approvingly.

Also conceded from the scale critique, and corrected in the report: §4's stated methodology
(`avg(pg_column_size(t.*))`) was applied only to the three rows a previous critic named, while five other rows kept the
old `total_relation_size / rows` figure under the new label; `notifications` bloat is post-vacuum free space, not 17%
dead tuples; and the "51 tenant-index" headline was promoted by default after the write-path finding was withdrawn —
43 of the 51 tables are empty and the flagship example is 99.96% index-served.

---

## Post-audit: a finding I had already made never reached the documents that drive action

Converting Round 0 and Round 1 from "fix sentences" into the exact statement an engineer would type led me to
`pg_get_constraintdef('app_settings')` — and from there to **NEW-49**: the PK became `(key, tenant_id)` on
2026-04-07, nine call sites never followed, leaving five dead writes, four tenant-blind service-role reads, and a
fresh Al-Waseet login on every courier call for ~178 days.

**My first write-up of this called it "a P1 the audit pass had missed." That was wrong, and the truth is worse.**
`MULTI_TENANT_FANOUT_REPORT.md` §1.2 already had the core of it — correct root cause, correct `.single()` →
platform-wide-silent-skip consequence, ranked **#3** among launch blockers. The failure was not detection. It was
that **the register never assigned it an ID**, and the register is what the remediation plan and the verdict were
built from. So a finding I had already verified sat in one deliverable while the verdict told the reader that
`settings/auto-send` was a live unauthenticated *mutating* endpoint — a claim §1.2 had already disproved, since its
PUT 500s on every call.

**The lesson is about the pipeline, not the reading.** Every other error in this log is a verification failure. This
one is a hand-off failure: seven deliverables with no mechanism guaranteeing that a finding in any of them acquires
an ID and propagates to the plan. The register's own §-by-§ structure made it feel complete because it adjudicated
every *prior* ID; nothing checked that it had ingested **my own** supporting reports. Anyone extending this audit
should start by diffing the six supporting documents against the register's ID list rather than trusting the register
as the index — I did, and it cost one P1 four months of latency it did not need to have.

What the promotion genuinely added beyond §1.2: the call-site count (nine, not "three"), four sites in
`waseet-api.ts` including `clearToken()`'s unscoped delete, and the login-per-call consequence, which neither §1.2
nor §1.3 covers.

Three other prescriptions were corrected in the same pass, each in the direction of the plan having been *less*
specific than it sounded:

| Step | v2 said | Measured 2026-10-02 |
|---|---|---|
| 0.2 | "three broken sites", one of them a column rename | `admin_id` **does not exist** on the table; `notes/route.ts:96` is already correct and v1 implied otherwise; a rename fixes only two of three because `"system"` is not a uuid |
| 0.3 | "likely the admin console has never been used" | **Wrong reasoning.** `admin_users` = 6; the empty table is fully explained by 0.2's broken column, because the six correct writers sit on actions that have provably never run (`restrictions = '{}'` on all 28 tenants, no tenant in `trial`) |
| 1.2 / NEW-48 | "scope the RLS policy to a single tenant" | **Impossible as written** — `anon` carries no identity for a policy to key on; it has to be a revoke plus a server route, or dropping the sum-able columns |
| 1.4 | "apply the guard **or** delete the route" | Not a choice: `grep` finds **no caller** anywhere in the repo, so there is nothing to guard |

**Standing correction to how these documents should be read:** where a figure appears in more than one deliverable,
the register and this log were written earlier than the plan, and three figures have since moved —
`vault_backups` (222.9 MB → **509 MB / 76 objects**, growing daily), the payroll-table count ("five" → **37 tables**
with only `tenant_isolation_*`), and the tenant count (my "29" → **28**, the charter's original figure). The plan
carries the current numbers.

---

## The orphan-findings diff, run on my own advice

NEW-49's entry told the reader to *"diff the six supporting documents against the register's ID list rather than
trusting the register as the index."* Running it immediately produced a second orphan.

**Result of the diff.**

| Checked | Outcome |
|---|---|
| Prior ledger IDs vs. register | The ledger carries **~106** IDs across `SEC/MONEY/DATA/OPS/PERF/PROD/PROC`. The register names **51** individually; the other ~55 fall under one blanket line — *"All other P1/P2/PROD IDs not listed above: CONFIRMED as written, on the prior audit's evidence, which I did not re-derive."* That is disclosed and honestly labelled, **but the plan's header said "105 prior IDs adjudicated"**, which overclaims it. Header corrected. |
| Fan-out report §1.2 | **Orphan — became NEW-49.** |
| Fan-out report §4, email verification | **Orphan — became NEW-50**, and it is the precondition for four P0s. |
| Fan-out report §2.1 (three cross-tenant trust RPCs) | Carried correctly; present in register and plan. |
| Fan-out report §4, no tenant deletion / export / offboarding | **Absent from register, plan and verdict.** Left as a product-level absence rather than promoted, but it should be named in whatever document holds launch commitments. |
| Fan-out report §2.4, shared `["storefront-catalog"]` tag | Labelled `PERF-09`, which is one of the IDs covered only by the blanket line. Unverified. |
| Surface and scale reports | Carry almost no IDs (`PERF-01`, `DATA-05`, `PERF-08`). Their findings are reachable only by reading those documents — the same structural weakness, not yet diffed finding-by-finding. |

**Two measurements taken during the diff went against what I expected, which is the point of taking them.**

1. **I expected the `tenant_public_stats` leak to be mostly fabricated data, which would have softened NEW-48.** As
   `anon`: 8 of 10 rows are seed (1,942 completed orders / 1,561 customers) but the **2 real rows carry 2,889
   completed orders and 4,342 customers** — 60% of the leaked order volume and 74% of the customers. The hypothesis
   was false and NEW-48's severity stands.
2. **I expected the half-provisioned tenants to be evidence that signup's partial-failure path had fired.** All 10 are
   `seed-*`, all have `wallet`/`subscriptions`/`usage_tracking`, and **0 `user_profiles` point at any of them** — a
   seed-script signature, not a signup failure. So NEW-50's Consequences 3 and 4 are confirmed defects in the code and
   the enum, **not observed incidents**, and the entry says so.

Incidental corroboration: those 10 seed tenants hold **18,051 orders**, which is **78.6%** of the 22,964-row table —
independently reproducing DATA-05's 78.7% from a different direction, and sharpening Round 3's demo-data decision,
since all 10 are also in `tenant_public_stats` while being unreachable through the product (0 members, 0 profiles).

### Continuing the diff: `SURFACE_QUALITY_REPORT.md`

Two more orphans, and **both sections undercounted their own findings** — the same direction as every count error
recorded above.

| § | Became | What the section said | Live, 2026-10-02 |
|---|---|---|---|
| §6 RTL | **NEW-51** | "19 live in-app JSX `dir="rtl"` sites, 2 dynamic" | **25 `dir=` sites across 15 `.tsx` files.** It missed `packages/ui/src/prompt-dialog.tsx:62` — the shared package, unconditional `dir="rtl"` + `text-right` + hardcoded Arabic buttons with no `t()` — and missed `apps/admin/.../lead-form.tsx:201` `dir={dir}`, because a `dir={variable}` spelling escapes a `dir={…rtl…}` grep. Its 12 inline `direction: rtl` figure reproduced exactly. |
| §5 money | **NEW-52** | "`reports/return-breakdown.tsx:16` is the only `ar-IQ` site in the merchant app" | **Four, and three of them unconditional** — `order-confirmation-card.tsx:219`, `profit-breakdown-table.tsx:93`, `lib/duplicate-comparison.ts:70`. An English-language merchant gets Arabic-Indic dates. |

**A figure I deliberately did not correct.** §5 says "42 locally re-declared formatters." My pattern finds **27**
named declarations and **76** `Intl.NumberFormat` call sites. Neither is 42 and §5 records no counting method, so I
wrote the class as confirmed and the figure as unreproducible rather than swapping in a number of mine. Substituting a
plausible count for an unverifiable one is how most of the errors in this log were made.

**Standing instruction worth noting:** NEW-51 is not a judgement call — LTR-only is an explicit standing instruction,
and 25 sites accumulated under it because **nothing enforces it mechanically**. Both 10.1 and 10.2 therefore end in a
lint rule rather than a cleanup, or the cleanup is the thing that gets redone.

**Still undiffed:** `SCALE_PROJECTION_REPORT.md`, `TRUST_BOUNDARY_MATRIX.md`, `INVARIANT_WRITE_SITE_MATRIX.md`.

### Continuing the diff: `SCALE_PROJECTION_REPORT.md` — one orphan, one overstatement, one contradiction

**Orphan → NEW-53.** §7's backup-duration risk had no ID and was scheduled nowhere. While confirming it I found §7
had **overstated the headroom by 5×**: it reasoned against "300 s on Pro", but `/api/cron/backup` declares **no
`maxDuration`**, so it inherits the 60 s default. 300 s is the ceiling a route can *request*, and 7 of the 11 cron
routes do request one — just not this one, the heaviest. `waseet-locations`, a weekly location refresh, asks for 300.
Measured today: the run takes ~24 s for an 18.9 MB `orders.csv`, so the margin is real but five times smaller than
planned against. Also found alongside it: `products` at `:88` is a single unbounded `.select('*')`, both tables are
buffered whole in memory, and `app/vault/page.tsx:103-105` is `catch { // Cloud vault loading failed silently }` — the
line that turns any backup failure into a silent one, on the mechanism that had already failed silently for months
before 2026-09-11.

**A method that did not work, recorded so nobody repeats it.** To find which relation the backup actually read I
queried `pg_stat_all_tables.last_seq_scan` for scans in the 00:01–00:03 window. It returned nothing — **not because
no scan happened, but because the column keeps only the most recent scan**, and later traffic that day had overwritten
it. The empty result was evidence of nothing. I nearly reported it as evidence.

**And one thing I could not resolve, left open rather than explained.** Three verified facts that cannot all hold:
no relation named `customers` exists in this database in any schema or `relkind`; `cron/backup/route.ts:88` has read
exactly that name since the first commit and is identical on `main`; and `vault_backups` holds a growing 1.7 MB
`customers.csv` written at 00:02 today. I ruled out branch skew (`main...HEAD` = `0 423` — this branch *contains*
`main`) and a recent `DROP` (no migration touches it; it was read successfully today). The remaining hypotheses all
require production environment variables I do not have.

**The discipline point.** The pull to invent a resolution was strong, and three of my inferences along the way were
wrong in sequence — "no `customers` table" (I had queried only `public`), "maybe a matview hidden from
`information_schema`" (`pg_class` says no), "maybe production is behind `main`" (`main` is behind *me*). Each was
plausible and each was checkable, and the honest output is the contradiction plus the test that settles it, not the
fourth guess. It is now **Round 0 step 0.0**: print production's Supabase URL and commit SHA before anything else,
because **every code-derived finding in this engagement assumes the audited tree is what runs**, and this is one
verified case where that assumption may not hold.

### The contradiction resolved — and it was the worst error in the engagement

I said branch skew was ruled out because `git rev-list --left-right --count main...HEAD` returned `0 423`. **That
compared the audited tree against a local ref, not against the deployment.** Local `main` is `0b0ff8b0`. Production is
`scheniders-platform` from `main` @ **`3c0f0cb3`**, read from the Vercel API — and `git merge-base --is-ancestor
3c0f0cb3 HEAD` returns **no**. The two have diverged: **171 commits in production that the audited tree lacks**, 99 the
other way, **539 files differing**, 514 under `apps/`/`packages/`.

So the `customers` mystery was branch skew the entire time. Production's backup route is rewritten — 111 lines — and
its own comment names the bug I was circling: *"Backing up a name that does not exist threw PGRST205 on every run."*
It maps `customers.csv` → `mv_customer_aggregates`.

**What I got right and wrong in that sequence.** Right: refusing to invent a resolution, and writing the contradiction
down with the test that would settle it. Wrong: four successive inferences, each plausible and each checkable —
"no `customers` table" (queried only `public`), "a matview hidden from `information_schema`" (`pg_class` says no),
"production is behind `main`" (it is *ahead*, on a different line), and "branch skew is ruled out" (measured against
the wrong ref). The fifth attempt was the first one that asked the deployment instead of the repository, and it took
two tool calls.

**Then I did the re-verification the resolution demanded**, file by file at `3c0f0cb3`:

| Outcome | Items |
|---|---|
| **Files byte-identical in production — findings hold** | NEW-01, NEW-02, NEW-03, NEW-04, NEW-09, NEW-13, NEW-45, NEW-50, NEW-51, NEW-52, NEW-49's `auto-send` half, `admin/middleware.ts`, `vault/page.tsx` |
| **File differs, finding re-read and still holds** | NEW-49's `waseet-api.ts` (token read `:81`, tenant-less upsert `:128`, unscoped delete `:143`, package size `:575`) · NEW-49's `whatsapp-dispatcher.ts:69-72` · the `/reports` hook-order crash (`if (loading)` at `:176` above `useLanguage()` at `:184` in production; `:189`/`:197` in the audited tree — **live in both**) |
| **Already fixed in production — WITHDRAWN** | plan step **1.5(c)** `process-checkouts-manual` (now requires a bearer token + `verifyAccessToken`) · **NEW-53's two largest halves** (deployed route reads `mv_customer_aggregates`, paginates every dataset, gives each its own `try`/`catch` with failures in `security_logs`) |
| **Survives in production** | NEW-53's absent `maxDuration` on `backup`, whole-table in-memory accumulation, and `vault/page.tsx:103-105`'s swallowed catch |

**The structural lesson, which is bigger than any finding here.** Three separate failures in this engagement share one
shape: a finding orphaned between my own documents (NEW-49, NEW-50), a count taken from a report rather than the tree
(NEW-51, NEW-52), and now an entire audit taken from a tree rather than the deployment. Each time the artefact
describing the system was trusted over the system. The register's ID list was not the index of findings; local `main`
was not production; a report's "19 sites" was not 25. **Ask the thing itself.** For code that means the deployed SHA,
and `/reports` is the proof it is worth doing even when the answer is "the bug is real" — two of my items were already
fixed and would have been scheduled as work.

### Re-auditing against the deployed SHA — the gap is small, and SEC-27 shrank by 70%

Having found the divergence, the obvious next question was how much of production I had never seen. **Bounded, and
the answer is reassuring:** production has **120** `app/api/**/route.ts` files, the audited tree has 121, and **every
production route exists in the audited tree** — no production-only surface. **16 of 120 differ in content**, and they
cluster exactly where it matters: all 8 changed cron routes, the three `webhooks/interakt/*` routes including `send`,
`orders/delete`, `waseet/submit-orders`, `telegram/webhook`, and the storefront's `checkout/orders`. So the 539-file
diff overstates the audit gap for routes considerably.

**SEC-27 was wrong in the direction that inflates work.** The prior ledger's "10 of 17 cron guards fail open" became,
against `3c0f0cb3`: **10 cron routes, all ten guarded, 3 bypassable and only when `CRON_SECRET` is unset.** One of
those three (`waseet-sync`) is genuinely the PR #90 shape — `if (cronSecret && …)` skips the check entirely. The other
two use a strict comparison that an unset variable degrades to accepting the literal `Bearer undefined`. The fix is
three edits, not ten.

**A false negative I caught in my own sweep.** My first pass reported `auto-follow-up` as "NO GUARD". It greps for
`requireCronAuth|CRON_SECRET|verifyAccessToken` — and `auto-follow-up` authenticates with **QStash signature
verification**, failing closed when the signing keys are absent. The same loop also reported `waseet-locations` as
unguarded when the file **does not exist in production at all**, because `git show` on a missing path returns empty
and my loop read empty as "no match". Two different bugs in one 11-line loop, both of which would have produced
fabricated findings. Checking existence before checking content is now the habit.

**And a question I could not answer, with the reason it matters.** Is `CRON_SECRET` set? Vercel returned
**403 forbidden** on the env listing, so not readable here. The outcome test says yes — 15 of 16 `suspended` tenants
have an expired `trial_ends_at`, and `trial-suspend`'s strict check must have passed for that to happen. But it is
not conclusive, because a tenant could have been suspended from the admin console instead, and **I cannot tell the
two apart because `admin_activity_logs` has 0 rows**. NEW-13's missing audit trail is why a question about production
state has to be inferred. That is the strongest argument in these documents for why NEW-13 is "fix this first" — not
its own severity, but that everything else becomes unanswerable without it.

### Finishing the 16-route sweep — all authenticated in production, and one claim of mine inverted

The remaining differing routes, checked at `3c0f0cb3`: `orders/delete`, `orders/analyze-image`,
`waseet/submit-orders` and `webhooks/interakt/send` all use `verifyAccessToken`; `telegram/webhook`,
`webhooks/interakt` and `webhooks/interakt/[tenantId]` all check a secret. **No unauthenticated surface among them.**
Worth noting for the plan: production's `interakt/send` authenticates with `verifyAccessToken` while the audited tree
uses `resolveCallerTenant()` — same intent, different idiom, so citations of that file describe the audited version.

**And a correction that improves the plan.** I had written, twice, that `consume_rate_limit` "has zero call sites."
True of the audited tree, **false of production**: `consumeRateLimit()` guards `orders/analyze-image:31`, keyed
`analyze-image:${user.id}`, because each call bills Gemini. So NEW-50's rate limit is copying a proven mechanism, not
commissioning one — and my "its first caller is also its first test" warning was wrong. **But the production caller
deliberately fails *open* on limiter error**, which is correct for a cost cap on a logged-in feature and exactly wrong
for unauthenticated signup, so NEW-50 must specify fail-closed rather than inherit it.

**Three grep false positives in one session, all the same shape — loose substring matching on short tokens.**
`auto-follow-up` "unguarded" (pattern lacked `Receiver`; it verifies QStash signatures). `waseet-locations`
"unguarded" (the file is absent from production; `git show` on a missing path returns empty and my loop read empty as
no-match). Storefront checkout "rate-limited" (`rate` matched **governo**rate_code). Each would have become a
fabricated finding had I not followed up. The habit: check existence before content, and anchor short patterns.

### The last two companions diffed — and §5 had been right all along

`TRUST_BOUNDARY_MATRIX.md` §5 **already contained** the corrected cron table that this session's "SEC-27 — CORRECTED"
section re-derived: `waseet-sync` failing open, `subscription-renew`/`trial-suspend` accepting `Bearer undefined`,
`auto-follow-up` on QStash signatures. The register carried the prior ledger's "10 of 17 fail open" instead of its own
companion's measurement. **So the SEC-27 work was confirmation against the deployed SHA, not discovery** — and that is
the fourth instance of the same hand-off failure. My re-derivation added only three things §5 lacked: that production
has 10 cron routes not 11 (`waseet-locations` exists in **neither** committed tree), that `process-checkouts-manual` is
now authenticated there, and the outcome evidence that `CRON_SECRET` is set.

§5 also named three webhook fail-opens. **Two of the three were in no register section and none was in the plan** —
now **NEW-54**, and verifying it at `3c0f0cb3` (all three are among the 16 content-differing routes) produced the most
serious live finding of this session:

- **`webhooks/interakt/[tenantId]` is open right now, measured not inferred.** `0 of 1` `tenant_integrations` rows has
  a `webhook_secret`, and that row is active `interakt`, so the outer `if (expectedSecret)` skips the check entirely.
  An unauthenticated POST with a phone number sets that tenant's most recent `contacted` order to a caller-supplied
  status under service role, logged as `changed_by: "whatsapp_bot"`.
- **`webhooks/lightfunnels` creates orders from anonymous POSTs by design**, documented with a TODO → Round 3
  decision 6, because a decision of that size should not live only in a code comment.

**I checked §5's one overstatement rather than repeating it.** §5 says `telegram/webhook` "reaches `createOrderCore`".
The function it imports is `createOrderForTenant`. Substance right, name wrong — and the distinction mattered enough
to verify, because quoting a symbol that does not exist is how a reader loses trust in the rest of the document.

**Where the orphan diff ends up.** Six findings existed in my own companion reports and never reached the register or
the plan: NEW-49 (§1.2 fan-out), NEW-50 (§4 fan-out), NEW-51 and NEW-52 (§6 and §5 surface), NEW-53 (§7 scale), and
NEW-54 (§5 trust) — plus SEC-27's correction, which §5 had already made. **The detection work was sound; the
consolidation was the failure, every time.** Any future audit of this size needs the ID assignment to be a mechanical
step over the companions, not a judgement made while writing the register.
