# PDP lower sections: related row + footer cleanup. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the product page's related-products grid into a compact horizontal row that shows each perfume's maker and audience, lists products a shopper can order before sold-out ones, and labels sold-out products clearly. In the footer, stop promising a coupon nobody can redeem and use the header's wordmark so the shop has one name.

**Architecture:** Three opt-in fields on two shared sections. Each field is a new optional schema field with `.catch(undefined)`: `product_grid.layout: "row"`, `product_grid.query.sold_out_last` and `site_footer.wordmark_i18n`. Unset, every render is byte-identical, and snapshots taken before any edit pin that. The row is a server component that uses CSS scroll-snap and ships no JavaScript. It reuses the express PDP's `Tag`, gender icons and `EXPRESS_STRINGS`. The coupon promise lives in config, not code, so the footer fix is a draft-config edit and needs no new prop. The only DB writes are to `tenants.store_config_v2_draft` for scheniders-iraq.

**Tech Stack:** Next.js 16 / React 19 server components, Zod v4, Tailwind v4 `bk-*` token utilities, Vitest (`renderToStaticMarkup`), Supabase CLI (`supabase db query --linked`).

---

## Ground rules for every task

- Repo `/Users/ali/scheniders-mono`, branch **`feat/pdp-lower-sections`**. Run `git branch --show-current` before every edit and before every commit. If it prints anything else, STOP and report BLOCKED.
- Shell prefix for every command: `export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"`. Use pnpm only. Never run `pnpm install` or delete `.next`, and never stop the dev servers on :3000 / :3001.
- Tests: `CI=true pnpm exec vitest run <path>`. **Exception:** a *brand-new* snapshot file is written once with `pnpm exec vitest run <path>` (no `CI=true`; vitest refuses to write new snapshots in CI mode). Never run `-u` against an existing snapshot file. A diff there is a back-compat break.
- Commit only explicit paths, as gga2000:
  `git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "<msg>"`. End every message with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, stash, reset, or `checkout <ref> -- <path>`.
- Never stage `apps/storefront/AGENTS.md`, `apps/storefront/CLAUDE.md`, `apps/admin/next-env.d.ts` or any `*.png`. This plan file is committed once, on its own, as `docs(plan)` before Task 1, and is not staged with any task.
- Banned: `any`, `@ts-ignore`, `eslint-disable`, `!` non-null assertions used to silence the compiler, swallowed catches, `dir="rtl"`, hex colours outside a `var(--bk-*, fallback)`, and English/Arabic literals in markup (chrome text goes through `chromeString` / `xs`).

---

## Design

### What it looks like at 390px (Arabic)

```
 ┌────────────────────────────────────────────┐
 │ عرض المزيد ←              اكثر منتجاتنا مبيعاً │  ← header row: heading on the right (h2, font-bk-display 22px),
 │                شوف تشكيلة من اكثر العطور…  │    "see all" link on the left (44px tall, underlined)
 │                                            │
 │ ┌──┐ ┌───────────┐ ┌───────────┐            │  ← row bleeds to the screen edges; ~2.3 cards visible,
 │ │  │ │  [photo]  │ │  [photo]  │            │    third card peeks to show it scrolls; first card is
 │ │  │ │           │ │           │            │    at the RIGHT edge, swipe leftwards
 │ │  │ │ ويفر انتنس │ │ انفوي بلو  │            │  ← display name (2 lines max, font-bk-display 15px)
 │ │  │ │[الشركة: باريس كورنر]     │            │  ← strong tag (bk-secondary), truncates if long
 │ │  │ │[رجالي ♂] [★ 4.6 (12)]    │            │  ← quiet hairline tags: gender, real rating
 │ │  │ │ 36,750 د.ع  ̶4̶8̶,̶5̶0̶0̶     │            │  ← price pinned to the card bottom, struck compare-at
 │ └──┘ └───────────┘ └───────────┘            │
 └────────────────────────────────────────────┘
```

- Each card is one `rounded-bk-card` surface with a hairline `border-bk border-bk-divider` on `bg-bk-surface`, the same quiet card language as `packages/sections/src/pdp_express/*`. The whole card is the link, so the touch target is far above 44px.
- Card width: `w-[44%]` (about 157px at 390), `sm:w-[30%]`. From `lg` up the row becomes a 4-column grid with no hidden overflow, so a desktop mouse user never has to scroll a scrollbar-less strip.
- **Sold out** (on hand minus reserved ≤ 0, oversold included): the photo is greyed (`opacity-60 grayscale`), a `bg-bk-ink` pill reads «نفد المخزون» / "Sold out" / «لە کۆگا نەماوە», and the price is faint with no struck compare-at. With `query.sold_out_last` these cards come after every orderable product. The partition happens **before** `limit`, so a sold-out best seller gives its slot to something orderable.
- Tags come only from product data (`products.brand`, `products.gender`, approved-review aggregates). If the data is missing there is no tag, never a placeholder. The rating tag needs `show_stars` and `review_count > 0`.
- Arabic visual order comes from classes only. The `<ul>` gets `flex-row-reverse`, so in an LTR document the scroll origin is the right edge. Cards snap with `snap-end` in Arabic and `snap-start` in English. Text blocks use `text-right` / `items-end`, and tag rows use `flex-row-reverse`. There is no `dir` attribute.
- Motion: snap scrolling only. There is no transform animation; `PRESSABLE` already carries `motion-reduce:transition-none`.

### Data (read 2026-10-22, project `sduvpgqwhxragxtxztur`)

- The PDP's `ctx.products` is `listProducts(tenant.id, { limit: 24, withAttributes: true })` (`apps/storefront/app/s/[tenant]/products/[slug]/page.tsx:98`). It selects `PRODUCT_COLUMNS`, which already includes `brand, gender, display_name, bestseller_rank, stock_quantity, reserved_quantity` (`apps/storefront/lib/queries.ts:165`). **No query change is needed.**
- 43 visible products. Best-seller ranks 1 (خير فيوجن, stock −5) and 3 (برسيفيرون, stock −86, reserved 1) are **oversold**, so today the shelf opens with two sold-out cards. `مينيا` is 1 on hand with 2 reserved.
- 43 orderable-listing products (visible, active, not archived, not supply). Brand is set on 36, gender on only 12 (men 7, women 1, unisex 4), and 3 are sold out or oversold. Most cards therefore show the brand tag only, which is truthful.

### Props

| section | new field | type | effect when unset |
|---|---|---|---|
| `product_grid` | `layout` | `"grid" \| "row"`, `.optional().catch(undefined)` | today's grid, byte-identical |
| `product_grid` | `query.sold_out_last` | `boolean`, `.optional().catch(undefined)` | today's order, byte-identical |
| `site_footer` | `wordmark_i18n` | `i18nStringOptional.catch(undefined)` | tenant `business_name`, byte-identical |

The row reads the existing `heading_i18n`, `subheading_i18n`, `see_all_href`, `see_all_label_i18n` and `show_stars` fields. It does not render `eyebrow_i18n`.

### Draft config (scheniders-iraq, rev 38, applied in Task 6)

- PDP `product_grid` section `acb81db0-60f4-4dba-b39c-45cf5f749fce` (`pages[2].sections[6]`): `layout: "row"` and `query.sold_out_last: true`. Heading, sort (`bestsellers`, limit 8), `show_stars` and see-all stay as they are.
- Footer `7be7c06b-b16e-463b-8c68-aa7a215e50bb` (`globals.footer.base`):
  - `wordmark_i18n = {"ar":"شنايدر","en":"Scheniders"}`. This is the header's `wordmark_i18n` verbatim. Today the footer prints `business_name` "Scheniders Iraq".
  - `newsletter.copy_i18n`: the «ستحصل فورا على كوبون خصم 15%» clause is removed. The new value is `{"ar":"كن أول من يعرف آخر الاخبار عن متجرنا.","en":"Be the first to hear our news."}`.
  - `newsletter.success_i18n`: the «كود الخصم مالتك: WELCOME15» line is replaced with `{"ar":"تم الاشتراك، شكراً إلك!","en":"You are subscribed, thank you!"}`. The key is not deleted, because without it the API falls back to the chrome line "تم! تحقق من بريدك.", which promises an email that nothing sends.
  - Why the coupon is unredeemable: the only order path the shop links to is the PDP direct order, which has no code field. `/cart` and `/checkout`, where `commerce.discounts` (WELCOME15) is read, are URL-only. The coupon is config-owned (`newsletter.copy_i18n` / `success_i18n`), so **no hide-coupon prop is needed**.
  - Social links are **not changed**: `instagram: https://www.instagram.com/kawkab.brand/`, `tiktok: https://www.tiktok.com/@kawkab.brand`. These are a merchant gap.

