// The soft cart/checkout chrome strings: tokens fill, every entry has
// ar, en and ku, and «اطلب عبر واتساب» is the express tile's words.

import { describe, expect, it } from "vitest";
import { CART_STRINGS, cs } from "./cart_checkout.strings";
import { EXPRESS_STRINGS } from "./pdp_express/strings";
import { COPY_ACTIONS } from "./_copy-terms";

describe("cs", () => {
  it("fills the quantity and the delivery tokens", () => {
    expect(cs("lineQuantity", "ar", { count: 2 })).toBe("الكمية 2");
    expect(cs("deliveryVaries", "en", { range: "3,000 – 5,000 IQD" })).toBe("Varies by governorate: 3,000 – 5,000 IQD");
    expect(cs("deliveryWithin", "ar", { hours: "24 ساعة" })).toBe("التوصيل خلال 24 ساعة");
  });

  it("ordering on WhatsApp has one name: the express tile's", () => {
    expect(CART_STRINGS.orderOnWhatsapp.ar).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(EXPRESS_STRINGS.whatsapp.ar).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(CART_STRINGS.orderOnWhatsapp.en).toBe(EXPRESS_STRINGS.whatsapp.en);
  });

  it("every entry has ar, en and ku", () => {
    for (const entry of Object.values(CART_STRINGS)) {
      expect(Object.keys(entry).sort()).toEqual(["ar", "en", "ku"]);
    }
  });
});
