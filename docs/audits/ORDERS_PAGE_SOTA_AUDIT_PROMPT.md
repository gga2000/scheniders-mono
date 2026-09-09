# Orders Page — World-Class Launch-Readiness Audit — Master Prompt

> Paste everything from `===BEGIN===` onward into a **fresh Fable 5 session opened at the repo root** (`/Users/ali/scheniders-mono`).
> Expect 3–6 hours of real work. The agent runs a read-only audit first, then a gated fix campaign.

---

===BEGIN===

# 0. Role and mission

You are a **principal product engineer + design director + staff security reviewer**, all in one, running the final launch-readiness review of the **Orders page** of the Schenider platform — a multi-tenant, Shopify-class SaaS for Iraqi merchants.

The Orders page is the **single most-used screen in the entire product**. Merchants live in it 8 hours a day. It is the revenue surface: every order confirmed, shipped, cancelled, split, merged, or refunded flows through it. If it is slow, wrong, confusing, or leaky, the business dies.

Your mission: produce the **definitive, evidence-backed verdict** on whether this page is **FAANG-class, SaaS-ready, and commercially launchable**, then — only after the audit is delivered and approved — fix what you found.

Two things are equally disqualifying and you must hunt both with the same intensity:
1. **Defects** — bugs, races, leaks, perf cliffs, broken states, wrong money math.
2. **Mediocrity** — anything that reads as "internal admin tool" rather than a product a merchant would pay for and a competitor would fear. Ugly, cluttered, inconsistent, unpolished, or thoughtless counts as a finding, not a taste preference.

**"It works" is not the bar. "A Stripe/Linear/Shopify PM would ship this as-is" is the bar.**

# 0.5 ABSOLUTE STOP RULE — read this twice, it overrides everything below

**You may not change a single line of code, config, or database schema until the user sends this exact message:**

```
I'm Ali and I approve these changes
```

Rules around that gate — no exceptions, no interpretation:

1. **Read-only until approved.** The entire audit is read-only. No edits, no refactors, no "tiny obvious fix while I'm here", no formatting, no lint autofix, no deleting dead code, no renaming.
2. **This overrides auto-accept.** If the session is in auto-accept / auto-edit / YOLO mode, or a hook grants blanket permission, **you still stop.** Tool permission is not user approval. The only thing that unlocks execution is that exact sentence, typed by the user.
3. **This overrides the repo's auto-apply-migrations rule.** `CLAUDE.md` says drafted migrations are applied without confirmation. For this engagement that rule is **suspended**. No migration is applied, no `apply_migration`, no DDL, no `INSERT/UPDATE/DELETE` against any database until the sentence is given.
4. **Approval is scoped, not blanket.** The sentence approves **only the specific findings the user names, or the specific round you presented, in that message**. It is not a standing licence. Each subsequent round needs the sentence again.
5. **Understanding comes before approval.** The user must be able to say, for every single finding: what it is, why it is a problem, what it costs, what you would change, and what could break. If a finding is not explained to that depth, it is not ready to be approved — go explain it better.
6. **The user may deny any finding.** A denied finding is closed permanently, recorded in the report as `DENIED — not to be revisited`, and never reintroduced later under a different name.
7. **If you are unsure whether something counts as a change: it does. Stop and ask.**
8. **A restore point exists** — a verified backup was taken before this engagement (git ref `refs/backups/pre-orders-audit-*`, snapshot commit `c374f50c`, archives at `/Users/ali/scheniders-backups/`). Its existence is **not** a reason to move faster or be less careful. It is the last line of defence, not a permission slip.

Announce at the start of your run that you understand and accept this gate.

# 0.6 The design and layout are ALREADY APPROVED — do not redesign

The user is **happy with the visual design and layout** of the orders page. That is a settled decision, not an open question.

Therefore:

- **Do not propose a redesign, a restyle, a new layout, a component library swap, a "modernisation", or a visual refresh.** Not in the report, not as a suggestion, not as a "quick win".
- **Do not move, reorder, resize, recolour, or restyle anything** because you think it would look better.
- You **do** still report, under a clearly separated heading **`DESIGN OBSERVATIONS — FYI ONLY, NO ACTION PROPOSED`**:
  - anything visually **broken**: overflow, clipping, text collision, unreadable contrast, an element that disappears at some viewport, a control that cannot be hit;
  - anything visually **missing**: a state with no design at all (empty, error, loading, zero-results, permission-denied);
  - anything visually **inconsistent** with the rest of the page in a way that looks like an accident rather than a choice.
- Frame each of those as: *"here is what is broken/missing, here is the smallest possible fix that stays inside the existing design language"*. Never as *"here is how I would redesign it"*.
- **Pure taste opinions are banned from this report.** If your only argument is "it would look better", cut it.
- If you genuinely believe a layout change would unlock significant merchant value, you may write **one** short paragraph at the very end of the report labelled `OPTIONAL — DESIGN IDEA THE USER DID NOT ASK FOR`, and then drop it. Do not build it, do not repeat it, do not lobby for it.

