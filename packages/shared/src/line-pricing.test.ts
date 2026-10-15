import { describe, expect, it } from "vitest";
import { resolveLineUnitPrice, type LinePricingInput } from "./line-pricing";

const base: LinePricingInput = {
  productId: "addon",
  basePrice: 10000,
  quantity: 1,
  shownPrice: 10000,
  tiers: [{ min_quantity: 3, max_quantity: null, price: 9000 }],
  bumps: [{ product_id: "parent", bump_product_id: "addon", discount_percentage: 30 }],
  orderProductIds: ["parent", "addon"],
};

describe("resolveLineUnitPrice", () => {
  it("is the base price with no rule in play", () => {
    expect(resolveLineUnitPrice({ ...base, tiers: null, bumps: null })).toBe(10000);
  });

  it("applies the quantity break", () => {
    expect(resolveLineUnitPrice({ ...base, quantity: 3, shownPrice: 9000, bumps: null })).toBe(9000);
  });

  it("honours the bump price only when the line was priced at it", () => {
    expect(resolveLineUnitPrice({ ...base, shownPrice: 7000 })).toBe(7000);
    // Put in the cart independently: full price, not a surprise discount.
    expect(resolveLineUnitPrice({ ...base, shownPrice: 10000 })).toBe(10000);
  });

  it("never lets the shown price invent a third number", () => {
    for (const shownPrice of [0, 1, 6999, 7001, 9999, 50000]) {
      expect([7000, 10000]).toContain(resolveLineUnitPrice({ ...base, shownPrice }));
    }
  });

  it("keeps the bump price unreachable without the parent in the order", () => {
    expect(resolveLineUnitPrice({ ...base, shownPrice: 7000, orderProductIds: ["addon"] })).toBe(10000);
  });

  it("discounts the tiered price, not the base, when both apply", () => {
    expect(resolveLineUnitPrice({ ...base, quantity: 3, shownPrice: 6300 })).toBe(6300);
  });
});
