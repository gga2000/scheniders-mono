import { describe, expect, it } from "vitest";
import { priceOrderLines, type PricedLineInput } from "./line-pricing";
import type { OrderBumpOffer } from "./order-bumps";

const BUMPS: OrderBumpOffer[] = [{ product_id: "parent", bump_product_id: "addon", discount_percentage: 30 }];

const parent: PricedLineInput = { productId: "parent", basePrice: 35000, quantity: 1, shownPrice: 35000, tiers: null };
const addon = (over: Partial<PricedLineInput> = {}): PricedLineInput => ({
  productId: "addon",
  basePrice: 10000,
  quantity: 1,
  shownPrice: 7000,
  tiers: null,
  ...over,
});

describe("priceOrderLines", () => {
  it("is the base price with no rule in play", () => {
    expect(priceOrderLines([parent], null)).toEqual([35000]);
  });

  it("applies the quantity break", () => {
    const tiers = [{ min_quantity: 3, max_quantity: null, price: 30000 }];
    expect(priceOrderLines([{ ...parent, quantity: 3, shownPrice: 30000, tiers }], null)).toEqual([30000]);
  });

  it("honours the bump price beside a full-price parent", () => {
    expect(priceOrderLines([parent, addon()], BUMPS)).toEqual([35000, 7000]);
  });

  it("charges full price for an add-on the shopper did not take as an offer", () => {
    expect(priceOrderLines([parent, addon({ shownPrice: 10000 })], BUMPS)).toEqual([35000, 10000]);
  });

  it("never lets the shown price invent a third number", () => {
    for (const shownPrice of [0, 1, 6999, 7001, 9999, 50000]) {
      expect([7000, 10000]).toContain(priceOrderLines([parent, addon({ shownPrice })], BUMPS)[1]);
    }
  });

  it("keeps the bump price unreachable without the parent in the order", () => {
    expect(priceOrderLines([addon()], BUMPS)).toEqual([10000]);
  });

  it("discounts a single unit only — never a stack of the add-on", () => {
    expect(priceOrderLines([parent, addon({ quantity: 50 })], BUMPS)[1]).toBe(10000);
  });

  it("gives ONE discounted unit per add-on per order, however many lines ask", () => {
    // Exploit: N duplicate one-unit lines (or one per variant), each posted
    // at the bump price, used to earn N discounts.
    const prices = priceOrderLines([parent, addon(), addon(), addon()], BUMPS);
    expect(prices).toEqual([35000, 7000, 10000, 10000]);
  });

  it("does not let reciprocal bumps discount both lines", () => {
    // Exploit: A bumps B and B bumps A; post both at their bump prices and
    // neither pays full price.
    const reciprocal: OrderBumpOffer[] = [
      { product_id: "a", bump_product_id: "b", discount_percentage: 50 },
      { product_id: "b", bump_product_id: "a", discount_percentage: 50 },
    ];
    const lines: PricedLineInput[] = [
      { productId: "a", basePrice: 20000, quantity: 1, shownPrice: 10000, tiers: null },
      { productId: "b", basePrice: 20000, quantity: 1, shownPrice: 10000, tiers: null },
    ];
    expect(priceOrderLines(lines, reciprocal)).toEqual([20000, 20000]);
  });

  it("does not let a discounted add-on parent another add-on (A→B→C)", () => {
    const chain: OrderBumpOffer[] = [
      { product_id: "a", bump_product_id: "b", discount_percentage: 50 },
      { product_id: "b", bump_product_id: "c", discount_percentage: 50 },
    ];
    const lines: PricedLineInput[] = [
      { productId: "a", basePrice: 20000, quantity: 1, shownPrice: 20000, tiers: null },
      { productId: "b", basePrice: 20000, quantity: 1, shownPrice: 10000, tiers: null },
      { productId: "c", basePrice: 20000, quantity: 1, shownPrice: 10000, tiers: null },
    ];
    expect(priceOrderLines(lines, chain)).toEqual([20000, 10000, 20000]);
  });

  it("discounts the tiered one-unit price, not the base, when both apply", () => {
    const tiers = [{ min_quantity: 1, max_quantity: null, price: 9000 }];
    expect(priceOrderLines([parent, addon({ shownPrice: 6300, tiers })], BUMPS)[1]).toBe(6300);
  });
});
