import { describe, expect, it } from "vitest";
import { eligiblePostPurchaseOffers, postPurchasePrice } from "./post-purchase";
import type { OrderBumpOffer } from "./order-bumps";

const A = "prod-a", B = "prod-b", SAMPLE = "sample", TRAVEL = "travel";
const BUMPS: OrderBumpOffer[] = [
  { product_id: A, bump_product_id: SAMPLE, discount_percentage: 15, display_order: 1 },
  { product_id: A, bump_product_id: TRAVEL, discount_percentage: 25, display_order: 0 },
  { product_id: B, bump_product_id: SAMPLE, discount_percentage: 30, display_order: 2 },
  { product_id: B, bump_product_id: "off", discount_percentage: 90, is_active: false },
];

describe("eligiblePostPurchaseOffers", () => {
  it("offers the add-ons of what was ordered, best discount first", () => {
    const offers = eligiblePostPurchaseOffers([{ product_id: A, quantity: 1 }], BUMPS);
    expect(offers.map((o) => [o.product_id, o.discount_percentage])).toEqual([
      [TRAVEL, 25], [SAMPLE, 15],
    ]);
  });

  it("never offers something already in the order", () => {
    const offers = eligiblePostPurchaseOffers(
      [{ product_id: A, quantity: 1 }, { product_id: SAMPLE, quantity: 1 }], BUMPS,
    );
    expect(offers.map((o) => o.product_id)).toEqual([TRAVEL]);
  });

  it("keeps one entry per add-on and the better discount wins", () => {
    const offers = eligiblePostPurchaseOffers(
      [{ product_id: A, quantity: 1 }, { product_id: B, quantity: 1 }], BUMPS,
    );
    const sample = offers.find((o) => o.product_id === SAMPLE);
    expect(sample?.discount_percentage).toBe(30);
    expect(sample?.parent_product_id).toBe(B);
    expect(offers.filter((o) => o.product_id === SAMPLE)).toHaveLength(1);
  });

  it("does not let an accepted add-on unlock its own add-ons", () => {
    const chain: OrderBumpOffer[] = [
      { product_id: A, bump_product_id: SAMPLE, discount_percentage: 20 },
      { product_id: SAMPLE, bump_product_id: TRAVEL, discount_percentage: 50 },
    ];
    expect(
      eligiblePostPurchaseOffers([{ product_id: A, quantity: 1 }, { product_id: SAMPLE, quantity: 1 }], chain),
    ).toEqual([]);
  });

  it("skips offers the merchant switched off", () => {
    const offers = eligiblePostPurchaseOffers([{ product_id: B, quantity: 1 }], BUMPS);
    expect(offers.map((o) => o.product_id)).not.toContain("off");
  });

  it("offers nothing for an order with no bumped products", () => {
    expect(eligiblePostPurchaseOffers([{ product_id: "zzz", quantity: 1 }], BUMPS)).toEqual([]);
    expect(eligiblePostPurchaseOffers([], BUMPS)).toEqual([]);
    expect(eligiblePostPurchaseOffers([{ product_id: A, quantity: 1 }], null)).toEqual([]);
  });

  it("prices an accepted offer with the same rounding as a checkout bump", () => {
    const [travel] = eligiblePostPurchaseOffers([{ product_id: A, quantity: 1 }], BUMPS);
    expect(postPurchasePrice(10000, travel)).toBe(7500);
  });
});
