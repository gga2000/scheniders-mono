// faq_contact_split — the opt-in `compact: true` presentation (the product
// page's FAQ in the express buy box's visual language). Static markup only.
// The default markup is pinned in _pdp-lower-baseline-snapshot.test.tsx.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode, PageId } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import {
  BARE_TENANT,
  IRAQ_TENANT,
  LIVE_PDP_FAQ,
  lowerCtx,
  type FaqProps,
} from "./_pdp-lower-fixtures";
import type { Tenant } from "./types";

function render(
  props: FaqProps,
  locale: LocaleCode = "ar",
  tenant: Tenant = IRAQ_TENANT,
  page: PageId = "product",
): string {
  const Render = faq_contact_split.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render props={props} ctx={lowerCtx(locale, tenant, page)} />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const COMPACT: FaqProps = { ...LIVE_PDP_FAQ, compact: true };
const n = COMPACT.items.length;

describe("schema", () => {
  const { schema, defaultProps } = faq_contact_split;

  it("keeps `compact` out of defaultProps", () => {
    expect(defaultProps).not.toHaveProperty("compact");
    expect(schema.safeParse(defaultProps).success).toBe(true);
  });

  it("the live config parses with compact undefined", () => {
    const r = schema.safeParse(LIVE_PDP_FAQ);
    expect(r.success).toBe(true);
    expect(r.data?.compact).toBeUndefined();
  });

  it("accepts true", () => {
    expect(schema.safeParse(COMPACT).data?.compact).toBe(true);
  });

  it("a malformed value parses to undefined and renders the default", () => {
    const base = render(LIVE_PDP_FAQ);
    for (const bad of ["yes", 1, { on: true }]) {
      const r = schema.safeParse({ ...LIVE_PDP_FAQ, compact: bad });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.compact).toBeUndefined();
      expect(render(r.data)).toBe(base);
    }
  });

  it("compact: false renders the default byte for byte", () => {
    for (const locale of ["ar", "en"] as const) {
      expect(render({ ...LIVE_PDP_FAQ, compact: false }, locale)).toBe(render(LIVE_PDP_FAQ, locale));
    }
  });
});

describe("compact", () => {
  const ar = render(COMPACT, "ar");
  const en = render(COMPACT, "en");

  it("draws none of the cards / ledger surfaces or decoration", () => {
    for (const html of [ar, en]) {
      expect(html).not.toContain("--bk-shadow-card");
      expect(html).not.toContain("-top-4 left-1/2");
      expect(html).not.toContain("lg:col-span-3");
      expect(html).not.toContain("<img");
      expect(html).not.toContain('data-i18n-field="eyebrow_i18n"');
      expect(html).not.toContain('data-i18n-field="sub_i18n"');
      expect(html).not.toContain("color-mix(");
    }
  });

  it("titles the block with one start-aligned display heading", () => {
    expect(count(ar, "<h2")).toBe(1);
    expect(ar).toMatch(
      /<h2 data-i18n-field="title_i18n" class="[^"]*font-bk-display[^"]*text-right[^"]*">الأسئلة الأكثر شيوعا<\/h2>/,
    );
    expect(en).toMatch(/<h2 data-i18n-field="title_i18n" class="[^"]*text-left[^"]*">Frequently asked questions<\/h2>/);
  });

  it("owns the page's h1 on /faq and /contact, as the default does", () => {
    for (const page of ["faq", "contact"] as const) {
      const html = render(COMPACT, "ar", IRAQ_TENANT, page);
      expect(count(html, "<h1")).toBe(1);
      expect(html).not.toContain("<h2");
    }
  });

  it("is one hairline list of closed native rows in one exclusive group", () => {
    expect(ar).toContain("divide-y divide-bk-divider border-y border-bk-divider");
    const details = ar.match(/<details\b[^>]*>/g) ?? [];
    expect(details).toHaveLength(n);
    expect(details.filter((d) => /\bopen(=""|\s|>)/.test(d))).toHaveLength(0);
    expect(new Set(details.map((d) => d.match(/name="([^"]+)"/)?.[1] ?? "")).size).toBe(1);
    expect(ar).not.toContain("<button");
  });

  it("keeps every answer in the HTML while closed", () => {
    for (const item of COMPACT.items) {
      expect(ar).toContain(item.a_i18n.ar ?? "");
      expect(en).toContain(item.a_i18n.en ?? "");
    }
  });

  it("uses one ink chevron per row, and 56px rows", () => {
    const chevrons = [...ar.matchAll(/<span class="([^"]*)"[^>]*>expand_more<\/span>/g)];
    expect(chevrons).toHaveLength(n);
    for (const [, cls] of chevrons) {
      expect(cls).toContain("text-bk-ink");
      expect(cls).toContain("group-open:rotate-180");
      expect(cls).toContain("motion-reduce:transition-none");
    }
    expect(count(ar, "min-h-14")).toBe(n);
  });

  it("folds the contact card into one WhatsApp row on the store number", () => {
    expect(count(ar, 'data-action-row="whatsapp"')).toBe(1);
    expect(ar).toContain('href="https://wa.me/9647779703832"');
    expect(ar).toContain('target="_blank"');
    expect(ar).toContain('<span data-i18n-field="contact.cta_label_i18n">تواصل معنا</span>');
    expect(ar).toContain('data-i18n-field="contact.title_i18n"');
    expect(ar).toContain('data-i18n-field="contact.sub_i18n"');
    expect(ar).toContain("min-h-11");
    // The row comes after the list.
    expect(ar.indexOf('data-action-row="whatsapp"')).toBeGreaterThan(ar.lastIndexOf("</details>"));
  });

  it("drops the WhatsApp row when the store has no usable number", () => {
    const html = render(COMPACT, "ar", BARE_TENANT);
    expect(html).not.toContain("data-action-row");
    expect(html).not.toContain("wa.me");
    expect(html.match(/<details\b/g) ?? []).toHaveLength(n);
  });

  it("overrides the ledger layout", () => {
    expect(render({ ...COMPACT, layout: "ledger" }, "ar")).toBe(ar);
  });

  it("flips visual order for Arabic with classes, never dir=rtl", () => {
    // n summaries + the contact row + its pill.
    expect(count(ar, "flex-row-reverse")).toBe(n + 2);
    expect(count(ar, "pl-8")).toBe(n);
    expect(ar).not.toContain("text-left");
    expect(en).not.toContain("flex-row-reverse");
    expect(en).not.toContain("text-right");
    expect(count(en, "pr-8")).toBe(n);
    for (const html of [ar, en]) {
      expect(html).not.toContain('dir="rtl"');
      const dirTags = [...html.matchAll(/<(\w+)[^>]*\sdir="auto"/g)].map((m) => m[1]);
      expect(dirTags).toHaveLength(n);
      expect(new Set(dirTags)).toEqual(new Set(["p"]));
    }
  });

  it("tags the merchant fields for the editor", () => {
    expect(ar).toContain('data-i18n-field="items[0].q_i18n"');
    expect(ar).toContain('data-i18n-field="items[0].a_i18n"');
  });
});
