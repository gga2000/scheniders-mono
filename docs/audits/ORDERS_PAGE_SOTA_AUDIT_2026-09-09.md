# Orders Page — Launch-Readiness Audit — 2026-09-09

**Status: IN PROGRESS.** Phase 0 complete. D1 (lifecycle/money) and D2 (concurrency) done for the write path; D3 (security) substantially done; D9 (integrations) and D10 (resilience) done; D4 (performance) and D11 (code health) partial. **9 findings so far — 4 × P1, 5 × P2.** Dimensions not yet run are listed in *What I have not audited yet*. Nothing in this document is a fix — the §0.5 gate has not been given and **no code, config, schema or data has been changed**.

---

## Engagement terms, as I understand them

- **§0.5** — read-only until the exact sentence `I'm Ali and I approve these changes`. This overrides auto-accept and the repo's auto-apply-migrations rule. Creating this report and the ledger is not a code change; everything else waits.
- **§0.6** — the design and layout are approved. Visual **defects and missing states** only; no redesign, no restyle, no taste opinions.
- The restore point (`refs/backups/pre-orders-audit-*`, snapshot `c374f50c`) is a last line of defence, not a licence to move fast.

**Two deviations from the prompt, stated up front rather than buried:**

1. **No subagents.** §4 asks for parallel subagent investigation. This session is configured not to use them, so every dimension is being run serially by me. Nothing is delegated, so nothing is unverified for that reason — but it is slower, and that is why this report is staged rather than delivered whole.
2. **No live browser pass yet.** §6 step 4 requires driving the real app as a merchant. That needs a test-tenant login I do not have; there is no dev auth bypass (verified during the dashboard audit). Everything below is evidenced from source and from the live database. **Every claim that would need eyes on the screen is marked `[U]` and is not counted as a pass.**

---

## Phase 0 — Baseline

### An important caveat about this baseline

This audit starts **after** the dashboard engagement (rounds 1–29, 2026-09-02 → 09-09) already changed this surface. The prompt's stated baseline — "a ~5.5MB / 12k-row orders fetch gating first paint" — **no longer describes the code**. What follows is measured today, and where a number moved because of that earlier work I say so. Auditing against a stale baseline would manufacture findings that are already closed.

| Metric | Measured | Note |
|---|---|---|
| `app/orders/page.tsx` | **3,177 lines** | Prompt said 3,129 — it has grown |
| `components/orders/order-card.tsx` | 2,461 lines | Moved here from `components/dashboard/` on 2026-09-09 |
| `order-details-modal.tsx` / `create-order-modal.tsx` | 1,642 / 1,311 | As prompted |
| Order-list JSON payload, largest tenant | **6,980 kB** over 4,743 rows | Was 9,718 kB; `risk_data` removed 2,738 kB (28.2%) on 2026-09-09 |
| Rows fetched per page request | 1,000 × 5 parallel pages | `orderRepository.findAll()` |
| **One page of 1,000 rows, via `v_orders_with_risk`** | **413.0 ms** | seq scan + external **disk** sort + `customer_trust` join |
| **Same page, direct from `orders`** | **53.6 ms** | index scan on `idx_orders_created_at` |
| Largest tenant | 4,767 active orders | 22,833 orders across all tenants |
| `: any` in `components/orders/` | **23** | 0 in `app/orders/` and `components/mobile/orders/` |
| `dir="rtl"` on the orders surface | **14** | House-rule violation — see ORD-A2 |
| Advisor findings touching this surface | 1 ERROR, several WARN | Triaged below; the ERROR is a false alarm, proven |

**Not yet measured (needs the browser):** bundle size for the route, cold/warm LCP, INP on filter/search/sort, CLS, DOM node count at 3k rows, re-render counts, memory after 5 minutes. All `[U]`.

---

## Findings so far

### [ORD-A12] 11 of 13 Server Actions are unauthenticated AND run as service-role, bypassing RLS; one grants arbitrary permissions
- **Dimension:** D3/D14 · **Pillar:** P5
- **Severity:** **P0**
- **Location:** `apps/platform/app/actions/orders.ts` (4 actions, 5 service-role clients), `permissions.ts` (2 actions, 3 service-role clients), `deleted-orders.ts` (2), `telegram-link.ts` and the rest — **13 exported actions, 0 auth checks between them**; `apps/platform/middleware.ts:14-16`
- **Evidence:**
  - Counted across `apps/platform/app/actions/`: **13 exported Server Actions, none of which performs any `auth.getUser` / `verifyAccessToken` / `tenant_members` / `get_user_tenant_ids` check.** Split by the client they build:

    | File | Actions | Client | RLS applies? |
    |---|:--:|---|---|
    | `orders.ts` | 4 | service-role | **No** |
    | `telegram-link.ts` | 3 | service-role | **No** |
    | `permissions.ts` | 2 | service-role | **No** |
    | `wallet.ts` | 1 | service-role | **No** |
    | `billing.ts` | 1 | service-role | **No** |
    | `deleted-orders.ts` | 2 | cookie-scoped | Yes |

    **11 of 13 bypass RLS entirely.** The 2 in `deleted-orders.ts` still lack a role check, but their cookie-scoped client means RLS remains in force — they are *not* part of this P0. Note that `wallet.ts` and `billing.ts` are in the unprotected group: those touch money directly.
  - `permissions.ts:5-17` — `toggleRolePermissionAction(role, permission, grant)` builds a **service-role** client and inserts straight into `role_permissions`. `:35+` — `toggleUserOverrideAction(userId, permission, grant)` does the same for a named user. Neither checks who is calling.
  - `orders.ts:22` — `createOrderAction(orderData, tenantId, …)` takes the **tenant id as a parameter from the caller**, uses a service-role client (RLS bypassed), creates the order, charges the wallet and increments `usage_tracking`.
  - **These are reachable.** `components/settings/team-settings.tsx:1` is `"use client"` and imports both permission actions (`:49`), so Next.js registers them as public Server Action endpoints whose ids ship in the client bundle. `hooks/use-orders-query.ts:473` does the same for `createOrderAction`.
  - **Middleware does not protect anything.** `middleware.ts:14-16`, verbatim: *"Refresh-only for now: route protection stays in the client auth guard. A server-side unauthenticated→/login redirect can be layered on once the cookie flow is confirmed in production."* It calls `supabase.auth.getUser()` to refresh a token and blocks nothing.
  - **The pattern is documented and spreading.** `app/actions/telegram-link.ts:6-15`, verbatim: *"The Settings → Team page is already gated to admins, so we follow the existing pattern (e.g. toggleRolePermissionAction) and don't re-verify the caller's role here."* The same comment adds that the service-role client "bypasses RLS but we still filter explicitly to prevent cross-tenant leakage" — filtering on a **caller-supplied** tenant id, which prevents nothing.
