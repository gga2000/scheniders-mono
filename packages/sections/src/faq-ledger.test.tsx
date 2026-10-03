// faq_contact_split — the opt-in ledger layout and the FAQPage structured
// data. Static markup only (this package has no DOM lib in its unit setup):
// each case pins something a restyle must not quietly drop.

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import type { SectionRenderContext } from "./_types";

const baseCtx = {
  tenant: {
    id: "tenant-1",
    business_name: "متجر",
    store_config: { contact: { whatsapp_number: "07701234567" } },
  } as never,
  runtime: {
    page_id: "home" as const,
    breakpoint: "mobile" as const,
    locale: "ar" as const,
    audience_segments: [],
    ab_test_arms: {},
    now: new Date("2026-10-02T00:00:00Z"),
  },
  products: [],
  categories: [],
};

type Props = typeof faq_contact_split.defaultProps;

function render(props: Props, ctx: Partial<SectionRenderContext> = {}): string {
  const Render = faq_contact_split.render;
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "", children: null },
      React.createElement(Render, { props, ctx: { ...baseCtx, ...ctx } }),
    ),
  );
}

const cards = faq_contact_split.defaultProps;
const ledger: Props = { ...cards, layout: "ledger" };

describe("faq_contact_split — ledger layout", () => {
  it("treats an absent layout as cards", () => {
    // Only says the default maps to the cards branch. It cannot guard the
    // cards markup itself — both sides of this comparison move together,
    // so a restyle of the plate keeps it green. The next case does that job.
    expect(render(cards)).toBe(render({ ...cards, layout: "cards" }));
  });

  it("leaves the cards plate exactly as it was", () => {
    // Back-compat, pinned against literals rather than against another
    // render of the same branch: every config in the wild omits `layout`,
    // and this is the layout they are all getting.
    const html = render(cards);
    const detailTags = html.match(/<details\b[^>]*>/g) ?? [];
    expect(detailTags).toHaveLength(cards.items.length);
    for (const d of detailTags) {
      expect(d).toContain('class="group overflow-hidden"');
      expect(d).toContain("background-color:var(--bk-surface, #ffffff)");
      expect(d).toContain("border-radius:var(--bk-radius-card, 1rem)");
      expect(d).toContain("--bk-shadow-card");
      expect(d).not.toContain("border-top");
    }
    // The column spacing, the row's accent tab and its padding are part of
    // that look too.
    expect(html).toContain('class="space-y-bk-sm lg:col-span-3"');
    expect(html).toContain("h-5 w-1.5 shrink-0 rounded-full");
    expect(html).toContain("items-center gap-3 px-5 py-4");
  });

  it("rules the rows instead of plating them", () => {
    const html = render(ledger);
    const detailTags = html.match(/<details\b[^>]*>/g) ?? [];
    expect(detailTags).toHaveLength(ledger.items.length);
    // Every row carries the hairline rule…
    expect(
      detailTags.filter((d) => d.includes("border-top:1px solid color-mix")),
    ).toHaveLength(ledger.items.length);
    // …and none of them is a raised white plate any more.
    for (const d of detailTags) {
      expect(d).not.toContain("--bk-shadow-card");
      expect(d).not.toContain("background-color:var(--bk-surface,");
    }
  });

  it("keeps the accordion's behaviour: one open row, one exclusive group, answers in the DOM", () => {
    const html = render(ledger);
    const detailTags = html.match(/<details\b[^>]*>/g) ?? [];
    expect(detailTags.filter((d) => /\bopen(=""|\s|>)/.test(d))).toHaveLength(1);
    const names = new Set(
      detailTags.map((d) => d.match(/name="([^"]+)"/)?.[1] ?? ""),
    );
    expect(names.size).toBe(1);
    for (const item of ledger.items) expect(html).toContain(item.a_i18n.ar);
    expect(html).not.toContain("<button");
  });

  it("drops the overhanging pin and tints the contact panel from the accent", () => {
    const html = render(ledger);
    expect(html).not.toContain("-top-4 left-1/2");
    expect(html).toContain(
      "color-mix(in srgb, var(--bk-accent, #ffd84a) 8%, var(--bk-surface-alt, #faf7f0))",
    );
    // The cards layout still has its pin — this is a layout switch, not a
    // removal.
    expect(render(cards)).toContain("-top-4 left-1/2");
  });

  it("holds the answer to a readable measure", () => {
    expect(render(ledger)).toContain("max-w-[62ch]");
    expect(render(cards)).not.toContain("max-w-[62ch]");
  });

  it("keeps `layout` out of defaultProps so old configs still parse", () => {
    expect(faq_contact_split.defaultProps).not.toHaveProperty("layout");
    expect(
      faq_contact_split.schema.safeParse(faq_contact_split.defaultProps).success,
    ).toBe(true);
    // An unknown layout is rejected rather than silently rendering cards —
    // a parse failure drops the section, which is louder than a wrong look.
    expect(
      faq_contact_split.schema.safeParse({ ...cards, layout: "grid" }).success,
    ).toBe(false);
  });
});
