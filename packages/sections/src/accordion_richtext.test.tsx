// =====================================================================
// accordion_richtext — cards baseline (frozen) + opt-in quiet layout
// =====================================================================
// The cards render is what every tenant's existing config ships. The
// baseline block below was written and snapshotted BEFORE the opt-in
// `layout: "quiet"` field existed; a diff in it is a back-compat break,
// not a snapshot to refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveI18n, type LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import { splitParagraphs, toggleOpen } from "./accordion_richtext.client";
import type { SectionRenderContext } from "./_types";
import type { Tenant } from "./types";

type AccordionProps = typeof accordion_richtext.defaultProps;

const tenant: Tenant = {
  id: "t1",
  business_name: "t1",
  slug: "t1",
  plan: "pro",
  status: "active",
  branding: {},
  settings: {},
  store_config: {},
};

function ctx(locale: LocaleCode): SectionRenderContext {
  return {
    tenant,
    runtime: {
      page_id: "product",
      breakpoint: "mobile",
      locale,
      audience_segments: [],
      ab_test_arms: {},
      now: new Date("2026-05-15T00:00:00Z"),
    },
    products: [],
    categories: [],
  };
}

function render(props: AccordionProps, locale: LocaleCode = "ar"): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={ctx(locale)} />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** scheniders-iraq's live PDP policy accordion (store_config_v2_draft
 *  pages[2].sections[1].base), frozen verbatim — merchant typos included. */
const LIVE_POLICIES: AccordionProps = {
  allow_multiple: false,
  items: [
    {
      title_i18n: { ar: "سياسة الدفع عند الاستلام", en: "Cash-on-delivery policy" },
      body_i18n: {
        ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال العينة الزجاجية المرفقة مجاناُ مع كل طلب.",
        en: "Payment happens only after receiving the perfume and testing it via the free glass sample included with every order.",
      },
    },
    {
      title_i18n: { ar: "شحن فائق السرعة", en: "Ultra-fast shipping" },
      body_i18n: {
        ar: "أغلب الطلبات توصل خلال ٢٤ ساعة من تثبيت الطلب.",
        en: "Most orders arrive within 24 hours of confirmation.",
      },
    },
    {
      title_i18n: {
        ar: "كرت الضمان المميز و سياسة الاسترجاع",
        en: "Premium warranty card & return policy",
      },
      body_i18n: {
        ar: "عند استلام المنتج يتم التأكد من الجودة والمواصفات والفوحان والثبات بحضور المندوب, اي اختلاف يحق للزبون رفض المنتج ويتم ارجاع قيمته كاملة.\n\nويحق للزبون استعمال العطر والاحتفاظ به لمدة اسبوع كامل من تاريخ استلام الطلب واختباره من راحة منزله. ان لم تعجبه التجربة العطرية او اكتشافه لفرق بالمواصفات المذكورة يحق له ارجاع العطر واستلام قيمته من قبلنا.",
        en: "On delivery, quality, projection and longevity are verified with the courier present — any mismatch entitles you to refuse the product for a full refund.\n\nYou may keep and test the perfume for a full week from delivery; if the experience disappoints or the specs differ, return it for a full refund.",
      },
    },
    {
      title_i18n: { ar: "عطور اصلية", en: "Authentic perfumes" },
      body_i18n: {
        ar: "جميع عطورنا مختارة يدوياً وبعناية من افخم المصادر العالمية, ومن اجود انواع العطور والخامات العطرية. لا نتعامل بالعطور التركية المصنعة بالجملة او العطور الصينية الرديئة",
        en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials. We never deal in bulk-made or low-grade imitations.",
      },
    },
    {
      title_i18n: { ar: "خدمة العملاء", en: "Customer care" },
      body_i18n: {
        ar: "سولف ويانا ! احنا موجودين بأي وقت وبكل وقت حتى نجاوب بكل حب ع اسئلتكم واستفساراتكم من خلال الواتساب",
        en: "Talk to us! We are available around the clock to answer your questions with love, over WhatsApp.",
      },
    },
  ],
};

