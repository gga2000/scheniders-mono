import { describe, it, expect } from "vitest";
import { computeBundleDiscounts } from "./bundle";
import type { Bundle } from "./types/store-config-v2";

const cart = [
  { product_id: "a", price: 10000, quantity: 1 },
  { product_id: "b", price: 5000, quantity: 2 }, // 10000
  { product_id: "c", price: 3000, quantity: 1 },
];

describe("computeBundleDiscounts", () => {
  it("applies a percent bundle on the combined item subtotal", () => {
    const bundles: Bundle[] = [
      { id: "x", product_ids: ["a", "b"], kind: "percent", value: 10 },
    ];
    const r = computeBundleDiscounts(cart, bundles);
    // subtotal a+b = 10000 + 10000 = 20000 → 10% = 2000
    expect(r.total_amount_iqd).toBe(2000);
    expect(r.applied).toEqual([{ bundle_id: "x", amount_iqd: 2000 }]);
  });

  it("skips a bundle when not all products are in the cart", () => {
    const bundles: Bundle[] = [
      { id: "x", product_ids: ["a", "z"], kind: "fixed", value: 1000 },
    ];
    expect(computeBundleDiscounts(cart, bundles).total_amount_iqd).toBe(0);
  });

  it("does not let two bundles double-dip the same product", () => {
    const bundles: Bundle[] = [
      { id: "x", product_ids: ["a", "b"], kind: "fixed", value: 1000 },
      { id: "y", product_ids: ["a", "c"], kind: "fixed", value: 1000 }, // 'a' already used
    ];
    const r = computeBundleDiscounts(cart, bundles);
    expect(r.applied).toEqual([{ bundle_id: "x", amount_iqd: 1000 }]);
  });

  it("clamps a fixed discount to the bundle subtotal + skips disabled/empty", () => {
    const bundles: Bundle[] = [
      { id: "x", product_ids: ["c"], kind: "fixed", value: 999999 }, // > 3000
      { id: "off", product_ids: ["a"], kind: "fixed", value: 500, enabled: false },
    ];
    const r = computeBundleDiscounts(cart, bundles);
    expect(r.total_amount_iqd).toBe(3000);
    expect(r.applied).toHaveLength(1);
  });

  it("is empty-safe", () => {
    expect(computeBundleDiscounts([], null).total_amount_iqd).toBe(0);
    expect(computeBundleDiscounts(cart, []).total_amount_iqd).toBe(0);
  });
});
