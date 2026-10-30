// The sticky bar's chrome strings: tokens fill, every entry resolves in
// ar, en and ku, and the region name is today's, unchanged.

import { describe, expect, it } from "vitest";
import { STICKY_STRINGS, ss } from "./sticky_cta_bar.strings";

describe("ss", () => {
  it("names the missing field and fills the WhatsApp message", () => {
    expect(ss("stillMissing", "ar", { field: "المنطقة والشارع" })).toBe("باقي المنطقة والشارع");
    expect(ss("waPrefill", "ar", { product: "ويفر انتنس" })).toBe("هلا، أريد أطلب ويفر انتنس");
    expect(ss("waPrefill", "en", { product: "Wayfarer Intense" })).toBe("Hi, I'd like to order Wayfarer Intense");
  });

  it("the region name is the one the bar always had", () => {
    expect([ss("region", "ar"), ss("region", "en"), ss("region", "ku")]).toEqual([
      "إجراءات سريعة",
      "Quick actions",
      "کردارە خێراکان",
    ]);
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(STICKY_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
