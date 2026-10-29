// =====================================================================
// accordion_richtext `layout: "guarantee_card"` — «كرت الضمان» (spec §1.5)
// =====================================================================
// One espresso ticket that states every term once, with nothing to open:
// eyebrow, title, sub; numbered terms (title + body paragraphs); one stub
// link to the full policy; `id={anchor_id}` for the band's «الشروط» link.
// The call row never renders here. Plus the slice's other accordion props:
// they parse safely, and `heading_style: "chapter"` swaps the cards and
// quiet headings for ChapterHeading.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_BRAND_KIT, buildBrandKitVars } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import { IRAQ_TENANT, LIVE_PDP_POLICIES, lowerCtx } from "./_pdp-lower-fixtures";

const { schema } = accordion_richtext;

function render(input: unknown, locale: LocaleCode = "ar"): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/scheniders-iraq">
      <Render props={schema.parse(input)} ctx={lowerCtx(locale, IRAQ_TENANT)} />
    </StoreBaseProvider>,
  );
}

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const CARD = {
  allow_multiple: false,
  layout: "guarantee_card",
  heading_i18n: { ar: "كرت الضمان", en: "Guarantee card" },
  eyebrow_i18n: { ar: "ويا كل طلب من شنايدر", en: "With every Scheniders order" },
  sub_i18n: { ar: "حقك مكتوب هنا قبل ما تطلب", en: "Your rights, written down before you order" },
  anchor_id: "guarantee",
  policy_link: {
    href: "/policies/returns",
    label_i18n: { ar: "سياسة الإرجاع الكاملة", en: "Full return policy" },
  },
  items: [
    { title_i18n: { ar: "الدفع عند الاستلام" }, body_i18n: { ar: "ما تدفع إلا بعد ما يوصلك العطر." } },
    { title_i18n: { ar: "تفحصه والمندوب يمّك" }, body_i18n: { ar: "فقرة أولى.\n\nفقرة\nثانية." } },
    { title_i18n: { ar: "أسبوع تجربة ببيتك" }, body_i18n: { ar: "ترجّعه ونرجعلك فلوسه." } },
  ],
  // Ignored by the card: the mid-page call card is gone.
  call_row: { prompt_i18n: { ar: "تحب تحچي ويانا؟" }, action_i18n: { ar: "اتصل" } },
};

describe("accordion_richtext slice 1d props", () => {
  it("accepts the card config", () => {
    const parsed = schema.parse(CARD);
    expect(parsed.layout).toBe("guarantee_card");
    expect(parsed.anchor_id).toBe("guarantee");
    expect(parsed.policy_link?.href).toBe("/policies/returns");
  });

  it.each<[string, unknown]>([
    ["eyebrow_i18n", "x"],
    ["sub_i18n", 3],
    ["anchor_id", "Guarantee!"],
    ["anchor_id", "1guarantee"],
    ["policy_link", { href: "https://example.com/returns", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "//example.com/returns", label_i18n: { ar: "x" } }],
    // Browsers read `\` as `/`: `/\evil.com` is protocol-relative.
    ["policy_link", { href: "/\\evil.example", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "/\\x", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "/policies\\returns", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "/policies/ returns", label_i18n: { ar: "x" } }],
    ["policy_link", { href: "/policies/returns" }],
    ["heading_style", "huge"],
  ])("a bad %s (%j) falls back to absent", (key, value) => {
    const parsed = schema.parse({ ...CARD, [key]: value });
    expect(parsed[key as keyof typeof parsed]).toBeUndefined();
    expect(parsed.items).toHaveLength(3);
  });

  it("policy_link: a store path is kept; a rejected href is dropped, never thrown", () => {
    expect(schema.parse(CARD).policy_link?.href).toBe("/policies/returns");
    for (const href of ["/\\x", "//x"]) {
      const input = { ...CARD, policy_link: { ...CARD.policy_link, href } };
      expect(() => schema.parse(input)).not.toThrow();
      expect(schema.parse(input).policy_link).toBeUndefined();
    }
  });
});