# 1. Non-negotiable house rules (violating these is itself a P0 finding)

Read `/Users/ali/scheniders-mono/CLAUDE.md` in full before anything else. Additionally:

- **LTR only.** The app is LTR in every locale including Arabic. Set `<html lang>`, **never** `<html dir>`. If you find `dir="rtl"` anywhere in the orders surface, that is a finding.
- **Iraq market.** Currency is **IQD**. There is **no tax/VAT**. Any tax field, VAT line, ZATCA logic, or `.00` decimal money formatting on the orders surface is a finding. IQD is displayed as whole numbers with thousands separators.
- **No keyboard-shortcut or keyboard-a11y sweeps.** Per house rule, do **not** propose new keyboard shortcuts or run a keyboard-navigation/screen-reader audit unless explicitly asked mid-run. You **do** still audit: color contrast, hit-target size, color-only signalling, focus visibility on click targets, text legibility, and motion-sensitivity. State this scope boundary in the report so it is not mistaken for an oversight.
- **Root cause only.** No workarounds, swallowed `try/catch`, sleep/retry hacks, hardcoded values, or "temporary" patches. Banned unless justified in a comment: `any`, `@ts-ignore`, `eslint-disable`, non-null `!` used to silence the compiler, `// TODO fix later`. Finding one of these in the orders surface is itself a finding.
- **pnpm only** (Corepack-pinned). Never npm/yarn. Node 20 (`.nvmrc`).
- **Tenant scoping is absolute.** Every query tenant-scoped; never trust a client-supplied tenant id; service-role key server-only; `NEXT_PUBLIC_*` ships to the browser.
- **Verification gate.** `pnpm type-check` and `pnpm lint` are the CI gate. **CI does not run tests — you must.** Nothing is "done" until you have run the command and pasted the real output.

# 2. What "world-class" means for THIS page (the rubric you are grading against)

A launch-ready orders console must satisfy all seven pillars. Grade each 0–100 with justification; a pillar below 85 blocks launch.

| # | Pillar | Passing definition |
|---|--------|--------------------|
| P1 | **Correctness** | Order state machine cannot enter an illegal state. Money, counts, and totals are always right. No lost writes under concurrency. Deletes are recoverable. Audit trail is complete and truthful. |
| P2 | **Performance** | First meaningful paint of the order list under 1.5s warm / 3s cold on mid-tier Android over 4G. Interaction latency (INP) under 200ms for filter, search, sort, select, status change. No frame drops scrolling 3k+ rows. No fetch above ~500KB on the critical path. |
| P3 | **Visual integrity** | The approved design renders correctly everywhere: nothing overflows, clips, collides, or becomes unreadable at any viewport or theme; every state (empty, loading, error, zero-result, permission-denied) actually has a design; no dead styles, no accidental inconsistencies. *(The design and layout themselves are approved and out of scope — see §0.6.)* |
| P4 | **Workflow fit** | Matches how an Iraqi COD merchant actually works — confirm → fulfil → ship → deliver → collect → return. The 5 highest-frequency actions are reachable in ≤2 interactions. Bulk operations are first-class. Nothing forces a modal round-trip that a inline edit could do. |
| P5 | **Trust and safety** | Zero cross-tenant leakage across DB / realtime / cache / export. Role-appropriate visibility (an agent must not see supplier cost or margins). Destructive actions confirmed and reversible. PII handled deliberately. |
| P6 | **Resilience** | Every network call has a defined failure UX. Realtime disconnect recovers without data loss. Partial bulk failures are reported per-item, never silently. Integrations (shipping, WhatsApp) degrade gracefully. |
| P7 | **Commercial readiness** | Plan/quota gating enforced server-side, onboarding first-run state is welcoming not empty, exports are limited and watermarked appropriately, permissions per seat work, and the page is instrumented so the business can see usage and failures. |

# 3. Skills — use them, do not improvise

Before each phase, **scan the full available-skills list and invoke the fitting skill via the Skill tool.** This is mandatory, not advisory. Minimum required usage:

| Phase / task | Skill to invoke |
|---|---|
| Visual DEFECT detection only (never redesign — see §0.6) | `critique`, then `web-design-guidelines` — ignore their purely aesthetic recommendations |
| A missing state you were approved to build (empty/error/zero-result) | `frontend-design` or `impeccable`, plus `polish` — **matching the existing design language exactly**, never introducing a new one |
| React / Next.js correctness, RSC boundaries, data patterns | `next-best-practices`, `vercel-react-best-practices`, `vercel-composition-patterns` |
| SQL, indexes, RLS, query plans, migrations | `supabase-postgres-best-practices` |
| Any bug you find and intend to explain or fix | `systematic-debugging` (before proposing any fix) |
| Live clicking through the real app | `agent-browser` (preferred over built-in browser tools) |
| Conversion / friction / drop-off reasoning on merchant actions | `page-cro`, `form-cro` |
| Before writing the fix plan | `writing-plans` |
| Before executing the fix plan | `executing-plans`, and `test-driven-development` for anything with logic |
| Before claiming ANY item complete | `verification-before-completion` |
| Reviewing your own diff at the end | `requesting-code-review` then `/code-review high` |
| Navigating unfamiliar parts of the codebase | the graph RAG in `graphify-out/` (see §4) |

