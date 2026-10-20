# Orders Page — SECOND-PASS Ledger (2026-09-09)

> **This is a second pass, not the original.** A prior Orders-page audit ran 2026-08-20 → closed 2026-09-10 (55 findings, PRs #67 and #81 merged and live, 14 migrations applied). Its ledger owns `docs/audits/ORDERS_PAGE_APPROVAL_LEDGER.md` on `main`; these files were renamed so they cannot clobber it. Findings here are numbered `ORD-A*` and are **additional** to that audit's.
>
> **This pass ran on `chore/remove-dead-product-cms`, which is 140 commits behind `main`.** Some findings below were therefore measured against stale code — each is re-checked against `main` before being acted on.

Single source of truth for what may and may not be touched on the orders surface.

**Gate — SUPERSEDED 2026-09-10.** Ali granted standing approval for this engagement ("I'm Ali and I approve every change done by you from here on … till the end of this entire work"), overriding §0.5's per-round sentence. Two exceptions still surfaced rather than done silently: destructive data operations, and anything outward-facing (push, deploy, PR). `DENIED` remains permanent.

Report: [ORDERS_PAGE_SECOND_PASS_AUDIT_2026-09-09.md](ORDERS_PAGE_SECOND_PASS_AUDIT_2026-09-09.md)

**Audit status: IN PROGRESS.** 12 findings — **1 × P0, 6 × P1, 5 × P2**. **2 FIXED** (ORD-A12 the P0, ORD-A7). Standing approval granted 2026-09-10: the §0.5 per-round gate no longer applies to this engagement. D1, D2 (write path), D3, D9, D10 done; D4/D11 partial; D5 blocked on a login; D6, D7, D12, D13, D14 not started. No verdict yet — see *What I have not audited yet* in the report.

| ID | Title | Severity | Pillar | Status | Date | Round |
|---|---|:--:|:--:|:--:|---|---|
| **ORD-A12** | **11 of 13 Server Actions are unauthenticated AND service-role (RLS bypassed)** — orders 4, telegram-link 3, permissions 2, wallet 1, billing 1; several use service-role; `toggleRolePermissionAction`/`toggleUserOverrideAction` grant arbitrary permissions; `createOrderAction` takes a caller-supplied tenant id. Middleware protects nothing by design. | **P0** | P5 | **FIXED on this branch** | 2026-09-10 | `d27da8c2` |
| **ORD-A1** | Order-assignment feature is wired into four screens, cannot be invoked, and persists nothing; a Web Worker evaluates mock rules on every orders change | **P1** | P1/P4 | PENDING | 2026-09-09 | — |
| **ORD-A3** | Every order-list read pays a 345 ms `customer_trust` join for `risk_data` (413 ms → 44.8 ms without it) | **P1** | P2 | **FIXED on this branch** | 2026-09-10 | `848afdf6` |
| **ORD-A7** | `cleanup-deleted-orders` — unauthenticated-when-`CRON_SECRET`-unset GET that hard-deletes orders across ALL tenants via service_role, unscheduled, unlogged, no LIMIT | **P1** (P0 if the env var is unset) | P5/P1 | **FIXED on this branch** | 2026-09-10 | `2d3c03f3` |
| **ORD-A6** | Optimistic locking is blind on ~30% of orders — the guard keys on `updated_at`, which no write path and no trigger maintains | **P1** | P1 | **FIX EXISTS — BLOCKED ON DEPLOY** | 2026-09-11 | held `d9f2700f` |
| **ORD-A10** | No order state machine at any layer — 86 distinct transitions observed; `completed` is not terminal; `cancelled → confirmed` and `rejected → new` seen this month; ~880 self-transitions in the audit log | **P1** | P1 | PENDING | 2026-09-09 | — |
| **ORD-A11** | Delta sync misses any change that leaves `updated_at` untouched; strict `.gt()` boundary drops rows in the watermark's own tick | **P1** | P1/P6 | **FIX EXISTS — BLOCKED ON DEPLOY** | 2026-09-11 | held `d9f2700f` |
| **ORD-A9** | 18 of 27 order-CRUD failure paths tell the user nothing; zero Sentry anywhere on the orders surface | **P1** | P6/P7 | PENDING | 2026-09-09 | — |
| **ORD-A8** | Gemini extractor casts LLM output straight to a typed object; no size cap, no MIME allowlist, no rate limit, PII to a third party | P2 | P6/P7/P5 | PENDING | 2026-09-09 | — |
| **ORD-A2** | `dir="rtl"` × 14 on the orders surface, against the LTR-only house rule | P2 | P5/P7 | PENDING | 2026-09-09 | — |
| **ORD-A4** | 23 `any` in `components/orders/`, including a fully untyped component and an open index signature | P2 | P1 | PENDING | 2026-09-09 | — |
| **ORD-A5** | 3,039 historical orders whose total does not match their own line items (~39.7M IQD drift, 11 tenants, none since 2026-05-30) — historical residue, live path clean | P2 | P1 | PENDING | 2026-09-09 | — |

## Open items carried from the audit, not yet findings

| Item | Why it is not yet a finding |
|---|---|
| `anon` holds EXECUTE on write-capable `SECURITY DEFINER` functions taking a client-supplied `tenant_id` (`adjust_customer_points`, `zero_oversold`, `recompute_inventory`) | Confirming it requires **calling a mutating function**, which §0.5 forbids during the audit. Highest-priority open item. `[U]` |
| Four sibling cron routes share ORD-A7's conditional-guard pattern (`process-checkouts`, `abandoned-cart-recovery`, `backup`, `auto-no-response`) | Outside the orders surface, so not written up as orders findings — but the same class. Flagged for whoever owns those routes. |
| `api_rate_limits` has RLS enabled with **no policies** | If the rate limiter reads/writes it as a normal role it is silently a no-op. Needs a read of the consuming code. `[U]` |

## Verified clean — do not re-litigate

| Checked | Result |
|---|---|
| **Order money math, current code** | **Clean.** Zero unexplained totals across **4,619 ordinary orders** in the four complete months since 2026-06. IQD integer handling clean: 0 non-integer prices, fees or discounts in 22,810 orders. |
| `sku` stripping in `order-repository.ts` (known precedent) | **Gone.** No `sku` reference in the file; item SKUs travel in the `items` jsonb. |
| `mockEmployees` / `mockOrders` on live orders paths | **None**, apart from the assignment machinery tracked as ORD-A1. |
| `@ts-ignore`, `eslint-disable`, `TODO`, `FIXME` on the orders surface | **Zero.** |
| Empty `catch {}` blocks | **3, all benign** — every one wraps a `localStorage.setItem` in `virtualized-order-table.tsx`, which can legitimately throw in private mode. Not a finding. |
| **Waseet shipping submit** (`api/waseet/submit-orders`) | **Clean, and notably well built.** Idempotency guard: refuses any order that already has `waseet_qr_id` (`:120-127`). Status precondition enforced (`:115`). Partial batch failure is surfaced **per item** — a per-order loop returning `{submitted, failed, results[]}`, not an all-or-nothing. Best detail: when the external submit succeeds but the local DB write fails (`:163-173`), it returns an explicit error **carrying the Al-Waseet QR ID** so the operator can reconcile by hand. That is the hardest case in any integration and it is handled deliberately. |
| API route authentication | **All four orders/cron routes check an `Authorization` header**, and `analyze-image` genuinely verifies the token via `verifyAccessToken` rather than checking presence. The exception is ORD-A7's conditional guard. |
| `anon` reading customer data via flagged RPCs | `get_paginated_customers` → 0 rows; `get_customer_dashboard_stats` → all zeros. **No leak.** |
| `lookup_order` taking a client-supplied `tenant_id` | **Sound.** Requires order number + matching phone, trial/active tenants only, four coarse fields, `LIMIT 1`. |
| **Tenant isolation, all 11 orders tables** | **Proven clean.** As a tenant employee: `orders` 4,781, `order_status_history` 12,003, `order_notifications` 12,306, `activity_logs` 7,450, `order_reasons` 26, `blacklist` 1, others 0 — **0 foreign-tenant rows in every table**. As `anon`: **all 11 denied** (fails closed on `get_user_tenant_ids`). |
| `customer_aggregates` flagged `SECURITY DEFINER` by the advisor (**ERROR**) | **False alarm, proven.** `anon` → permission denied; employee → 4,238 rows, 1 tenant, 0 foreign rows. It wraps a matview, which cannot carry RLS, so the tenant predicate is inside the view. **Do not flip it to `security_invoker`** — that breaks the orders and customers read paths. |

## Re-checked against `main` on 2026-09-11 — three corrections to this ledger

This pass ran on a branch **140 commits behind `main`**. Re-checking every finding against `origin/main` changed three of them:

- **ORD-A6 / ORD-A11 are already FIXED AND DEPLOYED**, not "blocked on deploy" as I recorded an hour earlier. The prior audit applied `trg_orders_updated_at` (migration `20260822150000`) on **2026-09-10**, after the code was live — the exact ordering its header demanded. Concurrency runs on `version` now. **Nothing is outstanding for either.**
- **The `permissions.ts` half of ORD-A12 is already fixed on `main`.** It has a `requireAdmin(accessToken)` helper that verifies the token and checks the role before writing, and its header independently documents the missing-tenant-column problem I raised as ORD-A13. I said "the P0 is live in production" — **for the permissions actions that was wrong**, and this is the correction.
- **What IS still unauthenticated on `main`:** `wallet.ts` (1 action), `billing.ts` (1), `telegram-link.ts` (3) — **5 actions, all building a service-role client with zero caller checks**. `topUpWalletAction(tenantId, amountIqd, …)` credits up to 10,000,000 IQD to a caller-supplied tenant. That half of ORD-A12 is genuinely live.

My fixes for A12, A7 and A3 are **not** on `main` (verified: main still has the conditional cron guard and 13 view reads). They sit on a stale branch and need to reach `main` to matter.

## Fix ordering constraint — SUPERSEDED 2026-09-11, and my prescription was wrong

I recorded that A6 and A11 must ship together, A6 first. The direction was right and **the fix I proposed for A6 was wrong**: I would have applied the trigger and kept `updated_at` as the conflict token. The held commit `d9f2700f` deliberately rejects that, because the optimistic cache stamps `updated_at` with the **client** clock — arming the guards against it produces false "modified elsewhere" errors on rapid edits. It moves the token to `version` (server-assigned, on all 21,071 rows, trigger-bumped, unforgeable) and removes the client stamp.

That commit also found **two consequences I missed**: the realtime batcher silently dropping peer edits that carried an equal timestamp, and the drift heartbeat never advancing.

**Migration `20260822150000` must NOT be applied on its own.** Its header states the prerequisite: apply only together with the code that moves the token to `version`, because the database is shared with production and an older live build would begin throwing spurious conflicts. **I have not applied it.**

**A6 and A11 therefore collapse into PROC-D1** — merge and deploy the held branch, applying the migration with it. No new code is needed for either.

## Round notes

**Phase 0 (2026-09-09).** Recon and baseline. Recorded that the prompt's stated baseline — "~5.5 MB / 12k-row fetch gating first paint" — **no longer describes the code**: the dashboard engagement (rounds 1–29, 2026-09-02 → 09-09) already reduced the list payload to 6,980 kB over 4,743 rows and made the fetch opt-in per route. Auditing against the stale figure would have manufactured closed findings.

Two deviations declared up front: **no subagents** (session not configured for them, so every dimension is serial and nothing is delegated), and **no live browser pass** (needs a test-tenant login that does not exist; there is no dev auth bypass). Every claim needing eyes on the screen is marked `[U]` and counted as unverified, not as a pass — D5 is entirely blocked, and the perf work is database-side only.
