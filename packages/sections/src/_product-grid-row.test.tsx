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
