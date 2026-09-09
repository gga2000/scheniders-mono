import { describe, expect, it } from "vitest";
import {
  applyBumpDiscount,
  offersForProduct,
  resolveBumpPrice,
  type OrderBumpOffer,
} from "./order-bumps";

const PARENT = "parent-1";
const OTHER_PARENT = "parent-2";
const SAMPLE = "sample-1";

const BUMPS: OrderBumpOffer[] = [
  { product_id: PARENT, bump_product_id: SAMPLE, discount_percentage: 15, display_order: 0 },
  { product_id: OTHER_PARENT, bump_product_id: SAMPLE, discount_percentage: 30, display_order: 1 },
  { product_id: PARENT, bump_product_id: "retired", discount_percentage: 50, is_active: false },
];

describe("applyBumpDiscount", () => {
  it("discounts and rounds to whole IQD", () => {
    expect(applyBumpDiscount(10000, 15)).toBe(8500);
    expect(applyBumpDiscount(7333, 15)).toBe(6233); // 6233.05 → 6233
  });

  it("clamps a nonsensical percentage instead of inverting the price", () => {
    expect(applyBumpDiscount(10000, 150)).toBe(0);
    expect(applyBumpDiscount(10000, -20)).toBe(10000);
    expect(applyBumpDiscount(10000, Number.NaN)).toBe(10000);
  });
});

describe("resolveBumpPrice", () => {
  it("prices a bump when its parent is in the order", () => {
    expect(resolveBumpPrice(BUMPS, [PARENT], SAMPLE, 10000)).toBe(8500);
  });

  it("refuses the discount when the parent is NOT in the order", () => {
    // Otherwise the bump price is a coupon anyone can claim by ordering the
    // add-on on its own.
    expect(resolveBumpPrice(BUMPS, ["unrelated"], SAMPLE, 10000)).toBeNull();
    expect(resolveBumpPrice(BUMPS, [], SAMPLE, 10000)).toBeNull();
  });

  it("honours the better offer when two parents bump the same product", () => {
    expect(resolveBumpPrice(BUMPS, [PARENT, OTHER_PARENT], SAMPLE, 10000)).toBe(7000);
  });

  it("ignores an offer the merchant switched off", () => {
    expect(resolveBumpPrice(BUMPS, [PARENT], "retired", 10000)).toBeNull();
  });

  it("returns null for a product that is not bumped at all", () => {
    expect(resolveBumpPrice(BUMPS, [PARENT], "something-else", 10000)).toBeNull();
    expect(resolveBumpPrice([], [PARENT], SAMPLE, 10000)).toBeNull();
    expect(resolveBumpPrice(null, [PARENT], SAMPLE, 10000)).toBeNull();
  });
});

describe("offersForProduct", () => {
  it("returns a product's active offers in the merchant's order", () => {
    const offers = offersForProduct(BUMPS, PARENT);
    expect(offers.map((o) => o.bump_product_id)).toEqual([SAMPLE]);
  });

  it("returns nothing for a product with no offers", () => {
    expect(offersForProduct(BUMPS, "nobody")).toEqual([]);
    expect(offersForProduct(null, PARENT)).toEqual([]);
  });
});