- **Repro:** read the action ids out of the client bundle, then POST to any page route with the `Next-Action` header and a crafted argument array. **I did not run this** — §0.5 forbids mutations, and every one of these actions writes.
- **Impact:** the certain case needs no exotic access: **any authenticated user of any tenant and any role can invoke all 13 actions with arbitrary arguments.** An employee can call `toggleUserOverrideAction` and grant themselves any permission in the system, or `toggleRolePermissionAction` and grant it to their whole role. They can call `createOrderAction` with another tenant's id to create orders in that tenant, charging that tenant's wallet and consuming its plan quota. None of it is gated by anything except a UI that simply does not render the button.
- **Root cause:** a category error, and it is written down: the team believes that gating the *page* gates the *action*. A Server Action is an independently addressable HTTP endpoint; the component that imports it is irrelevant to who may call it. Middleware, which could have been the backstop, explicitly defers protection to "the client auth guard" — which is a rendering decision, not a security boundary.
- **Fix:** every Server Action must, as its first statement, establish the caller from the session cookie (`createSupabaseServerClient()` + `auth.getUser()`), reject when absent, and then check the caller's membership and role **against the resource it is about to touch** — never against a tenant id supplied in the arguments. Derive `tenantId` server-side from the session; stop accepting it as a parameter. The permission actions additionally need an explicit admin check. A shared `requireTenantAdmin()` / `requireTenantMember()` helper would make the correct thing the easy thing, since the current comment shows the easy thing is currently to skip it.
- **In plain language:** The app has 13 server functions that anyone signed in can call directly, bypassing the screens that normally hide them. One of them hands out permissions — a junior staff member could give themselves full admin. Another creates orders and charges the bill to whichever company id it is handed. The code says these are safe because the settings page is admin-only, but the page and the function are not the same thing: you can call the function without ever opening the page.
- **What could break if we fix it:** the Telegram webhook calls `createOrderAction` server-to-server with `link.tenant_id` (`api/telegram/webhook/route.ts:290`) and has no user session — it needs an explicit service path rather than the user path. Every call site must be checked for whether a session actually exists.
- **How we prove the fix worked:** with a non-admin session, invoke `toggleUserOverrideAction` directly against the action endpoint and confirm it is rejected; invoke `createOrderAction` with a foreign tenant id and confirm rejection; confirm the Telegram webhook still creates orders. A regression test per action asserting "no session → rejected" and "wrong tenant → rejected".
- **Effort:** M · **Risk of fix:** med — it touches every action call site
- **Recommendation:** **fix first, before anything else in this report.** This is the only P0 in either audit.
- **Approval status:** PENDING

### [ORD-A1] The order-assignment feature is wired into four screens, cannot be used, and persists nothing
- **Dimension:** D1/D11 · **Pillar:** P1/P4
- **Severity:** **P1**
- **Location:** `apps/platform/app/orders/page.tsx:19, 500, 566-579, 581-606, 2664-2665, 2725-2726, 2784-2785, 2871-2872`; `components/mobile/orders/MobileOrdersPage.tsx:13, 65, 72, 261`; `apps/platform/lib/team-types.ts:71`; `apps/platform/public/workers/assignment-worker.js`
- **Evidence:**
  - `page.tsx:500` — `const [assignments, setAssignments] = useState<OrderAssignment[]>(mockAssignments);`
  - `team-types.ts:71` — `export const mockAssignments: OrderAssignment[] = [];`
  - `page.tsx:566-579` — `handleAssignDuty` builds an object with `crypto.randomUUID()`, pushes it into React state, and calls `toast.success(\`Assigned to ${duty}\`)`. **There is no database write in this function.**
  - `onAssignDuty={handleAssignDuty}` is passed at **four** render sites (2665, 2726, 2785, 2872) plus `MobileOrdersPage.tsx:261`.
  - The three components that receive it — `order-card.tsx:127,162`, `virtualized-order-list.tsx:46,87,197`, `order-details-modal.tsx:96,114` — **declare and destructure it and never invoke it.** `virtualized-order-list.tsx:197` only forwards it further down.
  - Database: `SELECT relname FROM pg_class WHERE relname ILIKE '%assign%'` returns only `customer_tag_assignments` and `product_tag_assignments`. **No order-assignment table exists.**
  - `page.tsx:581-606` — an effect keyed on `[orders, assignments]` spawns `new Worker('/workers/assignment-worker.js')` on every orders change and feeds it `mockAssignmentRules`.
- **Repro:** `grep -rn "onAssignDuty" apps/platform/components` — every hit is a declaration, a destructure, or a forward. No call site exists.
- **Impact:** Two compounding problems. (1) The assignment UI **cannot be triggered** — the handler is plumbed through four screens and nothing calls it, so a merchant cannot assign an order to a member of staff at all. (2) If it *were* called, the assignment would live only in one browser tab's memory: gone on refresh, invisible to every colleague, never auditable — while the user is shown a green success toast. A success message for an action that was never saved is the worst of the two failure modes, and it is one prop-wiring change away.
- **Root cause:** The feature was built front-end-first against mock data and the persistence layer was never written. The mock never got removed because it is an empty array, so it looks harmless in review.
- **Fix:** Decide the feature's status first — this is a product call, not a code call. Either (a) build it: an `order_assignments` table with RLS and tenant scoping, real persistence in `handleAssignDuty`, and a real call site; or (b) remove it: delete `handleAssignDuty`, the four prop wirings, the three unused props, `mockAssignments`, `mockAssignmentRules`, the worker file and the effect. **Do not leave it as it is** — the current state is a trap that will eventually be "fixed" by wiring up the call site, which ships the silent-data-loss version.
- **In plain language:** There is an "assign this order to someone" feature that looks finished. Nothing can actually trigger it, and if anything did, the assignment would disappear the moment the page reloaded — after telling the user it worked. It also runs a background worker on every order refresh to compute assignments from fake rules that go nowhere.
- **What could break if we fix it:** Removal is low risk — nothing calls it. Building it touches the orders write path and the RLS model, and the mobile tree duplicates the same state.
- **How we prove the fix worked:** If removed: `grep -rn "onAssignDuty\|mockAssignments\|assignment-worker"` returns nothing and the page still builds. If built: assign an order, hard-refresh, confirm it survives; confirm a second user in the same tenant sees it; confirm a user in another tenant does not.
- **Effort:** S (remove) / L (build) · **Risk of fix:** low (remove) / med (build)
- **Recommendation:** **Decide, then act.** My recommendation is remove now and build deliberately later — a feature nobody can invoke is not shipping value today, and the dead wiring is actively dangerous.
- **Approval status:** PENDING

