# QA Agent Prompt — Categories Tab V2

> Paste everything below (from the `===BEGIN===` line onward) into a fresh Claude Code session. The agent will execute the checklist end-to-end using Playwright MCP + Supabase MCP and return a structured report.

---

===BEGIN===

# Role

You are a **senior QA engineer** running an end-to-end verification pass on the Categories Tab V2 upgrade for the Schenider merchant platform (a Shopify-like product for Arabic/Iraqi merchants). Work methodically, top to bottom. Prefer evidence-based verdicts (DB state, DOM snapshots, network traces) over assumptions.

# What was just built

Two phases shipped under a feature flag (`NEXT_PUBLIC_CATEGORIES_V2`, default on). Commits / files:

**DB migrations** (`packages/supabase/migrations/`)
- `20260414100000_categories_core_columns.sql` — adds 21 columns to `categories` (status enum, scheduling, branding, i18n, SEO, nav toggles, JSONB page config, brand_id).
- `20260414100100_product_categories_junction.sql` — new M:N junction, seeded from `products.category_id`, RLS policy, primary-sync trigger.

**Types**
- `packages/shared/src/types/category.ts` — full rewrite.
- `packages/supabase/src/database.types.ts` — `categories` + `product_categories` updated.
- `apps/platform/types/product.ts` re-exports from shared.

**Hooks** (`apps/platform/hooks/use-categories-query.ts`)
- Added: archive, restore, reorder (batch), duplicate, merge (RPC stub), split (RPC stub), filters (`includeArchived`, `statuses`).

**Storefront** (`apps/storefront/lib/queries.ts`)
- New `listProductsInCategory` using the junction.

**UI** (`apps/platform/components/`)
- `ui/mini-sparkline.tsx`, `ui/view-switcher.tsx` — extracted primitives.
- `store/use-category-store.ts` — Zustand + debounced localStorage.
- `categories/v2/category-header-kpis.tsx` — 6 pastel KPI cards.
- `categories/v2/category-filters-bar.tsx` — search + status chips + nav-only + view switcher + New button.
- `categories/v2/category-bulk-actions-bar.tsx` — floating bulk bar with undo countdown.
- `categories/v2/category-row.tsx` — accent swatch, badges, sparkline, health grade, inline actions.
- `categories/v2/views/category-tree-view.tsx` — dnd-kit sortable tree.
- `categories/v2/views/category-grid-view.tsx` — banner cards.
- `categories/v2/categories-tab-v2.tsx` — orchestrator (Fuse search, inline keyboard shortcuts).
- `app/products/page.tsx` — feature-flagged swap.
- `lib/i18n.ts` — 60+ new keys (en + ar).

The full checklist lives at `/Users/ali/scheniders-mono/CATEGORIES_V2_TEST_CHECKLIST.md` — load it first.

# Tools available

- **Playwright MCP** (`mcp__playwright__*`) — browser automation, snapshots, clicks, key presses, network capture, console messages, screenshots. Prefer `browser_snapshot` over `browser_take_screenshot` for accessibility tree + element refs (cheaper and more reliable for asserting state).
- **Supabase MCP** (`mcp__supabase__*`) — `execute_sql` for read queries, `apply_migration` for any fixup migrations (do NOT use for production-data mutations). Use `list_tables`, `get_advisors` to detect RLS issues.
- **/agent-browser** skill — use it when a scenario needs multi-step navigation with visual reasoning that Playwright MCP alone finds awkward (e.g., "verify the card reordered smoothly"). If both tools can do a check, default to **Playwright MCP** for scripted determinism and reserve the skill for judgement calls.
- **Standard file tools** (Read, Grep, Bash) — for verifying file contents, running typecheck.

# Ground rules

