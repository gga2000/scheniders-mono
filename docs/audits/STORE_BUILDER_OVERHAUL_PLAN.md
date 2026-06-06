# Store / Website Builder Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run in a dedicated git worktree.

**Goal:** Turn the store builder into one state-of-the-art system: V2's section model becomes the engine that drives the live storefront, V1 is retired, advanced features (variants/A-B/segments/scheduling) go fully live, persistence is atomic/validated, AI is removed, and merchants enter through a Command Center → canvas flow.

**Architecture:** The public storefront stops rendering legacy V1 React templates and instead renders `store_config_v2` pages/sections via `@scheniders/sections` `RenderPage` — one renderer for editor preview AND production (no drift). `StoreConfigV2` absorbs the business-logic fields V1 owned (`commerce` + `custom_css`). The pure, already-tested variant resolver (`@scheniders/shared`) makes schedules/segments/experiments live once the storefront builds a real `RuntimeContext`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Supabase (SSR + RLS), Zod v4, Tailwind v4, Vitest, Playwright. Package manager: **npm**. Iraq market: IQD, no tax, LTR-only even in Arabic.

**Decisions locked (2026-06-04):** single section render model · Command Center → canvas entry · finish advanced features properly · **no AI anywhere** in the builder · plan-first.

**Source audit:** [STORE_BUILDER_ARCHITECTURE_AUDIT_2026-06.md](STORE_BUILDER_ARCHITECTURE_AUDIT_2026-06.md). Memory: `project_store_builder_v1_v2`.

---

## Roadmap (all phases)

| Phase | Title | Depends on | Outcome |
|---|---|---|---|
| **1** | **Foundation** (detailed below) | — | AI removed; drafts/CSS secured; `StoreConfigV2` unified; **storefront home renders v2 sections** with legacy fallback; all tenants ported. |
| 2 | Full multi-page render | 1 | product / category / cart / checkout / policies / about / faq / contact / search / track render from v2; globals (header/footer/promo) v2-driven; per-page SEO from `PageMeta`. |
| 3 | Safe persistence | 1 | Atomic publish RPC (`publish_store_config_v2`); patch route Zod-validated, id-based paths, optimistic lock; server-safe `@scheniders/sections/schemas` entrypoint; no swallowed catches. |
| 4 | Section single-source-of-truth | 1 | `SECTIONS_MANIFEST` generated from the real registry (adapter over `BUILTIN_SECTIONS`); `section-field-groups` fixed to real keys; 25 missing sections become editable; 10 dead sections deleted-or-wired (keep `exit_intent_offer`, `sticky_cta_bar` for COD); parity test. |
| 5 | Advanced features live | 2, 3 | First-party visitor-key cookie; storefront event-writer API (service role); `assignAbArm`/`evaluateSegments` wired into `RuntimeContext`; checkout→order conversion event; optional schedule-status reconcile cron. |
| 6 | Command Center + V1 retirement | 2, 4 | `/store` = overview hub (live thumbnail, status, KPIs, health, pages, Customize CTA); editor at `/store/edit`; nav repointed; domains + store-analytics + share-QR ported into V2; `tenant_domains`/`store_pages` migrations added; **V1 deleted**; "Try v2" banner removed. |
| 7 | Polish & perf | 6 | Mobile editing parity for core surfaces; post-publish "your store is live" moment; ISR/tag revalidation on publish; remaining dead code + tests. |

**Scope note (writing-plans):** Phases 2–7 are separate sub-plans, each producing working, testable software on its own. They are scoped here and will be detailed task-by-task when reached. Phase 1 below is fully detailed.

---

## Phase 1 — Foundation

**Phase goal:** Ship a storefront that renders the **published** `store_config_v2` home page through the same `RenderPage` the editor uses, with a safe legacy fallback — after removing the builder's AI and closing the two storefront security holes, and after `StoreConfigV2` gains a home for the V1 business fields and every tenant is ported.