describe("accordion_richtext cards baseline — frozen", () => {
  const { defaultProps } = accordion_richtext;

  it("defaultProps ar", () => {
    expect(render(defaultProps, "ar")).toMatchSnapshot();
  });

  it("defaultProps en", () => {
    expect(render(defaultProps, "en")).toMatchSnapshot();
  });

  it("defaultProps allow_multiple ar", () => {
    expect(render({ ...defaultProps, allow_multiple: true }, "ar")).toMatchSnapshot();
  });

  it("LIVE_POLICIES ar", () => {
    expect(render(LIVE_POLICIES, "ar")).toMatchSnapshot();
  });

  it("LIVE_POLICIES en", () => {
    expect(render(LIVE_POLICIES, "en")).toMatchSnapshot();
  });

  it("pins the cards markup by literal, not by comparing a branch with itself", () => {
    const n = LIVE_POLICIES.items.length;
    const html = render(LIVE_POLICIES, "ar");
    expect(count(html, "bento-card")).toBe(n);
    expect(html).toContain("group-open:rotate-45");
    expect(count(html, "<details")).toBe(n);
    expect(count(html, 'open=""')).toBe(1);
    expect(html).toContain("color-mix(in srgb, var(--bk-accent, #ffd84a) 55%");
    expect(html).toContain("dashed color-mix(in srgb, var(--bk-ink, #1a1a1a) 10%");
    expect(html).not.toContain("<button");
  });

  it("an unset or explicit cards layout renders the same markup", () => {
    for (const locale of ["ar", "en"] as const) {
      const base = render(LIVE_POLICIES, locale);
      expect(render({ ...LIVE_POLICIES, layout: undefined }, locale)).toBe(base);
      expect(render({ ...LIVE_POLICIES, layout: "cards" }, locale)).toBe(base);
    }
  });
});

describe("schema", () => {
  const { schema, defaultProps } = accordion_richtext;

  it("defaultProps carries no layout", () => {
    expect("layout" in defaultProps).toBe(false);
    expect(schema.safeParse(defaultProps).success).toBe(true);
  });

  it("the live config parses with layout undefined", () => {
    const r = schema.safeParse(LIVE_POLICIES);
    expect(r.success).toBe(true);
    expect(r.data?.layout).toBeUndefined();
  });

  it("accepts quiet", () => {
    const r = schema.safeParse({ ...LIVE_POLICIES, layout: "quiet" });
    expect(r.success).toBe(true);
    expect(r.data?.layout).toBe("quiet");
  });

  it("an unknown layout parses to undefined (the section is never dropped) and renders cards", () => {
    const cards = render(LIVE_POLICIES, "ar");
    for (const bad of ["grid", 42]) {
      const r = schema.safeParse({ ...LIVE_POLICIES, layout: bad });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.layout).toBeUndefined();
      expect(render(r.data, "ar")).toBe(cards);
    }
  });
});

