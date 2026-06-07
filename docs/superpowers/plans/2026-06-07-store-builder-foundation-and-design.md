# Store Builder V2 — Foundation Integrity + Design-System Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seal the three foundation cracks in the V2 store builder (untracked publish RPC, lying `config_version`, open iframe origin), then elevate the storefront from "competent (7/10)" to "premium (9/10)" by introducing a real spacing/opacity/fluid-type token layer + a shared `<Section>` primitive, then sweeping all ~47 sections onto it.

**Architecture:** Three sequential phases, each independently shippable. Phase 1 is DB/infra (migrations + one client constant). Phase 2 introduces design-system primitives WITHOUT touching most sections (proven on one reference section). Phase 3 is a mechanical sweep applying the Phase-2 patterns across every section. Tenant-driven visual tokens stay in the per-tenant JS emitter (`buildBrandKitVars`); static design constants (spacing/opacity/fluid type) live in each app's `globals.css :root` and are exposed as Tailwind utilities — this is the key correctness decision (spacing is NOT per-tenant).

**Tech Stack:** Next.js 16 / React 19, Tailwind v4, TypeScript (strict), Zod v4, Supabase (Postgres + RLS), Vitest. Monorepo: pnpm + Turborepo. Sections in `packages/sections`, tokens in `packages/shared`, storefront in `apps/storefront`, builder in `apps/platform`.

**Branch:** Work on a dedicated branch off `main` (e.g. `feat/store-builder-design-foundation`) — the current `feat/mobile-leads` branch is unrelated.

**Verification gate (every phase):** `pnpm type-check` and `pnpm lint` must pass (CI gate). Tests are NOT in CI — run them locally with `pnpm exec vitest run <path>`.

---

## Key Files Map

| File | Responsibility | Phase |
|------|----------------|-------|
| `packages/supabase/migrations/<ts>_capture_publish_store_config_v2.sql` | Track the live publish RPC in migrations | 1 |
| `packages/supabase/migrations/<ts>_backfill_config_version.sql` | Make `config_version` truthful | 1 |
| `apps/platform/hooks/use-iframe-bridge.ts` | Lock postMessage origin | 1 |
| `packages/sections/src/RenderSection.tsx` | Telemetry on dropped sections | 1 |
| `packages/shared/src/brand-kit-vars.ts` | Per-tenant derived interaction-state colors | 2 |
| `packages/shared/src/brand-kit-vars.test.ts` | Token emitter tests | 2 |
| `apps/storefront/app/globals.css` | Static design tokens (`:root`) | 2 |
| `apps/platform/app/globals.css` (or equivalent) | Mirror static tokens for builder-side render | 2 |
| `apps/storefront/tailwind.config.ts` | Map tokens → utilities + safelist | 2 |
| `packages/sections/src/helpers/primitives.tsx` | New `<Section>` / `<SectionHeader>` primitives | 2 |
| `packages/sections/src/helpers/product-card.tsx` | Image priority + sold-out state + bk colors | 2 |
| `packages/sections/src/product_grid.tsx` | Reference adoption of `<Section>` + responsive grid | 2 |
| `packages/sections/src/_render-smoke.test.tsx` | Update candy→bk assertions | 2 |
| `packages/sections/src/*.tsx` (all ~47) | Sweep onto `<Section>` + responsive + bk colors | 3 |

---

# PHASE 1 — Foundation Integrity

Small, high-leverage, no design changes. Removes the "works today, breaks on rebuild" trap.

### Task 1.1: Capture the live `publish_store_config_v2` RPC into a migration

**Context:** The publish RPC exists in the live DB (verified via `pg_proc`) but in NO migration file — only its sibling `apply_store_config_v2_patch` is migrated. A rebuild-from-migrations has no publish path. This task captures the exact live body (idempotent `CREATE OR REPLACE`, so applying it to the live DB is a safe no-op).

**Files:**
- Create: `packages/supabase/migrations/20260607120000_capture_publish_store_config_v2.sql`

- [ ] **Step 1: Write the migration file with the exact live function body**

