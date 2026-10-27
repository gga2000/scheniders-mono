import { describe, expect, it } from "vitest";
import { buildVCard, vcardFileName, vcardHref } from "./vcard";

describe("buildVCard", () => {
  it("writes a vCard 3.0 with the name and the E.164 number, CRLF-separated", () => {
    expect(
      buildVCard({ name: "متجر — تأكيد الطلبات", phoneE164: "+9647779703832" }),
    ).toBe(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "N:متجر — تأكيد الطلبات;;;;",
        "FN:متجر — تأكيد الطلبات",
        "TEL;TYPE=CELL,VOICE:+9647779703832",
        "END:VCARD",
      ].join("\r\n"),
    );
  });

  it("escapes the characters vCard text reserves", () => {
    const card = buildVCard({ name: "A, B; C\\D\nE", phoneE164: "+9647701234567" });
    expect(card).toContain("FN:A\\, B\\; C\\\\D\\nE");
  });
});

describe("vcardHref", () => {
  it("is a data URL that decodes back to the card", () => {
    const card = buildVCard({ name: "x", phoneE164: "+9647701234567" });
    const href = vcardHref(card);
    expect(href.startsWith("data:text/vcard;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(href.slice(href.indexOf(",") + 1))).toBe(card);
  });
});

describe("vcardFileName", () => {
  it("strips path and reserved characters", () => {
    expect(vcardFileName('متجر/شنايدر: "طلبات"')).toBe("متجر شنايدر طلبات.vcf");
  });

  it("never produces an empty name", () => {
    expect(vcardFileName("   ")).toBe("contact.vcf");
  });
});