### Files

| file | responsibility |
|---|---|
| Create `packages/sections/src/helpers/stock.ts` | `unitsLeft` / `isBuyable`: one definition of "can be ordered" for the new code |
| Create `packages/sections/src/product_grid.row.tsx` | `ProductRow` + `RowCard`, the row layout's markup |
| Modify `packages/sections/src/product_grid.tsx` | schema fields, `soldOutLast` partition in selection, early `row` branch |
| Modify `packages/sections/src/pdp_express/identity-label.tsx` | `export` the existing `Tag` and `GENDER_ICON` (no markup change) |
| Modify `packages/sections/src/helpers/chrome-strings.ts` | `sold_out` chrome string (ar / en / ku) |
| Modify `packages/sections/src/site_footer.tsx` | `wordmark_i18n` schema field |
| Modify `packages/sections/src/site_footer.client.tsx` | render the wordmark in both layouts |
| Create `packages/sections/src/_product-grid-baseline-snapshot.test.tsx` (+ `.snap`) | T0 pin of today's product_grid markup |
| Create `packages/sections/src/_site-footer-baseline-snapshot.test.tsx` (+ `.snap`) | T0 pin of today's footer markup |
| Create `packages/sections/src/_product-grid-row.test.tsx` | selection + row behaviour |
| Create `packages/sections/src/site_footer.wordmark.test.tsx` | footer wordmark behaviour |

---

### Task 1: Pin today's product_grid markup (T0, before any edit)

**Files:**
- Create: `packages/sections/src/_product-grid-baseline-snapshot.test.tsx`
- Create (generated): `packages/sections/src/__snapshots__/_product-grid-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Confirm the branch and a clean section tree**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git status --porcelain packages/sections
```
Expected: `feat/pdp-lower-sections`, and no modified files under `packages/sections`.

- [ ] **Step 2: Write the snapshot test**

```tsx
// =====================================================================
// T0 — product_grid renders, frozen before the opt-in "row" layout and
// `query.sold_out_last` land
// =====================================================================
// Server-markup snapshots of the section's defaults and of a frozen copy of
// scheniders-iraq's draft PDP instance (section acb81db0-…, config rev 38,
// read 2026-10-22). Inlined on purpose: a config edit must not be able to
// re-baseline this. With neither new field set, these renders must stay
// byte-identical. A diff is a back-compat break, not a snapshot to refresh.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import product_grid, { selectProducts } from "./product_grid";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  FIXTURE_NOW,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
} from "./_pdp-fixtures";

type Props = typeof product_grid.defaultProps;

const IRAQ_PDP_GRID_PROPS: Props = {
  mode: "auto",
  query: { sort: "bestsellers", limit: 8 },
  card_style: "price_pill",
  show_stars: true,
  eyebrow_i18n: { ar: "القطع المميزة لهذا الشهر", en: "This month's standouts" },
  heading_i18n: { ar: "اكثر منتجاتنا مبيعاً", en: "Our best sellers" },
  see_all_href: "/products",
  scribble_color: "butter",
  subheading_i18n: {
    ar: "شوف تشكيلة من اكثر العطور اللي حبوها زبائنا",
    en: "A selection of the perfumes our customers loved most",
  },
  manual_product_ids: [],
  pinned_product_ids: [],
  see_all_label_i18n: { ar: "عرض المزيد", en: "Show more" },
};

const VIEWED: Product = {
  ...plainProduct,
  id: "p-viewed",
  slug: "p-viewed",
  name: "المنتج المعروض",
  bestseller_rank: 3,
};

const PRODUCTS: Product[] = [
  {
    ...soldOutProduct,
    id: "p-sold",
    slug: "p-sold",
    name: "عطر فيوجن",
    bestseller_rank: 1,
    brand: "باريس كورنر",
    gender: "unisex",
  },
  {
    ...saleProduct,
    id: "p-sale",
    slug: "p-sale",
    bestseller_rank: 2,
    brand: "باريس كورنر",
    gender: "men",
  },
  { ...plainProduct, id: "p-plain", slug: "p-plain", bestseller_rank: null },
  VIEWED,
];

const homeRuntime = { ...productRuntime, page_id: "home" as const };

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  const Section = product_grid.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section
        props={props}
        ctx={productCtx(product, { products: PRODUCTS, ...overrides })}
      />
    </StoreBaseProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("product_grid baseline — defaultProps", () => {
  it("home", () => {
    expect(
      render(product_grid.defaultProps, undefined, { runtime: homeRuntime }),
    ).toMatchSnapshot();
  });

  it("product page", () => {
    expect(render(product_grid.defaultProps, VIEWED)).toMatchSnapshot();
  });
});

describe("product_grid baseline — frozen scheniders-iraq PDP props", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = product_grid.schema.safeParse(IRAQ_PDP_GRID_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_PDP_GRID_PROPS);
  });

  it("arabic", () => {
    expect(render(IRAQ_PDP_GRID_PROPS, VIEWED)).toMatchSnapshot();
  });

  it("english", () => {
    expect(
      render(IRAQ_PDP_GRID_PROPS, VIEWED, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("selection order: sold-out best seller still leads today", () => {
    const ids = selectProducts(
      IRAQ_PDP_GRID_PROPS,
      productCtx(VIEWED, { products: PRODUCTS }),
    ).map((p) => p.id);
    expect(ids).toEqual(["p-sold", "p-sale", "p-plain"]);
  });
});
```

- [ ] **Step 3: Write the snapshots once (new file, so no `CI=true`)**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm exec vitest run packages/sections/src/_product-grid-baseline-snapshot.test.tsx
```
Expected: `6 passed`, `4 written` snapshots.

- [ ] **Step 4: Re-run in CI mode to prove the pin is stable**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_product-grid-baseline-snapshot.test.tsx
```
Expected: `6 passed`, `4 passed` snapshots, 0 written.

- [ ] **Step 5: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_product-grid-baseline-snapshot.test.tsx.snap && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): pin product_grid default and scheniders-iraq PDP markup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pin today's site_footer markup (T0, before any edit)

**Files:**
- Create: `packages/sections/src/_site-footer-baseline-snapshot.test.tsx`
- Create (generated): `packages/sections/src/__snapshots__/_site-footer-baseline-snapshot.test.tsx.snap`

- [ ] **Step 1: Write the snapshot test**