```sql
-- Capture publish_store_config_v2 into migrations.
-- This function already exists in the live NEW project (sduvpgqwhxragxtxztur)
-- but was never captured in a migration file. CREATE OR REPLACE makes applying
-- this a safe no-op against the live DB while making a rebuild-from-migrations
-- correct. Keep in lockstep with apply_store_config_v2_patch.
CREATE OR REPLACE FUNCTION public.publish_store_config_v2(p_tenant_id uuid, p_config jsonb)
  RETURNS public.store_config_versions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_author text;
  v_row    public.store_config_versions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Caller must be an active member of the tenant.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_uid AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Only accept a v2-shaped config.
  IF (p_config->>'schema_version')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid store_config_v2 (schema_version must be 2)';
  END IF;

  -- Serialize concurrent publishes for this tenant.
  PERFORM pg_advisory_xact_lock(hashtext('store_config_' || p_tenant_id::text));

  SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
    INTO v_author
    FROM auth.users WHERE id = v_uid;

  UPDATE public.tenants
     SET store_config_v2 = p_config,
         store_config_v2_draft = NULL,
         config_version = 2,
         updated_at = now()
   WHERE id = p_tenant_id;

  INSERT INTO public.store_config_versions (tenant_id, label, is_named, config, created_by, author_name)
  VALUES (p_tenant_id, NULL, false, p_config, v_uid, v_author)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_config_v2(uuid, jsonb) TO authenticated;
```

- [ ] **Step 2: Apply the migration to the live NEW project**

Use the Supabase MCP tool `apply_migration` with name `capture_publish_store_config_v2` and the SQL above. (Per project policy, drafted migrations are auto-applied.)

- [ ] **Step 3: Verify the function still exists and the grant is correct**

Run (via `mcp__supabase__execute_sql`):
```sql
SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='publish_store_config_v2';
```
Expected: one row, args `p_tenant_id uuid, p_config jsonb`, `security_definer = true`.

- [ ] **Step 4: Commit**

```bash
git add packages/supabase/migrations/20260607120000_capture_publish_store_config_v2.sql
git commit -m "fix(supabase): capture publish_store_config_v2 RPC into migrations (was live-only)"
```

---

### Task 1.2: Make `config_version` truthful (backfill to reality)

**Context:** The storefront routes V2 purely on `pickV2Page(store_config_v2,"home")` presence ([apps/storefront/app/s/[tenant]/page.tsx:61-64](../../apps/storefront/app/s/[tenant]/page.tsx)), never on `config_version`. Yet 12 of 13 tenants have a published `store_config_v2` while still flagged `config_version=1`. The column lies. Decision: keep presence-based routing (lowest risk, already correct), and **backfill `config_version` to match reality** so nothing trips on the stale value later. (We do NOT switch routing to gate on `config_version` — that would risk regressing the 12 live V2 tenants.)

**Files:**
- Create: `packages/supabase/migrations/20260607120100_backfill_config_version.sql`

- [ ] **Step 1: Capture the BEFORE state (for the commit message / sanity)**

Run (via `mcp__supabase__execute_sql`):
```sql
SELECT config_version, count(*),
       count(*) FILTER (WHERE store_config_v2 IS NOT NULL) AS with_v2
FROM public.tenants GROUP BY config_version ORDER BY config_version;
```
Record the result. Expect ~12 rows at `config_version=1` that have `store_config_v2 IS NOT NULL`.

- [ ] **Step 2: Write the backfill migration**

```sql
-- config_version was never maintained for tenants seeded directly (bypassing
-- publish_store_config_v2). The storefront gates V2 on store_config_v2 presence,
-- not on this column, so these tenants ALREADY render V2 — the flag just lied.
-- Backfill it to match reality so future code can trust it.
UPDATE public.tenants
   SET config_version = 2
 WHERE store_config_v2 IS NOT NULL
   AND config_version IS DISTINCT FROM 2;
```

- [ ] **Step 3: Apply via `apply_migration`** (name: `backfill_config_version`).

- [ ] **Step 4: Verify it is now truthful**

Run (via `mcp__supabase__execute_sql`):
```sql
SELECT count(*) AS lying_rows
FROM public.tenants
WHERE store_config_v2 IS NOT NULL AND config_version IS DISTINCT FROM 2;
```
Expected: `lying_rows = 0`.

- [ ] **Step 5: Commit**

```bash
git add packages/supabase/migrations/20260607120100_backfill_config_version.sql
git commit -m "fix(supabase): backfill config_version=2 for published-v2 tenants (column was stale)"
```

---

### Task 1.3: Lock the editor↔preview iframe `postMessage` origin

**Context:** `use-iframe-bridge.ts` accepts/sends `postMessage` with `"*"` and carries a `TODO(prod)`. Lock to the storefront origin, with a dev fallback so local dev still works.

**Files:**
- Modify: `apps/platform/hooks/use-iframe-bridge.ts`
- Reference: `apps/platform/app/store/edit/page.tsx` (where the preview URL/origin is already derived)

- [ ] **Step 1: Read the current origin handling**

