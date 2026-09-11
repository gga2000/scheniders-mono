# Home Proof Ledge + Occasion Triptych Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page's generic trust row with a proof ledge built from real order data, and replace the two hardcoded category cards with an occasion triptych built from real categories and live product counts.

**Architecture:** Aggregates are computed in Postgres into a narrow, anon-readable `tenant_public_stats` table refreshed by `pg_cron` — the public storefront never touches `orders`. Category counts come from a new storefront query reusing the exact visibility filter the category page already applies. Both sections gain optional schema fields so existing configs render byte-identically.

**Tech Stack:** Next.js 16 / React 19 (RSC), Supabase Postgres + RLS + pg_cron, Zod v4, Tailwind v3 (storefront), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-home-proof-ledge-and-occasion-triptych-design.md`

---

## File Structure

**Create**
- `packages/supabase/migrations/20260911120000_tenant_public_stats.sql` — table, RLS, refresh function, cron job.
- `packages/sections/src/helpers/compact-count.ts` — the round-down rule. One file, one job, so no section reinvents it.

**Modify**
- `apps/storefront/lib/queries.ts` — add `listCategoryProductCounts`, `getTenantPublicStats`.
- `apps/storefront/app/s/[tenant]/page.tsx` — fetch both, pass into `renderCtx`.
- `apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx` — same, so the editor preview matches the store.
- `packages/sections/src/_types.ts` — two optional `SectionRenderContext` fields.
- `packages/sections/src/trust_badge_row.tsx` — optional per-item `metric`.
- `packages/sections/src/category_spotlight_pair.tsx` — optional `source` / `show_counts`, portrait cards, mobile scroll-snap.
- `packages/sections/src/_signature-sections.test.tsx` — guards.
- `packages/sections/src/helpers/compact-count.test.ts` — new test file.

---

## Task 1: `tenant_public_stats` — table, RLS, refresh, cron

**Files:**
- Create: `packages/supabase/migrations/20260911120000_tenant_public_stats.sql`

- [ ] **Step 1: Write the migration**

Create `packages/supabase/migrations/20260911120000_tenant_public_stats.sql`:

```sql
-- =====================================================================
-- tenant_public_stats — aggregates a public storefront may read
-- =====================================================================
-- The storefront renders for `anon`. `orders` is tenant-private and must
-- never be readable there, so the home page's proof ledge reads only
-- these pre-aggregated counts: no order rows, no phones, no addresses,
-- no revenue.
--
-- Refreshed on a schedule rather than counted per request — a public
-- page must not run an aggregate over the whole order book on every hit.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_public_stats (
  tenant_id           uuid PRIMARY KEY
                        REFERENCES public.tenants(id) ON DELETE CASCADE,
  completed_orders    integer NOT NULL DEFAULT 0,
  customers           integer NOT NULL DEFAULT 0,
  governorates_served integer NOT NULL DEFAULT 0,
  first_order_at      timestamptz,
  refreshed_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_public_stats ENABLE ROW LEVEL SECURITY;

-- Readable by anyone who can already see the storefront, using the SAME
-- predicate as `public_storefront_read` on tenants. No INSERT/UPDATE/
-- DELETE grant to anon: only the SECURITY DEFINER refresh writes here.
DROP POLICY IF EXISTS public_stats_read ON public.tenant_public_stats;
CREATE POLICY public_stats_read
  ON public.tenant_public_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = tenant_public_stats.tenant_id
        AND t.status IN ('trial', 'active')
    )
  );

REVOKE ALL ON public.tenant_public_stats FROM anon, authenticated;
GRANT SELECT ON public.tenant_public_stats TO anon, authenticated;

-- ---------------------------------------------------------------------
-- Refresh
-- ---------------------------------------------------------------------
-- NOTE: do NOT gate this on `current_user <> 'service_role'`. That
-- predicate is always true inside a SECURITY DEFINER function because
-- current_user is the owner (postgres). That exact bug has been fixed
-- four times in this codebase. There is no caller gate here at all --
-- the function is not granted to anon, and it only ever writes
-- aggregates.
CREATE OR REPLACE FUNCTION public.refresh_tenant_public_stats()
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  INSERT INTO public.tenant_public_stats AS s (
    tenant_id, completed_orders, customers,
    governorates_served, first_order_at, refreshed_at
  )
  SELECT
    o.tenant_id,
    count(*) FILTER (WHERE o.status = 'completed'),
    count(DISTINCT o.phone) FILTER (WHERE o.phone IS NOT NULL AND o.phone <> ''),
    -- Blank codes are not a governorate. Counting them returns 19 for a
    -- country that has 18, which would publish a false number.
    count(DISTINCT coalesce(o.validated_governorate_code, o.governorate_code))
      FILTER (
        WHERE coalesce(o.validated_governorate_code, o.governorate_code)
              IS NOT NULL
          AND coalesce(o.validated_governorate_code, o.governorate_code) <> ''
      ),
    min(o.created_at),
    now()
  FROM public.orders o
  GROUP BY o.tenant_id
  ON CONFLICT (tenant_id) DO UPDATE SET
    completed_orders    = EXCLUDED.completed_orders,
    customers           = EXCLUDED.customers,
    governorates_served = EXCLUDED.governorates_served,
    first_order_at      = EXCLUDED.first_order_at,
    refreshed_at        = EXCLUDED.refreshed_at;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_tenant_public_stats() FROM public, anon;

