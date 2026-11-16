import { describe, expect, it } from "vitest";
import storefront from "./demo-store-storefront.json";
import { demoCountsLine, demoOpenUrl, demoStorefrontUrl } from "./demo-store";

describe("demo store helpers", () => {
  it("links the store at its own subdomain", () => {
    expect(demoStorefrontUrl("mithal")).toBe("https://mithal.usefermi.com");
  });

  it("builds the sign-in link on the merchant app, whatever path the setting carries", () => {
    expect(demoOpenUrl("https://schenidersapp.xyz", "abc")).toBe(
      "https://schenidersapp.xyz/api/auth/confirm?token_hash=abc&type=magiclink&next=%2Forders",
    );
    expect(demoOpenUrl("https://app.usefermi.com/", "a b")).toBe(
      "https://app.usefermi.com/api/auth/confirm?token_hash=a+b&type=magiclink&next=%2Forders",
    );
  });

  it("says what a reset made in one line", () => {
    expect(demoCountsLine({ products: 40, variants: 86, orders: 290, abandoned_carts: 8, expenses: 33 })).toBe(
      "290 orders (8 abandoned carts), 40 products, 33 expenses",
    );
  });
});

describe("the demo storefront design", () => {
  it("is a store config the seed accepts, named for the demo store, in Arabic", () => {
    expect(Array.isArray(storefront.pages)).toBe(true);
    expect(storefront.pages.length).toBeGreaterThan(0);
    expect(storefront.brand_kit.identity.name).toBe("متجر مثال");
    expect(storefront.default_locale).toBe("ar");
  });

  it("carries no phone number or WhatsApp ordering a shopper could reach", () => {
    const text = JSON.stringify(storefront);
    expect(text).not.toMatch(/07\d{9}|964\d{9}/);
    expect(text).not.toMatch(/"enable_whatsapp_order":true/);
  });
});
