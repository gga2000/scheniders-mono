import { describe, expect, it } from "vitest";
import {
  computeReferralDiscount,
  normalizeReferralCode,
  referralShareUrl,
  resolveReferral,
} from "./referral";

const ON = { enabled: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000, referrer_points: 50 };

describe("resolveReferral", () => {
  it("is on only with a real friend discount; referrer points need loyalty", () => {
    expect(resolveReferral(ON, { enabled: true })).toEqual({
      enabled: true, friendDiscountPct: 10, friendMaxDiscountIqd: 5000, referrerPoints: 50,
    });
    expect(resolveReferral(ON, null).referrerPoints).toBe(0);
    expect(resolveReferral({ ...ON, friend_discount_pct: 0 }).enabled).toBe(false);
    expect(resolveReferral({ ...ON, enabled: false }).enabled).toBe(false);
    expect(resolveReferral(null).enabled).toBe(false);
  });
});

describe("computeReferralDiscount", () => {
  it("applies the percent, the cap, and never exceeds the subtotal", () => {
    expect(computeReferralDiscount(25_000, ON)).toBe(2500);
    expect(computeReferralDiscount(80_000, ON)).toBe(5000);
    expect(computeReferralDiscount(80_000, { ...ON, friend_max_discount_iqd: undefined })).toBe(8000);
    expect(computeReferralDiscount(0, ON)).toBe(0);
    expect(computeReferralDiscount(25_000, { ...ON, enabled: false })).toBe(0);
  });
});

describe("normalizeReferralCode", () => {
  it("accepts the minted alphabet in any case or spacing, rejects the rest", () => {
    expect(normalizeReferralCode(" ab3k 7m ")).toBe("AB3K7M");
    expect(normalizeReferralCode("AB3K7")).toBeNull();     // too short
    expect(normalizeReferralCode("AB3K70")).toBeNull();    // 0 not in alphabet
    expect(normalizeReferralCode("")).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });
});

describe("referralShareUrl", () => {
  it("attaches the code to the store entry for both routing modes", () => {
    expect(referralShareUrl("https://kawkab.iq", "", "AB3K7M")).toBe("https://kawkab.iq/?ref=AB3K7M");
    expect(referralShareUrl("https://app.example", "/s/kawkab", "AB3K7M")).toBe("https://app.example/s/kawkab/?ref=AB3K7M");
  });
});