### [ORD-A2] `dir="rtl"` appears 14 times on the orders surface, against an explicit house rule
- **Dimension:** D8 · **Pillar:** P5/P7
- **Severity:** **P2**
- **Location:** `components/mobile/orders/MobileOrdersPage.tsx:144`; `components/mobile/orders/MobileOrderCard.tsx:318, 414`; `components/orders/product-picker.tsx:152`; `components/orders/blacklist-dialog.tsx:71`; 9 further occurrences across the same three directories
- **Evidence:** `grep -rn 'dir="rtl"' apps/platform/components/orders apps/platform/components/mobile/orders apps/platform/app/orders | wc -l` → **14**
- **Repro:** the command above
- **Impact:** `CLAUDE.md` and the standing house rule are unambiguous: the app is **LTR in every locale including Arabic**; set `<html lang>`, never `dir`. Each of these flips the direction of a container, so layout order inside it reverses — which is exactly the inconsistency the rule exists to prevent. §1 of this engagement's own prompt names finding one of these as a finding.
- **Root cause:** Applied locally to make Arabic text look right in one component, rather than relying on the app's LTR-with-Arabic-content convention.
- **Fix:** Remove each `dir="rtl"` and verify the affected block still reads correctly; where the intent was text alignment rather than direction, use `text-right`.
- **In plain language:** The app is supposed to stay left-to-right everywhere, even in Arabic. Fourteen places on the orders screens flip themselves to right-to-left, which reverses the order of things inside them.
- **What could break if we fix it:** Visual only, but real: removing `dir` will move things inside those containers. Each one needs looking at, which needs the browser pass I have not done.
- **How we prove the fix worked:** grep returns 0 on the surface, plus a screenshot of each of the 14 blocks before and after.
- **Effort:** M · **Risk of fix:** low, but **needs eyes** — I would not ship this blind.
- **Recommendation:** fix now, but only alongside a live pass. **Note:** the dashboard audit deliberately did not sweep these; there are ~19 more outside the orders surface.
- **Approval status:** PENDING

### [ORD-A3] Every read of the order list pays a 345 ms `customer_trust` join for a column it no longer selects
- **Dimension:** D4 · **Pillar:** P2
- **Severity:** **P1**
- **Location:** `apps/platform/lib/repositories/order-repository.ts` (`findAll` reads `v_orders_with_risk`); view `public.v_orders_with_risk`
- **Evidence:** `EXPLAIN (ANALYZE, BUFFERS)` on one 1,000-row page, as a real tenant member:
  - via `v_orders_with_risk` → **413.0 ms**. `Seq Scan on orders` (Rows Removed by Filter: 18,090), `Sort Method: external merge Disk: 2,264 kB`, `Merge Right Join` against `customer_trust` costing **345 ms** on its own, `Heap Fetches: 3,158` on the index-only scan.
  - the same projection direct from `public.orders` → **53.6 ms**, `Index Scan using idx_orders_created_at`.
  - **7.7× slower**, and `findAll` issues **five such pages in parallel**.
- **Repro:** both `EXPLAIN` statements are in this audit's transcript; re-run under `SET LOCAL ROLE authenticated` with a tenant member's JWT claims.
- **Impact:** roughly 1.8 seconds of aggregate database work on every full order-list load, for a join whose only product is `risk_data` — which the list **stopped selecting on 2026-09-09**. The join is not eliminated by column pruning because it is a join, not a projection. The external merge sort also spills 2.2 MB to disk per page, and it sorts on `normalize_phone(...)`, a function call per row that no index can serve as written.
- **Root cause:** `v_orders_with_risk` bundles the risk join into the only view the list can read. When `risk_data` was split out of the payload (correctly, for transfer size), the *query* cost stayed behind.
- **Fix:** read the list from a projection without the trust join — either `public.orders` directly or a lean view — and keep supplying risk through `useOrderRiskQuery()`, which already exists and already works. Then re-`EXPLAIN`. Separately, consider an index supporting `(tenant_id, is_archived, deleted_at, created_at DESC)`; the current plan seq-scans and discards 18,090 rows.
- **In plain language:** Loading the orders list makes the database do a large amount of extra work to attach customer-risk information that the list threw away last week. Removing that join takes one page of orders from 413 ms to 54 ms.
- **What could break if we fix it:** anything still expecting `risk_data` on a list row. The dashboard audit already moved every such reader onto `useOrderRiskQuery()`, but the orders **detail** path and `v_orders_with_risk`'s 20+ other consumers must be checked one by one before the list is repointed.
- **How we prove the fix worked:** re-run both `EXPLAIN`s and show the list query at index-scan speed; confirm risk badges still render on the orders route; confirm row counts are identical before and after.
- **Effort:** M · **Risk of fix:** med — the view has many consumers.
- **Recommendation:** fix now. It is the single largest measured cost on the page's critical path.
- **Approval status:** PENDING

### [ORD-A4] 23 `any` types in `components/orders/`, including whole components with untyped props
- **Dimension:** D11 · **Pillar:** P1
- **Severity:** **P2**
- **Location:** `virtualized-order-table.tsx:130, 131, 316, 520`; `order-customer-card.tsx:14, 15, 16`; `swipeable-order-card.tsx:18, 20`; `order-confirmation-card.tsx:192`; 13 more
- **Evidence:** `grep -rn ': any' apps/platform/components/orders | grep -v '\.test\.' | wc -l` → **23**. Notable: `virtualized-order-table.tsx:316` is `}: any)` — an entire component's props untyped; `swipeable-order-card.tsx:20` is `[key: string]: any` — an open index signature that defeats every prop check on the card.
- **Repro:** the command above
- **Impact:** `any` is banned by `CLAUDE.md` unless justified in a comment. This is not a style matter on this particular codebase: during the dashboard audit, **four separate real defects were found precisely by removing a too-wide type** — a prop no caller passed, a null price that would render `IQD NaN`, a null phone, and an RPC row lying about its shape. Each `any` here is a place where that class of bug is currently invisible.
- **Root cause:** props were widened to move fast, and the open index signature on the card makes any future widening free.
- **Fix:** type them, one component at a time, starting with `virtualized-order-table.tsx:316` and `swipeable-order-card.tsx:20`. Expect the compiler to surface real defects rather than merely going quiet — budget for fixing what it finds.
- **In plain language:** Twenty-three places on the orders screens tell the type-checker "don't look here". On this codebase, that is exactly where bugs have been hiding.
- **What could break if we fix it:** typing these will produce compiler errors that are *findings*, not noise. `virtualized-order-table.tsx` is on the hot render path.
- **How we prove the fix worked:** the grep count falls; `pnpm type-check` stays clean; every error surfaced on the way is triaged and recorded, not silenced with another cast.
- **Effort:** M · **Risk of fix:** low to med, per component
- **Recommendation:** fix later, deliberately, one component per round — but do not batch it with anything else.
- **Approval status:** PENDING