Run: `grep -n '"\*"\|targetOrigin\|origin\|STOREFRONT' apps/platform/hooks/use-iframe-bridge.ts`
Confirm the exact lines posting with `"*"` and the inbound `event.origin` check (if any).

- [ ] **Step 2: Add a resolved-origin constant near the top of the hook module**

```ts
// Resolve the trusted storefront origin once. In prod this MUST be set;
// in dev we fall back to localhost so the local preview iframe still works.
const STOREFRONT_ORIGIN =
  process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ?? "http://localhost:3001";
```
(Confirm the dev storefront port from `apps/storefront/package.json` `dev` script and adjust `3001` if different.)

- [ ] **Step 3: Replace every outbound `postMessage(..., "*")` with the trusted origin**

For each `iframe.contentWindow?.postMessage(payload, "*")`, change `"*"` → `STOREFRONT_ORIGIN`.

- [ ] **Step 4: Guard inbound messages by origin**

In the `message` event handler, add as the first line of the handler body:
```ts
if (event.origin !== STOREFRONT_ORIGIN) return;
```

- [ ] **Step 5: Type-check + manual verify**

Run: `pnpm --filter @scheniders/platform type-check` → Expected: no errors.
Then run the builder (`pnpm dev:platform`), open `/store/edit`, confirm the preview iframe still loads and live edits still reflect (no console origin errors).

- [ ] **Step 6: Add the env var to the example env file**

