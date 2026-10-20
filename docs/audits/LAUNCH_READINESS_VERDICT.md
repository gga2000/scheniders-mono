# Launch Readiness Verdict

**Date:** 2026-09-17 · **Question:** is this platform ready to onboard 150 merchants processing 3,750 orders/day?

> **⚠ Read this before the verdict. Added 2026-10-02, and it is now answered.** This verdict is built from code in
> the repository, and the repository is **not** what runs. Production is `main` @ **`3c0f0cb3`**, which is **not an
> ancestor** of the audited tree: `3c0f0cb3...HEAD` = **171 / 99**, with **539 files differing**. (An earlier version
> of this note said branch skew was ruled out; that comparison was made against a stale local `main`, which was the
> error.) **The principal findings were re-verified file-by-file at the deployed SHA and survive** — NEW-01, NEW-02,
> NEW-03, NEW-04, NEW-09, NEW-13, NEW-45, NEW-49, NEW-50, NEW-51 and the `/reports` crash are all present in
> production. **Two items were withdrawn as already fixed there:** plan step 1.5(c), and the two largest halves of
> NEW-53. The long tail of findings was **not** re-verified. So: the verdict's direction stands, the six items below
> stand, and **each individual item must be re-read at the deployed SHA before work is scheduled on it** — see the
> register's **⚠ RESOLVED** section and plan step 0.0.

---

## Verdict

# NO-GO for 150 merchants.
# GO for continued operation with the current single merchant, once six items are closed.

This is not a close call, and the reasons are not the ones a defect count would suggest. **The blocking problems are
architectural absences, not bugs.** You could fix every P0 in the register and still not be able to onboard merchant
number two, because there is one courier account, one order-number namespace, no way to collect money from merchants, and
no ledger that says whether the courier paid them.

---

## The five things that make 150 merchants impossible today

1. **One Al-Waseet account for the whole platform.** `lib/waseet-api.ts:94-96` reads process-level credentials. Every
   merchant's shipments, invoices and COD remittances land in one upstream account with no attribution, and any
   authenticated user can read and settle invoices belonging to any merchant. There is no per-tenant carrier credential
   path anywhere. **This blocks merchant #2, not merchant #150.**
2. **You cannot collect money from merchants.** No payment gateway exists — ZainCash/FastPay/Qi are UI labels; the
   verification webhook `wallet.ts` refers to was never built. Billing is a manual top-up, and the top-up route has no
   authorization and no amount ceiling.
3. **`orders.price` has no agreed meaning.** Five conventions are live in one column, `create_order_atomic` validates
   nothing, and one courier formula is applied to all of them. Manual orders are handed to the courier as
   `Σ(lines) + 2×delivery_fee − 2×discount`. At one merchant this is a known quirk someone compensates for; at 150 it is
   systematic revenue error nobody can see.
4. **No COD cash ledger.** Nothing reconciles cash collected against cash received. `orders.waseet_invoice_id` is
   non-null on **0 of 22,943 rows**, so the payouts screen structurally cannot report a mismatch, and the one field that
   records money actually received defaults to the courier's own claim. In a ~100% COD market this is the single
   question merchants ask weekly.
5. **Order status writes measure ~1.7 s.** At 3,750 orders/day × 3.38 status transitions that is ~6 hours of database
   time per day, ~40% of it inside a 3-hour evening peak. The peak does not fit before anything else runs.

---

## The six that must close before the *current* merchant is safe

*(Item 3 now carries three endpoints rather than two; the count of six headings is unchanged.)*

These are live exposures on a system serving one real business today.

**Read items 1, 2 and 5 against NEW-50 first.** Each of them is gated on the attacker holding an `authenticated` JWT,
and `auth/signup/route.ts:44` sets `email_confirm: true` on an unauthenticated, unrate-limited public route that also
writes `role: 'admin'`. So that JWT costs one `curl` with an address nobody checks. "Open signup is the entry point"
below understated it — there is no email in the loop at all.

1. **`vault_backups`** — **509 MB across 76 objects** (re-measured 2026-10-02; 222.9 MB when this was written) of
   cross-tenant order and customer CSVs, readable **and deletable** by anyone who signs up. Open signup is the entry
   point. The nightly backup now runs, so this **grows ~23 MB/day at 28 tenants** and would be on the order of
   124 MB/day at 150. It compounds while it stays open.
2. **`GET /api/health` on the admin console** — unauthenticated, returns every tenant's name, plan, city and wallet
   balance.
3. **Three unauthenticated mutating endpoints — revised upward 2026-10-02.** `lightfunnels/sync` (steal or destroy
   the integration token), `interakt/dispatch-event` (open WhatsApp relay, billed to the merchant, risks the WABA),
   and — **newly confirmed against the deployed SHA and against live data** — `webhooks/interakt/[tenantId]`
   (**NEW-54a**), whose secret check is skipped because **0 of 1 `tenant_integrations` rows has a `webhook_secret`**.
   An unauthenticated POST with a phone number can confirm or cancel that tenant's orders awaiting customer response,
   logged as `changed_by: "whatsapp_bot"`; confirming is the phase that reserves inventory. Fix it by provisioning the
   secret **before** inverting the guard, or the fix is an outage.

   Separately, **`webhooks/lightfunnels` accepts anonymous POSTs that create orders, by design** (NEW-54b) — a
   documented decision with a TODO, on the live order-intake path. Not a bug to fix; a decision to re-ratify, which is
   now Round 3 decision 6. **Correction,
   2026-10-02: `settings/auto-send` does not belong on this list.** Its PUT omits `tenant_id`, which has been part of
   `app_settings`' primary key and `NOT NULL` since 2026-04-07, so every call raises `23502` and returns 500 — it
   cannot mutate anything and has not for ~178 days. It still needs auth, but the live defect is the opposite of the
   one claimed: its tenant-blind **GET** silently reports `enabled: false` the moment a second tenant sets the flag
   (`.single()` → `PGRST116` → bare `catch`). See NEW-49, which is the same root cause across nine call sites and
   includes a login-per-call against Al-Waseet.