```tsx
// =====================================================================
// T0 — site_footer renders, frozen before the opt-in `wordmark_i18n`
// =====================================================================
// Both layouts at their defaults, plus a frozen copy of scheniders-iraq's
// draft footer (globals.footer 7be7c06b-…, config rev 38, read 2026-10-22).
// The date is pinned because the default rights line prints the year.
// A diff here is a back-compat break, not a snapshot to refresh.
// =====================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { Props } from "./site_footer";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";
import {
  FIXTURE_NOW,
  fixtureTenant,
  productCtx,
  productRuntime,
} from "./_pdp-fixtures";

const IRAQ_FOOTER_PROPS: Props = {
  columns: [
    {
      heading_i18n: { ar: "معلومات عنا", en: "About us" },
      links: [
        { href: "/contact", label_i18n: { ar: "تواصل معنا", en: "Contact us" } },
        { href: "/about", label_i18n: { ar: "من نحن", en: "Who we are" } },
        { href: "/track", label_i18n: { ar: "تتبع الطلب", en: "Track your order" } },
        { href: "/policies/privacy", label_i18n: { ar: "سياسة الخصوصية", en: "Privacy policy" } },
        { href: "/policies/terms", label_i18n: { ar: "الشروط والاحكام", en: "Terms and conditions" } },
        { href: "/policies/returns", label_i18n: { ar: "سياسة الاسترجاع", en: "Return and refund policy" } },
        { href: "/policies/shipping", label_i18n: { ar: "سياسة الشحن", en: "Shipping policy" } },
      ],
    },
  ],
  contact: {
    address_i18n: { ar: "العراق - بغداد - زيونة", en: "Iraq - Baghdad - Zayouna" },
  },
  layout: "info_panel",
  legal: { business_license: "310536983500003", company_name: "Schnieder - شنايدر" },
  links_heading_i18n: { ar: "معلومات عنا", en: "About us" },
  newsletter: {
    button_i18n: { ar: "اشترك", en: "Subscribe" },
    copy_i18n: {
      ar: "كن أول من يعرف آخر الاخبار عن متجرنا، عند انضمامك ستحصل فورا على كوبون خصم 15% على منتجاتنا.",
      en: "Be the first to hear our news — join and instantly get a 15% coupon.",
    },
    enabled: true,
    placeholder_i18n: { ar: "ادخل بريدك الالكتروني هنا", en: "Enter your email here" },
    success_i18n: {
      ar: "تم الاشتراك! كود الخصم مالتك: WELCOME15",
      en: "You're in! Your discount code: WELCOME15",
    },
  },
  rights_i18n: {
    ar: "جميع الحقوق محفوظة لمجموعة شركات شنايدر",
    en: "All rights reserved to the Scheniders group",
  },
  show_cod_badge: false,
  social_links: {
    instagram: "https://www.instagram.com/kawkab.brand/",
    tiktok: "https://www.tiktok.com/@kawkab.brand",
  },
  tagline_i18n: {
    ar: "عطور فخمة فائقة الجودة بأسعار تنافسية",
    en: "Premium, top-quality perfumes at competitive prices",
  },
};

const iraqTenant: Tenant = { ...fixtureTenant, business_name: "Scheniders Iraq" };
const homeRuntime = { ...productRuntime, page_id: "home" as const };

function render(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = site_footer.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(undefined, { runtime: homeRuntime, ...overrides })} />
    </StoreBaseProvider>,
  );
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("site_footer baseline — defaults", () => {
  it("bento (arabic)", () => {
    expect(render(site_footer.defaultProps)).toMatchSnapshot();
  });

  it("bento (kurdish)", () => {
    expect(
      render(site_footer.defaultProps, { runtime: { ...homeRuntime, locale: "ku" } }),
    ).toMatchSnapshot();
  });

  it("info_panel (arabic)", () => {
    expect(render({ ...site_footer.defaultProps, layout: "info_panel" })).toMatchSnapshot();
  });
});

describe("site_footer baseline — frozen scheniders-iraq footer", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = site_footer.schema.safeParse(IRAQ_FOOTER_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_FOOTER_PROPS);
  });

  it("arabic", () => {
    expect(render(IRAQ_FOOTER_PROPS, { tenant: iraqTenant })).toMatchSnapshot();
  });

  it("english", () => {
    expect(
      render(IRAQ_FOOTER_PROPS, {
        tenant: iraqTenant,
        runtime: { ...homeRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Write the snapshots once (new file, so no `CI=true`)**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm exec vitest run packages/sections/src/_site-footer-baseline-snapshot.test.tsx
```
Expected: `6 passed`, `5 written`.

- [ ] **Step 3: Re-run in CI mode**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_site-footer-baseline-snapshot.test.tsx
```
Expected: `6 passed`, 0 written.

- [ ] **Step 4: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/__snapshots__/_site-footer-baseline-snapshot.test.tsx.snap && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "test(sections): pin site_footer default and scheniders-iraq markup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `query.sold_out_last`: orderable products first

**Files:**
- Create: `packages/sections/src/helpers/stock.ts`
- Modify: `packages/sections/src/product_grid.tsx` (schema `query` object, about lines 47-58; `selectAuto`, about lines 141-197; `selectProducts`, about lines 204-228)
- Test: `packages/sections/src/_product-grid-row.test.tsx` (new)

- [ ] **Step 1: Write the failing selection tests**

Create `packages/sections/src/_product-grid-row.test.tsx`:

```tsx
// =====================================================================
// product_grid — opt-in `query.sold_out_last` and `layout: "row"`
// =====================================================================
// The PDP's related shelf on scheniders-iraq opened with two sold-out best
// sellers (ranks 1 and 3 are oversold). `sold_out_last` keeps them but
// after everything orderable, and before `limit` so they give up their
// slots. The row layout is a compact snap row whose tags come straight from
// product data. Unset, both leave the grid byte-identical (see
// _product-grid-baseline-snapshot).
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import product_grid, { selectProducts } from "./product_grid";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { plainProduct, productCtx, productRuntime } from "./_pdp-fixtures";

type Props = typeof product_grid.defaultProps;

const IMG = "https://cdn.example.com/row/";

/** Oversold best seller (live: خير فيوجن, stock −5). */
const fusion: Product = {
  ...plainProduct,
  id: "p-fusion",
  slug: "fusion",
  name: "عطر فيوجن الفاخر للرجال والنساء",
  display_name: "خير فيوجن",
  brand: "باريس كورنر",
  gender: "unisex",
  price: 36750,
  compare_at_price: 45000,
  image_url: `${IMG}fusion.jpg`,
  stock_quantity: -5,
  reserved_quantity: 0,
  bestseller_rank: 1,
};

const weaver: Product = {
  ...plainProduct,
  id: "p-weaver",
  slug: "weaver",
  name: "عطر ويفر انتنس الفاخر من باريس كورنر للرجال",
  display_name: "ويفر انتنس",
  brand: "باريس كورنر",
  gender: "men",
  price: 36750,
  compare_at_price: 48500,
  image_url: `${IMG}weaver.jpg`,
  stock_quantity: 53,
  reserved_quantity: 0,
  bestseller_rank: 2,
  review_count: 12,
  avg_rating: 4.6,
};

/** No brand, no gender, no sale — the card shows no tags at all. */
const ibsco: Product = {
  ...plainProduct,
  id: "p-ibsco",
  slug: "ibsco",
  name: "ايبسكو",
  brand: null,
  gender: null,
  price: 48000,
  compare_at_price: null,
  image_url: `${IMG}ibsco.jpg`,
  stock_quantity: 2,
  reserved_quantity: 0,
  bestseller_rank: 7,
};

/** Sold out through reservations, not stock (live: مينيا, 1 on hand, 2 reserved). */
const minya: Product = {
  ...plainProduct,
  id: "p-minya",
  slug: "minya",
  name: "مينيا",
  stock_quantity: 1,
  reserved_quantity: 2,
  bestseller_rank: 8,
};

const viewed: Product = {
  ...plainProduct,
  id: "p-viewed",
  slug: "viewed",
  name: "المنتج المعروض",
  bestseller_rank: 3,
};

const PRODUCTS = [fusion, weaver, ibsco, minya, viewed];

const BEST: Props = {
  ...product_grid.defaultProps,
  query: { sort: "bestsellers", limit: 8 },
};

function ids(props: Props, products: Product[] = PRODUCTS): string[] {
  return selectProducts(props, productCtx(viewed, { products })).map((p) => p.id);
}