If you skip a mandated skill, say so explicitly in the report and why.

# 4. Tools and how to use them

- **Graph RAG first, grep second.** `graphify-out/GRAPH_REPORT.md` (79 community hubs) → `graphify-out/graph.json` (grep for node names / edges) → read the real file. The graph is a snapshot dated 2026-04-14 and drifts — **live code always wins**. Ignore `apps/platform/graphify-out/` (stale cache).
- **Supabase MCP** (`mcp__supabase__*`) — project is **NEW** `sduvpgqwhxragxtxztur`. Never touch OLD `ibfdugifekivquwprqjc`.
  - Run `get_advisors` early — every advisor warning touching an orders table is a finding.
  - `list_tables`, `list_migrations`, `execute_sql` for **read-only** investigation. Use `EXPLAIN ANALYZE` on the real order queries.
  - **Never** run `INSERT/UPDATE/DELETE/DROP/TRUNCATE/ALTER` against production data during the audit phase. If a mutation is unavoidable, stop and ask.
  - Verify RLS by impersonation: run the same query as `anon`, as a foreign tenant's `authenticated` role, and as the owning tenant. Prove isolation; do not assume it from reading policy SQL.
- **agent-browser skill / Playwright MCP** — drive the real app. Known gotcha from prior sessions: automated clicks miss below-the-fold targets; use JS `.click()` for those. Dev server: `pnpm dev:platform` (:3000). Test tenants: **#100048, #100050, #100051**.
- **Subagents — parallelize.** Dispatch independent Explore/general-purpose agents for the independent dimensions (security, perf, i18n, mobile, integrations, tests). Send them in one message so they run concurrently. Do not let a subagent's conclusion into the report unverified — you re-check every claim against the source before it becomes a finding.
- **Chrome DevTools / Lighthouse** via the browser skill for real LCP/INP/CLS and bundle numbers. Numbers you did not measure are not evidence.

# 5. The surface under audit

The Orders page is not one file. Audit **the whole surface**, all of it. Verify this map with `ls` / `find` — it may have drifted.

**Route + shell**
- `apps/platform/app/orders/page.tsx` — **3,129 lines**, `"use client"`, the god component. Prime suspect for everything.
- `apps/platform/app/orders/layout.tsx`, `error.tsx`
- `apps/platform/app/orders/trash/page.tsx` — soft-delete / restore surface

**Desktop components** — `apps/platform/components/orders/`
`order-details-modal.tsx` (1,642) · `create-order-modal.tsx` (1,311) · `virtualized-order-table.tsx` (1,152) · `duplicate-comparison-modal.tsx` (974) · `whatsapp-template-panel.tsx` (689) · `order-customer-card.tsx` (623) · `export-report-modal.tsx` (619) · `import-orders-modal.tsx` (555) · `sticky-filter-bar.tsx` (455) · `cancellation-reason-dialog.tsx` (440) · `reason-list-editor.tsx` (398) · `bulk-upload-modal.tsx` (350) · `product-picker.tsx` · `order-pipeline.tsx` · `split-order-dialog.tsx` · `ship-export-confirmation-dialog.tsx` · `order-timeline.tsx` · `order-confirmation-card.tsx` · `saved-views-tabs.tsx` · `order-items-editor.tsx` · `virtualized-order-list.tsx` · `message-templates-modal.tsx` · `floating-action-bar.tsx` · `assignment-popover.tsx` · `risk-badge.tsx` · `gemini-badge.tsx` · `discount-badge.tsx` · `discount-preset-selector.tsx` · `auto-send-toggle.tsx` · `blacklist-dialog.tsx` · `move-to-transit-dialog.tsx` · `order-notes.tsx` · `order-customer-risk-panel.tsx` · `audit-log-viewer.tsx` · `presence-avatar-group.tsx` · `workflow-tabs.tsx`
- `components/orders/table/` — `column-visibility` · `hover-preview` · `density-toggle` · `inline-edit-cell` · `selection-toolbar` · `context-menu`
- `components/orders/workflow/` — `confirm-tab` · `fulfill-tab` · `delivery-tab`
- `components/orders/duplicate-comparison/` — `likelihood-meter` · `order-timeline` · `column-header-controls`
- `components/dashboard/orders-table.tsx`, `components/dashboard/swipeable-order-card.tsx`, `components/providers/orders-provider.tsx`, `components/ui/orders-loader.tsx`

**Mobile (a separate component tree — audit divergence explicitly)** — `apps/platform/components/mobile/orders/`
`MobileOrdersPage` · `MobileOrdersList` · `MobileOrderCard` · `MobileFilterModal` · `MobileSearchModal`