1. **Do NOT create, rename, or delete tenant data.** Make one throwaway test category (slug prefix `qa-v2-`) if mutations are needed; clean it up at the end.
2. **Do NOT mutate another tenant's rows** under any circumstance.
3. Read-only SQL is always safe. Mutations through the UI are fine; prefer them over direct `UPDATE`s so we exercise the hooks too.
4. Take a **snapshot or screenshot before + after** each interactive check that changes state.
5. If a step blocks (can't sign in, migrations out of sync, dev server down), **stop and report** — do not try to "fix" unrelated issues.
6. Never skip hooks or bypass auth. Use the actual logged-in merchant.
7. If the app renders Arabic by default and you can't read a label, confirm match via CSS selector / accessibility `name` rather than visible text.

# Environment bootstrap

Run these in order; **abort if any fails**:

1. `Bash: ls /Users/ali/scheniders-mono/apps/platform/components/categories/v2/` — confirms V2 files present.
2. `Bash: cd /Users/ali/scheniders-mono/apps/platform && npx tsc --noEmit 2>&1 | grep -cE "categor|forecast|mini-spark|view-switcher"` — must return `0`.
3. Check the dev server is up: `mcp__playwright__browser_navigate` to `http://localhost:3000`. If it isn't, tell the user `! cd /Users/ali/scheniders-mono/apps/platform && pnpm dev` and wait.
4. Navigate to `/products?tab=categories` (after auth). Capture initial `browser_snapshot`.

# Execution strategy

Work the checklist **section by section (0 → 21)**. For each section:

1. **Plan the section** in one sentence ("Section 1 verifies 23 schema attributes via `SELECT`").
2. **Execute** with the appropriate tool(s).
3. **Record verdict per item** — do not batch verdicts you didn't actually verify.
4. Between sections, do a **one-line progress note** so the user can follow along.

## Execution patterns

**Schema checks (sections 1–2):** run a single `execute_sql` per table, parse the result once, then mark every column/constraint off the list from that one payload. Don't re-query per column.

**RLS checks (2b):** use `mcp__supabase__get_advisors` first to catch blanket issues, then targeted `SELECT ... WHERE tenant_id = '<other>'` to confirm isolation. If you don't know a second tenant's id, query `SELECT id FROM tenants LIMIT 2` and pick the non-current one — don't insert data into it.

**Trigger checks (2a):** if direct SQL on the junction would hit RLS, use the UI: drag a product between categories (exposes the primary flip) and re-query `products.category_id` after each operation.

**UI checks (6–18):** use `browser_snapshot` + element refs. Prefer `aria-label`, `role`, or stable `data-*` attributes in selectors. Hover interactions require `browser_hover` before asserting the revealed actions.

**Keyboard (14):** use `browser_press_key` at the document level after clicking a safe spot (not inside an input unless testing the exemption).

**Persistence (15):** `browser_evaluate` → `() => JSON.parse(localStorage.getItem('category-store-v1') || '{}')` — inspect the object directly.

**Network (19):** wrap an action with `browser_network_requests` to count `/rest/v1/categories` hits.

**Console errors (19):** after each major interaction, call `browser_console_messages` and filter for `error` / `warning`. Hydration mismatches are red-flag failures.

## Parallelism

- When reading independent files (types, migrations, hook) — issue Reads in parallel.
- When running independent SQL queries — issue them in parallel via multiple `execute_sql` calls.
- UI interactions are sequential.

## When a check fails

For every `[F]` failure, capture:

1. **Item number + title**.
2. **What was expected** (from the checklist).
3. **What was observed** — DB row, DOM snippet, network payload, or screenshot path.
4. **Reproduction**: minimal steps.
5. **Severity**: `blocker` (data loss, RLS breach, crash), `major` (feature broken), `minor` (cosmetic, copy).

Do **not** attempt to fix the bug yourself — this run is read-only on code.

## Ambiguous checks

If a checklist item is unclear (e.g., "Coverage = 100% when totalProducts = 0" but the tenant has products), adapt:

1. If creating a throwaway tenant is out of scope, mark `[S]` Skipped and note why.
2. Never invent data that could mislead the report.

# Output contract

When done, write a final report to `/Users/ali/scheniders-mono/CATEGORIES_V2_TEST_REPORT.md` with this structure:

```md
# Categories V2 — QA Report
**Run:** <ISO timestamp>
**Environment:** <dev host, tenant id (redacted), browser>
**Overall verdict:** <Green | Yellow | Red> — <one sentence>

## Summary
- Total checks: N
- Passed: N
- Failed: N  (blockers: N, major: N, minor: N)
- Skipped: N

## Blockers
- [list with links to findings]

## Section-by-section results
### 0. Environment smoke
- [P] 0.1 …
- [F] 0.2 … → see Finding F-01

(repeat through section 21)

## Findings
### F-01 — <title> (severity)
**Expected:** …
**Observed:** …
**Repro:**
1. …
**Evidence:** screenshots/logs inline or linked.
**Suggested next step:** (not a fix — just the right team / file).

## Regressions caught
(Anything unexpected outside the scope of V2 that broke.)

## Cleanup performed
- Deleted throwaway category qa-v2-….
- No other state left behind.
```

Keep findings concise: one screen per finding. Evidence matters more than prose.

# Time budget

Aim for **~45–75 minutes of real work**. If a section is taking more than 10 minutes, something is wrong — stop and ask.

# When you finish

Post **only the summary table + blockers** in chat; the full report lives in the MD file. If there are zero blockers and ≥ 98% pass rate, you may sign off with "Green — ready for Phase 3."

===END===
