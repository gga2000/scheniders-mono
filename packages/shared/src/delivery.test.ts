import { describe, it, expect } from "vitest";
import {
  computeDeliveryFee,
  resolveShippingRate,
  FREE_DELIVERY_THRESHOLD_IQD,
  FLAT_DELIVERY_FEE_IQD,
} from "./delivery";
import type { GovernorateShippingConfig } from "./types/store-config-v2";

describe("computeDeliveryFee (EC2)", () => {
  it("charges the flat fee below the free-delivery threshold", () => {
    expect(computeDeliveryFee(10_000, 1)).toBe(FLAT_DELIVERY_FEE_IQD);
    expect(computeDeliveryFee(FREE_DELIVERY_THRESHOLD_IQD - 1, 3)).toBe(
      FLAT_DELIVERY_FEE_IQD,
    );
  });

  it("waives delivery at/above the free-delivery threshold", () => {
    expect(computeDeliveryFee(FREE_DELIVERY_THRESHOLD_IQD, 1)).toBe(0);
    expect(computeDeliveryFee(FREE_DELIVERY_THRESHOLD_IQD + 50_000, 2)).toBe(0);
  });

  it("is free for an empty cart regardless of subtotal", () => {
    expect(computeDeliveryFee(0, 0)).toBe(0);
    expect(computeDeliveryFee(10_000, 0)).toBe(0);
  });

  it("never charges on a non-positive or non-finite subtotal", () => {
    expect(computeDeliveryFee(-5, 1)).toBe(0);
    expect(computeDeliveryFee(Number.NaN, 1)).toBe(0);
    expect(computeDeliveryFee(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it("guards a non-finite item count", () => {
    expect(computeDeliveryFee(10_000, Number.NaN)).toBe(0);
    expect(computeDeliveryFee(10_000, -1)).toBe(0);
  });
});

describe("per-governorate shipping engine", () => {
  const shipping: GovernorateShippingConfig = {
    rates: {
      BA: { fee_iqd: 8_000, free_threshold_iqd: 100_000 },
      BG: { fee_iqd: 3_000 },
    },
    default_rate: { fee_iqd: 6_000 },
  };

  it("uses the governorate's override rate", () => {
    expect(computeDeliveryFee(20_000, 1, { shipping, governorate: "BA" })).toBe(8_000);
    expect(computeDeliveryFee(20_000, 1, { shipping, governorate: "BG" })).toBe(3_000);
  });

  it("falls back to default_rate for an unlisted governorate", () => {
    expect(computeDeliveryFee(20_000, 1, { shipping, governorate: "ER" })).toBe(6_000);
  });

  it("honours a per-governorate free threshold", () => {
    expect(computeDeliveryFee(120_000, 1, { shipping, governorate: "BA" })).toBe(0);
    // BG has no threshold → never free via shipping rate.
    expect(computeDeliveryFee(120_000, 1, { shipping, governorate: "BG" })).toBe(3_000);
  });

  it("falls back to the legacy flat fee when no shipping config", () => {
    expect(computeDeliveryFee(20_000, 1)).toBe(FLAT_DELIVERY_FEE_IQD);
    expect(computeDeliveryFee(20_000, 1, { governorate: "BA" })).toBe(FLAT_DELIVERY_FEE_IQD);
  });

  it("falls back to legacy flat when config has neither override nor default", () => {
    expect(
      computeDeliveryFee(20_000, 1, { shipping: { rates: {} }, governorate: "ER" }),
    ).toBe(FLAT_DELIVERY_FEE_IQD);
  });

  it("resolveShippingRate: override > default > null", () => {
    expect(resolveShippingRate(shipping, "BA")?.fee_iqd).toBe(8_000);
    expect(resolveShippingRate(shipping, "ER")?.fee_iqd).toBe(6_000);
    expect(resolveShippingRate(null, "BA")).toBeNull();
    expect(resolveShippingRate({ rates: {} }, "ER")).toBeNull();
  });
});