**Data / state layer** — `apps/platform/hooks/`
`use-orders-query.ts` (TanStack, delta sync, realtime batcher registry) · `use-orders.ts` · `use-order-crud.ts` · `use-order-filters.ts` · `use-order-bulk-actions.ts` · `use-order-realtime.ts` · `use-order-details-state.ts` · `use-order-details-form.ts` · `use-order-auxiliary.ts` · `use-order-profits.ts` · `use-order-reasons.ts` · `use-order-activity-notifications.ts` · `use-order-push-pref.ts` · `use-order-pipeline-layout.ts` · `use-viewport.ts`
- `apps/platform/store/use-order-store.ts` (Zustand)
- `apps/platform/lib/repositories/order-repository.ts` (436) — **known bug precedent: it strips `sku`, causing wrong-item WhatsApp messages. Verify whether that is still live.**

**Libs** — `apps/platform/lib/`
`order-utils.ts` · `order-filter-utils.ts` · `order-format-utils.ts` · `order-normalize-utils.ts` · `order-export-utils.ts` · `order-pipeline.ts` · `order-reasons.ts` · `export-utils.ts` · `gemini-order-extractor.ts` · `data-quality-utils.ts` · `team-types.ts` (**`mockAssignments` is imported by `page.tsx` — mock data in a production path is a finding until proven otherwise**)

**Server** — `apps/platform/app/`
`actions/orders.ts` · `actions/deleted-orders.ts` · `actions/permissions.ts` · `api/orders/analyze-image/route.ts` · `api/orders/delete/route.ts` · `api/settings/order-pipeline/route.ts` · `api/cron/cleanup-deleted-orders/route.ts` · `api/waseet/submit-orders/route.ts` · `api/waseet/invoice-orders/route.ts`

**Tests (note the thinness — that is itself a finding)**
`apps/platform/e2e/orders.spec.ts` · `lib/order-reasons.test.ts` · `components/orders/duplicate-comparison/*.test.tsx`

**Prior art to read before you start (do not re-litigate settled decisions):**
`docs/audits/PRODUCTION_READINESS_AUDIT_PROMPT.md`, `PRODUCTION_READINESS_REPORT.md`, `QC_TEST_MATRIX.md`, and the store-builder audit series (for the report format and scoring style this team expects).

# 6. Execution plan

## Phase 0 — Recon and baseline (do not skip, do not fix anything yet)

1. Read `CLAUDE.md`, then the prior-art docs in §5.
2. `git log --oneline -30 -- apps/platform/app/orders apps/platform/components/orders` — understand recent churn and what was already fixed.
3. Read `app/orders/page.tsx` **in full**. All 3,129 lines. Build a written map: state variables, effects, memos, handlers, render branches, modal registry. You cannot audit what you have not read.
4. Boot the app (`pnpm dev:platform`), log in as a test tenant with real order volume, and **use the page like a merchant for at least 20 distinct actions.** Screenshot every state. This is mandatory — do not audit from source alone.
5. Capture the baseline numbers: bundle size for the route, cold/warm load time, payload size of the orders fetch, row count, LCP/INP/CLS, memory after 5 minutes of use, re-render counts on typing in the search box.
6. Write `Phase 0 — Baseline` into the report before proceeding.

## Phase 1 — The fourteen audit dimensions

Run these as parallel subagent investigations where independent, then verify every claim yourself. For each dimension, output findings in the §7 schema.

### D1. Order lifecycle correctness (P1)
- Enumerate every order status and every legal transition. Draw the actual state machine from the code, then compare it to the intended one. Find every path that can produce an illegal or orphaned state.
- Split order, merge/duplicate resolution, cancellation with reason, move-to-transit, return/refund, soft delete + restore + cron cleanup: for each, trace the full write path and prove it is atomic. Partial writes are P0.
- **Money math**: totals, discounts, delivery fees, partial delivery, returns, profit/margin. Recompute by hand against a real tenant's data via `execute_sql`. Any drift is P0. Confirm IQD integer handling — no float money.
- Audit log / timeline: does every mutation write a truthful entry with actor, timestamp, before/after? Silent mutations are P1.
- Check the payroll/completion bucketing precedent (`completed_at` vs `created_at`) — verify no other aggregate on this page repeats that class of bug.

### D2. Concurrency, realtime, and multi-user (P1/P6)
- Two agents open the same order and both save. What happens? Prove it. Last-write-wins on a whole row is a P0 data-loss bug; document the exact fields at risk.
- Realtime: subscription setup/teardown, the `RealtimeBatcher`, the module-level `_orderBatcher` singleton in `use-orders-query.ts`. Audit the delta-sync high-water-mark logic for missed rows (clock skew, equal timestamps, rows updated during the fetch window).
- Disconnect/reconnect, tab backgrounded for an hour, laptop sleep, flaky 3G: does the list converge to truth or silently diverge?
- Optimistic updates: is every one rolled back correctly on failure, and is the user told?
- Presence avatars: do they leak identity across tenants? Do they clean up on unmount?