### [ORD-A7] A destructive, service-role, cross-tenant delete endpoint whose auth check disables itself when an optional env var is unset
- **Dimension:** D3/D9 · **Pillar:** P5/P1
- **Severity:** **P1** *(P0 if `CRON_SECRET` is unset in production — see "why not P0")*
- **Location:** `apps/platform/app/api/cron/cleanup-deleted-orders/route.ts:14-51`; `apps/platform/lib/env.ts:46`; `apps/platform/vercel.json`
- **Evidence:**
  - The guard is conditional: `if (process.env.CRON_SECRET && authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)`. **If `CRON_SECRET` is unset or empty, the whole check is skipped** and the request proceeds.
  - `env.ts:46` — `CRON_SECRET: z.string().min(1).optional()`. Explicitly optional, so the app boots and runs without it. It appears in **no `.env.example`**.
  - It then builds a **service-role** client (`createSupabaseServiceClient()`), which **bypasses RLS**, and executes a hard delete with **no tenant filter**: `.delete().not('deleted_at','is',null).lt('deleted_at', thresholdIso)`.
  - It is a **GET**. No POST body, no CSRF token — a plain URL fetch, a crawler, a link preview or an address bar triggers it.
  - The in-code comment says "Delete up to 1000 orders per cron execution". **There is no limit clause.** It deletes every matching row.
  - It is **not registered in `vercel.json`** — the crons list contains `backup`, `waseet-sync`, `trial-suspend`, `subscription-renew` and others, but not this. So it is an unscheduled endpoint that exists only to be called.
  - It writes nothing to `order_deletion_log` (which has **0 rows**), so a deletion through this path leaves no audit trail.
  - **The codebase already knows the correct pattern.** `trial-suspend/route.ts:18` and `subscription-renew/route.ts:31` use the strict form — `if (authHeader !== \`Bearer ${process.env.CRON_SECRET}\`)` — which fails closed when the variable is missing. Four other routes (`process-checkouts`, `abandoned-cart-recovery`, `backup`, `auto-no-response`) use the same conditional form as this one.
- **Repro:** `GET /api/cron/cleanup-deleted-orders` with no headers. If `CRON_SECRET` is unset, it returns `{success: true, deletedCount: N}`. **I did not run this** — §0.5 forbids mutations during the audit.
- **Impact:** unauthenticated, permanent, cross-tenant deletion of orders, with no audit record and no per-tenant scope. Recovery would depend entirely on database backups.
- **Why this is P1 and not P0 — measured, not assumed:** right now the endpoint would delete **nothing**. There are **24 soft-deleted orders across all tenants and none is older than 30 days**, so the threshold matches zero rows today. The hole is real but its target set is currently empty. It becomes live the moment any trashed order ages past 30 days, which happens continuously in normal use. I also **cannot confirm whether `CRON_SECRET` is set in production** — I have no environment access — so the severity genuinely hinges on a fact I could not check. That check is the first thing I would do.
- **Root cause:** an auth guard written as an optional convenience ("optional depending on your Vercel setup", per the comment) on an endpoint whose blast radius is permanent cross-tenant deletion.
- **Fix:** (1) make the guard unconditional, matching `trial-suspend`: reject when the header does not match, and reject when `CRON_SECRET` is absent. (2) Add a `LIMIT` so the comment becomes true. (3) Write to `order_deletion_log` before deleting. (4) Either register it in `vercel.json` or delete the route — an unscheduled destructive endpoint has no reason to exist. (5) Sweep the four sibling routes using the same conditional pattern.
- **In plain language:** There is a web address that permanently deletes old trashed orders for every merchant on the platform. It is supposed to be protected by a secret, but the protection only switches on if that secret happens to be configured — and the secret is optional and documented nowhere. Nothing schedules this endpoint, so it exists purely to be called. Today it would delete nothing, because no trashed order is old enough yet.
- **What could break if we fix it:** making the guard strict will break the endpoint for any caller that currently relies on it being open — which, since it is unscheduled, should be nobody. Verify before shipping.
- **How we prove the fix worked:** call it with no header and with a wrong header — both must return 401 regardless of whether `CRON_SECRET` is set. Confirm with the variable deliberately unset.
- **Effort:** S · **Risk of fix:** low
- **Recommendation:** **fix now**, and check the production environment for `CRON_SECRET` today. This repo has a precedent for env vars silently disappearing from this Vercel project (`INTERAKT_API_KEY` and `NEXT_PUBLIC_SITE_URL` were dropped around 2026-06-01, causing silent WhatsApp send failures), which is exactly the failure mode this guard depends on not happening.
- **Approval status:** PENDING

### [ORD-A10] There is no order state machine — status is unconstrained at every layer, and `completed` is not terminal
- **Dimension:** D1 · **Pillar:** P1
- **Severity:** **P1**
- **Location:** `apps/platform/hooks/use-order-crud.ts:120-125` (`updateOrderStatus`); `public.orders.status`; no guard exists anywhere
- **Evidence:**
  - **No validation in code.** `grep -rniE "allowedTransitions|validTransitions|canTransition|isValidTransition|stateMachine"` across the whole app returns **nothing relevant** — every hit is about SKU transitions in the batching module. `updateOrderStatus(orderId, status, ...)` accepts a status and writes it; TypeScript constrains the *value* at compile time but nothing checks it is *legal from the current state*.
  - **No validation in the database.** The only CHECK constraint on `public.orders` is `orders_delivered_source_check`. `status` is unconstrained `text` — no enum, no CHECK, no trigger.
  - **The observed state machine is close to a complete graph.** Deriving it from 12,003 rows of `order_status_history` yields **86 distinct `from → to` pairs** across 13 statuses.
  - **`completed` is not terminal.** Observed exits from `completed`: → `delivered` (12), → `confirmed` (11), → `rejected` (3), → `in_transit` (2), → `refund_delivered` (2), → `cancelled` (1), → `contacted` (1).
  - **Recent reversals, not just legacy:** `cancelled → confirmed` (16, last **2026-09-06**), `rejected → new` (last **2026-09-09**), `confirmed → new` (3, last **2026-09-09**), `delivered → confirmed` (20), `delivered → in_transit` (125).
  - **~880 self-transitions are recorded as history:** `confirmed → confirmed` (537), `contacted → contacted` (133), `in_transit → in_transit` (79), `new → new` (66), `pending_checkout → pending_checkout` (65). Each writes an audit row for a change that did not happen.
