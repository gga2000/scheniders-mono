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