### D3. Security, RLS, and multi-tenancy (P5)
- Prove tenant isolation empirically for every orders-related table, view, RPC, and realtime channel: query as `anon`, as a foreign tenant, as the owner. Include `orders`, order items, notes, audit log, assignments, saved views, reasons, pipeline layout, deleted orders.
- **Column-level exposure**: supplier `cost`, margins, profit, internal notes, customer PII, phone numbers. Which roles can read them via the page, via the API, via raw PostgREST, and via **export/CSV**? The precedent bug in this repo was exactly a `products.cost` anon leak — assume the same class exists here until disproven.
- RBAC: enumerate roles and prove per-role UI **and** server-side enforcement. Client-side hiding without a server check is P0.
- Every server action and API route in §5: authn, authz, tenant scope, Zod-validated input, rate limiting, IDOR on order id. Test an IDOR directly.
- Service-role usage: is it ever reachable from a client path? Any secret in `NEXT_PUBLIC_*`?
- `SECURITY DEFINER` functions: check for the `current_user <> 'service_role'` guard bug precedent (it is always true; must be `auth.role()`).
- Run `mcp__supabase__get_advisors` and triage every result touching this surface.

### D4. Performance (P2)
- The known sin: a ~5.5MB / 12k-row orders fetch gating first paint. Confirm current state on this route. Measure the actual payload. If the page still over-fetches, design server-side pagination/filtering and quantify the win.
- Is filtering, sorting, searching, and counting done client-side over the full set? Anything O(n) per keystroke over thousands of rows is a finding.
- Virtualization: verify `virtualized-order-table` and `virtualized-order-list` actually virtualize under real data — measure DOM node count at 3k rows. Check row height stability, scroll restoration, sticky header/column jank.
- Re-render audit: React DevTools Profiler on typing in search, toggling a filter, receiving a realtime event, selecting rows. Identify unstable deps, inline object/array props, context churn (`orders-provider`), missing memo boundaries. Quantify before/after for any fix you propose.
- Bundle: what does the route ship? Are the 20+ `dynamic()` imports actually splitting, or has something pulled a heavy module into the main chunk? Check for date/lodash/icon barrel bloat.
- DB: `EXPLAIN ANALYZE` the real queries. Missing indexes on `(tenant_id, status, created_at)` and phone/search paths. Check for N+1 in details modal, items, customer card, profits.
- Memory: leak check on repeated modal open/close and long sessions.
- Mobile: same measurements on a throttled mid-tier Android profile.

### D5. Visual integrity — DEFECTS ONLY (P3) — see §0.6 before writing a single word here
**The design and layout are approved and out of scope. This dimension hunts visual BREAKAGE, not visual taste.**
Invoke `critique` and `web-design-guidelines` only as defect-detection lenses — ignore every recommendation they make that is purely aesthetic.

In scope (report as findings):
- **Broken rendering**: overflow, clipping, text collision, wrapped/broken layout at any tested viewport, sticky header/column jank, z-index and stacking bugs, scroll containers that trap or double-scroll.
- **Unreadable or invisible**: contrast failures, text over image/glass with no legibility floor, elements that vanish in light or dark mode, disabled states indistinguishable from enabled ones.
- **Missing states** (this is the big one): first-run with zero orders ever, zero results after filtering, loading skeleton that does not match the final layout, partial load, error, offline, permission-denied, empty trash. Enumerate every state that has **no design at all** — that is a gap, not a preference.
- **Content stress**: very long Arabic names, mixed Arabic/Latin strings, huge numbers, a 100-item order, missing product image, null/undefined rendering as "null" or "NaN" or "Invalid Date".
- **Accidental inconsistency**: the same concept styled two different ways in two places (count the distinct status/badge treatments and list the duplicates), leftover one-off styles, orphaned controls that do nothing.
- **Silently dead styles**: repo trap — Lightning CSS strips bare `backdrop-filter` from the platform Tailwind v4 pipeline, so glass effects can be silently no-oping. Use the `backdrop-blur-*` utility instead. Find any dead rules.
- **Motion**: anything that animates where the user expects instant feedback; `prefers-reduced-motion` not respected.
- **Hit targets and click accuracy**: targets under 44px on touch, overlapping click zones, a row click that fires when the user meant to click a button inside it.
- Per house rule, keyboard-shortcut and keyboard-a11y sweeps are **out of scope**. Contrast, hit-target size, colour-only signalling, and legibility stay in scope. State this boundary in the report.

Out of scope (do not write these up): palette changes, spacing/rhythm preferences, typography scale opinions, "this should be a drawer instead of a modal" purely on aesthetics, component library swaps, any full-screen redesign.

Screenshot every state regardless — screenshots are evidence for the whole audit, not just this dimension.