describe("guarantee card", () => {
  const ar = render(CARD);
  const en = render(CARD, "en");

  it("is one espresso card carrying the anchor id", () => {
    expect(count(ar, 'id="guarantee"')).toBe(1);
    expect(ar).toMatch(/<article id="guarantee" data-guarantee-card="true" class="[^"]*bg-bk-secondary[^"]*text-bk-on-secondary/);
  });

  it("eyebrow, title at the chapter scale, sub", () => {
    expect(ar).toMatch(/data-i18n-field="eyebrow_i18n"[^>]*>ويا كل طلب من شنايدر</);
    expect(ar).toMatch(/<h2 data-i18n-field="heading_i18n" class="[^"]*text-bk-chapter[^"]*">كرت الضمان<\/h2>/);
    expect(ar).toContain("حقك مكتوب هنا قبل ما تطلب");
  });

  it("states every term, numbered, always visible: nothing to open", () => {
    expect(count(ar, "data-guarantee-term=")).toBe(3);
    expect([...ar.matchAll(/data-guarantee-num="true"[^>]*>(\d)</g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    expect(ar).not.toContain("<details");
    expect(ar).not.toContain("<button");
    expect(ar).not.toContain("aria-expanded");
  });

  it("keeps the blank-line paragraph split", () => {
    const term2 = ar.slice(ar.indexOf('data-guarantee-term="1"'), ar.indexOf('data-guarantee-term="2"'));
    expect(count(term2, "<p ")).toBe(2);
    expect(term2).toContain("فقرة\nثانية.");
  });

  it("ends with one stub link to the full policy, under the store base", () => {
    expect(count(ar, "<a ")).toBe(1);
    expect(ar).toMatch(/href="\/s\/scheniders-iraq\/policies\/returns"[^>]*>.*سياسة الإرجاع الكاملة/);
    expect(en).toContain("Full return policy");
  });

  it("never renders the call row", () => {
    expect(ar).not.toContain("تحب تحچي ويانا؟");
    expect(ar).not.toContain("tel:");
  });

  it("yellow only tints numerals and the eyebrow (D4), never fills", () => {
    expect(ar).not.toContain("bg-bk-primary");
    expect(ar).toContain("text-bk-primary");
  });

  it("reads right to left with classes, never dir", () => {
    expect(ar).not.toMatch(/\sdir="/);
    expect(ar).toContain("flex-row-reverse");
    expect(en).not.toContain("flex-row-reverse");
  });

  it("without anchor_id: no id; without policy_link: no stub", () => {
    const bare = render({ ...CARD, anchor_id: undefined, policy_link: undefined });
    expect(bare).not.toContain('id="');
    expect(bare).not.toContain("<a ");
    expect(bare).toContain("data-guarantee-card");
  });

  it("a label that resolves for the locale keeps the link (ku falls back to ar)", () => {
    const ku = render(CARD, "ku");
    expect(count(ku, "<a ")).toBe(1);
    expect(ku).toMatch(/<a [^>]*>.*سياسة الإرجاع الكاملة.*<\/a>/);
  });

  it("a label that resolves empty: no stub, no text-less arrow link", () => {
    const blank = render({ ...CARD, policy_link: { href: "/policies/returns", label_i18n: { ar: " ", en: "" } } }, "ku");
    expect(blank).not.toContain("<a ");
    expect(blank).not.toContain("arrow_back");
    expect(blank).not.toContain("border-dashed");
    expect(blank).toContain("data-guarantee-card");
  });

  it("no items: no card", () => {
    expect(render({ ...CARD, items: [] })).toBe("");
  });
});

describe("heading_style chapter in the existing layouts", () => {
  const titled = { ...LIVE_PDP_POLICIES, heading_i18n: { ar: "ضماناتك", en: "Our promise" } };

  it.each([undefined, "quiet"] as const)("layout %s: ChapterHeading in place of today's heading", (layout) => {
    const html = render({ ...titled, layout, heading_style: "chapter" });
    expect(html).toMatch(/<h2 data-i18n-field="heading_i18n" class="[^"]*text-bk-chapter[^"]*">ضماناتك<\/h2>/);
  });

  it.each([undefined, "quiet"] as const)("layout %s: heading_style section is today's markup", (layout) => {
    expect(render({ ...titled, layout, heading_style: "section" })).toBe(render({ ...titled, layout }));
  });
});

describe("guarantee card contrast on the scheniders brand kit", () => {
  // Body `text-bk-on-secondary/90`, sub `/75`, numerals and eyebrow
  // `text-bk-primary`, all on `bg-bk-secondary`.
  const vars = buildBrandKitVars({
    ...EMPTY_BRAND_KIT,
    colors: {
      primary: "#f7db17",
      secondary: "#3e3129",
      accent: "#fbb82e",
      surface: "#fdf8ef",
      surface_alt: "#f8efdf",
      ink: "#483b36",
      success: "#3ecf8e",
      danger: "#e2574c",
    },
  }) as Record<string, string>;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0] ?? 0) + 0.7152 * f(c[1] ?? 0) + 0.0722 * f(c[2] ?? 0);
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + (bg[i] ?? 0) * (1 - alpha));
  const bg = rgb(vars["--bk-secondary"] ?? "");

  it.each([
    ["term bodies at 90%", 0.9],
    ["the sub line at 75%", 0.75],
  ])("%s clear 7:1", (_label, alpha) => {
    expect(ratio(over(rgb(vars["--bk-on-secondary"] ?? ""), bg, alpha), bg)).toBeGreaterThanOrEqual(7);
  });

  it("the yellow numerals clear 7:1", () => {
    expect(ratio(rgb(vars["--bk-primary"] ?? ""), bg)).toBeGreaterThanOrEqual(7);
  });
});