-- Supports the FILTERed aggregate above.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_stats
  ON public.orders (tenant_id, status);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-tenant-public-stats') THEN
    PERFORM cron.unschedule('refresh-tenant-public-stats');
  END IF;
  PERFORM cron.schedule(
    'refresh-tenant-public-stats',
    '*/30 * * * *',
    'SELECT public.refresh_tenant_public_stats()'
  );
END$$;

SELECT public.refresh_tenant_public_stats();

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool with name `tenant_public_stats` and the SQL above. Drafted migrations are applied without asking.

- [ ] **Step 3: Verify the numbers match the spec**

Run via MCP `execute_sql`:

```sql
SELECT completed_orders, customers, governorates_served, first_order_at::date
FROM public.tenant_public_stats
WHERE tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a';
```

Expected exactly: `completed_orders = 2693`, `customers = 4465`,
`governorates_served = 18` (**not 19** — blanks excluded), `first_order_at = 2025-01-15`.

If `governorates_served` comes back 19, the blank-code filter is wrong. Stop and fix before continuing.

- [ ] **Step 4: Verify anon can read stats and still cannot read orders**

```sql
SET LOCAL ROLE anon;
SELECT count(*) FROM public.tenant_public_stats;   -- expect >= 1
SELECT count(*) FROM public.orders;                 -- expect 0 rows or permission denied
RESET ROLE;
```

Expected: stats readable; `orders` returns no rows (RLS) or errors. If anon can read a single order row, stop — the storefront must never expose the order book.

- [ ] **Step 5: Regenerate types**

Run: `pnpm generate-types`
Expected: `packages/supabase/src/database.types.ts` gains `tenant_public_stats`.

- [ ] **Step 6: Commit**

```bash
git add packages/supabase/migrations/20260911120000_tenant_public_stats.sql packages/supabase/src/database.types.ts
git commit -m "feat(db): expose tenant order aggregates to the public storefront

The proof ledge needs completed-order, customer and governorate counts on
a page that renders for anon. orders is tenant-private and must stay that
way, so only these aggregates are exposed: no order rows, no phones, no
addresses, no revenue. RLS reuses the same trial/active predicate as
public_storefront_read.

Blank governorate codes are excluded. Counting them returns 19 for a
country with 18 governorates, which would publish a false number.

Refreshed every 30 minutes by pg_cron, not counted per request."
```

---

## Task 2: The round-down rule

**Files:**
- Create: `packages/sections/src/helpers/compact-count.ts`
- Test: `packages/sections/src/helpers/compact-count.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sections/src/helpers/compact-count.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roundDownCompact, formatCompactCount } from "./compact-count";

describe("roundDownCompact", () => {
  it("rounds DOWN to two significant figures at or above 100", () => {
    expect(roundDownCompact(2693)).toBe(2600);
    expect(roundDownCompact(4465)).toBe(4400);
    expect(roundDownCompact(150)).toBe(150);
    expect(roundDownCompact(159)).toBe(150);
  });

  it("never rounds up — a displayed count may only understate", () => {
    for (const n of [101, 199, 999, 1001, 9999, 12345]) {
      expect(roundDownCompact(n)).toBeLessThanOrEqual(n);
    }
  });

  it("returns small counts exactly", () => {
    expect(roundDownCompact(18)).toBe(18);
    expect(roundDownCompact(99)).toBe(99);
  });

  it("treats absent or non-positive counts as nothing to show", () => {
    expect(roundDownCompact(0)).toBe(0);
    expect(roundDownCompact(-5)).toBe(0);
    expect(roundDownCompact(Number.NaN)).toBe(0);
  });
});

describe("formatCompactCount", () => {
  it("prefixes + only when the figure was rounded down", () => {
    expect(formatCompactCount(2693)).toBe("+2600");
    expect(formatCompactCount(18)).toBe("18");
    // Already on the step: nothing was dropped, so nothing is implied.
    expect(formatCompactCount(2600)).toBe("2600");
  });

  it("returns null when there is nothing true to show", () => {
    expect(formatCompactCount(0)).toBeNull();
    expect(formatCompactCount(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/helpers/compact-count.test.ts`
Expected: FAIL — `Failed to resolve import "./compact-count"`.

- [ ] **Step 3: Write the implementation**

Create `packages/sections/src/helpers/compact-count.ts`:

```ts
// =====================================================================
// compact-count — the one place that decides how a proof number reads
// =====================================================================
// Public counts round DOWN, never up. A figure refreshed on a schedule
// is always a little stale, and a number that can only understate stays
// true between refreshes and as it grows. Rounding up would publish a
// claim the data does not support.
// =====================================================================

/**
 * Round down to two significant figures at or above 100; below that the
 * exact value (an exact 18 is a stronger claim than a vague "+10").
 * Non-finite or non-positive input means "no count", i.e. 0.
 */
export function roundDownCompact(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 100) return Math.floor(value);
  const digits = Math.floor(Math.log10(value)) + 1;
  const step = 10 ** (digits - 2);
  return Math.floor(value / step) * step;
}

/**
 * Display form. The `+` appears ONLY when rounding actually dropped
 * something — on an exact figure it would make a complete fact look
 * like a partial one. Returns null when there is nothing true to show,
 * so callers drop the slot rather than render a bare unit.
 */
export function formatCompactCount(value?: number | null): string | null {
  if (value == null) return null;
  const rounded = roundDownCompact(value);
  if (rounded <= 0) return null;
  const prefix = rounded < value ? "+" : "";
  return `${prefix}${rounded}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/helpers/compact-count.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/sections/src/helpers/compact-count.ts packages/sections/src/helpers/compact-count.test.ts