### D6. Merchant workflow fit (P4) — invoke `page-cro`
- Write out the real COD merchant day: new orders arrive → call/WhatsApp to confirm → assign → print/export to shipping (Waseet) → track transit → mark delivered → collect cash → handle returns/no-response. Map every step onto the UI. Where does the UI fight the workflow?
- Count interactions for the top 10 actions. Anything above 2 for a daily action is a finding with a proposed fix.
- Bulk operations: which actions are bulk-capable and which should be? Is partial failure surfaced per row?
- Filters, saved views, workflow tabs, pipeline widget: are they discoverable, persistent, shareable, and per-user vs org-default correct?
- Search: does it handle Arabic names, Iraqi phone formats (+964 / 0 prefixes / normalized), order id, product name? Test each. `normalizePhoneForSearch` correctness matters commercially.
- Inline edit vs modal: which fields force a modal that should not?
- Undo: is there any? For which destructive actions? There should be.

### D7. Mobile and responsive (P2/P3/P4)
- The mobile tree is **separate code**. Enumerate every feature-parity gap between `MobileOrdersPage` and desktop. Each gap is a finding: intentional simplification or accidental regression?
- Test at 360, 390, 414, 768, 1024, 1280, 1920. Find every overflow, clipped control, unreachable action, and horizontal scroll.
- Touch targets ≥44px, swipe gestures (`swipeable-order-card`) discoverable and non-destructive-by-accident, sticky bars vs iOS safe area, keyboard-open viewport behavior on the search/filter modals.
- Dual maintenance risk: how much logic is duplicated between the trees, and where has it already drifted?

### D8. Localization and market fit (P5/P7)
- Every user-visible string: is it translated, and is the Arabic natural merchant Arabic (not machine-translated)? List every untranslated or awkward string with a proposed replacement.
- **LTR enforcement** — confirm no `dir="rtl"` anywhere on this surface.
- Numbers, dates, times, relative times, currency: consistent IQD formatting, correct locale digits policy, no `$`, no decimals, no tax.
- Governorate names and shipping zones: match `packages/shared` canonical list; confirm the select submits the correct code (a prior storefront bug submitted the wrong governorate code — verify the orders side).
- Mixed Arabic/Latin text rendering, name truncation, sorting of Arabic strings.

### D9. Integrations and side effects (P6/P7)
- **Waseet shipping** (`submit-orders`, `invoice-orders`): idempotency, retry, duplicate submission, partial batch failure, status reconciliation, what the merchant sees when it fails.
- **WhatsApp / Interakt**: template panel, auto-send toggle, message templates. Verify the `sku`-stripping precedent in `order-repository.ts` is dead. Check env dependence (`INTERAKT_API_KEY`, `NEXT_PUBLIC_SITE_URL`), whitespace-in-variable 400s, and self-fetch-to-protected-URL 401 patterns — all previously real incidents here.
- **Gemini image analysis** (`analyze-image`): input validation, size limits, cost control, rate limiting, prompt-injection surface from user-uploaded images, failure UX, PII sent to a third party.
- **Import/bulk upload/export**: malformed CSV, encoding (Arabic UTF-8/BOM), 10k-row file, injection into CSV formulas, column mapping errors, dedupe on import, what happens mid-failure. Export: does it leak cost/margin to roles that must not see it? Is it tenant-scoped and rate-limited?
- **QStash / cron** (`cleanup-deleted-orders`): authenticated? idempotent? what if it runs twice? what if it never runs?
- For every integration: what is the **user-visible failure state**? "Silent" is a P1 finding.

### D10. Resilience and error handling (P6)
- `app/orders/error.tsx` and every boundary: does a crash in a modal take the page down? Test by forcing throws.
- Every fetch/mutation: loading, error, retry, timeout, offline. Enumerate the ones with no error UX.
- Sentry: is this surface instrumented? Are errors tagged with tenant/user/order id? Are known-noisy errors filtered? Are silent `catch` blocks hiding real failures? Grep for them.
- Toast discipline: are failures actually surfaced, and is success feedback proportionate (not toast-spam)?

### D11. Code health and architecture (P1 enabler)
- `page.tsx` at 3,129 lines is the central architectural finding. Produce a **concrete decomposition plan**: proposed module boundaries, what moves to a server component, what becomes a hook, what becomes a feature folder, estimated line counts per file, and the migration order that keeps the page shippable at every step.
- Same for `order-details-modal.tsx` (1,642) and `create-order-modal.tsx` (1,311).
- Grep the whole surface for `any`, `@ts-ignore`, `eslint-disable`, non-null `!`, `TODO`, `FIXME`, commented-out code, dead exports, duplicated utility logic across `order-*-utils.ts`, and mock/placeholder data (`mockAssignments`) on live paths. List each with file:line.
- RSC boundaries: how much of this must really be `"use client"`? What could be server-rendered or streamed? Invoke `next-best-practices` and `vercel-composition-patterns`.
- State architecture: TanStack Query vs Zustand vs React context vs local state — is ownership coherent, or is the same truth stored in three places? Find every duplicated source of truth.
- Prop drilling depth, context re-render blast radius, effect chains that could be derived state.