- **Repro:** `SELECT from_status, to_status, count(*) FROM order_status_history GROUP BY 1,2 ORDER BY 3 DESC;`
- **Impact:** an order whose money has been collected (`completed`) can be moved back to `confirmed` or `in_transit`, and a `cancelled` order can be resurrected to `confirmed`. Every downstream aggregate keyed on status — realized revenue, delivery rate, cycle time, the funnel, payroll — silently changes when that happens, with no record that it was a reversal rather than a normal progression. The self-transitions additionally pollute the audit trail with ~880 entries for non-events, which is exactly the noise that makes a real reversal hard to spot.
- **Root cause:** status is treated as a field rather than as a state. There is no single place that owns "what may follow what", so every writer — the UI, the Waseet sync, the auto-no-response cron, imports — decides for itself.
- **What I am *not* claiming:** despite `status` being unconstrained `text`, **no out-of-vocabulary value has ever landed**. All 13 statuses in use are within the declared TypeScript union (`refund_failed` is declared but unused). The app's types have held the line in practice. The risk is real at the database layer but it has not materialised, and I am not going to inflate it into one that has.
- **Fix:** define the legal transition map in one shared module, enforce it in `updateOrderStatus` before the write, and mirror it as a database trigger so non-UI writers (cron, sync, import) obey it too. Decide explicitly which states are terminal and which reversals are permitted — some almost certainly are, deliberately (a mis-clicked `cancelled` needs an undo path), and those should be *named* transitions with a reason, not silent equivalence. Suppress no-op self-transitions at the history writer.
- **In plain language:** Nothing in the app or the database says which order statuses may follow which. An order that has been completed and paid for can be pushed back to "confirmed", and a cancelled order can be un-cancelled, with no record that anything unusual happened — and every revenue and performance number quietly changes when it does.
- **What could break if we fix it:** enforcing transitions will start rejecting moves that staff currently make routinely — including legitimate corrections. The map must be derived from the 86 observed transitions and agreed with someone who knows the workflow, not invented from first principles. Shipping a guess here would block real work on the busiest screen in the product.
- **How we prove the fix worked:** replay the 86 observed transitions against the map and confirm each is either allowed or deliberately listed as forbidden; then attempt `completed → confirmed` and confirm it is rejected or logged as an explicit reversal; confirm the self-transition count stops growing.
- **Effort:** M (code) + the workflow decision · **Risk of fix:** **med-high** — this constrains the daily work of every agent
- **Recommendation:** fix, but design it with the workflow owner first. Start with the narrow, safe half: stop writing self-transitions, and make `completed` and `refund_delivered` terminal-unless-explicitly-reversed.
- **Approval status:** PENDING

### CORRECTION to ORD-A6 and ORD-A11 — the fix already exists, and mine was wrong

Both findings are **accurate in their diagnosis and wrong in their prescription**. Before writing either fix I checked whether the held `20260822150000` migration existed on this branch. It does not — it lives on commit `d9f2700f`, *"fix(orders): stop silent lost writes and revive realtime between users"*, on the unmerged `feat/store-builder-preview-iframe` branch. That commit already solves both, and solves them better.

**It found two consequences I missed.** I identified optimistic concurrency (A6) and delta sync (A11). It enumerates four mechanisms that silently depended on `updated_at` moving — also **the realtime batcher**, which discarded an incoming peer edit because it carried an equal timestamp (`updated.updated_at <= o.updated_at`), so realtime looked connected while delivering nothing between employees; and **the drift heartbeat**, whose server-side `MAX(updated_at)` never advanced.

**My proposed fix for A6 would have made things worse.** I recommended applying the trigger and keeping `updated_at` as the conflict token. That commit deliberately rejects exactly that:

> *"Deliberately NOT keeping `updated_at` as the conflict token: the optimistic cache stamped it with the CLIENT clock, so arming the guards against it would have produced false 'modified elsewhere' errors."*

The token moves to `version` instead — server-assigned, present on all 21,071 rows, bumped by a trigger on every UPDATE, and impossible for a client to fabricate. It also removes the client-clock stamp, because a fabricated future timestamp could suppress a genuine incoming event. My A11 `.gt()` → `.gte()` recommendation matches what it does; my A6 recommendation did not.

**The migration must not be applied yet, and I have not applied it.** Its own header carries the prerequisite:

> *"Apply this ONLY together with (or after) the application code that moves the conflict token from `updated_at` to `version`. Applying it while an older build is still live would arm the previously-dormant `.eq("updated_at", ...)` guards against a client-clock timestamp the browser fabricates optimistically, and merchants would see spurious 'modified elsewhere' errors on rapid edits."*

The database is shared with production and production runs an older build, so applying it now would break live editing. This is a self-documented prerequisite — the one case where the repo's auto-apply-migrations rule explicitly stops.

**I also did not cherry-pick the code.** `d9f2700f` modifies `order-repository.ts`, which I changed for ORD-A3, so a cherry-pick would conflict — and duplicating the commit on two branches would make the eventual merge harder, on a branch another session is actively working in.

**Therefore A6 and A11 are not "open findings needing a fix". They are `PROC-D1`** — the held branch needs merging and deploying, and the migration applied with it. That is the whole remedy. Recorded here rather than reinvented, because writing my own version would have shipped the false-conflict bug that commit was careful to avoid.

### [ORD-A11] Delta sync can never see a change that leaves `updated_at` untouched, and never removes a deleted order
- **Dimension:** D2 · **Pillar:** P1/P6
- **Severity:** **P1**
- **Location:** `apps/platform/hooks/use-orders-query.ts:46-72` (`syncOrdersDelta`); `apps/platform/lib/repositories/order-repository.ts:247-256` (`findChangedSince`); `apps/platform/lib/realtime-batcher.ts:207-229` (`applyChangedOrders`)
- **Evidence:**
  - `use-orders-query.ts:54-58` — the high-water mark is the newest `updated_at` in the cache. `order-repository.ts:251` — the delta fetch is `.gt("updated_at", sinceTimestamp)`.
  - **The watermark column is unmaintained.** As established in ORD-A6, no write path sets `updated_at` and no trigger maintains it. Measured: **1,436 orders changed status while `updated_at` never moved; 36 of them since 2026-06-01.**
  - `realtime-batcher.ts:221` — archived rows are handled (`if (o.is_archived) { archived.add(o.id); continue; }`) and removed from the cache. **Soft-deleted rows are not, and cannot be:** `v_orders_with_risk` filters `deleted_at IS NULL`, so a soft-deleted order never appears in `findChangedSince`'s result at all — there is nothing to signal its removal.
  - `syncOrdersDelta` is called on app reopen (`use-orders.ts:46-50`) and on realtime reconnect (`:71-77`) — exactly the moments the client is most likely to be behind.