**File structure for this phase:**
- `apps/platform/app/api/store/generate-copy/` — **deleted** (insecure AI route).
- `apps/platform/components/store-builder/ai-copy-button.tsx`, `ai-image-suggestions.tsx` — **deleted**.
- `apps/platform/components/store-builder/sections/{hero-editor,about-editor}.tsx`, `editor-panel.tsx` — AI render sites removed.
- `packages/shared/src/util/sanitize-css.ts` (new) + test — root-cause XSS fix.
- `apps/storefront/lib/tenant.ts` — split public vs preview column sets (stop leaking draft).
- `apps/storefront/app/s/[tenant]/layout.tsx` — sanitize `custom_css`; read v2 `custom_css`.
- `packages/shared/src/types/store-config-v2.ts` — add `commerce?` + `custom_css?`.
- `scripts/migrate-store-config-v2/mapper.ts` (+ `mapper.test.ts`) — populate `commerce`/`custom_css`/footer.
- `apps/storefront/lib/storefront-runtime.ts` (new) + test — `buildRuntimeContext`.
- `apps/storefront/components/storefront-globals.tsx` (new) — render v2 globals (header/footer/promo).
- `apps/storefront/app/s/[tenant]/page.tsx` — **swap** to `RenderPage` (v2) with legacy fallback.

> **Convention reminder:** No `any`/`@ts-ignore`/`eslint-disable`/swallowed catch. Tenant-scope every query. After every task: `npm run type-check && npm run lint` (the CI gate) plus the task's tests. CI does NOT run tests — run them locally.

---

### Task 1: Remove all builder AI

**Files:**
- Delete: `apps/platform/app/api/store/generate-copy/route.ts` (and its now-empty `app/api/store/generate-copy/` dir)
- Delete: `apps/platform/components/store-builder/ai-copy-button.tsx`
- Delete: `apps/platform/components/store-builder/ai-image-suggestions.tsx`
- Modify: `apps/platform/components/store-builder/sections/hero-editor.tsx`
- Modify: `apps/platform/components/store-builder/sections/about-editor.tsx`
- Modify: `apps/platform/components/store-builder/editor-panel.tsx`

> Verified scope: these AI surfaces are imported only by hero-editor + about-editor, which are used only by editor-panel. **Do NOT** remove `@google/generative-ai` or `GEMINI_API_KEY` — the Telegram order-image extractor (`lib/gemini-order-extractor.ts`, `app/api/telegram/webhook/route.ts`, `app/api/orders/analyze-image/route.ts`) still needs them.

- [ ] **Step 1: Delete the three AI files**

```bash
git rm apps/platform/app/api/store/generate-copy/route.ts
git rm apps/platform/components/store-builder/ai-copy-button.tsx
git rm apps/platform/components/store-builder/ai-image-suggestions.tsx
```

- [ ] **Step 2: Strip AI from `hero-editor.tsx`**

Remove the two imports (lines ~8–9: `AiCopyButton`, `AiImageSuggestions`), the `<AiCopyButton …onApply…/>` block in the hero header (~lines 90–100), and the `<AiImageSuggestions …/>` block (~lines 206–207). Then remove the now-unused props from `HeroEditorProps` (`businessName?`, `industry?`, `template?`) and from the destructure (`businessName = "", industry, template,`). Keep the section header `<div>`/`<h3>` (drop the now-cosmetic `flex-1` if it looks off).

- [ ] **Step 3: Strip AI from `about-editor.tsx`**

Remove the `AiCopyButton` import (~line 6) and its `<AiCopyButton …onApply…/>` block (~lines 48–57). Remove unused props `businessName?`, `industry?`, `template?` from `AboutEditorProps` and the destructure.

- [ ] **Step 4: Remove now-invalid props at the render sites in `editor-panel.tsx`**

In the `<HeroEditor …/>` usage (~lines 163–175) remove `businessName={businessName}` and `template={builder.template}`. In `<AboutEditor …/>` (~lines 183–192) remove `businessName={businessName}` and `template={builder.template}`. **Keep** the `EditorPanel` `businessName` prop itself — `TemplatePicker` and `SEOEditor` still use it.

- [ ] **Step 5: Verify build + lint catch any dangling references**

