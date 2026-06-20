import { describe, it, expect } from "vitest";
import { computeDiscount } from "./discount";
import type { DiscountCode } from "./types/store-config-v2";

const NOW = new Date("2026-06-20T12:00:00Z");

const codes: DiscountCode[] = [
  { code: "SAVE10", kind: "percent", value: 10 },
  { code: "BIG", kind: "percent", value: 50, max_discount_iqd: 20_000 },
  { code: "MINUS5K", kind: "fixed", value: 5_000, min_subtotal_iqd: 30_000 },
  {
    code: "EID",
    kind: "percent",
    value: 25,
    starts_iso: "2026-06-19T00:00:00Z",
    ends_iso: "2026-06-21T00:00:00Z",
  },
  { code: "OFF", kind: "fixed", value: 5_000, enabled: false },
  { code: "BROKEN", kind: "fixed", value: 5_000, ends_iso: "not-a-date" },
];

describe("computeDiscount", () => {
  it("percent off", () => {
    expect(computeDiscount(100_000, "SAVE10", codes, NOW)).toEqual({
      code: "SAVE10",
      amount_iqd: 10_000,
    });
  });

  it("is case-insensitive + trims", () => {
    expect(computeDiscount(100_000, "  save10 ", codes, NOW)?.amount_iqd).toBe(10_000);
  });

  it("caps a percent discount at max_discount_iqd", () => {
    // 50% of 100k = 50k, capped to 20k.
    expect(computeDiscount(100_000, "BIG", codes, NOW)?.amount_iqd).toBe(20_000);
  });

  it("fixed off, gated by min_subtotal", () => {
    expect(computeDiscount(50_000, "MINUS5K", codes, NOW)?.amount_iqd).toBe(5_000);
    expect(computeDiscount(20_000, "MINUS5K", codes, NOW)).toBeNull(); // under min
  });

  it("clamps a fixed discount to the subtotal (never below 0)", () => {
    expect(computeDiscount(3_000, "MINUS5K", [{ code: "MINUS5K", kind: "fixed", value: 5_000 }], NOW)?.amount_iqd).toBe(3_000);
  });

  it("honours the active window", () => {
    expect(computeDiscount(100_000, "EID", codes, NOW)?.amount_iqd).toBe(25_000);
    expect(
      computeDiscount(100_000, "EID", codes, new Date("2026-07-01T00:00:00Z")),
    ).toBeNull(); // expired
    expect(
      computeDiscount(100_000, "EID", codes, new Date("2026-06-01T00:00:00Z")),
    ).toBeNull(); // not started
  });

  it("rejects disabled codes, malformed end_iso, and unknown codes", () => {
    expect(computeDiscount(100_000, "OFF", codes, NOW)).toBeNull();
    expect(computeDiscount(100_000, "BROKEN", codes, NOW)).toBeNull();
    expect(computeDiscount(100_000, "NOPE", codes, NOW)).toBeNull();
  });

  it("guards empty/missing inputs", () => {
    expect(computeDiscount(100_000, "", codes, NOW)).toBeNull();
    expect(computeDiscount(100_000, "SAVE10", undefined, NOW)).toBeNull();
    expect(computeDiscount(0, "SAVE10", codes, NOW)).toBeNull();
  });
});