### D12. Testing and verifiability (P1)
- Current coverage on this surface is essentially **one e2e spec and three unit files**. Quantify what that actually covers.
- Produce the **test plan this page needs to be launch-safe**: the exact unit tests for money math, state transitions, phone normalization, filters, export mapping; the exact Playwright journeys for confirm → ship → deliver, bulk actions, split, duplicate merge, trash/restore, import; and the RLS/isolation tests.
- Rank by risk-reduction-per-hour. In the fix phase, actually write the top ones (use `test-driven-development`).
- Run everything that exists now and paste real output: `pnpm exec vitest run <paths>`, `pnpm test:e2e`, `pnpm type-check`, `pnpm lint`.

### D13. Observability and business instrumentation (P7)
- Can the business answer, from data: how many orders confirmed per agent per day, time-to-confirm, failure rate of shipping submission, WhatsApp delivery rate, page error rate, p95 interaction latency? If not, specify the events and where to fire them (invoke `analytics-tracking`).
- Existing `perf-trace` / `diag` utilities: are they wired here, do they ship to production, and do they cost anything at runtime?

### D14. Commercial and launch readiness (P7)
- Plan/quota/trial gating on orders volume, exports, integrations, seats: enforced **server-side**? Bypassable from the client?
- First-run experience for a brand-new tenant with zero orders: is it an empty grey table, or a designed onboarding moment? Design the latter if missing.
- Per-seat permissions in practice: create an agent-role session and prove what they can see and do.
- Data export / portability and deletion: can a merchant get their orders out, and can data be deleted on request?
- Competitive benchmark: put this page next to **Shopify Orders, Salla, Zid, and Linnworks**. Produce a feature and craft comparison table, name the three things competitors do better, and the two things this page does better. Be specific and honest.

## Phase 2 — Synthesis and verdict

- Score each of P1–P7 out of 100 with the evidence behind the number. Compute an overall maturity score.
- Give a **binary launch verdict: GO or NO-GO**, with the exact list of findings that must close before GO.
- Rank every finding by (business impact × likelihood) ÷ effort.

## Phase 2.5 — Walkthrough and approval (MANDATORY GATE)

Before any code is touched, you must **walk the user through every single finding** until they fully understand it. Not a summary. Not the top ten. Every one.

For each finding, present in plain language a merchant-facing person can follow:

1. **What it is** — one or two sentences, no jargon.
2. **How to see it yourself** — the exact steps or the screenshot.
3. **Why it matters** — the concrete cost: money lost, order lost, merchant confused, data leaked, page slow. Real consequences, not abstractions.
4. **What I would change** — the specific files and the specific change, described in words first, code sketch second.
5. **What could break** — the risk of the fix, honestly stated. Including "this touches the same code path as X".
6. **How I would prove it worked** — the exact test or measurement.
7. **Recommendation** — fix now / fix later / leave it, and why.

Work through them in severity order, in batches the user can absorb. **Ask after each batch whether anything is unclear, and answer until it is clear.** Never bundle findings together to speed up approval. Never assume silence is approval.

Then present the proposed change set and **stop**. Wait for the exact sentence:

```
I'm Ali and I approve these changes
```

Anything else — "sounds good", "go ahead", "ok", "yes", "approved", a thumbs up, or continued conversation — **is not approval.** Keep waiting, keep explaining. Do not nudge, do not ask for approval repeatedly, do not rephrase the gate to make it easier to trigger.

## Phase 3 — Fix campaign (locked until the sentence is received)

Once the sentence is received, for the approved scope only:

1. Use `writing-plans` to produce `docs/superpowers/plans/<date>-orders-page-launch-fixes.md`, covering **only the approved findings** and nothing else.
2. Execute with `executing-plans` and `test-driven-development`. Work round by round.
3. **Each new round needs the sentence again.** Present the round, explain it, stop, wait.
4. Every fix addresses the **root cause**. If the correct fix is bigger than what was approved, stop and say so — do not silently expand scope, and do not patch over it.
5. **Scope discipline**: touch only the files needed for the approved findings. No opportunistic cleanups, no drive-by refactors, no reformatting, no "while I was in there".
6. After each round: `pnpm type-check`, `pnpm lint`, relevant `vitest`, relevant Playwright — paste real output. Then `verification-before-completion`. Then a live browser pass on the changed flows with before/after screenshots.
7. Self-review the diff with `/code-review high` and fix what it finds before declaring the round done.
8. Migrations: `packages/supabase/migrations/YYYYMMDDHHMMSS_description.sql`, RLS + tenant-scoped from creation, **each shipping with a documented down-migration**, and applied **only** with the approval sentence for that specific migration (§0.5 rule 3).
9. Commits only when asked. Never push, never open a PR, unless asked.

# 7. Finding schema (use exactly this — one block per finding)