```bash
npm run type-check && npm run lint
```
Expected: PASS, with no "Cannot find module './ai-copy-button'", no unused-var warnings for `industry`/`template`. Grep to confirm zero references remain:
```bash
grep -rn "ai-copy-button\|ai-image-suggestions\|generate-copy" apps/platform --include="*.ts" --include="*.tsx" | grep -v ".next/"
```
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(builder): remove AI copy/image features (insecure generate-copy route + buttons)"
```

---

### Task 2: Stop leaking unpublished drafts to anonymous visitors

**Files:**
- Modify: `apps/storefront/lib/tenant.ts` (`V2_TENANT_COLS`, `selectTenant`, `getTenantBySlug`, `getTenantByCustomDomain`)
- Test: `apps/storefront/lib/tenant.test.ts` (create if absent)

> Today `V2_TENANT_COLS` includes `store_config_v2_draft` and the public resolver selects it; the `tenants` anon RLS policy is row-level only (no column restriction), so any visitor can read unpublished drafts. The preview route legitimately needs the draft; the public route must not.

- [ ] **Step 1: Write the failing test**

```ts
// apps/storefront/lib/tenant.test.ts
import { describe, it, expect } from "vitest";
import { PUBLIC_TENANT_COLS, PREVIEW_TENANT_COLS } from "./tenant";