Modify `apps/platform/.env.example` (or the repo's env template): add `NEXT_PUBLIC_STOREFRONT_ORIGIN=https://<your-storefront-domain>`.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/hooks/use-iframe-bridge.ts apps/platform/.env.example
git commit -m "fix(store-builder): lock iframe preview postMessage to STOREFRONT_ORIGIN"
```

---

### Task 1.4: Telemetry on silently-dropped sections

**Context:** `RenderSection` returns `null` (dev-only `console.warn`) for unknown types or schema-validation failures. In prod a renamed/removed type leaves a silent gap with no signal. Add Sentry capture (prod) without changing the graceful-degrade behavior.

**Files:**
- Modify: `packages/sections/src/RenderSection.tsx`

- [ ] **Step 1: Read the two drop sites**

Run: `grep -n 'return null\|console.warn\|safeParse\|getSection' packages/sections/src/RenderSection.tsx`
Confirm the unknown-type branch and the `safeParse` failure branch.

- [ ] **Step 2: Add a minimal, dependency-free telemetry hook**

At the top of the unknown-type branch (before `return null`), and the validation-failure branch, emit to Sentry IF present on `globalThis` (sections is a shared lib; avoid a hard `@sentry/*` import to keep it framework-neutral):

```ts
// Surface silent drops to Sentry when the host app has it on the global.
function reportSectionDrop(reason: string, type: string, detail?: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[sections] dropped "${type}": ${reason}`, detail);
    return;
  }
  const sentry = (globalThis as { Sentry?: { captureMessage?: (m: string, c?: unknown) => void } }).Sentry;
  sentry?.captureMessage?.(`section_dropped:${reason}`, { level: "warning", extra: { type, detail } });
}
```
Call `reportSectionDrop("unknown_type", instance.type)` in the unknown branch and `reportSectionDrop("schema_invalid", instance.type, parsed.error.format())` in the validation branch.

- [ ] **Step 3: Type-check + run the sections smoke test**

Run: `pnpm exec vitest run packages/sections/src/_render-smoke.test.tsx`
Expected: PASS (behavior unchanged — still returns null on bad input).

- [ ] **Step 4: Commit**

```bash
git add packages/sections/src/RenderSection.tsx
git commit -m "feat(sections): report silently-dropped sections to Sentry in prod"
```

**Phase 1 gate:** Run `pnpm type-check && pnpm lint`. Both pass. Phase 1 is independently shippable — open a PR titled "Store builder foundation integrity" if shipping incrementally.

---

# PHASE 2 — Design-System Layer

Introduce the token + primitive layer. Prove it on ONE reference section (`product_grid`). Most sections are untouched until Phase 3.

### Task 2.1: Add per-tenant derived interaction-state colors to the emitter

**Context:** `buildBrandKitVars` derives `--bk-primary-hover` etc. but has no active/disabled/focus states. These ARE tenant-derived (from `primary`/`ink`), so they belong in the emitter (unlike spacing — see 2.2).

**Files:**
- Modify: `packages/shared/src/brand-kit-vars.ts`
- Test: `packages/shared/src/brand-kit-vars.test.ts`

- [ ] **Step 1: Add a failing test for the new tokens**

Append to `packages/shared/src/brand-kit-vars.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildBrandKitVars, BK_VAR_NAMES } from "./brand-kit-vars";
import { EMPTY_BRAND_KIT } from "./types/store-config-v2-resolver";

describe("brand-kit interaction-state tokens", () => {
  it("emits primary-active, primary-disabled, and focus-ring", () => {
    const vars = buildBrandKitVars(EMPTY_BRAND_KIT) as Record<string, string>;
    expect(vars["--bk-primary-active"]).toBeDefined();
    expect(vars["--bk-primary-disabled"]).toBeDefined();
    expect(vars["--bk-focus-ring"]).toBeDefined();
    expect(BK_VAR_NAMES).toContain("--bk-primary-active");
    expect(BK_VAR_NAMES).toContain("--bk-focus-ring");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm exec vitest run packages/shared/src/brand-kit-vars.test.ts -t "interaction-state"`
Expected: FAIL (`--bk-primary-active` is undefined; `BK_VAR_NAMES` lacks it).

- [ ] **Step 3: Add the three names to `BK_VAR_NAMES`**

In `packages/shared/src/brand-kit-vars.ts`, in the `// Colors — derived (8)` block of `BK_VAR_NAMES`, add:
```ts
  "--bk-primary-active",
  "--bk-primary-disabled",
  "--bk-focus-ring",
```

- [ ] **Step 4: Compute + emit them**

In `buildBrandKitVars`, after the existing `const divider = rgba(ink, 0.1);` line add:
```ts
  const primaryActiveHex = toHex(mix(primary, ink, 0.18));
  const primaryDisabled = rgba(primary, 0.4);
  const focusRing = rgba(primary, 0.5);
```
Then in the returned `vars` object, in the `// Colors — derived` group, add:
```ts
    "--bk-primary-active": primaryActiveHex,
    "--bk-primary-disabled": primaryDisabled,
    "--bk-focus-ring": focusRing,
```

- [ ] **Step 5: Run the test — verify it passes**

Run: `pnpm exec vitest run packages/shared/src/brand-kit-vars.test.ts`
Expected: PASS (all, including pre-existing token-count assertions — update any hardcoded "33 entries"/"40 token" count assertion in the existing test to the new total if one exists).

- [ ] **Step 6: Expose as Tailwind utilities + safelist**

In `apps/storefront/tailwind.config.ts`, under `theme.extend.colors.bk`, add:
```ts
          "primary-active": "var(--bk-primary-active)",
          "primary-disabled": "var(--bk-primary-disabled)",
```
Update the `text-bk-*` and `bg-bk-*` safelist patterns to include `primary-active|primary-disabled`. Add a ring utility safelist entry: `{ pattern: /^ring-bk-focus$/ }` and map `ringColor.bk-focus = "var(--bk-focus-ring)"` under `theme.extend`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/brand-kit-vars.ts packages/shared/src/brand-kit-vars.test.ts apps/storefront/tailwind.config.ts
git commit -m "feat(brand-kit): emit primary-active/disabled + focus-ring tokens"
```

---

### Task 2.2: Add static design tokens (spacing, opacity, fluid type) to `:root` + Tailwind

**Context:** Spacing/opacity/fluid-type are NOT per-tenant — they are global design constants. They belong in each app's `globals.css :root` and Tailwind theme, NOT the per-tenant JS emitter. Sections (shared) consume them via Tailwind utilities; both storefront and platform scan `packages/sections/src/**` so utilities generate in both apps.

**Files:**
- Modify: `apps/storefront/app/globals.css`
- Modify: `apps/platform/app/globals.css` (mirror — confirm exact path with `find apps/platform -name globals.css`)
- Modify: `apps/storefront/tailwind.config.ts`

- [ ] **Step 1: Add the token block to storefront `:root`**

In `apps/storefront/app/globals.css`, inside the existing `:root { … }` (or add one in `@layer base`):
```css
  /* ---- Static design-system tokens (NOT per-tenant) ---- */
  /* Spacing scale (8px base) */
  --bk-space-2xs: 0.25rem;
  --bk-space-xs: 0.5rem;
  --bk-space-sm: 0.75rem;
  --bk-space-md: 1rem;
  --bk-space-lg: 1.5rem;
  --bk-space-xl: 2rem;
  --bk-space-2xl: 3rem;
  /* Vertical section rhythm — fluid, density-aware */
  --bk-section-y: clamp(2rem, 5vw, 4rem);
  --bk-section-y-dense: clamp(1rem, 3vw, 1.75rem);
  --bk-section-y-generous: clamp(3rem, 8vw, 6rem);
  /* Opacity scale */
  --bk-opacity-subtle: 0.08;
  --bk-opacity-soft: 0.3;
  --bk-opacity-medium: 0.6;
  --bk-opacity-strong: 0.85;
  /* Fluid type steps (display/headline/body) */
  --bk-text-hero: clamp(2.5rem, 7vw, 4.5rem);
  --bk-text-h1: clamp(2rem, 5vw, 3rem);
  --bk-text-h2: clamp(1.5rem, 3.5vw, 2.25rem);
  --bk-text-h3: clamp(1.125rem, 2.5vw, 1.5rem);
```

- [ ] **Step 2: Mirror the same block into the platform `:root`**

Apply the identical block to `apps/platform/app/globals.css` (path confirmed in Step 0). This ensures the builder's own previews resolve the tokens identically.

- [ ] **Step 3: Map tokens → Tailwind utilities (storefront config)**

In `apps/storefront/tailwind.config.ts`, under `theme.extend`, add:
```ts
      spacing: {
        "bk-2xs": "var(--bk-space-2xs)",
        "bk-xs": "var(--bk-space-xs)",
        "bk-sm": "var(--bk-space-sm)",
        "bk-md": "var(--bk-space-md)",
        "bk-lg": "var(--bk-space-lg)",
        "bk-xl": "var(--bk-space-xl)",
        "bk-2xl": "var(--bk-space-2xl)",
        "bk-section": "var(--bk-section-y)",
        "bk-section-dense": "var(--bk-section-y-dense)",
        "bk-section-generous": "var(--bk-section-y-generous)",
      },
      fontSize: {
        "bk-hero": ["var(--bk-text-hero)", { lineHeight: "1.0" }],
        "bk-h1": ["var(--bk-text-h1)", { lineHeight: "1.1" }],
        "bk-h2": ["var(--bk-text-h2)", { lineHeight: "1.15" }],
        "bk-h3": ["var(--bk-text-h3)", { lineHeight: "1.25" }],
      },
```
Add safelist patterns so dynamic usage survives purge:
```ts
    { pattern: /^(px|py|p|gap|space-y|mb|mt)-bk-(2xs|xs|sm|md|lg|xl|2xl|section|section-dense|section-generous)$/ },
    { pattern: /^text-bk-(hero|h1|h2|h3)$/ },
```

- [ ] **Step 4: Mirror the Tailwind additions in the platform config** (if `apps/platform/tailwind.config.ts` exists; confirm with `find apps/platform -name 'tailwind.config.*'`).

- [ ] **Step 5: Verify utilities generate**

Run: `pnpm --filter @scheniders/storefront build` (or `dev` + inspect). Add `className="py-bk-section text-bk-h2"` temporarily to `product_grid.tsx`, confirm computed style resolves the clamp (browser devtools), then revert the temp change.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront/app/globals.css apps/platform/app/globals.css apps/storefront/tailwind.config.ts
git commit -m "feat(design-system): add static spacing/opacity/fluid-type tokens + tailwind utilities"
```

---

### Task 2.3: Add `<Section>` and `<SectionHeader>` primitives

**Context:** Every section re-declares `<section className="px-4 py-8">` inline (confirmed in `product_grid.tsx:117`). A shared primitive unifies horizontal padding, vertical rhythm (with density), and max-width, so future global changes touch ONE file. It lives in `primitives.tsx` (the existing visual-language anchor).

**Files:**
- Modify: `packages/sections/src/helpers/primitives.tsx`
- Test: `packages/sections/src/helpers/primitives.test.tsx` (new)

- [ ] **Step 1: Write a failing test for `<Section>`**

Create `packages/sections/src/helpers/primitives.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Section } from "./primitives";

describe("Section primitive", () => {
  it("applies horizontal padding + default section rhythm", () => {
    const html = renderToStaticMarkup(<Section>hi</Section>);
    expect(html).toMatch(/px-4/);
    expect(html).toMatch(/py-bk-section/);
    expect(html).toContain("hi");
  });
  it("supports dense + generous density", () => {
    expect(renderToStaticMarkup(<Section density="dense">x</Section>)).toMatch(/py-bk-section-dense/);
    expect(renderToStaticMarkup(<Section density="generous">x</Section>)).toMatch(/py-bk-section-generous/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `pnpm exec vitest run packages/sections/src/helpers/primitives.test.tsx`
Expected: FAIL (`Section` is not exported).

- [ ] **Step 3: Implement the primitives**

Append to `packages/sections/src/helpers/primitives.tsx`:
```tsx
type SectionDensity = "default" | "dense" | "generous";

const SECTION_PY: Record<SectionDensity, string> = {
  default: "py-bk-section",
  dense: "py-bk-section-dense",
  generous: "py-bk-section-generous",
};

/**
 * Shared section shell. Owns horizontal padding, vertical rhythm (density),
 * and optional max-width centering so individual sections stop reinventing
 * `<section className="px-4 py-8">`. Forward `data-*` so the editor overlay
 * keeps working.
 */
export function Section({
  children,
  density = "default",
  bleed = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  density?: SectionDensity;
  /** When true, skip horizontal padding (full-bleed heroes/marquees). */
  bleed?: boolean;
}) {
  return (
    <section
      className={cn(!bleed && "px-4", SECTION_PY[density], className)}
      {...props}
    >
      {children}
    </section>
  );
}

/** Standard section heading row: scribble heading + optional subtitle, with rhythm. */
export function SectionHeader({
  title,
  subtitle,
  color = "butter",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  color?: ScribbleColor;
  className?: string;
}) {
  return (
    <div className={cn("mb-bk-lg", className)}>
      <ScribbleHeading color={color}>{title}</ScribbleHeading>
      {subtitle ? (
        <p
          className="mt-bk-xs font-body text-base"
          style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))" }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `pnpm exec vitest run packages/sections/src/helpers/primitives.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sections/src/helpers/primitives.tsx packages/sections/src/helpers/primitives.test.tsx
git commit -m "feat(sections): add shared Section + SectionHeader primitives"
```

---

### Task 2.4: Reference adoption — `product_grid` onto `<Section>`, responsive columns, image priority, sold-out + bk colors

**Context:** Prove the full pattern on the most visible home section. This becomes the template every Phase-3 section follows.

**Files:**
- Modify: `packages/sections/src/product_grid.tsx`
- Modify: `packages/sections/src/helpers/product-card.tsx`

- [ ] **Step 1: Update the product_grid render to use `<Section>` + responsive grid**

In `packages/sections/src/product_grid.tsx`, change the import line `import { ScribbleHeading } from "./helpers/primitives";` to:
```ts
import { Section, SectionHeader } from "./helpers/primitives";
```
Replace the `ProductGridRender` return body (lines ~116-142) with:
```tsx
  return (
    <Section>
      {heading && <SectionHeader title={heading} color={props.scribble_color ?? "butter"} />}
      <div
        data-layer="cards"
        data-layer-label="Product cards"
        className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4"
      >
        {items.map((product, i) => (
          <SchneidersProductCard
            key={product.id}
            product={product}
            index={i}
            priority={i < 4}
            whatsappPhone={
              (ctx.tenant as { contact_phone?: string | null } | undefined)
                ?.contact_phone ?? null
            }
            locale={ctx.runtime.locale}
          />
        ))}
      </div>
    </Section>
  );
```

- [ ] **Step 2: Add `priority` + sold-out dimming + bk text colors to the product card**

In `packages/sections/src/helpers/product-card.tsx`:
- Add `priority?: boolean;` to the `Props` interface and `priority = false,` to the destructured params.
- On the `<Image>`, add `priority={priority}` and widen `sizes` for the new desktop columns: `sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"`.
- Wrap the sold-out card image in dimming: on the image `<Image>` add `className={cn("object-cover mix-blend-multiply", !inStock && "opacity-60 grayscale")}` (import `cn` already present).
- Replace hardcoded `text-candy-ink` with `text-bk-ink`, and `text-candy-ink/40` → `text-bk-ink-faint`, `text-candy-ink/70` → `text-bk-ink-soft` (these map to tenant vars; `candy-ink` is a fixed hex and never rethemes).

- [ ] **Step 3: Update the smoke test for the new heading/markup if needed**

Run: `pnpm exec vitest run packages/sections/src/_render-smoke.test.tsx`
If the product_grid smoke assertion breaks (e.g. it asserted `mb-5`), update the assertion to the new structure. Expected after fix: PASS.

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter @scheniders/sections type-check && pnpm --filter @scheniders/sections lint`
Expected: no errors.

- [ ] **Step 5: Visual verify (mobile + desktop)**

Run `pnpm dev:storefront`, open a tenant store home at 390px and 1280px. Confirm: 2 cols on mobile, 4 on desktop; first 4 images load eager; sold-out cards are dimmed.

- [ ] **Step 6: Commit**

```bash
git add packages/sections/src/product_grid.tsx packages/sections/src/helpers/product-card.tsx packages/sections/src/_render-smoke.test.tsx
git commit -m "feat(sections): product_grid responsive cols + image priority + bk colors (reference adoption)"
```

**Phase 2 gate:** `pnpm type-check && pnpm lint` pass; `pnpm exec vitest run packages/sections packages/shared` passes. Shippable as "Design-system foundation + product grid".

---

# PHASE 3 — Section Polish Sweep

Apply the Phase-2 patterns across every remaining section. Each section is an independent task following the SAME checklist; full reference code is given for two representative sections, and the per-section checklist drives the rest. Do these in small commits (1-3 sections each) so review stays tractable.

### The per-section checklist (apply to every section file)

For each `packages/sections/src/<name>.tsx`:
1. **Adopt `<Section>`**: replace inline `<section className="px-4 py-8">` (or `py-4`/`py-6`) with `<Section>` / `<Section density="dense">` (utility strips like trust/marquee) / `<Section bleed>` (full-bleed heroes). Use `<SectionHeader>` where a heading exists.
2. **bk color migration**: replace `text-candy-ink`→`text-bk-ink`, `text-candy-ink/NN`→`text-bk-ink-soft`/`-faint`, `bg-candy-*` literals in section bodies → keep only when intentionally a fixed pastel; prefer `bg-bk-*`. (Primitives already bridge candy→bk — only fix section-LEVEL literals.)
3. **Responsive**: add `md:`/`lg:` where a grid/carousel currently stops at `sm:`. Carousels that fit on desktop → switch to a grid at `lg:` (no forced scroll).
4. **Fluid type**: section headings → `text-bk-h2`; hero titles → `text-bk-hero`; replace discrete `text-5xl sm:text-7xl` jumps.
5. **Images**: any raw `<img>` → `next/image` with `sizes`; first above-fold image gets `priority`.
6. **States**: replace bare `return null` empties with a minimal branded empty state where a customer could plausibly hit it (product/testimonial/category grids); add skeletons where data hydrates client-side.
7. **Spacing**: replace magic `gap-3/4`, `mb-5`, `p-6` with `gap-bk-*`, `mb-bk-*`, `p-bk-*`.
8. **Verify**: `pnpm exec vitest run packages/sections/src/_render-smoke.test.tsx` + type-check; update any class-name assertion that changed.

### Section work-list (group by page; check off as completed)

**Home / content (highest visibility — do first):**
- [ ] `hero_image.tsx` — see full reference below (Task 3.A)
- [ ] `testimonials_carousel.tsx` — see full reference below (Task 3.B)
- [ ] `trust_strip.tsx` — density="dense", scroll-fade gradient, `active:scale-95` on pills; update smoke assertion `/bg-candy-mint/`→`/bg-bk-success|bg-candy-mint/` (primitive emits both)
- [ ] `delivery_promise.tsx` — bk radius/border via primitive card; entrance animation on geo "You're here" sticker
- [ ] `category_grid.tsx` · `feature_grid.tsx` · `numbers_stat_strip.tsx` · `logo_strip.tsx` · `marquee_strip.tsx` (bleed) · `instagram_grid.tsx` · `image_gallery.tsx` · `video_block.tsx` · `accordion_richtext.tsx` · `faq_accordion.tsx`
- [ ] heroes: `hero_split.tsx` · `hero_marquee.tsx` (bleed) · `hero_video.tsx`
- [ ] story: `brand_story.tsx` · `about_block.tsx` · `founder_note.tsx` · `press_quotes.tsx`
- [ ] conversion: `newsletter_inline.tsx` (real validation + loading/success/error states) · `countdown_card.tsx` · `free_gift_strip.tsx` · `promo_banner.tsx` · `cta_banner.tsx` · `exit_intent_offer.tsx` · `sticky_cta_bar.tsx`

**Chrome:**
- [ ] `site_header.tsx` — unify underline with `--bk-border-thickness`; `focus-visible:ring-bk-focus` on links/buttons; responsive height
- [ ] `site_footer.tsx` — link hover underline; extract a shared `<BrandMark>` used by header+footer; `lg:order-last` on Policies column

**PDP:**
- [ ] `pdp_gallery.tsx` · `pdp_buy_box.tsx` · `pdp_info_block.tsx` · `pdp_info_tabs.tsx` · `pdp_variants.tsx` · `pdp_add_to_cart.tsx` (make sticky bar work on desktop too, not `sm:hidden`) · `pdp_related_products.tsx`

**Cart / checkout / order / search / policy:**
- [ ] `cart_line_items.tsx` · `cart_summary.tsx` · `checkout_form.tsx` · `checkout_order_summary.tsx` · `order_tracker.tsx` · `track_order_lookup.tsx` · `search_results_grid.tsx` · `policy_content.tsx`

---

### Task 3.A (reference): `hero_image` — `<Section bleed>`, fluid title, mobile title cap, load state

**Files:** Modify `packages/sections/src/hero_image.tsx`

- [ ] **Step 1: Read current render** — `Read packages/sections/src/hero_image.tsx` to get exact prop names + structure.
- [ ] **Step 2: Wrap in `<Section bleed>`** and change the title element to `className="text-bk-hero font-display font-black ... max-w-[14ch] sm:max-w-2xl"` (the `max-w-[14ch]` caps mobile wrapping). Replace `text-5xl sm:text-7xl` with `text-bk-hero`.
- [ ] **Step 3: CTA gap** → `gap-bk-xs sm:gap-bk-sm`.
- [ ] **Step 4: Image load state** — on the hero `<Image>`, add a brand-surface background on the wrapper (`style={{ backgroundColor: "var(--bk-surface, #fff7ed)" }}`) so there's no white flash before load; keep `priority`.
- [ ] **Step 5: Verify** — `pnpm exec vitest run packages/sections/src/_render-smoke.test.tsx` (assertions for "The new collection has arrived" / "Shop the drop" must still pass — keep the copy). Type-check.
- [ ] **Step 6: Commit** — `git commit -m "feat(sections): hero_image fluid title + bleed section + load state"`

### Task 3.B (reference): `testimonials_carousel` — desktop grid, position dots, next/image avatars

**Files:** Modify `packages/sections/src/testimonials_carousel.tsx`

- [ ] **Step 1: Read current render** to get exact prop/item shape.
- [ ] **Step 2:** Wrap in `<Section>` + `<SectionHeader>`. Change the track to: mobile snap-scroll, desktop grid — `className="flex gap-bk-md overflow-x-auto snap-x lg:grid lg:grid-cols-3 lg:overflow-visible"`. Card min-width only applies below `lg`: `className="snap-start min-w-[80%] sm:min-w-[340px] lg:min-w-0"`.
- [ ] **Step 3:** Convert avatar raw `<img>` → `next/image` (`width={48} height={48}`), bump to `w-12 h-12`, `text-lg` initials fallback.
- [ ] **Step 4:** Add `line-clamp-4` to the quote. Add scroll-position dots below the track on mobile (`lg:hidden`).
- [ ] **Step 5: Verify** — smoke test + type-check pass.
- [ ] **Step 6: Commit** — `git commit -m "feat(sections): testimonials desktop grid + dots + next/image avatars"`

### Tasks 3.C … 3.N: remaining sections

Each remaining file in the work-list above is one task: apply the per-section checklist, run `pnpm exec vitest run packages/sections/src/_render-smoke.test.tsx` + `pnpm --filter @scheniders/sections type-check`, fix any changed class-name assertion, commit in batches of 1-3 related sections (e.g. "feat(sections): story sections onto design-system").

**Phase 3 gate:** After the sweep — `pnpm type-check && pnpm lint && pnpm exec vitest run packages/sections packages/shared` all pass. Then a full visual pass of the home page + PDP + cart at 390px and 1280px. Re-run the builder Health panel to confirm no regressions in section content.

---

## Self-Review

- **Spec coverage:** Phase 1 covers F1 (1.1), F2 (1.2), F3 (1.3), F4 (1.4). Phase 2 covers the design-token + primitive foundation (interaction colors 2.1; static spacing/opacity/fluid-type 2.2; `<Section>` 2.3; reference adoption 2.4). Phase 3 covers the responsive ceiling, candy→bk split-brain, image handling, empty/loading states, spacing/type consistency, and the per-section craft notes from the audit. F5 (translation-completeness health rule) and F6/F7 are intentionally deferred — note them for a follow-up plan; they are not design-system work.
- **No placeholders:** Phase 1 + Phase 2 steps carry complete SQL/TS/CSS. Phase 3 gives complete reference code for 3.A/3.B and a fully-specified repeatable checklist for the rest (a documented pattern, not "TBD").
- **Type/name consistency:** `Section`, `SectionHeader`, `SectionDensity`, `ScribbleColor` are defined in 2.3 and consumed in 2.4 + Phase 3. `priority` added to product-card Props in 2.4 and used in 2.4 Step 1. Token names (`--bk-space-*`, `--bk-section-y`, `--bk-text-hero`, `--bk-primary-active`, `--bk-focus-ring`) are defined once and reused verbatim.
- **Deferred for a separate plan:** translation-completeness publish gate (F5), server-side `valid_on` validation (F6), invalid-hex brand-kit guard (F7), motion/micro-interaction system, sticky-add-to-cart desktop redesign beyond the simple fix in 3 (PDP). These are real but out of this plan's scope.