git commit -m "feat(sections): round public proof counts down, never up

A figure refreshed on a schedule is always slightly stale. Rounding down
means a displayed count can only understate, so it stays true between
refreshes and as it grows. The + prefix appears only when rounding
actually dropped something -- on an exact figure it would make a
complete fact look partial."
```

---

## Task 3: Category product counts

**Files:**
- Modify: `apps/storefront/lib/queries.ts`

- [ ] **Step 1: Add the query**

In `apps/storefront/lib/queries.ts`, directly after `listCategories`, add:

```ts
/**
 * Live product count per category id.
 *
 * Uses the SAME visibility filter as `listProductsInCategory`. If these
 * two ever diverge, a card advertises "19 عطر" and opens a page listing
 * a different number — so the filter lives in both places or neither.
 */
export const listCategoryProductCounts = cache(
  (tenantId: string): Promise<Record<string, number>> =>
    publicCache(["listCategoryProductCounts", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("category_id, products!inner(id, is_visible, is_archived, is_supply)")
        .eq("tenant_id", tenantId)
        .eq("products.is_visible", true)
        .eq("products.is_archived", false)
        .not("products.is_supply", "is", true);

      if (error) {
        console.error("[queries.listCategoryProductCounts]", error);
        return {};
      }

      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { category_id: string }[]) {
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
      }
      return counts;
    }),
);
```

- [ ] **Step 2: Add the stats query**

In the same file, after `listCategoryProductCounts`, add:

```ts
export interface TenantPublicStats {
  completed_orders: number;
  customers: number;
  governorates_served: number;
}

/**
 * Pre-aggregated public counts. Never reads `orders` — that table is
 * tenant-private and this runs for anon. Returns null when a tenant has
 * no stats row yet, and every consumer must drop its slot rather than
 * render a zero.
 */
export const getTenantPublicStats = cache(
  (tenantId: string): Promise<TenantPublicStats | null> =>
    publicCache(["getTenantPublicStats", tenantId], async (supabase) => {
      const { data, error } = await supabase
        .from("tenant_public_stats")
        .select("completed_orders, customers, governorates_served")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) {
        console.error("[queries.getTenantPublicStats]", error);
        return null;
      }
      return (data as TenantPublicStats) ?? null;
    }),
);
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @scheniders/storefront exec tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Verify the counts match the spec's table**

Confirm via MCP `execute_sql`:

```sql
SELECT c.slug,
       count(*) FILTER (
         WHERE p.is_visible AND NOT p.is_archived
           AND coalesce(p.is_supply,false) = false
       ) AS live
FROM categories c
LEFT JOIN product_categories pc ON pc.category_id = c.id AND pc.tenant_id = c.tenant_id
LEFT JOIN products p ON p.id = pc.product_id
WHERE c.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
  AND c.slug IN ('work','outings','occasions')
GROUP BY c.slug ORDER BY live DESC;
```

Expected: `outings = 19`, `work = 19`, `occasions = 17`.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront/lib/queries.ts
git commit -m "feat(storefront): category product counts and public tenant stats

Counts reuse the exact visibility filter listProductsInCategory applies,
so a card's count and the page it opens can never disagree."
```

---

## Task 4: Carry both onto the render context

**Files:**
- Modify: `packages/sections/src/_types.ts:20-32`
- Modify: `apps/storefront/app/s/[tenant]/page.tsx:69-72` and `:116`
- Modify: `apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx`

- [ ] **Step 1: Extend the context type**

In `packages/sections/src/_types.ts`, inside `SectionRenderContext`, after the `category?` field, add:

```ts
  /**
   * Live product count per category id. Optional: every existing section
   * and every test builds this context, so a required field would break
   * all of them at once.
   */
  category_product_counts?: Record<string, number>;
  /**
   * Pre-aggregated public proof counts. Optional for the same reason,
   * and absent whenever the tenant has no stats row yet.
   */
  public_stats?: {
    completed_orders: number;
    customers: number;
    governorates_served: number;
  };
```

- [ ] **Step 2: Fetch both on the home route**

In `apps/storefront/app/s/[tenant]/page.tsx`, change the existing `Promise.all` to:

```tsx
  const [products, categories, categoryCounts, publicStats] = await Promise.all([
    listProducts(tenant.id, { limit: 24 }),
    listCategories(tenant.id),
    listCategoryProductCounts(tenant.id),
    getTenantPublicStats(tenant.id),
  ]);