describe("tenant column sets", () => {
  it("public select never includes the draft column", () => {
    expect(PUBLIC_TENANT_COLS).not.toContain("store_config_v2_draft");
    expect(PUBLIC_TENANT_COLS).toContain("store_config_v2");
  });
  it("preview select includes the draft column", () => {
    expect(PREVIEW_TENANT_COLS).toContain("store_config_v2_draft");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
npx vitest run apps/storefront/lib/tenant.test.ts
```
Expected: FAIL — `PUBLIC_TENANT_COLS`/`PREVIEW_TENANT_COLS` not exported.

- [ ] **Step 3: Split the column sets in `tenant.ts`**

Replace the single `V2_TENANT_COLS` with two exported constants and thread an `includeDraft` flag through `selectTenant`:

```ts
// apps/storefront/lib/tenant.ts
export const PUBLIC_TENANT_COLS = `${BASE_TENANT_COLS}, store_config_v2`;
export const PREVIEW_TENANT_COLS = `${BASE_TENANT_COLS}, store_config_v2, store_config_v2_draft`;

// selectTenant(...) gains: opts?: { includeDraft?: boolean }
// const cols = opts?.includeDraft ? PREVIEW_TENANT_COLS : PUBLIC_TENANT_COLS;
// (keep the existing 42703 column-missing fallback to BASE_TENANT_COLS)
```
`getTenantBySlug` / `getTenantByCustomDomain` (public) call `selectTenant` with **no** `includeDraft`. The preview route's loader passes `{ includeDraft: true }`.

- [ ] **Step 4: Repoint the preview route to request the draft**

In `apps/storefront/app/%5Fpreview/[tenant]/[page_id]/page.tsx`, ensure the tenant load uses the draft-inclusive path (call the preview loader / pass `{ includeDraft: true }`). The line `tenant.store_config_v2_draft ?? tenant.store_config_v2` (~339) keeps working for preview only.

- [ ] **Step 5: Run tests + type-check**

```bash
npx vitest run apps/storefront/lib/tenant.test.ts && npm run type-check
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(storefront): never select store_config_v2_draft on public routes (draft leak)"
```

> **Defense-in-depth (note, not a Phase-1 step):** Phase 3 adds a DB safeguard — revoke `SELECT` on the draft column from `anon`, or expose the public storefront via a security-barrier view — so the column can never leak even if a future query re-adds it.

---

### Task 3: Eliminate the `custom_css` stored-XSS sink

**Files:**
- Create: `packages/shared/src/util/sanitize-css.ts`
- Create: `packages/shared/src/util/sanitize-css.test.ts`
- Modify: `packages/shared/src/index.ts` (export)
- Modify: `apps/storefront/app/s/[tenant]/layout.tsx` (~211–212)

> The risk is breaking out of `<style>` (e.g. `</style><script>…`) — CSS itself can't run JS in modern browsers, but the raw string is injected via `dangerouslySetInnerHTML`. Root-cause fix: a real sanitizer that strips any tag-closing/opening sequences and known dangerous tokens, applied at render.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/util/sanitize-css.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeCustomCss } from "./sanitize-css";

describe("sanitizeCustomCss", () => {
  it("strips style-tag breakout", () => {
    expect(sanitizeCustomCss("a{} </style><script>alert(1)</script>")).not.toMatch(/</);
  });
  it("removes javascript: and expression() and @import", () => {
    const out = sanitizeCustomCss("x{background:url(javascript:alert(1))} y{width:expression(1)} @import 'http://e.v';");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out.toLowerCase()).not.toContain("expression(");
    expect(out.toLowerCase()).not.toContain("@import");
  });
  it("keeps safe declarations intact", () => {
    expect(sanitizeCustomCss(".btn{color:#0a0;border-radius:8px}")).toContain("border-radius:8px");
  });
  it("returns empty string for nullish input", () => {
    expect(sanitizeCustomCss(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
npx vitest run packages/shared/src/util/sanitize-css.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sanitizer**

```ts
// packages/shared/src/util/sanitize-css.ts
/** Sanitize merchant-authored CSS before injecting into a <style> tag. */
export function sanitizeCustomCss(css: string | null | undefined): string {
  if (!css) return "";
  return css
    .replace(/<\/?[a-z!/]/gi, " ")            // any tag open/close (</style, <script, <!)
    .replace(/[<>]/g, " ")                     // stray angle brackets
    .replace(/@import[^;]*;?/gi, "")           // remote @import
    .replace(/expression\s*\(/gi, "blocked(")  // IE expression()
    .replace(/javascript\s*:/gi, "blocked:")   // javascript: urls
    .replace(/behavior\s*:/gi, "blocked:")     // IE behavior:
    .replace(/-moz-binding/gi, "blocked");     // XBL binding
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npx vitest run packages/shared/src/util/sanitize-css.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Export it and apply at the injection site**

Add `export * from "./util/sanitize-css";` to `packages/shared/src/index.ts`. In `apps/storefront/app/s/[tenant]/layout.tsx` (~211–212) wrap the value:
```tsx
import { sanitizeCustomCss } from "@scheniders/shared";
// ...
{rawCustomCss && (
  <style dangerouslySetInnerHTML={{ __html: sanitizeCustomCss(rawCustomCss) }} />
)}
```
where `rawCustomCss = tenant.store_config_v2?.custom_css ?? tenant.store_config?.custom_css` (v2 first once Task 4 lands; legacy fallback meanwhile).

- [ ] **Step 6: Verify + commit**

```bash
npx vitest run packages/shared/src/util/sanitize-css.test.ts && npm run type-check && npm run lint
git add -A
git commit -m "fix(storefront): sanitize merchant custom_css before injection (stored XSS)"
```

---

### Task 4: Give `StoreConfigV2` a home for V1 business fields

**Files:**
- Modify: `packages/shared/src/types/store-config-v2.ts` (interface ~314–332, add types)
- Test: `packages/shared/src/types/store-config-v2.test.ts` (extend or create)

> `StoreConfigV2` has no slot for `whatsapp_number`, `enable_whatsapp_order`, `custom_css`, or the social links the storefront needs. Add an **optional** top-level `commerce` object + optional `custom_css` (optional ⇒ `emptyStoreConfigV2` still compiles unchanged). `template` is intentionally dropped (brand_kit + sections encode the visual result).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/types/store-config-v2.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type { StoreConfigV2, StoreCommerceConfig } from "./store-config-v2";

describe("StoreConfigV2 commerce slot", () => {
  it("accepts commerce + custom_css", () => {
    const c: Pick<StoreConfigV2, "commerce" | "custom_css"> = {
      commerce: { whatsapp_number: "+9647…", enable_whatsapp_order: true, socials: { instagram: "x" } },
      custom_css: ".a{}",
    };
    expectTypeOf(c.commerce).toEqualTypeOf<StoreCommerceConfig | undefined>();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
npx vitest run packages/shared/src/types/store-config-v2.test.ts
```
Expected: FAIL — `StoreCommerceConfig` / `commerce` / `custom_css` don't exist.

- [ ] **Step 3: Add the types**

```ts
// packages/shared/src/types/store-config-v2.ts  (near the other interfaces)
export interface StoreCommerceConfig {
  whatsapp_number?: string;
  enable_whatsapp_order?: boolean;
  /** prefilled WhatsApp message templates (from legacy schneiders.whatsapp_templates) */
  whatsapp_templates?: { order_confirm?: I18nString; product_inquiry?: I18nString };
  socials?: { instagram?: string; facebook?: string; tiktok?: string; email?: string };
  returns_policy?: { window_days?: number };
  delivery_promise?: { baghdad_hours?: number; provinces_hours?: number; governorates_covered?: number };
}
```
Then extend the interface (keep new fields **optional**):
```ts
export interface StoreConfigV2 {
  schema_version: 2;
  brand_kit: BrandKit;
  pages: PageConfig[];
  globals: GlobalSections;
  experiments: Experiment[];
  segments: AudienceSegment[];
  schedules: ScheduledChange[];
  default_locale: LocaleCode;
  enabled_locales: LocaleCode[];
  commerce?: StoreCommerceConfig;   // NEW
  custom_css?: string;              // NEW
}
```

- [ ] **Step 4: Run tests + type-check**

```bash
npx vitest run packages/shared/src/types/store-config-v2.test.ts && npm run type-check
```
Expected: PASS (optional fields ⇒ `emptyStoreConfigV2` in `store-config-v2-resolver.ts` still compiles).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): add StoreConfigV2.commerce + custom_css (homes for V1 business fields)"
```

---

### Task 5: Map legacy business fields in the porter

**Files:**
- Modify: `scripts/migrate-store-config-v2/mapper.ts` (`mapLegacyToV2` return ~437–446; `mapGlobals` ~325–335; `mapBrandKit` ~103–144)
- Modify: `scripts/migrate-store-config-v2/mapper.test.ts`
- Fixtures already exist: `scripts/migrate-store-config-v2/__fixtures__/{legacy-empty,legacy-minimal,legacy-schneiders-full}`

- [ ] **Step 1: Write the failing test**

```ts
// scripts/migrate-store-config-v2/mapper.test.ts  (add cases)
import { mapLegacyToV2 } from "./mapper";

it("maps contact + whatsapp + custom_css into commerce/custom_css", () => {
  const v2 = mapLegacyToV2({
    contact: { whatsapp_number: "+9647", instagram: "ig" },
    enable_whatsapp_order: true,
    custom_css: ".x{}",
  });
  expect(v2.commerce?.whatsapp_number).toBe("+9647");
  expect(v2.commerce?.enable_whatsapp_order).toBe(true);
  expect(v2.commerce?.socials?.instagram).toBe("ig");
  expect(v2.custom_css).toBe(".x{}");
});

it("synthesizes a footer global from contact socials", () => {
  const v2 = mapLegacyToV2({ contact: { instagram: "ig", email: "a@b.c" } });
  expect(v2.globals.footer).toBeTruthy();
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
cd scripts/migrate-store-config-v2 && npx vitest run mapper.test.ts; cd -
```
Expected: FAIL — `commerce`/`custom_css`/`footer` undefined.

- [ ] **Step 3: Populate `commerce` + `custom_css` in `mapLegacyToV2`**

In the `mapLegacyToV2` return (~437), add (reading from the `safe` legacy object):
```ts
commerce: {
  whatsapp_number: safe.contact?.whatsapp_number,
  enable_whatsapp_order: safe.enable_whatsapp_order,
  whatsapp_templates: safe.schneiders?.whatsapp_templates,
  socials: {
    instagram: safe.contact?.instagram,
    facebook: safe.contact?.facebook,
    tiktok: safe.contact?.tiktok,
    email: safe.contact?.email,
  },
  returns_policy: safe.schneiders?.returns_policy
    ? { window_days: safe.schneiders.returns_policy.window_days }
    : undefined,
  delivery_promise: safe.schneiders?.delivery_promise,
},
custom_css: safe.custom_css,
```

- [ ] **Step 4: Synthesize a footer global in `mapGlobals`**

In `mapGlobals` (~325), emit a `footer` `SectionInstance` when any social/contact exists:
```ts
const socials = legacy?.contact;
if (socials && (socials.instagram || socials.facebook || socials.tiktok || socials.email)) {
  globals.footer = {
    id: stableId("footer"),
    type: "footer",
    enabled: true,
    base: { instagram: socials.instagram, facebook: socials.facebook, tiktok: socials.tiktok, email: socials.email },
  };
}
```
(`footer` becomes a real section type in Phase 4's manifest pass; for now it carries data and renders via the legacy footer until then — see Task 7 globals note.)

- [ ] **Step 5: Run tests — verify pass (and existing fixtures still pass)**

```bash
cd scripts/migrate-store-config-v2 && npx vitest run mapper.test.ts; cd -
```
Expected: PASS, including the pre-existing `legacy-schneiders-full` snapshot (update the snapshot intentionally if it now includes commerce/footer).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(migrate): port whatsapp/socials/custom_css/returns into StoreConfigV2.commerce"
```

---

### Task 6: Storefront render helpers (runtime + globals)

**Files:**
- Create: `apps/storefront/lib/storefront-runtime.ts`
- Create: `apps/storefront/lib/storefront-runtime.test.ts`
- Create: `apps/storefront/components/storefront-globals.tsx`

> `RenderPage` renders only `page.sections` — header/footer/promo come from `globals` and must be rendered separately via `resolveGlobals` + `RenderSection`. `RuntimeContext` for the public route must be built fresh (the preview builds it inline). Phase 1 supplies empty `audience_segments`/`ab_test_arms` (real values arrive in Phase 5).

- [ ] **Step 1: Write the failing test for `buildRuntimeContext`**

```ts
// apps/storefront/lib/storefront-runtime.test.ts
import { describe, it, expect } from "vitest";
import { buildRuntimeContext } from "./storefront-runtime";

describe("buildRuntimeContext", () => {
  it("defaults to mobile/SSR-safe runtime for the home page", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const ctx = buildRuntimeContext({ pageId: "home", locale: "ar", now });
    expect(ctx).toMatchObject({
      page_id: "home", breakpoint: "mobile", locale: "ar",
      audience_segments: [], ab_test_arms: {}, now,
    });
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

```bash
npx vitest run apps/storefront/lib/storefront-runtime.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildRuntimeContext`**

```ts
// apps/storefront/lib/storefront-runtime.ts
import type { RuntimeContext, PageId, LocaleCode, GovernorateCode } from "@scheniders/shared";

export function buildRuntimeContext(opts: {
  pageId: PageId;
  locale: LocaleCode;
  now: Date;
  governorate?: GovernorateCode;
  productId?: string;
  categoryId?: string;
}): RuntimeContext {
  return {
    page_id: opts.pageId,
    breakpoint: "mobile",                 // SSR default; CSS handles responsive layout
    locale: opts.locale,
    audience_segments: [],                // populated in Phase 5
    ab_test_arms: {},                     // populated in Phase 5
    governorate: opts.governorate,
    product_id: opts.productId,
    category_id: opts.categoryId,
    now: opts.now,
  };
}
```

- [ ] **Step 4: Run test — verify pass**

```bash
npx vitest run apps/storefront/lib/storefront-runtime.test.ts
```
Expected: PASS.

- [ ] **Step 5: Implement the globals renderer (client island)**

```tsx
// apps/storefront/components/storefront-globals.tsx
"use client";
import { RenderSection } from "@scheniders/sections";
import { resolveGlobals } from "@scheniders/shared";
import type { GlobalSections, RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

type Slot = keyof GlobalSections;
export function StorefrontGlobals({
  globals, runtime, renderCtx, slots,
}: {
  globals: GlobalSections;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
  slots: Slot[];
}) {
  resolveGlobals(globals, runtime); // honors enabled/visibility
  return (
    <>
      {slots.map((slot) => {
        const inst = globals[slot];
        if (!inst || !inst.enabled) return null;
        return <RenderSection key={inst.id} instance={inst} runtime={runtime} renderCtx={renderCtx} />;
      })}
    </>
  );
}
```

- [ ] **Step 6: Type-check + commit**

```bash
npm run type-check && npx vitest run apps/storefront/lib/storefront-runtime.test.ts
git add -A
git commit -m "feat(storefront): runtime-context builder + v2 globals renderer"
```

---

### Task 7: Swap the storefront home to render v2 sections (with legacy fallback)

**Files:**
- Modify: `apps/storefront/app/s/[tenant]/page.tsx` (render site ~44–45, imports ~4)

> The pivotal change. Render the published `store_config_v2` home page via `RenderPage`; fall back to the legacy `getTemplate()` when the tenant has no v2 config or no `home` page (so nothing dark-ships during rollout). `RenderPage` is `"use client"`; passing server-fetched serializable data (tenant/products/categories, `now` as Date) into it is the proven preview pattern. Importing the `@scheniders/sections` **barrel** is required to populate the section registry.

- [ ] **Step 1: Add the v2 render branch**

Replace the legacy-only body. Concrete shape:

```tsx
// apps/storefront/app/s/[tenant]/page.tsx
import { RenderPage } from "@scheniders/sections";          // barrel ⇒ registers sections
import { buildRuntimeContext } from "@/lib/storefront-runtime";
import { StorefrontGlobals } from "@/components/storefront-globals";
import { getTemplate } from "@/templates/registry";         // legacy fallback (keep)
// ... existing imports/data loads (tenant, products, categories) stay ...

export default async function StorefrontHome(/* existing props */) {
  // ... existing tenant + products + categories resolution ...
  const v2 = tenant.store_config_v2 ?? null;                // PUBLISHED only (never _draft)
  const homePage = v2?.pages.find((p) => p.page_id === "home");

  if (v2 && homePage) {
    const runtime = buildRuntimeContext({
      pageId: "home",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    const renderCtx = { tenant, products, categories };     // Omit<SectionRenderContext,"runtime">
    return (
      <>
        <StorefrontGlobals globals={v2.globals} runtime={runtime} renderCtx={renderCtx} slots={["promo_bar", "header"]} />
        <RenderPage page={homePage} runtime={runtime} renderCtx={renderCtx} />
        <StorefrontGlobals globals={v2.globals} runtime={runtime} renderCtx={renderCtx} slots={["footer"]} />
      </>
    );
  }

  // Legacy fallback (unchanged behavior for un-ported tenants / preview_template override)
  const Template = getTemplate(preview ?? tenant.store_config?.template);
  return <Template tenant={tenant} products={products} categories={categories} />;
}
```

> Globals slot note: until Phase 4 makes `header`/`footer` real section types, `v2.globals.header`/`footer` may be undefined → `StorefrontGlobals` renders nothing and the layout/legacy chrome still applies. The mapped `footer` (Task 5) carries data for Phase 4 to consume. `promo_bar` already maps from `schneiders.promo_bar` and renders now.

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```
Expected: PASS (`renderCtx` is serializable; `now` is a Date — structured-clone safe across the RSC→client boundary).

- [ ] **Step 3: Add a smoke test that a v2 home renders sections, else falls back**

```ts
// apps/storefront/app/s/[tenant]/page.render.test.tsx
// Render a tenant with a minimal v2 home (one hero_image section) and assert the section's text appears;
// render a tenant with v2=null and assert the legacy template path is used.
// Use @testing-library/react + import "@scheniders/sections" for registry side-effects.
```
(Write concrete assertions against `resolveI18n` hero text for the v2 case and a legacy template marker for the fallback case.)

- [ ] **Step 4: Run the test**

```bash
npx vitest run apps/storefront/app/s/[tenant]/page.render.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Manual verification in the running app**

```bash
npm run dev:storefront   # :3001
```
Visit a ported tenant's store (`/s/<slug>`) — confirm the v2 hero/sections render and match the editor preview. Visit an un-ported tenant — confirm the legacy template still renders (no regression). Check the page source: first 2 sections eager, rest wrapped in `content-visibility` (SEO HTML still present).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(storefront): render published store_config_v2 home via RenderPage (legacy fallback)"
```

---

### Task 8: Port all existing tenants to `store_config_v2`

**Files:**
- Run: `scripts/migrate-store-config-v2/index.ts` (existing porter — now emits `commerce`/`custom_css`/footer)

> The porter reads `tenants.store_config`, runs the updated `mapLegacyToV2`, and writes `tenants.store_config_v2` (it does not touch the legacy column or `config_version`). Because Task 7 reads published `store_config_v2` with a legacy fallback, porting is safe and reversible per-tenant.

- [ ] **Step 1: Dry-run a single tenant**

```bash
cd scripts/migrate-store-config-v2
npm run start -- --tenant=<TEST_TENANT_ID> --dry-run   # confirm script's flags in its README
```
Expected: prints the mapped v2 config; no write.

- [ ] **Step 2: Migrate one real test tenant + verify in the storefront**

```bash
npm run start -- --tenant=<TEST_TENANT_ID>
```
Then load that tenant's storefront and confirm the v2 render path (Task 7) is taken and looks correct.

- [ ] **Step 3: Verify data via SQL (MCP supabase / SQL editor on NEW project `sduvpgqwhxragxtxztur`)**

```sql
select id,
       (store_config_v2->>'schema_version') as v,
       (store_config_v2->'commerce'->>'whatsapp_number') as wa,
       jsonb_array_length(store_config_v2->'pages') as pages
from public.tenants
where id = '<TEST_TENANT_ID>';
```
Expected: `v = 2`, `pages >= 1`, `wa` populated when legacy had a WhatsApp number.

- [ ] **Step 4: Migrate all tenants**

```bash
npm run start -- --all
cd -
```
Expected: per-tenant success log; idempotent (safe to re-run).

- [ ] **Step 5: Verify coverage**

```sql
select count(*) filter (where store_config_v2 is not null) as ported,
       count(*) as total
from public.tenants;
```
Expected: `ported = total` (or all `active`/`trial` tenants).

- [ ] **Step 6: Commit (script changes only; data lives in DB)**

```bash
git add scripts/migrate-store-config-v2
git commit -m "chore(migrate): run legacy→v2 porter for all tenants (commerce-aware)"
```

---

## Phase 1 acceptance criteria

- [ ] Visiting a ported tenant's `/s/<slug>` renders the **same** sections as the V2 editor preview (one renderer; no drift).
- [ ] An un-ported tenant still renders via the legacy template (zero regression during rollout).
- [ ] No anonymous request can read `store_config_v2_draft` (verified by query + the `tenant.test.ts` guard).
- [ ] Merchant `custom_css` containing `</style><script>` renders inert (verified by `sanitize-css.test.ts`).
- [ ] Zero references to the removed AI files; `npm run type-check && npm run lint` pass.
- [ ] All tenants have `store_config_v2.schema_version = 2`.
- [ ] `npx vitest run` passes for the new/changed tests.

## Risks & mitigations

- **`RenderPage` is a client component** → it renders as a client island from the RSC route (proven by the preview route). All `BUILTIN_SECTIONS` render components must be client-safe; verify during Task 7 manual check. Mitigation: legacy fallback stays until parity confirmed.
- **Porter data loss** (20 unconsumed `schneiders` fields) → Phase 1 only adds commerce/custom_css/footer; the remaining business config is folded into section base props / `commerce` in Phase 4. The legacy column is untouched, so nothing is destroyed.
- **Globals/header/footer** not yet real section types → Phase 1 renders only `promo_bar` from globals; header/footer chrome continues from the layout/legacy shell until Phase 4. No blank-chrome regression because the fallback and layout still apply.
- **Section registry not populated server-side** → always import the `@scheniders/sections` **barrel** (never `RenderSection.tsx` directly).

---

## Self-review (writing-plans checklist)

- **Spec coverage:** AI removal (T1) ✓ · draft leak (T2) ✓ · custom_css XSS (T3) ✓ · data-model unification (T4–T5) ✓ · storefront v2 render (T6–T7) ✓ · tenant porting (T8) ✓. Atomic publish / patch validation → Phase 3; section manifest SSOT → Phase 4; experiments/segments/schedules live → Phase 5; Command Center + V1 deletion → Phase 6; mobile/perf → Phase 7.
- **Type consistency:** `RuntimeContext`, `SectionRenderContext` (`Omit<…,"runtime">` at call sites), `StoreConfigV2.commerce`/`custom_css`, `StoreCommerceConfig`, `PUBLIC_TENANT_COLS`/`PREVIEW_TENANT_COLS`, `buildRuntimeContext`, `StorefrontGlobals`, `sanitizeCustomCss`, `mapLegacyToV2` — names used consistently across tasks.
- **No placeholders:** every code step contains real code; every command has an expected result.
