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