describe("quiet layout", () => {
  const QUIET: AccordionProps = { ...LIVE_POLICIES, layout: "quiet" };
  const n = QUIET.items.length;
  const ar = render(QUIET, "ar");
  const en = render(QUIET, "en");

  it("drops every cards surface", () => {
    for (const html of [ar, en]) {
      expect(html).not.toContain("<details");
      expect(html).not.toContain("bento-card");
      expect(html).not.toContain("--bk-shadow-card");
      expect(html).not.toContain("color-mix(");
      expect(html).not.toContain("--bk-border-thickness");
    }
  });

  it("is one hairline-ruled list in the divider token", () => {
    expect(ar).toContain("divide-y divide-bk-divider border-y border-bk-divider");
  });

  it("renders one closed native button per row, wired to its panel", () => {
    expect(count(ar, '<button type="button"')).toBe(n);
    expect(count(ar, 'aria-expanded="false"')).toBe(n);
    expect(count(ar, 'aria-expanded="true"')).toBe(0);
    const controls = [...ar.matchAll(/aria-controls="([^"]+)"/g)].map((m) => m[1]);
    const ids = [...ar.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(controls).toHaveLength(n);
    expect(new Set(controls).size).toBe(n);
    expect(ids).toEqual(controls);
    expect(count(ar, "grid-template-rows:0fr")).toBe(n);
    expect(count(ar, 'inert=""')).toBe(n);
  });

  it("keeps every body in the HTML while closed, split into paragraphs", () => {
    for (const item of LIVE_POLICIES.items) {
      for (const p of resolveI18n(item.body_i18n, "ar").split(/\n{2,}/)) expect(ar).toContain(p);
      for (const p of resolveI18n(item.body_i18n, "en").split(/\n{2,}/)) expect(en).toContain(p);
    }
    // 4 single-paragraph bodies + item 3's two paragraphs.
    expect(count(ar, "<p ")).toBe(n + 1);
  });

  it("uses one ink chevron for every row", () => {
    const chevrons = [...ar.matchAll(/<span class="([^"]*)"[^>]*>expand_more<\/span>/g)];
    expect(chevrons).toHaveLength(n);
    for (const [, cls] of chevrons) expect(cls).toContain("text-bk-ink");
    expect(ar).not.toContain(">add<");
  });

  it("flips visual order for Arabic with classes, never dir=rtl", () => {
    expect(count(ar, "flex-row-reverse")).toBe(n);
    expect(count(ar, "text-right")).toBe(n * 2 + 1);
    expect(count(ar, "pl-8")).toBe(n);
    expect(ar).not.toContain("text-left");
    expect(ar).not.toContain("pr-8");

    expect(en).not.toContain("flex-row-reverse");
    expect(en).not.toContain("text-right");
    expect(en).not.toContain("pl-8");
    expect(count(en, "text-left")).toBe(n * 2 + 1);
    expect(count(en, "pr-8")).toBe(n);

    for (const html of [ar, en]) {
      expect(html).not.toContain('dir="rtl"');
      const dirTags = [...html.matchAll(/<(\w+)[^>]*\sdir="auto"/g)].map((m) => m[1]);
      expect(dirTags.length).toBe(count(html, 'dir="auto"'));
      expect(new Set(dirTags)).toEqual(new Set(["p"]));
    }
  });

  it("meets the touch target and motion contract", () => {
    expect(count(ar, "min-h-14")).toBe(n);
    expect(ar).toContain("duration-bk-base");
    expect(count(ar, "motion-reduce:transition-none")).toBeGreaterThanOrEqual(n * 2);
  });

  it("renders a heading only when heading_i18n resolves", () => {
    expect(ar).not.toContain("<h2");
    const withHeading = render(
      { ...QUIET, heading_i18n: { ar: "ضماناتك", en: "Our promise" } },
      "ar",
    );
    expect(count(withHeading, "<h2")).toBe(1);
    expect(withHeading).toMatch(/<h2[^>]*data-i18n-field="heading_i18n"[^>]*>ضماناتك<\/h2>/);
    expect(withHeading).toMatch(/<h2[^>]*font-bk-display/);
  });

  it("tags the merchant fields for the editor", () => {
    expect(ar).toContain('data-i18n-field="items[0].title_i18n"');
    expect(ar).toContain('data-i18n-field="items[0].body_i18n"');
  });
});

describe("toggleOpen", () => {
  it("exclusive", () => {
    expect(toggleOpen([], 2, true)).toEqual([2]);
    expect(toggleOpen([2], 2, true)).toEqual([]);
    expect(toggleOpen([2], 4, true)).toEqual([4]);
  });

  it("multi", () => {
    expect(toggleOpen([2], 4, false)).toEqual([2, 4]);
    expect(toggleOpen([2, 4], 2, false)).toEqual([4]);
  });

  it("never mutates its input", () => {
    const input = Object.freeze([2, 4]);
    toggleOpen(input, 2, false);
    toggleOpen(input, 7, false);
    toggleOpen(input, 7, true);
    expect(input).toEqual([2, 4]);
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines, keeps single newlines", () => {
    expect(splitParagraphs("a\n\nb\nc")).toEqual(["a", "b\nc"]);
  });
});
