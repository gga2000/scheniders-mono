// =====================================================================
// WhatsApp helper tests
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  resolveTenantWhatsapp,
  resolveTrackerContact,
  whatsappOrderLink,
  whatsappCartLink,
} from "./whatsapp";
import { toSectionTenant } from "./section-tenant";
import type { SectionTenant } from "../types";

// A real, plausible Iraqi number (no 6+ identical-digit run, so it passes the
// placeholder guard). wa.me digits = 9647801234567.
const PHONE = "+964 (780) 123-4567";
const PHONE_DIGITS = "9647801234567";

describe("resolveTenantWhatsapp (S3-01 single source)", () => {
  it("prefers the V2 commerce number over V1 contact and contact_phone", () => {
    const tenant = {
      store_config_v2: { commerce: { whatsapp_number: "07802301677" } },
      store_config: { contact: { whatsapp_number: "07901112233" } },
      contact_phone: "07905556677",
    };
    expect(resolveTenantWhatsapp(tenant)).toBe("07802301677");
  });

  it("falls back to V1 contact, then contact_phone", () => {
    expect(
      resolveTenantWhatsapp({
        store_config: { contact: { whatsapp_number: "07901112233" } },
      }),
    ).toBe("07901112233");
    expect(resolveTenantWhatsapp({ contact_phone: "07905556677" })).toBe(
      "07905556677",
    );
  });

  it("skips an implausible V2 number entirely", () => {
    const tenant = {
      store_config_v2: { commerce: { whatsapp_number: "000000000000" } },
      contact_phone: "07905556677",
    };
    // The whole candidate chain resolves via ?? (first non-null wins), so a
    // fake-looking V2 number yields null rather than silently deep-linking.
    expect(resolveTenantWhatsapp(tenant)).toBe(null);
  });

  it("treats a blank V2 number as unset and falls through", () => {
    const tenant = {
      store_config_v2: { commerce: { whatsapp_number: "  " } },
      store_config: { contact: { whatsapp_number: "07901112233" } },
    };
    expect(resolveTenantWhatsapp(tenant)).toBe("07901112233");
  });

  it("survives the toSectionTenant prune (the shape sections receive)", () => {
    const tenant: SectionTenant = {
      id: "t1",
      business_name: "Shop",
      slug: "shop",
      plan: "starter",
      status: "active",
      branding: {},
      settings: {},
      store_config_v2: { commerce: { whatsapp_number: "07802301677" } },
    };
    expect(resolveTenantWhatsapp(toSectionTenant(tenant))).toBe("07802301677");
  });

  it("the order tracker falls back to the commerce number when no call number is set", () => {
    expect(
      resolveTrackerContact({
        store_config_v2: { commerce: { whatsapp_number: "07802301677" } },
      }),
    ).toBe("07802301677");
    expect(
      resolveTrackerContact({
        store_config: { contact: { phone_number: "07901112233" } },
        store_config_v2: { commerce: { whatsapp_number: "07802301677" } },
      }),
    ).toBe("07901112233");
  });

  it("per-section override wins", () => {
    const tenant = {
      store_config_v2: { commerce: { whatsapp_number: "07802301677" } },
    };
    expect(resolveTenantWhatsapp(tenant, "07711223344")).toBe("07711223344");
  });
});

describe("whatsappOrderLink", () => {
  it("returns null when no phone is provided", () => {
    expect(
      whatsappOrderLink(null, { name: "Hat", price: "10 IQD" }, "en"),
    ).toBeNull();
    expect(whatsappOrderLink("", { name: "Hat" }, "en")).toBeNull();
  });

  it("normalises the phone to wa.me international digits", () => {
    const link = whatsappOrderLink(
      PHONE,
      { name: "Hat", url: "https://x.com/hat", price: "10,000 IQD" },
      "en",
    );
    expect(link).toMatch(new RegExp(`^https://wa\\.me/${PHONE_DIGITS}\\?text=`));
  });

  it("uses the English template by default", () => {
    const link = whatsappOrderLink(
      PHONE_DIGITS,
      { name: "Schneiders Hoodie", url: "https://x/p/hoodie", price: "45,000 IQD" },
      "en",
    )!;
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("Hi! I want to order:");
    expect(decoded).toContain("Schneiders Hoodie");
    expect(decoded).toContain("https://x/p/hoodie");
    expect(decoded).toContain("45,000 IQD");
  });

  it("uses the Arabic template for the ar locale", () => {
    const link = whatsappOrderLink(
      PHONE_DIGITS,
      { name: "هودي", url: "https://x/p/hoodie", price: "45,000 د.ع" },
      "ar",
    )!;
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("مرحبًا");
    expect(decoded).toContain("أريد طلب");
    expect(decoded).toContain("هودي");
    expect(decoded).toContain("السعر");
  });

  it("folds the chosen variant into the product name (EC26)", () => {
    const link = whatsappOrderLink(
      PHONE_DIGITS,
      { name: "Hoodie", variant: "Red / L", price: "45,000 IQD" },
      "en",
    )!;
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("Hoodie — Red / L");
  });
});

describe("whatsappCartLink (EC26)", () => {
  it("returns null when no usable phone is configured", () => {
    expect(
      whatsappCartLink(null, { items: [{ name: "x", quantity: 1 }] }, "en"),
    ).toBeNull();
  });

  it("lists every line with variant + quantity, the total, and delivery", () => {
    const link = whatsappCartLink(
      PHONE,
      {
        items: [
          { name: "Hoodie", variant: "Red / L", quantity: 2 },
          { name: "Cap", quantity: 1 },
        ],
        customer: {
          name: "Ali",
          phone: "07801234567",
          governorate: "Baghdad",
          area: "Karrada",
          address: "St 14",
        },
        total: "95,000 IQD",
      },
      "en",
    )!;
    expect(link).toMatch(new RegExp(`^https://wa\\.me/${PHONE_DIGITS}\\?text=`));
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("• Hoodie — Red / L × 2");
    expect(decoded).toContain("• Cap × 1");
    expect(decoded).toContain("Total: 95,000 IQD");
    expect(decoded).toContain("Name: Ali");
    expect(decoded).toContain("Governorate: Baghdad");
    expect(decoded).toContain("Address: St 14");
  });

  it("omits the delivery block when no customer details are given", () => {
    const link = whatsappCartLink(
      PHONE,
      { items: [{ name: "Cap", quantity: 1 }], total: "10,000 د.ع" },
      "ar",
    )!;
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("هلا، أريد أكمل طلبي");
    expect(decoded).toContain("المجموع: 10,000 د.ع");
    expect(decoded).not.toContain("بيانات التوصيل");
  });
});