4. **`admin_activity_logs` has 0 rows** — no admin action has ever been recorded, while 4 active `support_staff` accounts
   can suspend merchants, extend trials and mint unbounded wallet credit. **Fix this first**: it costs minutes and it is
   what makes every other admin finding investigable. **Cause settled 2026-10-02 and it is a single bug:** three write
   sites insert a column named `admin_id`, which does not exist on the table, into a swallowed `console.error`. The six
   *correct* call sites all sit on `pause`/`unpause`/`convert-trial`, and those have never fired — all 28 tenants still
   hold `restrictions = '{}'` and none is in `trial`. `admin_users` = 6, so the console is in use; the actions people
   actually perform are exactly the three broken writers.
5. **Employees can pay themselves** — the payroll tables carry tenant-only RLS with no role predicate ("five" and
   "six" were both too narrow; **37 tables** hold only the four `tenant_isolation_*` policies and nothing else), payroll is
   computed and written from the browser, and the attendance input (`activity_logs`) is writable and deletable by the
   audited party.
6. **`OPS-01`** — `NEXT_PUBLIC_SENTRY_DSN` is stripped at build, so production error reporting is almost certainly dead.
   Everything else on this list is harder to detect because of it.

---

## What would change the verdict

**To GO for a small, controlled cohort (5–10 merchants):**

- Per-tenant courier credentials, or an explicit written decision that early merchants share your Al-Waseet account with
  manual reconciliation — and a plan to exit it. **NEW-49 raises the urgency:** the token cache has never persisted a
  row, so *every* courier operation performs a fresh login on that one shared account. At 150 × 25/day the likely
  outcome is Al-Waseet rate-limiting or blocking it mid-day.
- `orders.price` defined once, enforced by a DB `CHECK` and re-derivation inside `create_order_atomic`.
- The six live exposures above closed, **plus NEW-50's rate limit and `'incomplete'` write**, without which
  closing them is closing doors in an unlocked building.
- `order_id` unique per tenant, not globally.
- The `app_settings` read path tenant-scoped — otherwise **all outbound WhatsApp stops silently at merchant #2**.
- Admin audit logging actually writing.
- A second real tenant exercised end to end, because no isolation defect in this system has ever been tested by one.

**To GO for 150:** all of the above, plus a COD remittance ledger, a payment gateway, the 51 missing `tenant_id` indexes,
retention policies on four log tables, per-tenant aggregation instead of one global 10-minute matview refresh, and a load
test — which Phase 1 could not run.

---

## Three decisions that must precede code

The prior audit named two. There are three.

1. **SEC-30 — authorization has no single source of truth.** Three role vocabularies across three tables and 14 app
   permissions with no DB representation. SEC-03, SEC-08 and MONEY-07 cannot be fixed without choosing one.
2. **DATA-05 — 79% of production is demo data.** No dashboard number, benchmark or capacity measurement means anything
   until the seed tenants move out. Note the largest tenant by order count is currently a *seed* tenant.
3. **NEW-06 — what does `orders.price` mean?** Every money finding downstream depends on the answer, and it is a product
   decision (does the courier collect the fee, is the discount pre- or post-fee) before it is an engineering one.

---

## Stated plainly: what is genuinely strong

The fix campaign needs to know which patterns to copy, and this codebase has real ones.

- **Storefront checkout** re-derives every price, fee, discount and point balance server-side and returns structured
  `price_changed` issues. It is the only conforming money writer and it is better than most production e-commerce code.
- **No float money anywhere** across 159 tables, and the **wallet ledger reconciles exactly** — 0 mismatches across
  17,805 transactions, recomputed independently here.
- **`get_user_tenant_ids()`**, the linchpin of every RLS policy, is correct.
- **`chat-attachments` storage ACLs**, **`chat_search_messages`**, **`requireCronAuth`**, **`unfurl`'s SSRF defence**,
  **`computeDeliveryFee`**, **preview-token signing** and **`redactTenant`** are each correct, and several are exemplary.
- **RLS is enabled on all 159 tables**, and storefront cache keys are correctly tenant-scoped — the two places a
  multi-tenant leak was most likely, and both are closed.
- **i18n parity is machine-enforced** at 2,936 keys with zero drift.

The gap between that list and the register is the whole finding: this team knows how to do it right and does it once.

---

## What this verdict does not rest on

Stated so the confidence is calibrated:

- **No load test was run**, so every scale figure is arithmetic from a measured unit cost, not an observation.
- **`pnpm audit` was not re-run** — SEC-16 is carried forward as NEEDS-EVIDENCE.
- **No second tenant was created**, so the collision findings are derived from the schema, not demonstrated.
- **The app was never opened in a browser**, so contrast, hit targets, focus visibility and rendered Arabic quality are
  unjudged. That is the largest single hole in this audit.
- **Bundle size and Core Web Vitals remain unmeasured**, as they were in the prior audit.
