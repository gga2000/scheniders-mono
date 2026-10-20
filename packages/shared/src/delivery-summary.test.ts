import { describe, expect, it } from "vitest";
import { etaForGovernorate, summarizeDelivery } from "./delivery-summary";
import { computeDeliveryFee, FLAT_DELIVERY_FEE_IQD, FREE_DELIVERY_THRESHOLD_IQD } from "./delivery";
import { IRAQ_GOVERNORATES } from "./governorates";
import type { GovernorateShippingConfig } from "./types/store-config-v2";

const SMALL = { subtotalIqd: 30000, itemCount: 1 };

describe("summarizeDelivery", () => {
  it("reports the legacy flat fee with no config at all", () => {
    expect(summarizeDelivery(undefined, SMALL)).toEqual({
      kind: "legacy",
      fee: { min: FLAT_DELIVERY_FEE_IQD, max: FLAT_DELIVERY_FEE_IQD },
      free_threshold_iqd: FREE_DELIVERY_THRESHOLD_IQD,
      eta_hours: null,
    });
  });

  it("calls one fee everywhere 'flat' — the common Iraqi case", () => {
    const s = summarizeDelivery(
      { default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000, eta_hours: 24 } },
      SMALL,
    );
    expect(s.kind).toBe("flat");
    expect(s.fee).toEqual({ min: 5000, max: 5000 });
    expect(s.free_threshold_iqd).toBe(75000);
    expect(s.eta_hours).toEqual({ min: 24, max: 24 });
  });

  it("calls a free store free (the delivery-fee screen's 'free' answer: fee 0)", () => {
    const s = summarizeDelivery({ default_rate: { fee_iqd: 0 } }, SMALL);
    expect(s.kind).toBe("flat");
    expect(s.fee).toEqual({ min: 0, max: 0 });
    expect(s.free_threshold_iqd).toBeNull();
  });

  it("is still flat when overrides merely repeat the default", () => {
    const s = summarizeDelivery(
      { default_rate: { fee_iqd: 5000 }, rates: { BG: { fee_iqd: 5000 }, BA: { fee_iqd: 5000 } } },
      SMALL,
    );
    expect(s.kind).toBe("flat");
  });

  it("reports a range only when the numbers actually differ", () => {
    const s = summarizeDelivery(
      { default_rate: { fee_iqd: 6000, eta_hours: 48 }, rates: { BG: { fee_iqd: 4000, eta_hours: 6 } } },
      SMALL,
    );
    expect(s.kind).toBe("varies");
    expect(s.fee).toEqual({ min: 4000, max: 6000 });
    expect(s.eta_hours).toEqual({ min: 6, max: 48 });
  });

  it("does not call overrides-only 'flat': the other governorates pay the legacy fee", () => {
    // Every override says 10,000, but with no default rate the remaining
    // governorates fall back to the platform's flat 5,000 — so it varies.
    const s = summarizeDelivery({ rates: { BG: { fee_iqd: 10000 }, BA: { fee_iqd: 10000 } } }, SMALL);
    expect(s.kind).toBe("varies");
    expect(s.fee).toEqual({ min: FLAT_DELIVERY_FEE_IQD, max: 10000 });
  });

  it("prices the basket it is given: past a shared threshold delivery is free everywhere", () => {
    const s = summarizeDelivery(
      { default_rate: { fee_iqd: 5000, free_threshold_iqd: 50000 } },
      { subtotalIqd: 60000, itemCount: 2 },
    );
    expect(s).toMatchObject({ kind: "flat", fee: { min: 0, max: 0 } });
  });

  it("varies when only some governorates have crossed their threshold", () => {
    const s = summarizeDelivery(
      { default_rate: { fee_iqd: 5000 }, rates: { BG: { fee_iqd: 5000, free_threshold_iqd: 50000 } } },
      { subtotalIqd: 60000, itemCount: 1 },
    );
    expect(s).toMatchObject({ kind: "varies", fee: { min: 0, max: 5000 } });
  });

  it("only states a free threshold when every governorate agrees on it", () => {
    expect(
      summarizeDelivery(
        {
          default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000 },
          rates: { BG: { fee_iqd: 5000, free_threshold_iqd: 50000 } },
        },
        SMALL,
      ).free_threshold_iqd,
    ).toBeNull();
    expect(
      summarizeDelivery(
        { default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000 }, rates: { BG: { fee_iqd: 5000 } } },
        SMALL,
      ).free_threshold_iqd,
    ).toBeNull();
  });

  it("never invents an ETA, nor states one that some governorates lack", () => {
    expect(summarizeDelivery({ default_rate: { fee_iqd: 5000 } }, SMALL).eta_hours).toBeNull();
    expect(
      summarizeDelivery({ rates: { BG: { fee_iqd: 5000, eta_hours: 6 } } }, SMALL).eta_hours,
    ).toBeNull();
  });

  it("always agrees with computeDeliveryFee, governorate by governorate", () => {
    // The point of the summary: what the PDP states before a governorate is
    // picked is a range the checkout cannot fall outside of, and "flat"
    // means the checkout charges exactly that number wherever they live.
    const configs: Array<GovernorateShippingConfig | undefined> = [
      undefined,
      { default_rate: { fee_iqd: 0 } },
      { default_rate: { fee_iqd: 7000, free_threshold_iqd: 40000 } },
      { rates: { BG: { fee_iqd: 3000 } } },
      { default_rate: { fee_iqd: 6000 }, rates: { BG: { fee_iqd: 4000, free_threshold_iqd: 20000 } } },
      { default_rate: { fee_iqd: 5000 }, rates: { BG: { fee_iqd: Number.NaN } } },
    ];
    for (const shipping of configs) {
      for (const subtotal of [1000, 25000, 45000, 90000]) {
        const s = summarizeDelivery(shipping, { subtotalIqd: subtotal, itemCount: 1 });
        for (const g of IRAQ_GOVERNORATES) {
          const fee = computeDeliveryFee(subtotal, 1, { shipping, governorate: g.code });
          expect(fee).toBeGreaterThanOrEqual(s.fee.min);
          expect(fee).toBeLessThanOrEqual(s.fee.max);
          if (s.kind !== "varies") expect(fee).toBe(s.fee.min);
        }
      }
    }
  });
});

describe("etaForGovernorate", () => {
  const shipping = { default_rate: { fee_iqd: 5000, eta_hours: 48 }, rates: { BG: { fee_iqd: 5000, eta_hours: 6 } } };
  it("prefers the governorate's own ETA", () => {
    expect(etaForGovernorate(shipping, "BG")).toBe(6);
  });
  it("falls back to the default's ETA", () => {
    expect(etaForGovernorate(shipping, "BA")).toBe(48);
  });
  it("is null with nothing declared", () => {
    expect(etaForGovernorate({ default_rate: { fee_iqd: 5000 } }, "BG")).toBeNull();
    expect(etaForGovernorate(undefined, "BG")).toBeNull();
    expect(etaForGovernorate(shipping, null)).toBeNull();
  });
});