```

Add to the existing import from `@/lib/queries`: `listCategoryProductCounts`, `getTenantPublicStats`.

Then change the `V2Page` render context to:

```tsx
        <V2Page
          v2={v2}
          page={homePage}
          runtime={runtime}
          renderCtx={{
            tenant,
            products,
            categories,
            category_product_counts: categoryCounts,
            public_stats: publicStats ?? undefined,
          }}
        />
```

- [ ] **Step 3: Do the same on the preview route**

The editor preview must match the store — a merchant seeing different numbers in the editor than shoppers see will trust neither.

In `apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx`:

Add to the `@/lib/queries` import block at line ~55:

```ts
  listCategoryProductCounts,
  getTenantPublicStats,
```

Immediately after line ~349 (`const categories: Category[] = await listCategories(tenant.id);`) add:

```ts
  const [categoryCounts, publicStats] = await Promise.all([
    listCategoryProductCounts(tenant.id),
    getTenantPublicStats(tenant.id),
  ]);
```

Then in the `SchneidersPreviewLiveRenderer` `renderCtx` (line ~482), add the two fields after `category`:

```tsx
            category,
            category_product_counts: categoryCounts,
            public_stats: publicStats ?? undefined,
```

Note the comment already on that object: it is serialised into the page because the live renderer is a client component. Both additions are small scalar maps, which is fine — do not add anything larger here.

- [ ] **Step 4: Verify**

Run: `pnpm type-check`
Expected: `Tasks: 3 successful, 3 total`.

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/`
Expected: all pass — the new fields are optional, so no existing test context breaks.

- [ ] **Step 5: Commit**

```bash
git add packages/sections/src/_types.ts "apps/storefront/app/s/[tenant]/page.tsx" "apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx"
git commit -m "feat(sections): carry category counts and public stats on the render context

Both optional: every section and every test constructs this context, so a
required field would break all of them at once."
```

---

## Task 5: Proof ledge — `trust_badge_row` metric slots