- **Repro:** change an order's status through a path that does not touch `updated_at`, then trigger a reopen/reconnect delta sync; the change never arrives. Soft-delete an order in one session and delta-sync another; it remains in the list.
- **Impact:** three ways the list silently diverges from the database and stays diverged until a *full* refetch happens to occur. (1) Any change that does not move `updated_at` is invisible to delta sync forever — proven to happen 1,436 times. (2) A deleted order stays visible to every other user's session. (3) Because delta sync runs precisely on reopen and reconnect, the divergence is most likely exactly when the user assumes they have just been brought up to date.
- **Root cause:** the sync design assumes `updated_at` is a reliable change marker maintained by the database, and assumes "changed" and "still visible" are the same set. Neither holds.
- **A trap worth naming: fixing ORD-A6 activates a second bug here.** Once the held `updated_at` trigger lands, `updated_at` starts moving — and the strict `.gt()` boundary becomes live. In Postgres every row updated in one transaction receives the **same** `now()`, so a bulk status change gives many orders an identical `updated_at`. Delta sync takes one of them as the high-water mark and `.gt()` then skips **all the others permanently**. This surface has first-class bulk operations, so that is not a corner case. **ORD-A6 and ORD-A11 must be fixed together** — shipping the trigger alone converts a dormant boundary bug into a live one on the most common bulk path.
- **Fix:** (1) apply the `updated_at` trigger (ORD-A6). (2) Change the boundary to `.gte()` and de-duplicate by id on apply — re-fetching the boundary row is harmless; skipping siblings is not. (3) Give delta sync a way to learn about removals: either return soft-deleted ids from a dedicated query, or have it read a source that includes `deleted_at` rather than one that filters it. (4) Keep the existing full-refetch fallback as the safety net it already is.
- **In plain language:** When the app comes back from being closed or reconnects, it asks the server "what changed since the newest thing I have?" using a timestamp the database never updates — so changes it should catch are invisible, and orders someone else deleted stay on screen. Worse, the moment we fix the timestamp, a second bug wakes up: a bulk update stamps every affected order with the identical time, and this query is written to skip anything equal to what it has already seen.
- **What could break if we fix it:** `.gte()` re-applies the boundary row on every sync — harmless, but it will show up in the diagnostic counts as one extra applied row. Adding removal handling touches the cache-mutation path shared with realtime.
- **How we prove the fix worked:** bulk-update 50 orders in one transaction, delta-sync, and confirm **all 50** arrive rather than 1. Soft-delete an order in session A and confirm it disappears from session B after a sync. Change a status without touching `updated_at` and confirm it still arrives once the trigger is live.
- **Effort:** M · **Risk of fix:** med — it shares the cache-mutation path with realtime
- **Recommendation:** fix now, **in the same round as ORD-A6**, never before it and never separately.
- **Approval status:** PENDING

### [ORD-A8] The Gemini order extractor casts an LLM's output straight into a typed object, with no size cap, no MIME allowlist and no rate limit
- **Dimension:** D9 · **Pillar:** P6/P7/P5
- **Severity:** **P2**
- **Location:** `apps/platform/app/api/orders/analyze-image/route.ts:17-32`; `apps/platform/lib/gemini-order-extractor.ts:80`; consumed by `components/orders/create-order-modal.tsx:329` and `components/orders/bulk-upload-modal.tsx:76`
- **Evidence:**
  - `gemini-order-extractor.ts:80` — `return JSON.parse(cleaned) as ExtractedOrder;`. **A raw cast on a third-party LLM's output, itself derived from a user-uploaded image.** No Zod, no field checks, no `responseMimeType: "application/json"` and no response schema on the model call — correctness rests entirely on the prompt asking nicely for JSON.
  - `route.ts:23` — `Buffer.from(await file.arrayBuffer())` with **no size limit**. The whole upload is buffered in memory.
  - `route.ts:18-21` — `formData.get("image") as File`, and `file.type` is passed to Gemini unvalidated. **No MIME allowlist**; the type is client-controlled.
  - **No rate limiting and no usage attribution.** Every call is a paid Gemini request. The user is verified but the tenant is never recorded and nothing increments a quota.
  - `route.ts:30, 38` — error responses include `details: err.message`, returning raw internal error text (including upstream Gemini errors) to the caller.
  - The prompt sends a customer chat screenshot — **name, Iraqi phone numbers and full address** — to Google.
- **Repro:** read the two files; the cast is a single line and there is no validation between the model and the order form.
- **Impact:** four distinct problems. (1) If Gemini returns a shape that does not match, `ExtractedOrder` lies and the create-order form prefills `undefined` into fields typed `string`. (2) The image is untrusted input to a model whose output prefills a real order — adversarial text in a screenshot is a prompt-injection surface with no validation downstream. (3) Any authenticated employee of any tenant can loop an unbounded upload against a paid API with no cap. (4) Customer PII leaves the platform for a third party with no visible consent or notice mechanism.
- **Root cause:** the boundary was treated as internal. `CLAUDE.md` is explicit — "Type external boundaries (API input, webhooks, env) with Zod and infer the types" — and an LLM response is the most external boundary in the codebase.
- **Fix:** validate the model output with a Zod schema and reject or surface a clear error when it does not parse; add `responseMimeType`/response-schema to the Gemini call so the model is constrained rather than merely asked; cap upload size and enforce a MIME allowlist before buffering; add per-tenant rate limiting and usage attribution; stop returning `details` to the client. The PII question is a business decision — but it should be a decided one.
- **In plain language:** When a merchant uploads a screenshot of a customer chat, the app sends it to Google's AI and then trusts whatever comes back without checking it, using it to fill in a new order. There is no limit on file size, no check on file type, and no cap on how many times this can be called — each call costs money.
- **What could break if we fix it:** adding validation will start rejecting responses that currently slip through half-formed. That is the point, but it will surface as new errors where there were previously silently blank fields.
- **How we prove the fix worked:** feed the extractor a deliberately malformed response and confirm a clean, surfaced error rather than a cast; upload an oversized file and confirm rejection before buffering; call the endpoint past the rate limit and confirm a 429.
- **Effort:** M · **Risk of fix:** low
- **Recommendation:** fix now. This is the same class as the dashboard audit's ARCH-D3 (`as unknown as`), and there the cast was hiding a real defect.
- **Approval status:** PENDING

### [ORD-A9] 18 of 27 failure paths in the order CRUD layer tell the user nothing, and the surface has zero Sentry
- **Dimension:** D10 · **Pillar:** P6/P7
- **Location:** `apps/platform/hooks/use-order-crud.ts` (27 `catch` blocks); the whole orders surface for the Sentry half
- **Severity:** **P1**
- **Evidence:**
  - Parsed every `catch` block in `use-order-crud.ts`: **27 total — 9 surface via `toast.*`, 18 log to `console.*` and show the user nothing**, 0 completely empty.
  - `grep -rln "Sentry" apps/platform/app/orders apps/platform/components/orders apps/platform/hooks/use-order-crud.ts` → **no matches**. The orders surface reports nothing to Sentry.
