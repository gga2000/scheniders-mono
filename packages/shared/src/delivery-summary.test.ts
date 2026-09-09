import { describe, expect, it } from "vitest";
import { etaForGovernorate, summarizeDelivery } from "./delivery-summary";
import { FLAT_DELIVERY_FEE_IQD, FREE_DELIVERY_THRESHOLD_IQD } from "./delivery";

describe("summarizeDelivery", () => {
  it("reports the legacy flat fee with no config at all", () => {
    expect(summarizeDelivery(undefined)).toEqual({
      kind: "legacy",
      fee: { min: FLAT_DELIVERY_FEE_IQD, max: FLAT_DELIVERY_FEE_IQD },
      free_threshold_iqd: FREE_DELIVERY_THRESHOLD_IQD,
      eta_hours: null,
    });
  });

  it("calls one fee everywhere 'flat' — the common Iraqi case", () => {
    const s = summarizeDelivery({ default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000, eta_hours: 24 } });
    expect(s.kind).toBe("flat");
    expect(s.fee).toEqual({ min: 5000, max: 5000 });
    expect(s.free_threshold_iqd).toBe(75000);
    expect(s.eta_hours).toEqual({ min: 24, max: 24 });
  });

  it("is still flat when overrides merely repeat the default", () => {
    const s = summarizeDelivery({
      default_rate: { fee_iqd: 5000 },
      rates: { BG: { fee_iqd: 5000 }, BA: { fee_iqd: 5000 } },
    });
    expect(s.kind).toBe("flat");
  });

  it("reports a range only when the numbers actually differ", () => {
    const s = summarizeDelivery({
      default_rate: { fee_iqd: 6000, eta_hours: 48 },
      rates: { BG: { fee_iqd: 4000, eta_hours: 6 } },
    });
    expect(s.kind).toBe("varies");
    expect(s.fee).toEqual({ min: 4000, max: 6000 });
    expect(s.eta_hours).toEqual({ min: 6, max: 48 });
  });

  it("only states a free threshold when every rate agrees on it", () => {
    expect(summarizeDelivery({
      default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000 },
      rates: { BG: { fee_iqd: 5000, free_threshold_iqd: 50000 } },
    }).free_threshold_iqd).toBeNull();
    expect(summarizeDelivery({
      default_rate: { fee_iqd: 5000, free_threshold_iqd: 75000 },
      rates: { BG: { fee_iqd: 5000 } }, // no threshold here
    }).free_threshold_iqd).toBeNull();
  });

  it("never invents an ETA", () => {
    expect(summarizeDelivery({ default_rate: { fee_iqd: 5000 } }).eta_hours).toBeNull();
  });

  it("ignores a malformed rate rather than pricing from it", () => {
    const s = summarizeDelivery({
      default_rate: { fee_iqd: 5000 },
      rates: { BG: { fee_iqd: Number.NaN }, BA: { fee_iqd: -1 } },
    });
    expect(s.kind).toBe("flat");
    expect(s.fee).toEqual({ min: 5000, max: 5000 });
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
  });
});