**Files:**
- Modify: `packages/sections/src/trust_badge_row.tsx`
- Test: `packages/sections/src/_signature-sections.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `packages/sections/src/_signature-sections.test.tsx` (add `import trust_badge_row from "./trust_badge_row";` at the top if not already present):

```tsx
describe("trust_badge_row — proof ledge", () => {
  const ledgeProps = {
    band_style: "tinted" as const,
    items: [
      { icon_url: "", metric: "completed_orders" as const, label_i18n: { ar: "طلب وصل" } },
      { icon_url: "", label_i18n: { ar: "توصيل خلال ٢٤ ساعة" } },
      { icon_url: "", metric: "governorates" as const, label_i18n: { ar: "محافظة" } },
      { icon_url: "", label_i18n: { ar: "الدفع عند الاستلام" } },
    ],
  };
  const stats = { completed_orders: 2693, customers: 4465, governorates_served: 18 };

  it("renders the rounded-down count and the exact small one", () => {
    const html = render(trust_badge_row, ledgeProps, { public_stats: stats });
    expect(html).toContain("+2600");
    expect(html).toContain("18");
    expect(html).not.toContain("2693");
  });

  it("drops a metric slot when there are no stats at all", () => {
    const html = render(trust_badge_row, ledgeProps);
    expect(html).not.toContain("+2600");
    // Static slots survive — they are merchant claims, not derived.
    expect(html).toContain("توصيل خلال ٢٤ ساعة");
    expect(html).toContain("الدفع عند الاستلام");
  });

  it("drops a metric slot whose value is zero rather than printing 0", () => {
    const html = render(trust_badge_row, ledgeProps, {
      public_stats: { completed_orders: 0, customers: 0, governorates_served: 18 },
    });
    expect(html).not.toMatch(/>0</);
    expect(html).toContain("18");
  });

  it("leaves a plain badge row untouched when no item declares a metric", () => {
    const html = render(trust_badge_row, trust_badge_row.defaultProps, { public_stats: stats });
    expect(html).not.toContain("+2600");
    expect(html).toContain("توصيل سريع");
  });

  it("keeps `metric` out of defaultProps so old configs still parse", () => {
    for (const item of trust_badge_row.defaultProps.items) {
      expect(item).not.toHaveProperty("metric");
    }
    expect(trust_badge_row.schema.safeParse(trust_badge_row.defaultProps).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx -t "proof ledge"`
Expected: FAIL — `+2600` not found.

- [ ] **Step 3: Add the schema field**

In `packages/sections/src/trust_badge_row.tsx`, inside the item object in `schema`, after `label_i18n`, add:

```ts
        /**
         * Turns the slot into a live proof figure. The label becomes the
         * unit under the number. Unset renders exactly as before — a
         * static icon + label, which is what the cart, product and
         * contact pages still want.
         */
        metric: z
          .enum(["completed_orders", "customers", "governorates"])
          .optional(),
```

Leave `defaultProps` untouched.

- [ ] **Step 4: Render the figure**

Add the import at the top of the file:

```ts
import { formatCompactCount } from "./helpers/compact-count";
```

Inside `TrustBadgeRowRender`, before the `return`, add:

```ts
  const stats = ctx.public_stats;
  const metricValue = (metric?: Props["items"][number]["metric"]) => {
    if (!metric || !stats) return null;
    if (metric === "completed_orders") return formatCompactCount(stats.completed_orders);
    if (metric === "customers") return formatCompactCount(stats.customers);
    return formatCompactCount(stats.governorates_served);
  };
```

Inside `props.items.map`, replace the body so a metric slot renders number-over-label and a metric with no value drops entirely:

```tsx
          {props.items.map((item, i) => {
            const label = resolveI18n(item.label_i18n, locale);
            const figure = metricValue(item.metric);
            // A declared metric with no figure has nothing true to say.
            // Dropping the slot beats rendering a bare unit or a zero.
            if (item.metric && figure === null) return null;

            if (figure !== null) {
              return (
                <div
                  key={`${i}-${label}`}
                  className="flex flex-col items-start justify-center"
                >
                  <span
                    className="font-display font-black text-bk-h3 leading-none"
                    style={{
                      color: "var(--bk-ink, #1a1a1a)",
                      fontFamily: "var(--bk-font-display, inherit)",
                    }}
                  >
                    <bdi>{figure}</bdi>
                  </span>
                  <span
                    data-i18n-field={`items[${i}].label_i18n`}
                    className="mt-1 font-body text-sm"
                    style={{
                      color: "var(--bk-ink-soft, rgba(26,26,26,0.7))",
                      fontFamily: "var(--bk-font-body, inherit)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={`${i}-${label}`}
                className="flex items-center justify-start gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bk-accent, #ffd84a) 14%, transparent)",
                  }}
                >
                  {item.icon_url && (
                    /* eslint-disable-next-line @next/next/no-img-element -- merchant-supplied icon URLs (usually SVG) aren't next/image remote-pattern candidates */
                    <img src={item.icon_url} alt="" className="h-6 w-6 object-contain" />
                  )}
                </span>
                <span
                  data-i18n-field={`items[${i}].label_i18n`}
                  className="font-body text-sm font-semibold sm:text-base"
                  style={{
                    color: "var(--bk-ink, #1a1a1a)",
                    fontFamily: "var(--bk-font-body, inherit)",
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
```

The `<bdi>` around the figure is required: a Latin numeral inside Arabic on an LTR page gets reordered by the bidi algorithm without it. This is the same fix already applied to the hero offer chip.

- [ ] **Step 5: Add the `ledge` band style**

The spec calls for a single band the hero rests on, with hairline dividers, rather than four items floating in white. `tinted` is an accent wash and is not that. Add a third value — existing values keep their exact meaning.

In `schema`, replace the `band_style` line with:

```ts
  /**
   * "tinted" lays the band on the brand accent at 12% opacity.
   * "ledge" is the proof-strip treatment: a `--bk-surface-alt` band with
   * hairline dividers, so the row reads as one object the hero sits on
   * instead of four things adrift in white.
   */
  band_style: z.enum(["plain", "tinted", "ledge"]).optional(),
```

Replace `const tinted = props.band_style === "tinted";` with:

```ts
  const band = props.band_style ?? "plain";
```

Replace the `Section`'s `style` prop with:

```tsx
      style={
        band === "tinted"
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--bk-accent, #ffd84a) 12%, transparent)",
            }
          : band === "ledge"
            ? { backgroundColor: "var(--bk-surface-alt, #f8efdf)" }
            : undefined
      }
```

And on the inner grid, add dividers only in `ledge`, only from `sm` (they would cut the 2x2 mobile grid in the wrong places):

```tsx
        <div
          className={cn(
            "grid grid-cols-2 gap-x-4 gap-y-5 sm:flex sm:flex-wrap sm:items-center sm:justify-evenly sm:gap-6",
            band === "ledge" &&
              "sm:divide-x sm:[&>*]:px-6 sm:[&>*:first-child]:ps-0 sm:[&>*:last-child]:pe-0",
          )}
          style={
            band === "ledge"
              ? ({ "--tw-divide-opacity": "1", borderColor: "var(--bk-divider)" } as CSSProperties)
              : undefined
          }
        >
```

Add `import type { CSSProperties } from "react";` and `import { cn } from "./helpers/utils";` at the top if not already present.

Add a guard to the `proof ledge` describe block:

```tsx
  it("lays the ledge on surface-alt, not the accent wash", () => {
    const html = render(trust_badge_row, { ...ledgeProps, band_style: "ledge" as const }, { public_stats: stats });
    expect(html).toContain("var(--bk-surface-alt");
    expect(html).not.toContain("var(--bk-accent, #ffd84a) 12%");
    expect(html).toContain("sm:divide-x");
  });

  it("keeps plain and tinted meaning exactly what they meant before", () => {
    const plain = render(trust_badge_row, { ...trust_badge_row.defaultProps, band_style: "plain" as const });
    expect(plain).not.toContain("var(--bk-surface-alt");
    expect(plain).not.toContain("sm:divide-x");
    const tinted = render(trust_badge_row, { ...trust_badge_row.defaultProps, band_style: "tinted" as const });
    expect(tinted).toContain("var(--bk-accent, #ffd84a) 12%");
  });
```

- [ ] **Step 6: Run the tests**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx`
Expected: PASS, all tests including the 7 new ones.

- [ ] **Step 7: Prove the guards bite**

Temporarily change `if (item.metric && figure === null) return null;` to `if (false) return null;` and re-run.
Expected: the "drops a metric slot" tests FAIL. Restore the line and re-run to green.

- [ ] **Step 8: Commit**

```bash
git add packages/sections/src/trust_badge_row.tsx packages/sections/src/_signature-sections.test.tsx
git commit -m "feat(sections): trust_badge_row slots can carry live proof figures

A slot with a metric renders the figure large with its unit beneath.
A declared metric with no value drops the slot entirely rather than
printing a bare unit or a zero -- the row must never claim something the
data does not support.

metric is optional and absent from defaultProps, so the plain badge row
the cart, product and contact pages use is byte-identical."
```

---

## Task 6: Occasion triptych — `category_spotlight_pair`

**Files:**
- Modify: `packages/sections/src/category_spotlight_pair.tsx`
- Test: `packages/sections/src/_signature-sections.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `packages/sections/src/_signature-sections.test.tsx`:

```tsx
describe("category_spotlight_pair — occasion triptych", () => {
  const cats = [
    { id: "c1", tenant_id: "t", name: "عطور للدوام", slug: "work", description: null, image_url: "https://images.unsplash.com/w", parent_id: null, display_order: 10 },
    { id: "c2", tenant_id: "t", name: "عطور للطلعات", slug: "outings", description: null, image_url: "https://images.unsplash.com/o", parent_id: null, display_order: 11 },
    { id: "c3", tenant_id: "t", name: "عطور للمناسبات", slug: "occasions", description: null, image_url: "https://images.unsplash.com/x", parent_id: null, display_order: 12 },
  ] as never;
  const counts = { c1: 19, c2: 19, c3: 17 };
  const srcProps = {
    ...category_spotlight_pair.defaultProps,
    source: "categories" as const,
    category_slugs: ["work", "outings", "occasions"],
    show_counts: true,
  };

  it("builds its doors from real categories, in the order given", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_counts: counts,
    });
    expect(html).toContain("عطور للدوام");
    expect(html).toContain("عطور للطلعات");
    expect(html).toContain("عطور للمناسبات");
    expect(html.indexOf("عطور للدوام")).toBeLessThan(html.indexOf("عطور للمناسبات"));
  });

  it("labels each door with its real depth", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_counts: counts,
    });
    expect(html).toContain("19");
    expect(html).toContain("17");
  });

  it("omits the count when the category is empty rather than showing 0", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_counts: { c1: 19, c2: 19, c3: 0 },
    });
    expect(html).not.toMatch(/>0</);
  });

  it("skips a slug that has no matching category", () => {
    const html = render(category_spotlight_pair, {
      ...srcProps,
      category_slugs: ["work", "does-not-exist"],
    }, { categories: cats, category_product_counts: counts });
    expect(html).toContain("عطور للدوام");
    expect(html).not.toContain("does-not-exist");
  });

  it("crops portrait, because perfume bottles are vertical", () => {
    const html = render(category_spotlight_pair, srcProps, {
      categories: cats,
      category_product_counts: counts,
    });
    expect(html).toContain("aspect-[3/4]");
    expect(html).not.toContain("aspect-[4/3]");
  });

  it("falls back to config items untouched when source is unset", () => {
    const html = render(category_spotlight_pair, {
      ...category_spotlight_pair.defaultProps,
      items: [{ image_url: "https://images.unsplash.com/a", label_i18n: { ar: "قديم" }, href: "/categories" }],
    });
    expect(html).toContain("قديم");
  });

  it("keeps the new fields out of defaultProps", () => {
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("source");
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("category_slugs");
    expect(category_spotlight_pair.defaultProps).not.toHaveProperty("show_counts");
    expect(
      category_spotlight_pair.schema.safeParse(category_spotlight_pair.defaultProps).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/_signature-sections.test.tsx -t "occasion triptych"`
Expected: FAIL — category names not found.

- [ ] **Step 3: Add the schema fields**

In `packages/sections/src/category_spotlight_pair.tsx`, add to `schema` after `items`:

```ts
  /**
   * "categories" builds the cards from the tenant's real categories
   * instead of hardcoded links, so a door can never point at a category
   * that has been renamed or emptied. Unset keeps today's behaviour.
   */
  source: z.enum(["config", "categories"]).optional(),
  /** Which categories, in display order. Only read when source is "categories". */
  category_slugs: z.array(z.string()).max(4).optional(),
  /** Show the live product count on each card. */
  show_counts: z.boolean().optional(),
```

Leave `defaultProps` untouched.

- [ ] **Step 4: Resolve the cards from categories**

Inside `CategorySpotlightPair`, replace `if (!props.items.length) return null;` with:

```ts
  // Resolved doors: either the merchant's hardcoded items, or real
  // categories looked up by slug. Slugs that match nothing are dropped —
  // a door to a category that no longer exists is worse than no door.
  const resolved =
    props.source === "categories"
      ? (props.category_slugs ?? [])
          .map((slug) => ctx.categories.find((c) => c.slug === slug))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
          .map((c) => ({
            key: c.id,
            label: c.name,
            href: `/categories/${c.slug}`,
            image_url: c.image_url ?? "",
            count: props.show_counts
              ? (ctx.category_product_counts?.[c.id] ?? 0)
              : 0,
          }))
      : props.items.map((item, i) => ({
          key: String(i),
          label: resolveI18n(item.label_i18n, locale),
          href: item.href,
          image_url: item.image_url,
          count: 0,
        }));

  if (!resolved.length) return null;
```

Change `const count = Math.min(props.items.length, 4);` to `const count = Math.min(resolved.length, 4);`.

Change the map to iterate `resolved` instead of `props.items`, using `item.key` for the React key, `item.label`, `item.href`, `item.image_url`.

- [ ] **Step 5: Switch the crop to portrait and add the count**

Change the card wrapper class from `"relative aspect-[4/3] overflow-hidden"` to:

```tsx
                  className="relative aspect-[3/4] overflow-hidden"
```

Inside the label pill, after the truncated label span and before `<ChevronGlyph …/>`, add:

```tsx
                      {item.count > 0 && (
                        <span
                          className="shrink-0 opacity-70"
                          style={{ fontFamily: "var(--bk-font-body, inherit)" }}
                        >
                          <bdi>{item.count}</bdi>
                        </span>
                      )}
```

A zero count renders nothing — an empty category should not advertise its emptiness.

- [ ] **Step 6: Add the mobile scroll-snap**

Change the grid wrapper to:

```tsx
        <div
          className={cn(
            // Mobile: one row that snaps, with the next card peeking so the
            // third door is discoverable without three screens of stack.
            "-mx-4 flex snap-x snap-mandatory gap-bk-sm overflow-x-auto px-4 pb-2",
            "[&>*]:w-[86%] [&>*]:shrink-0 [&>*]:snap-start",
            // From `sm` it is a plain grid again; nothing scrolls.
            "sm:mx-0 sm:grid sm:gap-bk-md sm:overflow-visible sm:px-0 sm:pb-0",
            "sm:[&>*]:w-auto sm:[&>*]:shrink",
            COLS_GRID[count] ?? COLS_GRID[2],
          )}
        >
```

- [ ] **Step 7: Run the tests**

Run: `cd packages/sections && ../../node_modules/.bin/vitest run src/`
Expected: PASS, all files.

- [ ] **Step 8: Prove a guard bites**

Temporarily change `aspect-[3/4]` back to `aspect-[4/3]` and re-run.
Expected: "crops portrait" FAILS. Restore and re-run to green.

- [ ] **Step 9: Commit**

```bash
git add packages/sections/src/category_spotlight_pair.tsx packages/sections/src/_signature-sections.test.tsx
git commit -m "feat(sections): build category cards from real categories, with live depth

source: 'categories' looks the doors up by slug instead of hardcoding
links, so a card can never point at a category that was renamed or
emptied; a slug matching nothing is dropped rather than rendered.

Cards crop portrait 3:4 -- perfume bottles are vertical, and the old 4:3
threw away 229px of a 677px-tall source. Each door carries its real
product count, omitted when zero.

Mobile is a snap row with the next card peeking, so a third door is
discoverable without three screens of stack. All new fields optional and
absent from defaultProps."
```

---

## Task 7: Point the tenant's draft config at the new shape

**Files:** none — this is a config write via Supabase MCP.

- [ ] **Step 1: Rewrite the two home sections in the draft**

Run via MCP `execute_sql`. Home page is index 0; `trust_badge_row` is section index 1, `category_spotlight_pair` is index 2. Verify those indices first:

```sql
SELECT ord - 1 AS idx, s->>'type'
FROM tenants t, jsonb_array_elements(t.store_config_v2_draft->'pages') p,
     jsonb_array_elements(p->'sections') WITH ORDINALITY AS e(s, ord)
WHERE t.slug = 'scheniders-iraq' AND p->>'page_id' = 'home'
ORDER BY ord;
```

Expected: idx 1 = `trust_badge_row`, idx 2 = `category_spotlight_pair`, idx 9 = `trust_badge_row` (the duplicate).

Then write both, and drop the duplicate row at the end:

```sql
UPDATE tenants t
SET store_config_v2_draft = jsonb_set(
  jsonb_set(
    t.store_config_v2_draft,
    '{pages,0,sections,1,base}',
    jsonb_build_object(
      'band_style', 'ledge',
      'items', jsonb_build_array(
        jsonb_build_object('icon_url','', 'metric','completed_orders',
          'label_i18n', jsonb_build_object('ar','طلب وصل','en','orders delivered','ku','داواکاری گەیشتوو')),
        jsonb_build_object('icon_url','',
          'label_i18n', jsonb_build_object('ar','توصيل خلال ٢٤ ساعة','en','Delivered within 24 hours','ku','گەیاندن لە ماوەی ٢٤ کاتژمێر')),
        jsonb_build_object('icon_url','', 'metric','governorates',
          'label_i18n', jsonb_build_object('ar','محافظة','en','governorates','ku','پارێزگا')),
        jsonb_build_object('icon_url','',
          'label_i18n', jsonb_build_object('ar','الدفع عند الاستلام','en','Cash on delivery','ku','پارەدان لەکاتی وەرگرتن'))
      )
    )
  ),
  '{pages,0,sections,2,base}',
  (t.store_config_v2_draft #> '{pages,0,sections,2,base}')
    || jsonb_build_object(
         'source','categories',
         'category_slugs', jsonb_build_array('work','outings','occasions'),
         'show_counts', true,
         'title_i18n', jsonb_build_object('ar','وين رايح؟','en','Where are you headed?','ku','بۆ کوێ دەچیت؟'),
         'eyebrow_i18n', jsonb_build_object('ar','اختر حسب المناسبة','en','Shop by occasion','ku','بەپێی بۆنە')
       )
)
WHERE t.slug = 'scheniders-iraq';
```

Then remove the duplicate trust row (index 9) from the home page:

```sql
UPDATE tenants t
SET store_config_v2_draft = jsonb_set(
  t.store_config_v2_draft, '{pages,0,sections}',
  (t.store_config_v2_draft #> '{pages,0,sections}') - 9
)
WHERE t.slug = 'scheniders-iraq'
  AND (t.store_config_v2_draft #>> '{pages,0,sections,9,type}') = 'trust_badge_row';
```

- [ ] **Step 2: Verify the draft**

```sql
SELECT jsonb_array_length(store_config_v2_draft #> '{pages,0,sections}') AS n,
       store_config_v2_draft #>> '{pages,0,sections,1,base,items,0,metric}' AS m0,
       store_config_v2_draft #>> '{pages,0,sections,2,base,source}' AS src
FROM tenants WHERE slug = 'scheniders-iraq';
```

Expected: `n = 9`, `m0 = completed_orders`, `src = categories`.

- [ ] **Step 3: Restore the two static slots' merchant icons**

The proof slots render a numeral and take no icon. The two static slots keep their existing artwork. Copy it across from the published config by label, rather than retyping URLs:

```sql
UPDATE tenants t
SET store_config_v2_draft = jsonb_set(
  jsonb_set(
    t.store_config_v2_draft,
    '{pages,0,sections,1,base,items,1,icon_url}',
    -- "توصيل سريع" icon, reused for the 24-hour delivery slot
    to_jsonb((t.store_config_v2 #>> '{pages,0,sections,1,base,items,0,icon_url}'))
  ),
  '{pages,0,sections,1,base,items,3,icon_url}',
  -- "الدفع عند الاستلام" icon
  to_jsonb((t.store_config_v2 #>> '{pages,0,sections,1,base,items,3,icon_url}'))
)
WHERE t.slug = 'scheniders-iraq';
```

Verify both landed and the proof slots stayed empty:

```sql
SELECT i.ord - 1 AS idx,
       i.item ->> 'metric'   AS metric,
       (i.item ->> 'icon_url') <> '' AS has_icon
FROM tenants t,
     jsonb_array_elements(t.store_config_v2_draft #> '{pages,0,sections,1,base,items}')
       WITH ORDINALITY AS i(item, ord)
WHERE t.slug = 'scheniders-iraq' ORDER BY i.ord;
```

Expected: idx 0 metric `completed_orders` / no icon; idx 1 no metric / **has icon**; idx 2 metric `governorates` / no icon; idx 3 no metric / **has icon**.

---

## Task 8: Verify in a browser and close out

- [ ] **Step 1: Full gate**

```bash
pnpm type-check      # expect: Tasks: 3 successful, 3 total
pnpm lint            # expect: 3 successful, 0 errors
./node_modules/.bin/vitest run   # expect: all files pass
```

Node 20 is at `/opt/homebrew/opt/node@20/bin`. Run vitest on Node 24 (`/opt/homebrew/bin`) — two `order-age-locale` tests fail on Node 20 from an ICU hour-cycle difference, unrelated to this work.

- [ ] **Step 2: Measure the render**

With the storefront dev server running, open
`/_preview/scheniders-iraq/home?token=dev-preview-token&locale=ar` and confirm at **390px** and **1512px**:

- Ledge shows `+2600` and `18`, never `2693` or `19`.
- Ledge and triptych share the same left/right edges as each other.
- Three occasion cards, portrait, each with its count.
- At 390px the second card peeks; the row snaps.
- No horizontal scroll on `body` at 390px.

- [ ] **Step 3: Re-verify RLS against the live schema**

Repeat Task 1 Step 4. Do this again at the end, not just after the migration — a later policy change elsewhere could have opened `orders`.

- [ ] **Step 4: Commit and push**

```bash
git add -A && git commit -m "docs(plan): mark home ledge + triptych complete"
git push
```

- [ ] **Step 5: Hand off the publish**

The config is draft-only. Tell the user, in this order:
1. Merge the PR and let the storefront deploy.
2. Publish the draft from the store builder — the publish RPC requires
   `auth.uid()` and an owner/admin membership row, so it cannot be called
   with the service role.

Publishing before the deploy renders `metric` and `source` values the live
code does not understand.

---

## Notes for the implementer

- **Never** derive the delivery figure from `completed_at`. Average
  `created_at` → `completed_at` is 22.1 days because staff close tickets late;
  real delivery is within 24 hours. The 24-hour claim is static merchant copy.
- The `<bdi>` wrappers are load-bearing, not decoration. The storefront is LTR
  in every locale; a Latin numeral inside Arabic gets reordered without one.
- Do not add `dir="rtl"` or `<html dir>` anywhere.
- Currency is IQD and there is no tax. Nothing here touches either.
