import { describe, expect, it } from "vitest";
import { applyCatalog, priceSplitFrom, SORTS } from "./catalog-filter";
import type { Product } from "../types";

const p = (over: Partial<Product>): Product =>
  ({
    id: "x",
    name: "x",
    price: 40000,
    stock_quantity: 10,
    reserved_quantity: 0,
    is_archived: false,
    ...over,
  }) as Product;

describe("priceSplitFrom", () => {
  it("derives the threshold from the catalogue, not a constant", () => {
    // This catalogue's median is 38,500 -> 40,000. The helper this replaces
    // hardcoded 50,000, which would put ~80% of the shop on one side and
    // divide nothing.
    expect(priceSplitFrom([29000, 36750, 38500, 44750, 130000])).toBe(40000);
  });

  it("returns null when there is nothing meaningful to split", () => {
    expect(priceSplitFrom([])).toBeNull();
    expect(priceSplitFrom([40000])).toBeNull();
    // Every product the same price: a split would put everything on one side.
    expect(priceSplitFrom([40000, 40000, 40000])).toBeNull();
  });
});

describe("applyCatalog", () => {
  const products = [
    p({ id: "a", price: 30000 }),
    p({ id: "b", price: 50000 }),
    p({ id: "c", price: 90000, stock_quantity: 0 }),
  ];

  it("sorts what cannot be bought last, under every sort order", () => {
    for (const sort of SORTS) {
      const out = applyCatalog(products, { sort });
      expect(out[out.length - 1]?.id).toBe("c");
    }
  });

  it("filters by real membership, not the single primary category_id", () => {
    // Products belong to up to six categories; category_id is only the
    // primary and would filter wrongly.
    const out = applyCatalog(products, {
      categoryId: "work",
      categoryProductIds: { work: ["a", "b"] },
    });
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("yields nothing for a category with no members", () => {
    expect(
      applyCatalog(products, {
        categoryId: "empty",
        categoryProductIds: { work: ["a"] },
      }),
    ).toHaveLength(0);
  });

  it("splits on price in both directions, inclusive of the threshold above", () => {
    expect(
      applyCatalog(products, { price: "under", threshold: 40000 }).map((x) => x.id),
    ).toEqual(["a"]);
    expect(
      applyCatalog(products, { price: "over", threshold: 40000 }).map((x) => x.id),
    ).toEqual(["b", "c"]);
  });

  it("orders by price both ways, ignoring the unbuyable tail", () => {
    const asc = applyCatalog(products, { sort: "price_asc" });
    expect(asc.map((x) => x.id)).toEqual(["a", "b", "c"]);
    const desc = applyCatalog(products, { sort: "price_desc" });
    // b before a (dearer first), c last because it cannot be bought.
    expect(desc.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("never mutates the input", () => {
    const input = [...products];
    const before = input.map((x) => x.id);
    applyCatalog(input, { sort: "price_desc" });
    expect(input.map((x) => x.id)).toEqual(before);
  });

  it("counts exactly what the filter yields", () => {
    // A chip's count is `applyCatalog(...).length`. If these could differ,
    // a chip would advertise 19 and open onto 14 — the failure this
    // project has already fixed twice.
    const opts = {
      categoryId: "work",
      categoryProductIds: { work: ["a", "b"] },
    };
    expect(applyCatalog(products, opts)).toHaveLength(2);
  });
});
