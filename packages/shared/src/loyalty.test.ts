import { describe, it, expect } from "vitest";
import {
  computePointsEarned,
  formatPoints,
  computePointsRedemption,
  resolveLoyalty,
} from "./loyalty";
import type { LoyaltyConfig } from "./types/store-config-v2";

const ON: LoyaltyConfig = {
  enabled: true,
  earn_per_iqd: 0.001, // 1 pt per 1000 IQD
  redeem_value_iqd: 10, // 1 pt = 10 IQD
  min_redeem_points: 5,
  max_redeem_pct: 50,
};

describe("computePointsEarned", () => {
  it("floors subtotal × earn rate", () => {
    expect(computePointsEarned(25_500, ON)).toBe(25); // 25.5 → 25
  });
  it("is 0 when disabled or no rate", () => {
    expect(computePointsEarned(50_000, { ...ON, enabled: false })).toBe(0);
    expect(computePointsEarned(50_000, { ...ON, earn_per_iqd: 0 })).toBe(0);
    expect(computePointsEarned(50_000, null)).toBe(0);
  });
});

describe("computePointsRedemption", () => {
  it("redeems requested points at the per-point value", () => {
    const r = computePointsRedemption({
      balance: 100,
      requestedPoints: 30,
      subtotalIqd: 100_000,
      cfg: ON,
    });
    expect(r).toEqual({ points_used: 30, discount_iqd: 300 });
  });

  it("caps at max_redeem_pct of subtotal, spending only the points used", () => {
    // subtotal 1000, 50% cap = 500 IQD = 50 points; request 100
    const r = computePointsRedemption({
      balance: 100,
      requestedPoints: 100,
      subtotalIqd: 1_000,
      cfg: ON,
    });
    expect(r.discount_iqd).toBe(500);
    expect(r.points_used).toBe(50);
  });

  it("limits to the customer's balance", () => {
    const r = computePointsRedemption({
      balance: 8,
      requestedPoints: 50,
      subtotalIqd: 100_000,
      cfg: ON,
    });
    expect(r.points_used).toBe(8);
    expect(r.discount_iqd).toBe(80);
  });

  it("refuses below the minimum, when disabled, or with no value", () => {
    expect(
      computePointsRedemption({ balance: 100, requestedPoints: 3, subtotalIqd: 100_000, cfg: ON }),
    ).toEqual({ points_used: 0, discount_iqd: 0 }); // below min 5
    expect(
      computePointsRedemption({ balance: 100, requestedPoints: 30, subtotalIqd: 100_000, cfg: { ...ON, enabled: false } }),
    ).toEqual({ points_used: 0, discount_iqd: 0 });
  });
});

describe("resolveLoyalty", () => {
  it("defaults to off with safe values", () => {
    expect(resolveLoyalty(null)).toEqual({
      enabled: false,
      earnPerIqd: 0,
      redeemValueIqd: 0,
      minRedeemPoints: 0,
      maxRedeemPct: 100,
    });
  });
});

describe("formatPoints", () => {
  it("uses the dialect's count shapes", () => {
    expect(formatPoints(0, "ar")).toBe("0 نقطة");
    expect(formatPoints(1, "ar")).toBe("نقطة واحدة");
    expect(formatPoints(2, "ar")).toBe("نقطتين");
    expect(formatPoints(7, "ar")).toBe("7 نقاط");
    expect(formatPoints(25, "ar")).toBe("25 نقطة");
    expect(formatPoints(1, "en")).toBe("1 point");
    expect(formatPoints(25, "en")).toBe("25 points");
    expect(formatPoints(25, "ku")).toBe("25 خاڵ");
  });
});