- **Repro:** the parse script is in this audit's transcript; the Sentry grep is one command.
- **Impact:** for 18 failure paths in the layer that creates, updates, splits, merges, archives and deletes orders, a failure produces a line in a browser console that nobody is reading and no message to the merchant. The action appears to have worked. Combined with zero Sentry, the business also cannot see that it happened — there is no signal anywhere. On the revenue surface, a write that fails silently is indistinguishable from one that succeeded until someone notices the order is wrong days later.
- **Root cause:** `console.error` was treated as error handling. It is a development affordance, not a production one.
- **Fix:** each of the 18 needs a decision — surface to the user, report to Sentry, or both. Most order mutations warrant both. The dashboard audit set the precedent: identity (user + `tenant_id` + `user_role`) is already attached in the auth provider, so a `Sentry.captureException` here arrives attributable.
- **In plain language:** When something goes wrong while saving an order, in most cases the app writes a note to a hidden developer console and carries on. The merchant is not told, and nobody at the company can find out it happened.
- **What could break if we fix it:** adding toasts to 18 paths risks toast-spam if some of those failures are routine and expected. Each needs judging individually rather than a blanket wrap — which is why this is 18 small decisions, not one change.
- **How we prove the fix worked:** force a failure in each path (offline, or a rejected write) and confirm the user sees it and Sentry receives it, tagged with tenant and order id.
- **Effort:** M · **Risk of fix:** low
- **Recommendation:** fix now for the mutation paths; the read paths can follow.
- **Approval status:** PENDING

### [ORD-A5] 3,039 historical orders show a total that does not match their own line items — ~39.7M IQD of drift
- **Dimension:** D1 · **Pillar:** P1
- **Severity:** **P2** *(would have been P0 — see "what the evidence actually showed")*
- **Location:** data, not code. `public.orders.price` vs `items[].price × quantity`, `delivery_fee`, `discount_amount`
- **Evidence:** recomputed `price` from its own components for every order with line items, testing three candidate formulas (`items − discount`, `items + fee − discount`, `items`). For **ordinary orders** (excluding `is_return` and the `RTN-`/`RPL-` return and replacement flows, which have their own legitimate pricing):

  | Month | Ordinary orders | Unexplained | % |
  |---|---:|---:|---:|
  | 2026-09 | 441 | **0** | 0.0 |
  | 2026-08 | 1,388 | **0** | 0.0 |
  | 2026-07 | 1,423 | **0** | 0.0 |
  | 2026-06 | 1,367 | **0** | 0.0 |
  | 2026-05 | 2,334 | 5 | 0.2 |
  | 2026-04 | 1,642 | 316 | 19.2 |
  | 2026-03 | 2,377 | 992 | 41.7 |

  Residue: **3,039 orders across 11 of 12 tenants**, most recent **2026-05-30**, **39,746,006 IQD** total absolute drift, average 13,079 IQD, and **1,375 orders off by more than 10,000 IQD each**.
