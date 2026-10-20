import { describe, expect, it } from "vitest";
import { freeGiftProgress, qualifiesForFreeGift, resolveFreeGift } from "./free-gift";

const CONFIGURED = { enabled: true, product_id: "gift-1", threshold_iqd: 75000 };

describe("resolveFreeGift", () => {
  it("is enabled only when switched on, with a product and a threshold", () => {
    expect(resolveFreeGift(CONFIGURED).enabled).toBe(true);
  });

  it("refuses to enable when any piece is missing", () => {
    // Each of these would otherwise let the cart promise a gift the
    // checkout cannot deliver.
    expect(resolveFreeGift({ ...CONFIGURED, enabled: false }).enabled).toBe(false);
    expect(resolveFreeGift({ ...CONFIGURED, product_id: undefined }).enabled).toBe(false);
    expect(resolveFreeGift({ ...CONFIGURED, product_id: "  " }).enabled).toBe(false);
    expect(resolveFreeGift({ ...CONFIGURED, threshold_iqd: 0 }).enabled).toBe(false);
    expect(resolveFreeGift(undefined).enabled).toBe(false);
    expect(resolveFreeGift(null).enabled).toBe(false);
  });
});

describe("freeGiftProgress", () => {
  it("returns null when no gift is configured — nothing to promise", () => {
    expect(freeGiftProgress(undefined, 50000)).toBeNull();
    expect(freeGiftProgress({ enabled: true, threshold_iqd: 75000 }, 50000)).toBeNull();
  });

  it("reports what is left and how far along", () => {
    expect(freeGiftProgress(CONFIGURED, 30000)).toMatchObject({
      remainingIqd: 45000, unlocked: false, percent: 40,
    });
  });

  it("unlocks at exactly the threshold", () => {
    expect(freeGiftProgress(CONFIGURED, 75000)).toMatchObject({ remainingIqd: 0, unlocked: true });
  });

  it("caps the bar at 100 rather than overflowing it", () => {
    expect(freeGiftProgress(CONFIGURED, 200000)?.percent).toBe(100);
  });

  it("treats a nonsensical subtotal as zero", () => {
    expect(freeGiftProgress(CONFIGURED, Number.NaN)?.remainingIqd).toBe(75000);
    expect(freeGiftProgress(CONFIGURED, -100)?.remainingIqd).toBe(75000);
  });
});

describe("qualifiesForFreeGift", () => {
  it("qualifies at or above the threshold", () => {
    expect(qualifiesForFreeGift(CONFIGURED, 75000)).toBe(true);
    expect(qualifiesForFreeGift(CONFIGURED, 80000)).toBe(true);
  });

  it("does not qualify below it", () => {
    expect(qualifiesForFreeGift(CONFIGURED, 74999)).toBe(false);
  });

  it("never qualifies when the gift is not configured", () => {
    expect(qualifiesForFreeGift({ enabled: false, product_id: "g", threshold_iqd: 1 }, 999999)).toBe(false);
    expect(qualifiesForFreeGift(undefined, 999999)).toBe(false);
  });
});