```
### [ID] <one-line title>
- **Dimension:** D<n> · **Pillar:** P<n>
- **Severity:** P0 blocker | P1 launch-blocking | P2 should-fix | P3 polish | [U] Unverified
- **Location:** `path/to/file.tsx:120-145`
- **Evidence:** <the actual code excerpt, query output, measured number, or screenshot reference — not a paraphrase>
- **Repro:** <exact steps, or the exact command/query>
- **Impact:** <what a merchant or the business loses, concretely>
- **Root cause:** <the real reason, not the symptom>
- **Fix:** <specific proposed change; include the code sketch when non-obvious>
- **In plain language:** <2-4 sentences a non-engineer can follow: what breaks, what it costs, what you would change>
- **What could break if we fix it:** <honest risk, including which other flows share this code path>
- **How we prove the fix worked:** <the exact test, query, or measurement>
- **Effort:** S | M | L · **Risk of fix:** low | med | high
- **Recommendation:** fix now | fix later | leave it — <why>
- **Approval status:** PENDING  *(only the user changes this; `APPROVED` requires the §0.5 sentence, `DENIED` is permanent)*
```

Severity definitions:
- **P0** — data loss, money wrong, cross-tenant leak, security hole, page-breaking crash, or silent failure of a revenue action. Blocks launch absolutely.
- **P1** — merchant will hit it in normal use and be blocked, misled, or badly slowed. Blocks launch.
- **P2** — real quality gap; ship-with-known-issue is defensible only with an owner and a date.
- **P3** — polish that separates good from world-class. Batch these.
- **[U] Unverified** — you suspect it but could not evidence it. This is a finding, not a pass. Say exactly what you would need to confirm it.

# 8. Evidence standard (non-negotiable)

- Every claim carries an artifact: file:line, code excerpt, SQL output, a measured number, or a screenshot path.
- "Should work", "appears to", "likely" are banned in the report. Either you verified it or it is `[U]`.
- Numbers you did not measure yourself do not go in the report.
- A subagent's word is not evidence. Re-verify before it becomes a finding.
- If you find nothing in a dimension, say so and show what you checked — a clean dimension needs proof too.
- Do not inflate the finding count with trivia, and do not soften P0s to be agreeable. Both destroy the report's value.

# 9. Deliverables

1. `docs/audits/ORDERS_PAGE_SOTA_AUDIT_<YYYY-MM-DD>.md` — the full report:
   - Executive summary (≤1 page): verdict, overall score, the 5 things that matter most.
   - Pillar scorecard P1–P7 with justification.
   - Baseline metrics table (before).
   - All findings, grouped by dimension, sorted by severity.
   - `DESIGN OBSERVATIONS — FYI ONLY, NO ACTION PROPOSED` (defects and missing states only; see §0.6).
   - Competitive benchmark table.
   - Decomposition plan for `page.tsx` and the two large modals.
   - Test plan.
   - Explicit list of what you did **not** audit and why (including the keyboard-a11y scope boundary).
2. `docs/audits/ORDERS_PAGE_APPROVAL_LEDGER.md` — one row per finding: ID, title, severity, approval status (PENDING / APPROVED / DENIED), date, and the round it shipped in. This is the single source of truth for what you are and are not allowed to touch. Update it the moment the user approves or denies anything.
3. `docs/superpowers/plans/<YYYY-MM-DD>-orders-page-launch-fixes.md` — the ordered remediation plan. **Written only after approval, covering only approved findings.**
4. Screenshots of every audited state in a gitignored `tmp/` folder, referenced from the report.
5. A short terminal summary at the end of each phase — verdict, counts by severity, what is next.

# 10. Anti-patterns — do not do these

- Do not audit from source alone. Run the app, click everything, screenshot it.
- **Do not change anything before the §0.5 approval sentence.** Not one line. Not even something "obviously safe". Auto-accept mode does not change this.
- Do not treat "sounds good" / "ok" / "go ahead" / silence as approval. Only the exact sentence counts.
- Do not fix during the audit phase. Note it and move on; a half-fixed page corrupts the baseline.
- Do not propose a redesign or restyle. The design and layout are approved (§0.6).
- Do not pad the report with taste opinions to look thorough.
- Do not expand scope beyond the approved findings once execution starts.
- Do not recommend a rewrite. Recommend a **staged decomposition that ships at every step**.
- Do not touch the OLD Supabase project or the OLD codebase at `/Users/ali/Scheniders`.
- Do not create scratch files in committed directories. Use gitignored `tmp/` and clean up.
- Do not commit, push, or open a PR unless asked.
- Do not stop early because the list is long. Finish every dimension; if one is genuinely blocked, complete all the others and state exactly what you skipped and why.
- Do not declare anything done without pasted command output.

# 11. Start now

First, in your opening message, confirm in your own words that you understand:
- the **§0.5 stop rule** — zero changes until the exact sentence `I'm Ali and I approve these changes`, overriding auto-accept and the repo's auto-apply-migrations rule;
- the **§0.6 design rule** — the visual design and layout are approved and you will report visual **defects and missing states only**, never a redesign;
- that a **verified restore point** exists and is not a licence to move fast.

Then begin with Phase 0, step 1. Announce the phase, do the work, and report. Then proceed through the dimensions. Ask the user only when a decision would materially change the audit's direction; otherwise make the call, state the assumption, and keep going.

===END===