- **Repro:** the recomputation query is in this audit's transcript; it derives `items_total` with `jsonb_array_elements` and compares against the three formulas.
- **Impact:** a merchant opening any of these 3,039 historical orders sees a total that does not equal the products listed on it. That is a trust problem on the revenue surface, and it corrupts any historical analysis that sums line items rather than `price` (or vice versa). It does **not** affect current trading.
- **Root cause:** a pricing-formula defect that was live until roughly April–May 2026 and has since been fixed — the four most recent complete months show **zero** drift across 4,619 ordinary orders. The historical rows were never repaired.
- **Fix:** this is a **data decision, not a code change**. Either backfill `price` from line items for the affected rows (changes historical revenue figures — needs the owner's sign-off), or leave them and accept that pre-June-2026 orders may not reconcile. **I would not backfill without explicit instruction**: it rewrites money on 3,039 real orders.
- **In plain language:** About three thousand older orders show a total that does not add up from the products on them, by an average of 13,000 IQD. Whatever caused it was fixed around May — every order since June adds up correctly. The old records were just never corrected.
- **What could break if we fix it:** backfilling changes historical revenue totals, which will move reports, payroll and any figure already shown to the merchant. That is precisely why it needs a decision rather than a patch.
- **How we prove the fix worked:** re-run the recomputation; affected count falls to zero; and the same query on 2026-06-onward orders still returns zero, proving the live path was untouched.
- **Effort:** S (query) but the decision is the work · **Risk of fix:** **high** — it rewrites money
- **Recommendation:** **leave the data alone** unless the owner wants it repaired; record the cut-off date so anyone analysing history knows to treat pre-June-2026 totals as unreliable.
- **Approval status:** PENDING

### [ORD-A6] Optimistic locking is implemented correctly and is blind on ~30% of orders, because nothing guarantees `updated_at` moves
- **Dimension:** D2 · **Pillar:** P1
- **Severity:** **P1**
- **Location:** `apps/platform/lib/repositories/order-repository.ts:361-402` (`update`), `:404+` (`updateStatus`); `apps/platform/hooks/use-order-crud.ts:186, 275, 328-334, 800-818`; `apps/platform/lib/conflict-detection.ts:26-55`; held migration `packages/supabase/migrations/20260822150000_orders_updated_at_trigger.sql`
- **Evidence:**
  - The guard exists and is real: `order-repository.ts:370-372` adds `.eq("updated_at", expectedUpdatedAt)` and throws `CONFLICT_DETECTED` on `PGRST116` or an empty result. Callers pass it — `use-order-crud.ts:329` falls back to the cached `previousOrder?.updated_at`, bulk actions build a per-order map (`:800-818`), and chat's action bar passes `order.updated_at`.
  - **But nothing sets `updated_at`.** `grep -n "updated_at:" order-repository.ts use-order-crud.ts` → **no matches**: no write path assigns it. And the table has no trigger for it — live triggers on `public.orders` are `increment_orders_version`, `trg_chat_orders_event`, `trg_inv_order_changed`, `trg_notify_order_push`, `trg_order_completed_at`, `trg_orders_created_at_not_future`, `trg_update_trust_orders`. The migration that would add one, `20260822150000`, is **written but not applied** (`supabase_migrations.schema_migrations` has 0 rows for it).
  - Measured on live data (22,809 non-deleted orders): **6,810 (29.9%) have `updated_at = created_at`**. Of those, **1,436 have a status other than `new`** — they demonstrably changed and the timestamp never moved. **36 of those were created since 2026-06-01**, so this is the current code path, not only legacy rows.
- **Repro:** the query above; and `SELECT tgname FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND NOT tgisinternal`.
- **Impact:** for any order whose `updated_at` is stale, two agents editing the same order both pass the conflict check, and the second write silently overwrites the first. The user is told it saved. This is the exact lost-update the guard was built to prevent, and it is invisible: no error, no toast, no audit entry saying a value was replaced. On a page where two agents working the same queue is the *normal* operating mode, that matters.
- **Root cause:** the concurrency design assumes `updated_at` is maintained by the database. It is not — the trigger that would maintain it was written on 2026-08-22 and held for the Orders deploy, so the guard has been running against an unmaintained column ever since.
- **Fix:** apply the held trigger `20260822150000`. That is the root cause and the fix already exists. Until it lands, the guard should be treated as advisory, not as protection. A defensive second step: have `orderRepository.update` set `updated_at: new Date().toISOString()` in its payload so the value moves even without a trigger — but the trigger is the correct fix, because it also covers writes that do not come through this repository.
- **In plain language:** The app has a safety check to stop two people overwriting each other's edits on the same order. The check compares a "last changed" timestamp — but nothing actually updates that timestamp, so for about a third of orders it never changes and the check always says "no conflict". Two people editing the same order can silently lose one of the edits, and both are told it worked.
- **What could break if we fix it:** applying the trigger makes `updated_at` start moving, which will make the conflict check *start firing* — users will begin seeing conflict errors that were previously silent data loss. That is correct behaviour, but it is a visible change and support should know. It also shifts every `updated_at`-windowed metric (the dashboard audit's COR-D4 measured that separately).
- **How we prove the fix worked:** after applying, `UPDATE` an order and confirm `updated_at` moves; then re-run the measurement and confirm no new rows accumulate with `updated_at = created_at AND status <> 'new'`. For the guard itself: two sessions load the same order, both save, and the second receives `CONFLICT_DETECTED` rather than winning.
- **Effort:** S (the migration is written) · **Risk of fix:** med — it changes visible behaviour and moves metrics
- **Recommendation:** fix now, coordinated with the Orders deploy that already owns this migration.
- **Approval status:** PENDING

#### What the evidence actually showed — a correction to my own first reading

My first measurement said **15.5% of all orders (3,512) have money that does not reconcile, 49.85M IQD adrift** — which reads like a live P0 on the revenue surface. It was wrong twice:

1. It counted **returns and replacements** as broken. `RTN-` orders book `price = −(items − fee)` (refund the goods, keep the delivery fee) and `RPL-` orders can carry a top-up. Those are deliberate semantics my formula set did not model. Excluding them removes 473 orders.
2. It read as a **current** defect. Bucketing by month showed a clean monotonic decay — 41.7% in March, 19.2% in April, 0.2% in May, then **zero for four consecutive months**. The bug was already fixed; only the historical rows remain.

The honest finding is a P2 data-quality residue, not a P0. I am recording the wrong first reading deliberately: the difference between the two numbers is entirely "check whether a live code path can still produce this before you call it live", which is the same discipline the dashboard audit had to learn the hard way.

---

## Clean results — what I checked and did **not** find

A clean dimension needs proof too (§8).

- **`sku` stripping in `order-repository.ts` — GONE.** The prompt flags a precedent bug where the repository stripped `sku`, causing wrong-item WhatsApp messages. `grep -n "sku" apps/platform/lib/repositories/order-repository.ts` returns **nothing**: the column set does not mention `sku`, and item SKUs travel inside the `items` jsonb. The specific precedent is dead on this file. *(Whether the WhatsApp template path reads the sku correctly is D9 and not yet audited — `[U]`.)*
- **`mockEmployees` / `mockOrders` on live paths — none**, other than the assignment machinery in ORD-A1. (`mockEmployees` was removed from the orders and dashboard trees on 2026-09-09; the assignment popover still uses it, which is ORD-A1's territory.)
- **No `@ts-ignore`, no `eslint-disable`, no `TODO`, no `FIXME`** in `app/orders/`, `components/orders/` or `components/mobile/orders/`.
- **Anon cannot read customer data through the flagged RPCs.** As `anon`: `get_paginated_customers(...)` → **0 rows**; `get_customer_dashboard_stats()` → one all-zero row (`total_customers: 0`, `total_revenue: 0`). No leak.
- **`lookup_order` is sound despite taking a client-supplied `tenant_id`.** It requires the order number **and** a phone whose last 10 digits match the order's, restricts to tenants in `trial`/`active`, returns only four coarse fields, and is `LIMIT 1`. That is a correct design for public order tracking. *(Rate limiting is a separate question — see the open item below.)*
- **The `customer_aggregates` advisor ERROR is a false alarm — proven, not assumed.** The linter flags it as a `SECURITY DEFINER` view. It is deliberately so: it wraps a materialized view, and **materialized views cannot enforce RLS**, so the tenant predicate lives inside the view body. Verified empirically: as `anon` → `permission denied for view`; as a tenant employee → **4,238 rows, 1 distinct tenant, 0 foreign-tenant rows**. **Do not "fix" this warning by flipping it to `security_invoker`** — that would break the read path this and the customers page depend on.

---

## Open questions I could not close read-only

- **`api_rate_limits` has RLS enabled and no policies** (advisor, INFO). If rate limiting reads or writes that table as a normal role, it is silently a no-op — which would matter for `lookup_order`, the Gemini image endpoint, and export. Needs a look at the code that uses it. `[U]`
- **`anon` holds EXECUTE on `SECURITY DEFINER` functions that take a client-supplied `tenant_id` and perform writes** — `adjust_customer_points`, `zero_oversold`, `recompute_inventory`. I did **not** call them: §0.5 forbids mutations during the audit. Their read-only siblings proved safe, but these need either an authenticated-only grant or an internal tenant check. **This is the highest-priority open item and I would look at it first.** `[U]`

---

## What I have not audited yet

Stated plainly so nothing here is mistaken for a pass:

- **D1** money math **done** (ORD-A5); the order **state machine** itself — enumerating every legal transition and hunting illegal/orphaned states — is **not** done.
- **D2** the write-conflict half is **done** (ORD-A6). The **realtime** half — subscription teardown, the `RealtimeBatcher`, the module-level `_orderBatcher` singleton, and the delta-sync high-water-mark under clock skew and equal timestamps — is **not** done.
- **D3** substantially done: advisors triaged, anon surface probed, **per-table RLS impersonation completed across all 11 orders tables**, API-route auth reviewed. Still open: a live IDOR test against a running server (needs auth), and the `anon`-executable write RPCs, which cannot be confirmed without calling a mutating function.
- **D4** only the database half. Bundle, LCP/INP/CLS, virtualization under 3k rows, re-render profiling, memory — all need the browser. `[U]`
- **D5** visual integrity — **entirely blocked** on the login. Zero screenshots exist.
- **D9** done for Waseet (clean) and Gemini (ORD-A8). **WhatsApp/Interakt is not done** — the `sku` precedent is dead in the repository, but the template path itself is unaudited.
- **D10** done for the CRUD layer and Sentry coverage (ORD-A9). Boundary behaviour — whether a modal crash takes the page down — needs the browser. `[U]`
- **D6, D7, D12, D13, D14** — not started.
- **Keyboard shortcuts and keyboard-a11y are deliberately out of scope** per the house rule (§1). Contrast, hit-target size, colour-only signalling and legibility remain in scope and are unaudited pending the browser.

No score and no GO/NO-GO verdict is offered yet. Scoring seven pillars from a third of the evidence would be exactly the false confidence this report exists to prevent.
