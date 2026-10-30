// The term sheet's own rules: each catches its bad example, passes its
// approved rewrite, and leaves the words it must not touch alone.

import { describe, expect, it } from "vitest";
import { COPY_TERMS, lintArabicCopy } from "./_copy-terms";

describe("COPY_TERMS", () => {
  it.each(COPY_TERMS.map((r) => [r.id, r] as const))("%s: catches its example, passes the rewrite", (_id, rule) => {
    expect(rule.pattern.test(rule.example.bad)).toBe(true);
    expect(rule.pattern.test(rule.example.good)).toBe(false);
    expect(rule.reason.length).toBeGreaterThan(20);
  });

  it("ids are unique", () => {
    expect(new Set(COPY_TERMS.map((r) => r.id)).size).toBe(COPY_TERMS.length);
  });
});

describe("lintArabicCopy", () => {
  const ids = (text: string, scope: "chrome" | "tenant" = "tenant") =>
    lintArabicCopy(text, scope).map((h) => h.rule);

  it("عملاء is a tenant rule only", () => {
    expect(ids("آراء العملاء", "tenant")).toEqual(["customer-word"]);
    expect(ids("آراء العملاء", "chrome")).toEqual([]);
    expect(ids("زبائن شنايدر")).toEqual([]);
    expect(ids("شغل وعمل")).toEqual([]);
  });

  it("hamza: the bare spellings, with or without a clitic, and never inside another word", () => {
    expect(ids("الأسئلة الاكثر شيوعا")).toEqual(["hamza"]);
    expect(ids("اذا ما عجبك")).toEqual(["hamza"]);
    expect(ids("إدا مازلت تريد")).toEqual(["hamza"]);
    expect(ids("عطور اصلية")).toEqual(["hamza"]);
    expect(ids("خلال اسبوع")).toEqual(["hamza"]);
    expect(ids("للاسبوع الجاي")).toEqual(["hamza"]);
    expect(ids("أكثر عطر، أصلية، إذا، أسبوع")).toEqual([]);
    expect(ids("الاسبوعية")).toEqual([]);
  });

  it("واتساب without ال", () => {
    expect(ids("نفس الرقم للاتصال والواتساب")).toEqual(["whatsapp-without-al"]);
    expect(ids("ابعث نفس الطلب بالواتساب")).toEqual(["whatsapp-without-al"]);
    expect(ids("راسلنا واتساب")).toEqual([]);
  });

  it("the Arabic comma, only between Arabic words", () => {
    expect(ids("المصادر العالمية, ومن")).toEqual(["arabic-comma"]);
    expect(ids("075, 077")).toEqual([]);
  });

  it("counts: a {count} slot before a singular is chrome-only; 3–10 before a singular anywhere", () => {
    expect(ids("{count} تقييم", "chrome")).toEqual(["count-slot-singular"]);
    expect(ids("{count} تقييم", "tenant")).toEqual([]);
    expect(ids("6 تقييم")).toEqual(["count-3-10-plural"]);
    expect(ids("خلال 24 ساعة")).toEqual([]);
    expect(ids("10 دقايق")).toEqual([]);
    expect(ids("الرقم ناقص: {count} من 11 رقم", "chrome")).toEqual([]);
  });

  it("Latin digits and the guarantee's one name", () => {
    expect(ids("شارع ١٤ رمضان")).toEqual(["latin-digits"]);
    expect(ids("بطاقة الضمان")).toEqual(["guarantee-name"]);
    expect(ids("كرت الضمان")).toEqual([]);
    expect(ids("اتصل بنا")).toEqual(["call-us"]);
    expect(ids("اتصل بينا")).toEqual([]);
  });
});
