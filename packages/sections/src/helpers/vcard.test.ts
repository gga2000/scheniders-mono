import { describe, expect, it } from "vitest";
import { buildVCard, vcardContactName, vcardFileName, vcardHref } from "./vcard";

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

describe("vcardContactName", () => {
  const plain = { business_name: "متجر شنايدر" };
  const named = {
    business_name: "Scheniders Iraq",
    store_config_v2: {
      commerce: {
        contact: {
          call_number: "07779703832",
          name_i18n: { ar: "شنايدر", en: "Scheniders", ku: "شنایدەر" },
        },
      },
    },
  };

  it("names the contact after business_name when no name_i18n is set", () => {
    expect(vcardContactName(plain, "ar")).toBe("متجر شنايدر — تأكيد الطلبات");
    expect(vcardContactName(plain, "en")).toBe("متجر شنايدر — order confirmation");
    expect(vcardContactName(plain, "ku")).toBe("متجر شنايدر — پشتڕاستکردنەوەی داواکاری");
  });

  it("uses commerce.contact.name_i18n when the store set one", () => {
    expect(vcardContactName(named, "ar")).toBe("شنايدر — تأكيد الطلبات");
    expect(vcardContactName(named, "en")).toBe("Scheniders — order confirmation");
  });

  it("trims the template when the store has no name at all", () => {
    expect(vcardContactName({}, "ar")).toBe("— تأكيد الطلبات");
  });
});
