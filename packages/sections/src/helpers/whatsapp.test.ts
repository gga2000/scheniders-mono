// =====================================================================
// WhatsApp helper tests
// =====================================================================

import { describe, expect, it } from "vitest";
import { whatsappOrderLink } from "./whatsapp";

describe("whatsappOrderLink", () => {
  it("returns null when no phone is provided", () => {
    expect(
      whatsappOrderLink(null, { name: "Hat", price: "10 IQD" }, "en"),
    ).toBeNull();
    expect(whatsappOrderLink("", { name: "Hat" }, "en")).toBeNull();
  });

  it("strips non-digit characters from the phone number", () => {
    const link = whatsappOrderLink(
      "+964 (770) 000-0000",
      { name: "Hat", url: "https://x.com/hat", price: "10,000 IQD" },
      "en",
    );
    expect(link).toMatch(/^https:\/\/wa\.me\/9647700000000\?text=/);
  });

  it("uses the English template by default", () => {
    const link = whatsappOrderLink(
      "9647700000000",
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
      "9647700000000",
      { name: "هودي", url: "https://x/p/hoodie", price: "45,000 د.ع" },
      "ar",
    )!;
    const decoded = decodeURIComponent(link.split("?text=")[1]!);
    expect(decoded).toContain("مرحبًا");
    expect(decoded).toContain("أريد طلب");
    expect(decoded).toContain("هودي");
    expect(decoded).toContain("السعر");
  });
});
