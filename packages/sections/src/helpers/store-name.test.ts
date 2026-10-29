import { describe, expect, it } from "vitest";
import { storeDisplayName } from "./store-name";

const withName = (name_i18n: unknown, business_name: string | null = "Scheniders Iraq") => ({
  id: "t1",
  business_name,
  store_config_v2: { commerce: { contact: { call_number: "07779703832", name_i18n } } },
});

describe("storeDisplayName", () => {
  it("uses commerce.contact.name_i18n in the shopper's locale", () => {
    const t = withName({ ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" });
    expect(storeDisplayName(t, "ar")).toBe("شنايدر");
    expect(storeDisplayName(t, "en")).toBe("Scheniders");
    expect(storeDisplayName(t, "ku")).toBe("شنایدەر");
  });

  it("follows the locale fallback chain (ku → ar)", () => {
    expect(storeDisplayName(withName({ ar: "شنايدر" }), "ku")).toBe("شنايدر");
  });

  it("falls back to business_name when name_i18n is absent", () => {
    const t = { business_name: "  Scheniders Iraq ", store_config_v2: { commerce: { contact: { call_number: "07779703832" } } } };
    expect(storeDisplayName(t, "ar")).toBe("Scheniders Iraq");
  });

  it("falls back to business_name when name_i18n is malformed or blank", () => {
    expect(storeDisplayName(withName("شنايدر"), "ar")).toBe("Scheniders Iraq");
    expect(storeDisplayName(withName({ ar: 5 }), "ar")).toBe("Scheniders Iraq");
    expect(storeDisplayName(withName({ ar: "   " }), "ar")).toBe("Scheniders Iraq");
  });

  it("reads the name even when the contact block has no usable call number", () => {
    const t = { business_name: "x", store_config_v2: { commerce: { contact: { name_i18n: { ar: "شنايدر" } } } } };
    expect(storeDisplayName(t, "ar")).toBe("شنايدر");
  });

  it('is "" for a tenant with neither', () => {
    expect(storeDisplayName({ id: "t1" }, "ar")).toBe("");
    expect(storeDisplayName({ business_name: null }, "ar")).toBe("");
    expect(storeDisplayName(null, "ar")).toBe("");
    expect(storeDisplayName(undefined, "en")).toBe("");
  });
});