describe("product_grid — query.sold_out_last", () => {
  it("leaves the order untouched when unset", () => {
    expect(ids(BEST)).toEqual(["p-fusion", "p-weaver", "p-ibsco", "p-minya"]);
  });

  it("puts orderable products first and sold-out ones last, each in rank order", () => {
    expect(
      ids({ ...BEST, query: { sort: "bestsellers", limit: 8, sold_out_last: true } }),
    ).toEqual(["p-weaver", "p-ibsco", "p-fusion", "p-minya"]);
  });

  it("partitions before the limit, so sold-out products give up their slots", () => {
    expect(
      ids({ ...BEST, query: { sort: "bestsellers", limit: 2, sold_out_last: true } }),
    ).toEqual(["p-weaver", "p-ibsco"]);
  });

  it("applies to a manual list too", () => {
    expect(
      ids({
        ...BEST,
        mode: "manual",
        manual_product_ids: ["p-fusion", "p-ibsco"],
        query: { sold_out_last: true },
      }),
    ).toEqual(["p-ibsco", "p-fusion"]);
  });

  it("parses a malformed value as unset instead of dropping the section", () => {
    const parsed = product_grid.schema.parse({
      ...product_grid.defaultProps,
      query: { sort: "newest", sold_out_last: "yes" },
    });
    expect(parsed.query?.sold_out_last).toBeUndefined();
    expect(parsed.query?.sort).toBe("newest");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_product-grid-row.test.tsx
```
Expected: FAIL. 3 failed, 2 passed. "puts orderable products first…", "partitions before the limit…" and "applies to a manual list too" fail because the order is unchanged. "leaves the order untouched" passes, which is correct. "parses a malformed value…" also passes for now, because zod strips the unknown key. After Step 4 it passes because of `.catch(undefined)`.

- [ ] **Step 3: Add the stock helper**

Create `packages/sections/src/helpers/stock.ts`:

```ts
// =====================================================================
// Stock — one definition of "a shopper can order this"
// =====================================================================
// Units on hand minus units already reserved by open orders. Negative when
// the product is oversold, which the live catalogue does have (−5, −86):
// such a product is sold out, never "in stock".
// =====================================================================

import type { Product } from "../types";

/** Units a shopper could still order; negative when oversold. */
export function unitsLeft(product: Product): number {
  return (product.stock_quantity ?? 0) - (product.reserved_quantity ?? 0);
}

/** True when at least one unit can still be ordered. */
export function isBuyable(product: Product): boolean {
  return unitsLeft(product) > 0;
}
```

- [ ] **Step 4: Implement the partition in `product_grid.tsx`**

4a. Add the import next to the other helper imports (after `import { chromeString } from "./helpers/chrome-strings";`):

```ts
import { isBuyable } from "./helpers/stock";
```

4b. In the `query` object of `schema`, directly after `exclude_out_of_stock: z.boolean().optional(),` add:

```ts
      /**
       * Keep sold-out products, but after every product a shopper can
       * order. Applied before `limit`, so a sold-out best seller gives its
       * slot to something orderable instead of leading the shelf. Opt-in:
       * unset leaves today's order untouched. `.catch` so a malformed
       * stored value reads as unset rather than dropping the section.
       */
      sold_out_last: z.boolean().optional().catch(undefined),
```

4c. Directly above `function selectAuto(`, add:

```ts
/** Stable partition: orderable products first, sold-out and oversold ones
 *  after, each half in the order it arrived. */
function soldOutLast(products: Product[]): Product[] {
  return [
    ...products.filter((p) => isBuyable(p)),
    ...products.filter((p) => !isBuyable(p)),
  ];
}
```

4d. In `selectAuto`, replace

```ts
  if (query?.limit && pool.length > query.limit) {
    pool = pool.slice(0, query.limit);
  }
  return pool;
```

with

```ts
  if (query?.sold_out_last) pool = soldOutLast(pool);
  if (query?.limit && pool.length > query.limit) {
    pool = pool.slice(0, query.limit);
  }
  return pool;
```

4e. In `selectProducts`, replace the `manual` and `mixed` branches:

```ts
  if (props.mode === "manual") {
    const manual = (props.manual_product_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);
    return props.query?.sold_out_last ? soldOutLast(manual) : manual;
  }
  if (props.mode === "mixed") {
    const pinned = (props.pinned_product_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p);
    const pinnedIds = new Set(pinned.map((p) => p.id));
    const fill = selectAuto(
      ctx.products.filter((p) => !pinnedIds.has(p.id)),
      props.query,
      ctx.product?.id,
    );
    const limit = props.query?.limit ?? Infinity;
    const merged = [...pinned, ...fill];
    return (props.query?.sold_out_last ? soldOutLast(merged) : merged).slice(0, limit);
  }
```

- [ ] **Step 5: Run the new tests, the T0 pin, the existing grid tests, and the type-check**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_product-grid-row.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_pdp-social.test.tsx packages/sections/src/_chrome.test.tsx packages/sections/src/product-card.test.tsx && pnpm --filter @scheniders/storefront type-check
```
Expected: all pass, the baseline snapshots match with 0 written, and tsc exits 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/sections/src/helpers/stock.ts packages/sections/src/product_grid.tsx packages/sections/src/_product-grid-row.test.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(product-grid): opt-in sold_out_last lists orderable products first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `layout: "row"`, the compact related row

**Files:**
- Create: `packages/sections/src/product_grid.row.tsx`
- Modify: `packages/sections/src/product_grid.tsx` (schema; early branch in `ProductGridRender` right after the `return null` empty check at about line 649)
- Modify: `packages/sections/src/pdp_express/identity-label.tsx` (`const GENDER_ICON` → `export const`, `function Tag` → `export function`)
- Modify: `packages/sections/src/helpers/chrome-strings.ts` (add `sold_out`)
- Test: `packages/sections/src/_product-grid-row.test.tsx` (append)

- [ ] **Step 1: Append the failing row tests**

Append to `packages/sections/src/_product-grid-row.test.tsx`:

```tsx
const ROW: Props = {
  ...product_grid.defaultProps,
  layout: "row",
  query: { sort: "bestsellers", limit: 8, sold_out_last: true },
  heading_i18n: { ar: "اكثر منتجاتنا مبيعاً", en: "Our best sellers" },
  see_all_href: "/products",
  see_all_label_i18n: { ar: "عرض المزيد", en: "Show more" },
  show_stars: true,
};

function renderRow(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = product_grid.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(viewed, { products: PRODUCTS, ...overrides })} />
    </StoreBaseProvider>,
  );
}

/** The markup of one card, from its opening <a> to the next card. */
function card(html: string, id: string): string {
  const start = html.indexOf(`data-product-card="${id}"`);
  expect(start, `no card ${id}`).toBeGreaterThan(-1);
  const next = html.indexOf("data-product-card=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

/** The opening tag of the scrolling list. */
function rowList(html: string): string {
  const m = html.match(/<ul[^>]*data-layer="cards"[^>]*>/);
  expect(m, "no card list").not.toBeNull();
  return m ? m[0] : "";
}

describe("product_grid — layout: row", () => {
  it("renders a snap row of compact cards, orderable first, never the viewed product", () => {
    const html = renderRow(ROW);
    expect(html).toContain('data-layout="row"');
    expect(rowList(html)).toContain("snap-x");
    const order = [...html.matchAll(/data-product-card="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["p-weaver", "p-ibsco", "p-fusion", "p-minya"]);
  });

  it("reverses the row's visual order for Arabic with a class, never dir", () => {
    const ar = renderRow(ROW);
    expect(rowList(ar)).toContain("flex-row-reverse");
    expect(ar).not.toMatch(/\sdir="rtl"/);
    const en = renderRow(ROW, { runtime: { ...productRuntime, locale: "en" } });
    expect(rowList(en)).not.toContain("flex-row-reverse");
  });

  it("tags the maker and the audience from product data", () => {
    const w = card(renderRow(ROW), "p-weaver");
    expect(w).toContain('data-tag="brand"');
    expect(w).toContain("الشركة:");
    expect(w).toContain("باريس كورنر");
    expect(w).toContain('data-tag="gender"');
    expect(w).toContain("رجالي");
    // The public display name, not the long marketing name.
    expect(w).toContain("ويفر انتنس");
    expect(w).not.toContain("الفاخر من باريس كورنر للرجال");
  });

  it("shows no tag a product has no data for", () => {
    const i = card(renderRow(ROW), "p-ibsco");
    expect(i).not.toContain("data-tag=");
  });

  it("shows a real rating only with show_stars and reviews", () => {
    const on = card(renderRow(ROW), "p-weaver");
    expect(on).toContain('data-tag="rating"');
    expect(on).toContain("4.6");
    expect(on).toContain("(12)");
    const off = card(renderRow({ ...ROW, show_stars: false }), "p-weaver");
    expect(off).not.toContain('data-tag="rating"');
    expect(card(renderRow(ROW), "p-ibsco")).not.toContain('data-tag="rating"');
  });

  it("marks sold-out and oversold products, in every locale", () => {
    const html = renderRow(ROW);
    for (const id of ["p-fusion", "p-minya"]) {
      const c = card(html, id);
      expect(c).toContain("data-sold-out");
      expect(c).toContain("نفد المخزون");
    }
    const f = card(html, "p-fusion");
    expect(f).toContain("grayscale");
    // A struck price on something you cannot buy is a discount you cannot get.
    expect(f).not.toContain("data-compare-at");
    expect(card(html, "p-weaver")).not.toContain("data-sold-out");
    expect(card(html, "p-weaver")).toContain("data-compare-at");
    expect(
      card(renderRow(ROW, { runtime: { ...productRuntime, locale: "ku" } }), "p-fusion"),
    ).toContain("لە کۆگا نەماوە");
    expect(
      card(renderRow(ROW, { runtime: { ...productRuntime, locale: "en" } }), "p-fusion"),
    ).toContain("Sold out");
  });

  it("offers a full-size see-all link", () => {
    const html = renderRow(ROW);
    const link = html.match(/<a[^>]*data-i18n-field="see_all_label_i18n"[^>]*>/);
    expect(link).not.toBeNull();
    expect(link?.[0]).toContain('href="/s/fixture-store/products"');
    expect(link?.[0]).toContain("min-h-11");
    expect(html).toContain("عرض المزيد");
  });

  it("renders nothing when there is nothing to show", () => {
    expect(renderRow(ROW, { products: [viewed] })).toBe("");
  });

  it("layout: grid is the same render as no layout", () => {
    const noLayout: Props = { ...ROW, layout: undefined };
    expect(renderRow({ ...ROW, layout: "grid" })).toBe(renderRow(noLayout));
  });

  it("parses an unknown layout as unset", () => {
    const parsed = product_grid.schema.parse({
      ...product_grid.defaultProps,
      layout: "carousel",
    });
    expect(parsed.layout).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_product-grid-row.test.tsx
```
Expected: the five `sold_out_last` tests pass. Every `layout: row` test fails except three: "renders nothing…" (a viewed-only list already renders ""), "layout: grid is the same render…" (render receives props unparsed and today's code ignores `layout`, so both are the standard grid), and "parses an unknown layout as unset" (zod strips the unknown key). The rest fail with "no card list" or a missing `data-layout="row"`.

- [ ] **Step 3: Export the express tag pieces (no markup change)**

In `packages/sections/src/pdp_express/identity-label.tsx`:
- replace `const GENDER_ICON = { men: "man", women: "woman", unisex: "wc" } as const;` with
  `export const GENDER_ICON = { men: "man", women: "woman", unisex: "wc" } as const;`
- replace `function Tag({` with `export function Tag({`

- [ ] **Step 4: Add the `sold_out` chrome string**

In `packages/sections/src/helpers/chrome-strings.ts`, directly after the `price_before_discount` entry, add:

```ts
  /** Pill on a product card whose stock is gone (or oversold). */
  sold_out: { ar: "نفد المخزون", en: "Sold out", ku: "لە کۆگا نەماوە" },
```

- [ ] **Step 5: Create the row component**

Create `packages/sections/src/product_grid.row.tsx`:

```tsx
// =====================================================================
// product_grid — "row" layout
// =====================================================================
// A horizontal, snap-scrolling row of compact product cards for the foot of
// a product page: the photo, the perfume's public name, who makes it
// («الشركة: …») and who it is for — both straight from product data and
// absent when the merchant has not entered them — the real rating, and the
// price. A sold-out product is greyed and labelled, never dressed up as
// orderable; `query.sold_out_last` puts such products after everything a
// shopper can order.
//
// Server component: native CSS scroll-snap, no JavaScript. Arabic-script
// locales reverse the row's VISUAL order with a class (the document stays
// LTR), so the first card sits at the right edge and the row scrolls
// leftwards, the way an Arabic reader expects. From `lg` up it is a plain
// four-column grid, so a mouse never has to drag a scrollbar-less strip.
// The visual language is the express PDP's: hairline cards and quiet tags.
// =====================================================================

import Image from "next/image";
import type { LocaleCode } from "@scheniders/shared";
import { MaterialIcon, Section, Stars } from "./helpers/primitives";
import { StoreLink } from "./helpers/store-context";
import { chromeString } from "./helpers/chrome-strings";
import { formatPrice } from "./helpers/format";
import { isBuyable } from "./helpers/stock";
import { cn, PRESSABLE } from "./helpers/utils";
import { displayNameOf, GENDER_ICON, Tag } from "./pdp_express/identity-label";
import { readsRtl, xs } from "./pdp_express/text";
import type { Product } from "./types";

/** Compact tag sizing — the express tags are sized for a full-width h1 row. */
const TAG_COMPACT = "h-6 px-2 text-[11px]";

function RowCard({
  product,
  locale,
  showRating,
}: {
  product: Product;
  locale: LocaleCode;
  showRating: boolean;
}) {
  const rtl = readsRtl(locale);
  const buyable = isBuyable(product);
  const brand = product.brand?.trim();
  const gender = product.gender;
  const compareAt = product.compare_at_price;
  const onSale = buyable && compareAt != null && compareAt > product.price;
  const reviewCount = product.review_count ?? 0;
  const avgRating = product.avg_rating ?? 0;
  const rating = showRating && reviewCount > 0;

  return (
    <li
      className={cn(
        "w-[44%] shrink-0 sm:w-[30%] lg:w-auto",
        rtl ? "snap-end" : "snap-start",
      )}
    >
      <StoreLink
        href={`/products/${product.slug ?? product.id}`}
        data-product-card={product.id}
        data-sold-out={buyable ? undefined : ""}
        className={cn("group block h-full", PRESSABLE)}
      >
        <article className="flex h-full flex-col overflow-hidden rounded-bk-card border-bk border-bk-divider bg-bk-surface">
          <div className="relative aspect-square overflow-hidden bg-bk-surface-alt">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
                className={cn("object-cover", !buyable && "opacity-60 grayscale")}
              />
            ) : null}
            {!buyable && (
              <span
                className={cn(
                  "absolute top-2 inline-flex h-6 items-center rounded-bk-pill bg-bk-ink px-2 font-bk-body text-[11px] font-bold text-bk-surface",
                  rtl ? "right-2" : "left-2",
                )}
              >
                {chromeString("sold_out", locale)}
              </span>
            )}
          </div>
          <div
            className={cn(
              "flex flex-1 flex-col gap-1.5 p-2.5",
              rtl ? "items-end text-right" : "items-start text-left",
            )}
          >
            <h3 className="line-clamp-2 font-bk-display text-[15px] font-bold leading-snug text-bk-ink">
              {displayNameOf(product)}
            </h3>
            {(brand || gender || rating) && (
              <div className={cn("flex w-full flex-wrap gap-1", rtl && "flex-row-reverse")}>
                {brand && (
                  <Tag strong className={cn(TAG_COMPACT, "min-w-0 max-w-full")} data-tag="brand">
                    {/* <bdi> takes its direction from the label, so «الشركة:»
                        leads on the right even when the brand is Latin. */}
                    <bdi className="min-w-0 truncate">
                      <span className="font-medium">{xs("brandLabel", locale)}</span>{" "}
                      <span translate="no">{brand}</span>
                    </bdi>
                  </Tag>
                )}
                {gender && (
                  <Tag className={cn(TAG_COMPACT, rtl && "flex-row-reverse")} data-tag="gender">
                    <MaterialIcon name={GENDER_ICON[gender]} className="text-sm" />
                    {xs(gender, locale)}
                  </Tag>
                )}
                {rating && (
                  <Tag
                    className={cn(TAG_COMPACT, "text-bk-ink", rtl && "flex-row-reverse")}
                    data-tag="rating"
                  >
                    {/* One glyph and the real average — five rounded stars
                        overstate a 4.6 as a 5. */}
                    <Stars value={1} max={1} size={11} label={`${avgRating.toFixed(1)} / 5`} />
                    <bdi className="tabular-nums">{avgRating.toFixed(1)}</bdi>
                    <span className="font-normal text-bk-ink-soft tabular-nums">
                      <bdi>({reviewCount})</bdi>
                    </span>
                  </Tag>
                )}
              </div>
            )}
            <div
              className={cn(
                "mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1",
                rtl && "flex-row-reverse",
              )}
            >
              <span
                className={cn(
                  "font-bk-display text-base font-black tabular-nums",
                  buyable ? "text-bk-ink" : "text-bk-ink-faint",
                )}
              >
                <bdi>{formatPrice(product.price, locale)}</bdi>
              </span>
              {onSale && compareAt != null && (
                <span
                  data-compare-at
                  className="font-bk-body text-xs text-bk-ink-faint line-through tabular-nums"
                >
                  <bdi>{formatPrice(compareAt, locale)}</bdi>
                </span>
              )}
            </div>
          </div>
        </article>
      </StoreLink>
    </li>
  );
}

export function ProductRow({
  products,
  locale,
  heading,
  subheading,
  seeAllHref,
  seeAllLabel,
  showRating,
}: {
  products: Product[];
  locale: LocaleCode;
  heading: string;
  subheading: string;
  seeAllHref?: string;
  seeAllLabel: string;
  showRating: boolean;
}) {
  if (products.length === 0) return null;
  const rtl = readsRtl(locale);

  return (
    <Section data-layout="row">
      {(heading || seeAllHref) && (
        <div
          className={cn(
            "mb-bk-sm flex items-end justify-between gap-bk-sm",
            rtl && "flex-row-reverse",
          )}
        >
          <div className={cn("min-w-0", rtl ? "text-right" : "text-left")}>
            {heading && (
              <h2
                data-i18n-field="heading_i18n"
                className="font-bk-display text-[22px] font-black leading-tight text-bk-ink text-balance"
              >
                {heading}
              </h2>
            )}
            {subheading && (
              <p
                data-i18n-field="subheading_i18n"
                className="mt-1 font-bk-body text-sm text-bk-ink-soft"
              >
                {subheading}
              </p>
            )}
          </div>
          {seeAllHref && (
            <StoreLink
              href={seeAllHref}
              data-i18n-field="see_all_label_i18n"
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1 font-bk-body text-sm font-bold text-bk-ink underline underline-offset-4",
                rtl && "flex-row-reverse",
                PRESSABLE,
              )}
            >
              {seeAllLabel || chromeString("see_all", locale)}
              <MaterialIcon name={rtl ? "arrow_back" : "arrow_forward"} className="text-base" />
            </StoreLink>
          )}
        </div>
      )}
      <ul
        data-layer="cards"
        data-layer-label="Product cards"
        className={cn(
          // Bleeds past the section gutter on a phone so the next card
          // visibly peeks at the screen edge, the cue that it scrolls.
          "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-bk-sm overflow-x-auto px-4 pb-1",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0",
          rtl && "flex-row-reverse",
        )}
      >
        {products.map((product) => (
          <RowCard
            key={product.id}
            product={product}
            locale={locale}
            showRating={showRating}
          />
        ))}
      </ul>
    </Section>
  );
}
```

- [ ] **Step 6: Wire it into `product_grid.tsx`**

6a. Import (after the `CatalogGrid` import):

```ts
import { ProductRow } from "./product_grid.row";
```

6b. Schema: directly after the `card_style: z.enum(["standard", "price_pill"]).default("standard"),` line, add:

```ts
  /**
   * "row" = a compact horizontal snap row (maker / audience tags, orderable
   * first when paired with `query.sold_out_last`), built for the foot of a
   * product page. Unset or "grid" renders exactly as before. `.catch` so a
   * malformed stored value reads as unset rather than dropping the section.
   */
  layout: z.enum(["grid", "row"]).optional().catch(undefined),
```

6c. In `ProductGridRender`, directly after

```ts
  if ((category ? ctx.products.length : items.length) === 0) return null;
```

insert:

```ts
  // ---- row branch (opt-in) ----------------------------------------------
  // An early return like price_pill's, so every stored config without
  // `layout: "row"` keeps its markup byte-for-byte.
  if (props.layout === "row") {
    return (
      <ProductRow
        products={items}
        locale={locale}
        heading={heading}
        subheading={resolveI18n(props.subheading_i18n, locale)}
        seeAllHref={props.see_all_href}
        seeAllLabel={resolveI18n(props.see_all_label_i18n, locale)}
        showRating={props.show_stars === true}
      />
    );
  }
```

- [ ] **Step 7: Run the row tests, both T0 pins, the express snapshots, Kurdish coverage, the white-literal guard and the registry**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/_product-grid-row.test.tsx packages/sections/src/_product-grid-baseline-snapshot.test.tsx packages/sections/src/_pdp-express-snapshot.test.tsx packages/sections/src/_pdp-social.test.tsx packages/sections/src/_chrome.test.tsx packages/sections/src/_kurdish-coverage.test.ts packages/sections/src/_no-hardcoded-white.test.tsx packages/sections/src/_registry.test.ts packages/sections/src/_render-smoke.test.tsx
```
Expected: all pass, with 0 snapshots written or changed. If `_pdp-express-snapshot` changes, Step 3 changed express markup. Revert to a pure `export` keyword change.

- [ ] **Step 8: Type-check and lint**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/storefront lint
```
Expected: both tsc runs exit 0. Lint shows 0 errors (pre-existing warnings are allowed).

- [ ] **Step 9: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/sections/src/product_grid.row.tsx packages/sections/src/product_grid.tsx packages/sections/src/pdp_express/identity-label.tsx packages/sections/src/helpers/chrome-strings.ts packages/sections/src/_product-grid-row.test.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(product-grid): opt-in row layout with brand and gender tags

Compact snap row for the foot of a product page. Tags come from
products.brand / products.gender; sold-out cards are greyed and
labelled. Unset, the grid renders byte-identically (T0 snapshots).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `site_footer.wordmark_i18n`, one shop name

**Files:**
- Modify: `packages/sections/src/site_footer.tsx` (schema, after `layout`)
- Modify: `packages/sections/src/site_footer.client.tsx` (`SiteFooterRender`: the info_panel wordmark `<p>` at about lines 311-316, and the bento `BrandMark` at about lines 499-504)
- Test: `packages/sections/src/site_footer.wordmark.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// The footer printed the tenant's business_name ("Scheniders Iraq") while
// the header printed its own wordmark («شنايدر» / "Scheniders"): two names
// for one shop on every page. `wordmark_i18n` is the header's field,
// mirrored, opt-in. Unset, the footer is byte-identical
// (_site-footer-baseline-snapshot).

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import site_footer from "./site_footer";
import type { Props } from "./site_footer";
import type { SectionRenderContext } from "./_types";
import { FIXTURE_NOW, fixtureTenant, productCtx, productRuntime } from "./_pdp-fixtures";

const WORDMARK = { ar: "شنايدر", en: "Scheniders" };
const tenant = { ...fixtureTenant, business_name: "Scheniders Iraq" };
const homeRuntime = { ...productRuntime, page_id: "home" as const };

function render(props: Props, overrides: Partial<SectionRenderContext> = {}): string {
  const Section = site_footer.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Section props={props} ctx={productCtx(undefined, { tenant, runtime: homeRuntime, ...overrides })} />
    </StoreBaseProvider>,
  );
}

/** Text of the info_panel wordmark paragraph. */
function panelWordmark(html: string): string {
  const m = html.match(/<p class="font-display text-2xl[^"]*"[^>]*>([^<]*)<\/p>/);
  expect(m, "no wordmark paragraph").not.toBeNull();
  return m ? m[1] : "";
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("site_footer — wordmark_i18n", () => {
  const panel: Props = { ...site_footer.defaultProps, layout: "info_panel" };

  it("info_panel prints the configured wordmark per locale", () => {
    const ar = render({ ...panel, wordmark_i18n: WORDMARK });
    expect(panelWordmark(ar)).toBe("شنايدر");
    expect(ar).toContain('data-i18n-field="wordmark_i18n"');
    const en = render(
      { ...panel, wordmark_i18n: WORDMARK },
      { runtime: { ...homeRuntime, locale: "en" } },
    );
    expect(panelWordmark(en)).toBe("Scheniders");
  });

  it("info_panel keeps the business name when unset", () => {
    const html = render(panel);
    expect(panelWordmark(html)).toBe("Scheniders Iraq");
    expect(html).not.toContain('data-i18n-field="wordmark_i18n"');
  });

  it("bento shows the wordmark in the brand mark; the copyright keeps the legal name", () => {
    const html = render({ ...site_footer.defaultProps, wordmark_i18n: WORDMARK });
    expect(html).toContain("شنايدر");
    expect(html).toContain("© 2026 Scheniders Iraq");
  });

  it("parses a malformed value as unset", () => {
    const parsed = site_footer.schema.parse({ ...site_footer.defaultProps, wordmark_i18n: 42 });
    expect(parsed.wordmark_i18n).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/site_footer.wordmark.test.tsx
```
Expected: FAIL. 2 failed, 2 passed. "info_panel prints the configured wordmark" fails with `expected 'Scheniders Iraq' to be 'شنايدر'`, and the bento test fails because there is no «شنايدر». "keeps the business name when unset" passes, which is correct. "parses a malformed value" passes for now because zod strips the unknown key. After Step 3 it passes because of `.catch(undefined)`.

- [ ] **Step 3: Add the schema field**

In `packages/sections/src/site_footer.tsx`, directly after the `layout: z.enum(["bento", "info_panel"]).optional(),` line, add:

```ts
  /** The shop name in the footer lockup. Set it to the header's
   *  `wordmark_i18n` so the shop carries one name on every page. Unset
   *  keeps the tenant's business name. `.catch` so a malformed stored
   *  value reads as unset rather than dropping the footer. */
  wordmark_i18n: i18nStringOptional.catch(undefined),
```

- [ ] **Step 4: Render it**

In `packages/sections/src/site_footer.client.tsx`, inside `SiteFooterRender`, directly after `const name = ctx.tenant.business_name;`, add:

```ts
  // Opt-in shop name for the lockup. The copyright keeps `name`: that line
  // is a legal statement, not branding.
  const wordmark = props.wordmark_i18n
    ? resolveI18n(props.wordmark_i18n, locale)
    : "";
```

Replace the info_panel wordmark paragraph

```tsx
              <p
                className="font-display text-2xl font-black tracking-tight"
                style={{ fontFamily: "var(--bk-font-display, inherit)" }}
              >
                {name}
              </p>
```

with

```tsx
              <p
                className="font-display text-2xl font-black tracking-tight"
                style={{ fontFamily: "var(--bk-font-display, inherit)" }}
                {...(wordmark ? { "data-i18n-field": "wordmark_i18n" } : {})}
              >
                {wordmark || name}
              </p>
```

and in the bento `BrandMark`, replace `name={name}` with `name={wordmark || name}`.

- [ ] **Step 5: Run the wordmark test, the footer T0 pin and the existing footer tests**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections/src/site_footer.wordmark.test.tsx packages/sections/src/_site-footer-baseline-snapshot.test.tsx packages/sections/src/site_footer.links.test.tsx packages/sections/src/site_footer.reward.test.tsx packages/sections/src/site_footer.address.test.ts packages/sections/src/_chrome.test.tsx && pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check
```
Expected: all pass, with 0 snapshots changed, and both tsc runs exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/ali/scheniders-mono && git branch --show-current && git add packages/sections/src/site_footer.tsx packages/sections/src/site_footer.client.tsx packages/sections/src/site_footer.wordmark.test.tsx && git -c user.name=gga2000 -c user.email=gga2000@users.noreply.github.com commit -m "feat(site-footer): opt-in wordmark_i18n so footer and header share one name

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full-suite gate

- [ ] **Step 1: Every section and shared test, both type-checks, lint**

```bash
cd /Users/ali/scheniders-mono && export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:$PATH"; CI=true pnpm exec vitest run packages/sections packages/shared && pnpm --filter @scheniders/storefront type-check && pnpm --filter @scheniders/platform type-check && pnpm --filter @scheniders/storefront lint && pnpm --filter @scheniders/platform lint
```
Expected: 0 failed tests, 0 snapshots written or obsolete, tsc 0 errors, lint 0 errors. If anything fails, use the `systematic-debugging` skill. Never refresh a snapshot to make it pass.

---

### Task 7: scheniders-iraq draft config (draft only, never published here)

There are no repo files and no migration in this task. The config is jsonb and no schema changes. Run SQL with `supabase db query --linked` from `/Users/ali/scheniders-mono/packages`, because the MCP is unreliable. Never touch `store_config_v2` (published) and never call the publish RPC. Draft writes never bump `store_config_rev`; only publish does. The write is guarded on the rev that was read (38). **Before Step 2, make sure no store-builder tab is open for scheniders-iraq**, because its autosave would overwrite the draft. `updated_at = now()` makes any older local crash backup in the builder stale.

Write the SQL files below to the session scratchpad, not the repo.

- [ ] **Step 1: Preconditions (read-only)**

```sql
select t.store_config_rev,
       (select s.value -> 'base'
          from jsonb_array_elements(t.store_config_v2_draft -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where p.value ->> 'page_id' = 'product'
           and s.value ->> 'id' = 'acb81db0-60f4-4dba-b39c-45cf5f749fce') as grid,
       t.store_config_v2_draft -> 'globals' -> 'footer' ->> 'id' as footer_id,
       t.store_config_v2_draft -> 'globals' -> 'footer' -> 'base' -> 'newsletter' as newsletter,
       t.store_config_v2_draft -> 'globals' -> 'footer' -> 'base' -> 'wordmark_i18n' as footer_wordmark,
       t.store_config_v2_draft -> 'globals' -> 'header' -> 'base' -> 'wordmark_i18n' as header_wordmark
from public.tenants t
where t.slug = 'scheniders-iraq';
```
Expected:
- `store_config_rev = 38`
- `grid.query = {"sort":"bestsellers","limit":8}` with no `layout` key
- `footer_id = 7be7c06b-b16e-463b-8c68-aa7a215e50bb`
- `newsletter.copy_i18n.ar` contains «كوبون خصم 15%»
- `footer_wordmark = null`
- `header_wordmark = {"ar":"شنايدر","en":"Scheniders"}`

If the rev is not 38, or any of these differ, STOP: the draft changed since this plan was written. Re-read it and adapt the paths.

- [ ] **Step 2: Write the draft in one guarded statement.** A single `UPDATE` is its own transaction; do not wrap it in `begin`/`commit`, because the CLI then prints the result of `commit` instead of the `returning` row. Exactly five paths change. A no-write `SELECT` version of this expression was dry-run on 2026-10-22: it matched once (`pages[2].sections[6]`), and with the five paths removed the pages, the rest of the footer, the rest of the newsletter block and every other global were unchanged.

```sql
with target as (
  select t.id,
         (p.ordinality - 1)::int as page_idx,
         (s.ordinality - 1)::int as sec_idx
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and t.store_config_rev = 38
    and p.value ->> 'page_id' = 'product'
    and s.value ->> 'id' = 'acb81db0-60f4-4dba-b39c-45cf5f749fce'
    and s.value ->> 'type' = 'product_grid'
    and t.store_config_v2_draft -> 'globals' -> 'footer' ->> 'id' = '7be7c06b-b16e-463b-8c68-aa7a215e50bb'
)
update public.tenants t
set store_config_v2_draft =
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(t.store_config_v2_draft,
        array['pages', x.page_idx::text, 'sections', x.sec_idx::text, 'base', 'layout'],
        '"row"'::jsonb, true),
        array['pages', x.page_idx::text, 'sections', x.sec_idx::text, 'base', 'query', 'sold_out_last'],
        'true'::jsonb, true),
        '{globals,footer,base,wordmark_i18n}',
        '{"ar":"شنايدر","en":"Scheniders"}'::jsonb, true),
        '{globals,footer,base,newsletter,copy_i18n}',
        '{"ar":"كن أول من يعرف آخر الاخبار عن متجرنا.","en":"Be the first to hear our news."}'::jsonb, true),
        '{globals,footer,base,newsletter,success_i18n}',
        '{"ar":"تم الاشتراك، شكراً إلك!","en":"You are subscribed, thank you!"}'::jsonb, true),
    updated_at = now()
from target x
where t.id = x.id
returning t.id,
          t.store_config_v2_draft -> 'pages' -> x.page_idx -> 'sections' -> x.sec_idx -> 'base' -> 'query' as query,
          t.store_config_v2_draft -> 'pages' -> x.page_idx -> 'sections' -> x.sec_idx -> 'base' ->> 'layout' as layout,
          t.store_config_v2_draft -> 'globals' -> 'footer' -> 'base' -> 'wordmark_i18n' as wordmark,
          t.store_config_v2_draft -> 'globals' -> 'footer' -> 'base' -> 'newsletter' as newsletter;
```
Run: `cd /Users/ali/scheniders-mono/packages && supabase db query --linked -f <scratchpad>/pdp-lower-draft.sql -o json`
Expected: exactly one returned row with `layout = row`, `query = {"limit":8,"sold_out_last":true,"sort":"bestsellers"}`, `wordmark = {"ar":"شنايدر","en":"Scheniders"}`, and a newsletter whose `copy_i18n` / `success_i18n` contain no «15%» and no «WELCOME15». **Zero rows** means the guard did not match (the rev moved, or the ids changed). Nothing was written. Go back to Step 1.

- [ ] **Step 3: Verify that the published config is untouched**

```sql
select t.store_config_rev,
       t.store_config_v2 -> 'globals' -> 'footer' -> 'base' -> 'newsletter' -> 'copy_i18n' ->> 'ar' as published_copy,
       t.store_config_v2 -> 'globals' -> 'footer' -> 'base' -> 'wordmark_i18n'                 as published_wordmark,
       (select s.value -> 'base' ->> 'layout'
          from jsonb_array_elements(t.store_config_v2 -> 'pages') p,
               jsonb_array_elements(p.value -> 'sections') s
         where s.value ->> 'id' = 'acb81db0-60f4-4dba-b39c-45cf5f749fce')                      as published_layout,
       t.store_config_v2_draft -> 'commerce' ?& array['shipping','discounts']                  as draft_commerce_intact
from public.tenants t
where t.slug = 'scheniders-iraq';
```
Expected:
- `store_config_rev = 38` (unchanged)
- `published_copy` still contains «كوبون خصم 15%». Publishing is the merchant's call.
- `published_wordmark = null`
- `published_layout = null`
- `draft_commerce_intact = true`

- [ ] **Step 4: Reversal (keep it in the handoff and do not run it).** It restores the five paths exactly:

```sql
with target as (
  select t.id, (p.ordinality - 1)::int as page_idx, (s.ordinality - 1)::int as sec_idx
  from public.tenants t,
       jsonb_array_elements(t.store_config_v2_draft -> 'pages') with ordinality p,
       jsonb_array_elements(p.value -> 'sections') with ordinality s
  where t.slug = 'scheniders-iraq'
    and s.value ->> 'id' = 'acb81db0-60f4-4dba-b39c-45cf5f749fce'
)
update public.tenants t
set store_config_v2_draft =
      jsonb_set(jsonb_set(
        t.store_config_v2_draft
          #- array['pages', x.page_idx::text, 'sections', x.sec_idx::text, 'base', 'layout']
          #- array['pages', x.page_idx::text, 'sections', x.sec_idx::text, 'base', 'query', 'sold_out_last']
          #- '{globals,footer,base,wordmark_i18n}',
        '{globals,footer,base,newsletter,copy_i18n}',
        '{"ar":"كن أول من يعرف آخر الاخبار عن متجرنا، عند انضمامك ستحصل فورا على كوبون خصم 15% على منتجاتنا.","en":"Be the first to hear our news — join and instantly get a 15% coupon."}'::jsonb),
        '{globals,footer,base,newsletter,success_i18n}',
        '{"ar":"تم الاشتراك! كود الخصم مالتك: WELCOME15","en":"You''re in! Your discount code: WELCOME15"}'::jsonb),
    updated_at = now()
from target x
where t.id = x.id;
```

---

### Task 8: See it at 390px (draft view)

- [ ] **Step 1: Open the draft PDP.** The storefront dev server already runs on :3001; do not restart it. Open `http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/envoy` (envoy = انفوي بلو, in stock). Outside production, `canPreviewDraft` accepts the literal dev token (`apps/storefront/lib/preview-access.ts`). Set the viewport to 390×844.

- [ ] **Step 2: Check the related row.** Scroll to «اكثر منتجاتنا مبيعاً». Expected:
  - The heading is on the right and «عرض المزيد ←» on the left, at 44px tall.
  - The **first card's right edge lines up with the screen's right gutter** and a third card peeks at the left. Run `document.querySelector('[data-layout="row"] ul').scrollLeft` in the console. It should be `0`, and after a leftward swipe it should go negative. That proves the row-reverse scroll origin.
  - Cards show «الشركة: باريس كورنر» where the product has a brand, and a gender tag only on the 12 products that have one.
  - No sold-out card appears before an orderable one. خير فيوجن (rank 1, oversold) and برسيفيرون (rank 3) are pushed out of the 8 slots, or appear last, greyed, with «نفد المخزون».
  - The page has no horizontal scroll: `document.documentElement.scrollWidth === 390`.
  - Switch to English with the header's language switcher (the tenant has `ar` and `en` enabled). The first card is now at the left and the arrow is →.
  - At 1280px the row is a 4-column grid.

- [ ] **Step 3: Check the footer.** Expected:
  - The wordmark reads «شنايدر» (English: "Scheniders"), the same as the header pill.
  - The newsletter line reads «كن أول من يعرف آخر الاخبار عن متجرنا.», with no «15%».
  - The Instagram/TikTok icons still point at `kawkab.brand`, unchanged on purpose.

- [ ] **Step 4: Check the published storefront.** In a private window, without the draft cookie, open `/s/scheniders-iraq/products/envoy`. Expected: the old grid and the old footer with the coupon line. The published config is untouched.

- [ ] **Step 5: Fallback if the Playwright MCP is wedged.** Check the server-rendered markup with curl, carrying the `sb_draft_view` cookie the draft-view route sets:

```bash
JAR=/private/tmp/claude-501/-Users-ali-scheniders-mono/12e59a05-6c5e-434f-80c5-7a83760fd17d/scratchpad/sbdv.cookies; curl -s -c "$JAR" -o /dev/null "http://localhost:3001/api/draft-view?tenant=scheniders-iraq&token=dev-preview-token&to=/s/scheniders-iraq/products/envoy" && curl -s -b "$JAR" "http://localhost:3001/s/scheniders-iraq/products/envoy" | grep -o 'data-layout="row"\|data-sold-out=""\|data-tag="brand"\|data-i18n-field="wordmark_i18n"\|WELCOME15\|15%' | sort | uniq -c
```
Expected: `data-layout="row"` once, `data-tag="brand"` several times, `data-i18n-field="wordmark_i18n"` once, and **no** `WELCOME15` or `15%` from the footer. (`15%` could still appear in product copy; if it does, check the context by hand.)

Save screenshots to the session scratchpad, never to the repo root.

- [ ] **Step 6: Handoff, no commit.** Publishing waits for the merchant's sign-off on the gaps below.

---

## Merchant gaps (for the handoff)

1. **Social links point at another brand.** The footer's Instagram is `https://www.instagram.com/kawkab.brand/` and its TikTok is `https://www.tiktok.com/@kawkab.brand`. «kawkab» is not Scheniders/شنايدر. Are these your accounts? They are left unchanged.
2. **WELCOME15 is still live in `commerce.discounts`** (15%, enabled, both draft and published). It is now promised nowhere, and nothing on the shop's linked order path accepts a code, but `/checkout` (URL-only) would still honour it. Keep it or disable it?
3. **Two names in the legal lines.** The legal company is «Schnieder - شنايدر» (spelling differs from "Scheniders"). The rights line says «مجموعة شركات شنايدر», and the tenant `business_name` is "Scheniders Iraq". The wordmark now follows the header («شنايدر» / "Scheniders"). Is the legal spelling «Schnieder» correct as registered?
4. **Oversold best sellers.** خير فيوجن has stock −5, برسيفيرون −86 with 1 reserved, and مينيا 1 on hand with 2 reserved. The row now pushes them back and marks them sold out. Is stock really gone, or do the counts need a recount?
5. **Gender is set on only 12 of 43 products, and brand on 36 of 43.** Cards only show what is entered. Filling these in lights up the tags.
6. **Truthfulness of the grid's merchant copy (draft and published).** The eyebrow «القطع المميزة لهذا الشهر» (stored, not shown in the row) claims "this month", but the best-seller rank covers the last 180 days. The subheading «اكثر العطور اللي حبوها زبائنا» says "loved" where the data is "sold". Suggested: «العطور الأكثر طلباً عندنا». Not changed.
7. **Publish the draft?** Rev 38 → publish carries the row, the wordmark and the coupon-free newsletter copy live.
